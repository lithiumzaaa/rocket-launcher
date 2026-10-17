import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { DayPart, Game, PlayerStats, Session } from '../shared/types'
import { libraryStore, sessionsStore, updateGame, type ActiveSession } from './db'
import { readBattlenetConfig } from './scanners/battlenet'
import { findSteamRoot } from './scanners/steam'
import { parseVdf, vdfObj, vdfStr } from './scanners/vdf'

const POLL_MS = 15_000
const SAVE_HEARTBEAT_MS = 60_000
const LIST_TIMEOUT_MS = 10_000
/** Steam writes localconfig.vdf a little after the game exits. */
const STEAM_REIMPORT_DELAY_MS = 20_000
const END_MARKER = '<<rocket-launcher-end>>'

/**
 * Get-Process's .Path needs full query rights, so it comes back empty for elevated,
 * packaged (Xbox / WindowsApps) and many anti-cheat games. QueryFullProcessImageName
 * only needs limited rights, which Windows grants for nearly every user process.
 */
const LIST_HELPER = `
if (-not ('RlProc' -as [type])) { try { Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
public static class RlProc {
  [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll", CharSet = CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr h, uint flags, StringBuilder name, ref uint size);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  public static string[] List() {
    var rows = new List<string>();
    foreach (var p in Process.GetProcesses()) {
      string path = "";
      IntPtr h = OpenProcess(0x1000, false, p.Id);
      if (h != IntPtr.Zero) {
        var sb = new StringBuilder(1024); uint size = 1024;
        if (QueryFullProcessImageName(h, 0, sb, ref size)) path = sb.ToString();
        CloseHandle(h);
      }
      rows.Add(p.ProcessName + "|" + path);
      p.Dispose();
    }
    return rows.ToArray();
  }
}
'@ } catch {} }
function Get-RlProcesses {
  if ('RlProc' -as [type]) { [RlProc]::List() } else { Get-Process | ForEach-Object { $_.ProcessName + '|' + $_.Path } }
}
`

interface RunningProcess {
  /** Exe name without `.exe`, lowercased. */
  name: string
  /** Lowercased full path; empty when Windows won't tell us (protected/other-session processes). */
  path: string
}

export interface PlaytimeEvents {
  onLibrary: (games: Game[]) => void
  onRunning: (ids: string[]) => void
}

/**
 * One long-lived hidden PowerShell that lists every running process (name + exe
 * path) on request. Far cheaper than spawning a shell every poll.
 */
class ProcessLister {
  private ps?: ChildProcessWithoutNullStreams
  private buffer = ''
  private pending?: (processes: RunningProcess[] | null) => void

  private shell(): ChildProcessWithoutNullStreams {
    if (this.ps && this.ps.exitCode === null) return this.ps
    const ps = spawn('powershell.exe', ['-NoProfile', '-NoLogo', '-NonInteractive', '-Command', '-'], {
      windowsHide: true
    })
    ps.stdout.setEncoding('utf8')
    ps.stdout.on('data', (chunk: string) => {
      this.buffer += chunk
      const end = this.buffer.indexOf(END_MARKER)
      if (end < 0) return
      const out = this.buffer.slice(0, end)
      this.buffer = this.buffer.slice(end + END_MARKER.length)
      this.resolve(parseRows(out))
    })
    ps.stdin.on('error', () => {})
    ps.on('exit', () => {
      if (this.ps === ps) this.ps = undefined
      this.resolve(null)
    })
    // Non-ASCII install paths must survive the pipe.
    ps.stdin.write('[Console]::OutputEncoding = [Text.Encoding]::UTF8\n')
    // Here-strings need real newlines, so the helper is sent as one script block.
    ps.stdin.write(`. ([ScriptBlock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(LIST_HELPER, 'utf8').toString('base64')}'))))\n`)
    this.ps = ps
    return ps
  }

  private resolve(processes: RunningProcess[] | null): void {
    const cb = this.pending
    this.pending = undefined
    cb?.(processes)
  }

  /** Running processes, or null if the shell failed (callers should skip that poll). */
  list(): Promise<RunningProcess[] | null> {
    if (this.pending) return Promise.resolve(null)
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.ps?.kill()
        this.resolve(null)
      }, LIST_TIMEOUT_MS)
      this.pending = (processes) => {
        clearTimeout(timer)
        resolve(processes)
      }
      this.shell().stdin.write(`Get-RlProcesses | Sort-Object -Unique; '${END_MARKER}'\n`)
    })
  }

  stop(): void {
    this.ps?.kill()
  }
}

/** `name|path` lines → processes. */
function parseRows(out: string): RunningProcess[] {
  const rows: RunningProcess[] = []
  for (const line of out.split(/\r?\n/)) {
    const sep = line.indexOf('|')
    if (sep <= 0) continue
    rows.push({ name: line.slice(0, sep).trim().toLowerCase(), path: line.slice(sep + 1).trim().toLowerCase() })
  }
  return rows
}

/** "bf6" for `D:\Battlefield 6\bf6.exe`: matches processes Windows won't give a path for. */
function exeName(exePath: string | undefined): string | undefined {
  return exePath ? path.parse(exePath).name.toLowerCase() || undefined : undefined
}

/** "d:\steamlibrary\steamapps\common\palworld\" — trailing slash so "Palworld2" can't match "Palworld". */
function dirKey(dir: string): string | undefined {
  const norm = path.normalize(dir).toLowerCase().replace(/\\+$/, '')
  // Refuse drive roots / top-level folders: they would match half the system.
  if (norm.split('\\').filter(Boolean).length < 2) return undefined
  return `${norm}\\`
}

const lister = new ProcessLister()
const active = new Map<string, ActiveSession>()
let timer: NodeJS.Timeout | undefined
let lastSaved = 0
let events: PlaytimeEvents | undefined

function saveActive(): void {
  sessionsStore().set({ active: Object.fromEntries(active) })
  lastSaved = Date.now()
}

function recordSession(gameId: string, start: number, end: number): void {
  const minutes = Math.round((end - start) / 60_000)
  if (minutes < 1) return
  const session: Session = { gameId, start, end, minutes }
  sessionsStore().set({ sessions: [...sessionsStore().get().sessions, session] })
  const games = updateGame(gameId, (g) => ({
    ...g,
    playtimeMinutes: g.playtimeMinutes + minutes,
    lastPlayed: Math.max(g.lastPlayed ?? 0, end)
  }))
  events?.onLibrary(games)
}

function scheduleSteamReimport(gameId: string): void {
  if (!gameId.startsWith('steam:')) return
  setTimeout(() => {
    importSteamPlaytime()
      .then((games) => events?.onLibrary(games))
      .catch((err) => console.error('[playtime] steam import', err))
  }, STEAM_REIMPORT_DELAY_MS)
}

async function poll(): Promise<void> {
  const processes = await lister.list()
  if (!processes) return
  const now = Date.now()

  const dirs: [string, string][] = []
  const names = new Map<string, string>()
  for (const g of libraryStore().get().games) {
    const key = dirKey(g.installDir)
    if (key) dirs.push([g.id, key])
    const name = exeName(g.exePath)
    if (name) names.set(name, g.id)
  }
  const running = new Set<string>()
  for (const p of processes) {
    if (p.path) {
      for (const [id, key] of dirs) if (p.path.startsWith(key)) running.add(id)
    } else {
      const id = names.get(p.name)
      if (id) running.add(id)
    }
  }

  let changed = false
  for (const id of running) {
    const session = active.get(id)
    if (session) {
      session.heartbeat = now
      continue
    }
    active.set(id, { start: now, heartbeat: now })
    changed = true
    events?.onLibrary(updateGame(id, (g) => ({ ...g, lastPlayed: now })))
  }
  for (const [id, session] of active) {
    if (running.has(id)) continue
    active.delete(id)
    changed = true
    // Exit happened somewhere in the last poll interval; `now` is within POLL_MS.
    recordSession(id, session.start, now)
    scheduleSteamReimport(id)
  }

  if (changed || now - lastSaved >= SAVE_HEARTBEAT_MS) saveActive()
  if (changed) events?.onRunning([...active.keys()])
}

/** Sessions left open by a crash/quit are closed at their last heartbeat. */
function recoverSessions(): void {
  const leftover = sessionsStore().get().active
  for (const [id, s] of Object.entries(leftover)) recordSession(id, s.start, s.heartbeat)
  sessionsStore().set({ active: {} })
}

export function startPlaytime(e: PlaytimeEvents): void {
  events = e
  recoverSessions()
  const tick = (): void => {
    poll()
      .catch((err) => console.error('[playtime] poll', err))
      .finally(() => (timer = setTimeout(tick, POLL_MS)))
  }
  tick()
}

/** Called on quit: keep running games' sessions open so the next launch closes them at this heartbeat. */
export function stopPlaytime(): void {
  if (timer) clearTimeout(timer)
  const now = Date.now()
  for (const s of active.values()) s.heartbeat = now
  saveActive()
  lister.stop()
}

export function runningGameIds(): string[] {
  return [...active.keys()]
}

/**
 * Minutes played on each of `days` calendar days starting at local midnight `first`
 * (optionally for one game). Sessions spanning midnight are split across days, and
 * sessions still running count up to now.
 */
function minutesPerDay(first: Date, days: number, gameId?: string): number[] {
  // Midnight boundaries built from calendar dates, so DST-length days stay correct.
  const bounds = Array.from({ length: days + 1 }, (_, i) =>
    new Date(first.getFullYear(), first.getMonth(), first.getDate() + i).getTime()
  )
  const minutes = new Array<number>(days).fill(0)
  const now = Date.now()

  const spans: [number, number][] = sessionsStore()
    .get()
    .sessions.filter((s) => !gameId || s.gameId === gameId)
    .map((s) => [s.start, s.end])
  for (const [id, s] of active) if (!gameId || id === gameId) spans.push([s.start, now])

  for (const [start, end] of spans) {
    if (end <= bounds[0] || start >= bounds[days]) continue
    for (let i = 0; i < days; i++) {
      const overlap = Math.min(end, bounds[i + 1]) - Math.max(start, bounds[i])
      if (overlap > 0) minutes[i] += overlap / 60_000
    }
  }
  return minutes.map(Math.round)
}

export function activityForMonth(year: number, month: number): number[] {
  return minutesPerDay(new Date(year, month, 1), new Date(year, month + 1, 0).getDate())
}

/** Last `days` days for one game; the final entry is today. */
export function activityForGame(gameId: string, days: number): number[] {
  const today = new Date()
  return minutesPerDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1)), days, gameId)
}

/** Local calendar day as a plain counter, so consecutive days differ by exactly 1 (DST-safe). */
function dayNumber(ms: number): number {
  const d = new Date(ms)
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)
}

/** Local midnight (epoch ms) of a dayNumber. */
function dayStart(day: number): number {
  const d = new Date(day * 86_400_000)
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime()
}

const COMEBACK_GAP_MS = 30 * 86_400_000
/** Hour a "play day" starts, for the typical start time. */
const DAY_START_HOUR = 5

function dayPart(hour: number): DayPart {
  if (hour >= 5 && hour < 12) return 'morning'
  if (hour >= 12 && hour < 17) return 'afternoon'
  if (hour >= 17 && hour < 22) return 'evening'
  return 'night'
}

/** Personal stats across every game, from tracked sessions (running ones count up to now). */
export function playerStats(recentLimit: number): PlayerStats {
  const now = Date.now()
  const sessions = sessionsStore().get().sessions
  const spans: { gameId: string; start: number; end: number }[] = sessions.map((s) => ({ ...s }))
  for (const [gameId, s] of active) spans.push({ gameId, start: s.start, end: now })

  const today = new Date()
  const week = minutesPerDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6), 7)
  const prevWeek = minutesPerDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 13), 7)
  const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6).getTime()
  const prevWeekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 13).getTime()

  // Every day a session touches, plus minutes per part of the day, per day, per
  // weekday × hour and per game this/last week (walked hour by hour).
  const days = new Set<number>()
  const dayParts: Record<DayPart, number> = { morning: 0, afternoon: 0, evening: 0, night: 0 }
  const heatmap = Array.from({ length: 7 }, () => new Array<number>(24).fill(0))
  const dayMinutes = new Map<number, number>()
  const dayGames = new Map<number, Set<string>>()
  const gameWeek = new Map<string, number>()
  const gamePrevWeek = new Map<string, number>()
  const weekGames = new Set<string>()
  for (const s of spans) {
    if (s.end > weekStart) weekGames.add(s.gameId)
    for (let d = dayNumber(s.start); d <= dayNumber(s.end); d++) days.add(d)
    for (let t = s.start; t < s.end; ) {
      const next = Math.min(s.end, new Date(t).setMinutes(60, 0, 0))
      const minutes = (next - t) / 60_000
      const date = new Date(t)
      const day = dayNumber(t)
      dayParts[dayPart(date.getHours())] += minutes
      heatmap[(date.getDay() + 6) % 7][date.getHours()] += minutes
      dayMinutes.set(day, (dayMinutes.get(day) ?? 0) + minutes)
      if (!dayGames.has(day)) dayGames.set(day, new Set())
      dayGames.get(day)!.add(s.gameId)
      const perGame = t >= weekStart ? gameWeek : t >= prevWeekStart ? gamePrevWeek : undefined
      perGame?.set(s.gameId, (perGame.get(s.gameId) ?? 0) + minutes)
      t = next
    }
  }
  for (const k of Object.keys(dayParts) as DayPart[]) dayParts[k] = Math.round(dayParts[k])

  const sorted = [...days].sort((a, b) => a - b)
  let longestStreak = 0
  for (let i = 0, run = 0; i < sorted.length; i++) {
    run = i > 0 && sorted[i] === sorted[i - 1] + 1 ? run + 1 : 1
    longestStreak = Math.max(longestStreak, run)
  }
  // Today not played yet doesn't break the streak until the day is over.
  let currentStreak = 0
  for (let d = days.has(dayNumber(now)) ? dayNumber(now) : dayNumber(now) - 1; days.has(d); d--) currentStreak++

  const longest = sessions.reduce<Session | undefined>((best, s) => (!best || s.minutes > best.minutes ? s : best), undefined)
  const total = sessions.reduce((sum, s) => sum + s.minutes, 0)

  const latestSession = new Map<string, Session>()
  for (const s of sessions) {
    const prev = latestSession.get(s.gameId)
    if (!prev || s.start > prev.start) latestSession.set(s.gameId, s)
  }
  const recent = libraryStore()
    .get()
    .games.filter((g) => !g.hidden && g.lastPlayed)
    .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
    .slice(0, recentLimit)
    .map((g) => ({ gameId: g.id, lastPlayed: g.lastPlayed ?? 0, lastSessionMinutes: latestSession.get(g.id)?.minutes }))

  // Month and year totals, from the per-day minutes.
  const firstOfMonth = dayNumber(new Date(today.getFullYear(), today.getMonth(), 1).getTime())
  const firstOfPrevMonth = dayNumber(new Date(today.getFullYear(), today.getMonth() - 1, 1).getTime())
  const prevMonthToDateEnd = Math.min(firstOfPrevMonth + today.getDate() - 1, firstOfMonth - 1)
  const firstOfYear = dayNumber(new Date(today.getFullYear(), 0, 1).getTime())
  const sumDays = (from: number, to: number): number => {
    let sum = 0
    for (const [d, m] of dayMinutes) if (d >= from && d <= to) sum += m
    return Math.round(sum)
  }
  const monthGames = new Set<string>()
  for (const [d, ids] of dayGames) if (d >= firstOfMonth) for (const id of ids) monthGames.add(id)

  // Personal bests.
  let bestDay: PlayerStats['bestDay']
  const weekTotals = new Map<number, number>()
  for (const [d, m] of dayMinutes) {
    if (!bestDay || m > bestDay.minutes) bestDay = { day: d, minutes: m }
    // Day 0 (1 Jan 1970) was a Thursday: +3 makes Monday 0.
    const monday = d - ((d + 3) % 7)
    weekTotals.set(monday, (weekTotals.get(monday) ?? 0) + m)
  }
  let bestWeek: PlayerStats['bestWeek']
  for (const [start, m] of weekTotals) if (!bestWeek || m > bestWeek.minutes) bestWeek = { start, minutes: m }
  let mostGamesInDay: PlayerStats['mostGamesInDay']
  for (const [d, ids] of dayGames) if (!mostGamesInDay || ids.size > mostGamesInDay.count) mostGamesInDay = { day: d, count: ids.size }

  // Trends over the last 7 days. "Rising" needs a real gain (30+ minutes).
  let rising: PlayerStats['rising']
  let focus: PlayerStats['focus']
  const weekTotal = [...gameWeek.values()].reduce((a, b) => a + b, 0)
  for (const [gameId, m] of gameWeek) {
    const prev = gamePrevWeek.get(gameId) ?? 0
    if (m - prev >= 30 && (!rising || m - prev > rising.minutes - rising.prevMinutes)) {
      rising = { gameId, minutes: Math.round(m), prevMinutes: Math.round(prev) }
    }
    if (!focus || m > focus.minutes) focus = { gameId, minutes: Math.round(m), share: weekTotal ? m / weekTotal : 0 }
  }

  // Comeback: the latest return within 30 days after a 30+ day gap in that game's sessions.
  let comeback: PlayerStats['comeback']
  const byGame = new Map<string, { start: number; end: number }[]>()
  for (const s of spans) byGame.set(s.gameId, [...(byGame.get(s.gameId) ?? []), s])
  for (const [gameId, list] of byGame) {
    list.sort((a, b) => a.start - b.start)
    for (let i = 1; i < list.length; i++) {
      const gap = list[i].start - list[i - 1].end
      if (gap < COMEBACK_GAP_MS || now - list[i].start > COMEBACK_GAP_MS) continue
      if (!comeback || list[i].start > comeback.at) {
        comeback = { gameId, gapDays: Math.floor(gap / 86_400_000), at: list[i].start }
      }
    }
  }

  // Typical start: median first session of each play day. Days run 5am–5am so a
  // 1am start counts as late that night, not early the next morning.
  const firstStart = new Map<number, number>()
  for (const s of spans) {
    const shifted = new Date(s.start - DAY_START_HOUR * 3_600_000)
    const minutes = (shifted.getHours() + DAY_START_HOUR) * 60 + shifted.getMinutes()
    const day = dayNumber(shifted.getTime())
    firstStart.set(day, Math.min(firstStart.get(day) ?? Infinity, minutes))
  }
  const starts = [...firstStart.values()].sort((a, b) => a - b)
  const typicalStartMinutes = starts.length ? starts[Math.floor(starts.length / 2)] : undefined

  return {
    weekMinutes: week.reduce((a, b) => a + b, 0),
    prevWeekMinutes: prevWeek.reduce((a, b) => a + b, 0),
    weekDaysPlayed: week.filter((m) => m > 0).length,
    weekGames: weekGames.size,
    currentStreak,
    longestStreak,
    sessionCount: sessions.length,
    averageSessionMinutes: sessions.length ? Math.round(total / sessions.length) : 0,
    longestSession: longest && { gameId: longest.gameId, minutes: longest.minutes, start: longest.start },
    dayParts,
    recent,
    monthMinutes: sumDays(firstOfMonth, Infinity),
    prevMonthToDateMinutes: sumDays(firstOfPrevMonth, prevMonthToDateEnd),
    prevMonthMinutes: sumDays(firstOfPrevMonth, firstOfMonth - 1),
    yearMinutes: sumDays(firstOfYear, Infinity),
    monthGames: monthGames.size,
    bestDay: bestDay && { day: dayStart(bestDay.day), minutes: Math.round(bestDay.minutes) },
    bestWeek: bestWeek && { start: dayStart(bestWeek.start), minutes: Math.round(bestWeek.minutes) },
    mostGamesInDay: mostGamesInDay && { day: dayStart(mostGamesInDay.day), count: mostGamesInDay.count },
    rising,
    focus,
    comeback,
    heatmap: heatmap.map((row) => row.map(Math.round)),
    typicalStartMinutes
  }
}

export function sessionsForGame(gameId: string, limit: number): Session[] {
  return sessionsStore()
    .get()
    .sessions.filter((s) => s.gameId === gameId)
    .sort((a, b) => b.start - a.start)
    .slice(0, limit)
}

/**
 * Reads Steam's own lifetime playtime and last-played time for every local
 * account (UserLocalConfigStore > Software > Valve > Steam > apps > <appid>).
 */
export async function importSteamPlaytime(): Promise<Game[]> {
  const root = await findSteamRoot()
  if (!root) return libraryStore().get().games

  const stats = new Map<string, { minutes: number; lastPlayed: number }>()
  const userdata = path.join(root, 'userdata')
  let users: string[] = []
  try {
    users = await fs.readdir(userdata)
  } catch {
    return libraryStore().get().games
  }

  for (const user of users) {
    let text: string
    try {
      text = await fs.readFile(path.join(userdata, user, 'config', 'localconfig.vdf'), 'utf8')
    } catch {
      continue
    }
    const store = vdfObj(parseVdf(text), 'UserLocalConfigStore')
    const apps = vdfObj(vdfObj(vdfObj(vdfObj(store, 'Software'), 'Valve'), 'Steam'), 'apps')
    for (const [appId, entry] of Object.entries(apps ?? {})) {
      if (typeof entry !== 'object') continue
      const minutes = Number(vdfStr(entry, 'Playtime') ?? 0) || 0
      const lastPlayed = (Number(vdfStr(entry, 'LastPlayed') ?? 0) || 0) * 1000
      const prev = stats.get(appId)
      // Several accounts on one PC: take the best figure rather than mixing them.
      stats.set(appId, {
        minutes: Math.max(prev?.minutes ?? 0, minutes),
        lastPlayed: Math.max(prev?.lastPlayed ?? 0, lastPlayed)
      })
    }
  }

  // Read the library only now: covers/descriptions may have been saved while we were reading files.
  let changed = false
  const games = libraryStore().get().games
  const updated = games.map((g) => {
    if (g.source !== 'steam') return g
    const s = stats.get(g.sourceId)
    if (!s) return g
    const lastPlayed = Math.max(g.lastPlayed ?? 0, s.lastPlayed) || undefined
    if (s.minutes === g.importedPlaytimeMinutes && lastPlayed === g.lastPlayed) return g
    changed = true
    return { ...g, importedPlaytimeMinutes: s.minutes, lastPlayed }
  })
  if (changed) libraryStore().set({ games: updated })
  return updated
}

/**
 * Battle.net keeps no playtime (the process watcher counts it), but it does record
 * when each game was last played, including launches made while we weren't running.
 */
export async function importBattlenetLastPlayed(): Promise<Game[]> {
  const played = (await readBattlenetConfig()).Games ?? {}
  let changed = false
  const updated = libraryStore()
    .get()
    .games.map((g) => {
      if (g.source !== 'battlenet') return g
      const seconds = Number(played[g.sourceId]?.LastPlayed ?? 0) || 0
      if (seconds * 1000 <= (g.lastPlayed ?? 0)) return g
      changed = true
      return { ...g, lastPlayed: seconds * 1000 }
    })
  if (changed) libraryStore().set({ games: updated })
  return updated
}
