import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Game, Session } from '../shared/types'
import { libraryStore, sessionsStore, updateGame, type ActiveSession } from './db'
import { findSteamRoot } from './scanners/steam'
import { parseVdf, vdfObj, vdfStr } from './scanners/vdf'

const POLL_MS = 15_000
const SAVE_HEARTBEAT_MS = 60_000
const LIST_TIMEOUT_MS = 10_000
/** Steam writes localconfig.vdf a little after the game exits. */
const STEAM_REIMPORT_DELAY_MS = 20_000
const END_MARKER = '<<rocket-launcher-end>>'

export interface PlaytimeEvents {
  onLibrary: (games: Game[]) => void
  onRunning: (ids: string[]) => void
}

/**
 * One long-lived hidden PowerShell that prints the exe path of every running
 * process on request. Far cheaper than spawning a shell every poll.
 */
class ProcessLister {
  private ps?: ChildProcessWithoutNullStreams
  private buffer = ''
  private pending?: (paths: string[] | null) => void

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
      this.resolve(out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))
    })
    ps.stdin.on('error', () => {})
    ps.on('exit', () => {
      if (this.ps === ps) this.ps = undefined
      this.resolve(null)
    })
    // Non-ASCII install paths must survive the pipe.
    ps.stdin.write('[Console]::OutputEncoding = [Text.Encoding]::UTF8\n')
    this.ps = ps
    return ps
  }

  private resolve(paths: string[] | null): void {
    const cb = this.pending
    this.pending = undefined
    cb?.(paths)
  }

  /** Running exe paths, or null if the shell failed (callers should skip that poll). */
  list(): Promise<string[] | null> {
    if (this.pending) return Promise.resolve(null)
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.ps?.kill()
        this.resolve(null)
      }, LIST_TIMEOUT_MS)
      this.pending = (paths) => {
        clearTimeout(timer)
        resolve(paths)
      }
      this.shell().stdin.write(
        `Get-Process | ForEach-Object { $_.Path } | Where-Object { $_ } | Sort-Object -Unique; '${END_MARKER}'\n`
      )
    })
  }

  stop(): void {
    this.ps?.kill()
  }
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
  const paths = await lister.list()
  if (!paths) return
  const now = Date.now()

  const dirs: [string, string][] = []
  for (const g of libraryStore().get().games) {
    const key = dirKey(g.installDir)
    if (key) dirs.push([g.id, key])
  }
  const running = new Set<string>()
  for (const p of paths) {
    const lower = p.toLowerCase()
    for (const [id, key] of dirs) if (lower.startsWith(key)) running.add(id)
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
