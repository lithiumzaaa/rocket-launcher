import fs from 'node:fs/promises'
import path from 'node:path'
import type { Achievement, AchievementSet, Game, SteamAccount } from '../shared/types'
import { fetchWithTimeout } from './artwork'
import { settingsStore } from './db'
import { findSteamRoot } from './scanners/steam'
import { parseVdf, vdfStr, type VdfObject } from './scanners/vdf'

const API = 'https://api.steampowered.com/ISteamUserStats'
/** Unlocks change rarely; the game page re-asks after this, and right after a session ends. */
const CACHE_MS = 5 * 60_000

/**
 * The Steam account signed in on this PC, from config/loginusers.vdf: the "MostRecent" user,
 * else the one with the newest login timestamp.
 */
export async function steamAccount(): Promise<SteamAccount | undefined> {
  const root = await findSteamRoot()
  if (!root) return undefined
  let users: VdfObject | undefined
  try {
    const parsed = parseVdf(await fs.readFile(path.join(root, 'config', 'loginusers.vdf'), 'utf8'))
    users = Object.values(parsed).find((v): v is VdfObject => typeof v === 'object')
  } catch {
    return undefined
  }
  const entries = Object.entries(users ?? {}).filter(
    (e): e is [string, VdfObject] => /^7656\d{13}$/.test(e[0]) && typeof e[1] === 'object'
  )
  const pick =
    entries.find(([, u]) => vdfStr(u, 'MostRecent') === '1') ??
    entries.sort((a, b) => Number(vdfStr(b[1], 'Timestamp') ?? 0) - Number(vdfStr(a[1], 'Timestamp') ?? 0))[0]
  if (!pick) return undefined
  return { steamId: pick[0], personaName: vdfStr(pick[1], 'PersonaName') ?? vdfStr(pick[1], 'AccountName') ?? 'Steam user' }
}

/** A key is valid if Steam serves a game schema with it (Team Fortress 2: always has achievements). */
export async function testSteamApiKey(key: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API}/GetSchemaForGame/v2/?key=${encodeURIComponent(key)}&appid=440`)
    return res.ok
  } catch {
    return false
  }
}

interface SchemaAchievement {
  name: string
  displayName?: string
  description?: string
  icon?: string
  icongray?: string
  hidden?: number
}

interface PlayerAchievement {
  apiname: string
  achieved: number
  unlocktime: number
}

const cache = new Map<string, { at: number; data: AchievementSet }>()

/** Drop cached achievements: one game (a session just ended) or all (API key changed). */
export function invalidateAchievements(gameId?: string): void {
  if (gameId) cache.delete(gameId)
  else cache.clear()
}

/**
 * Steam achievements for a Steam game, merged from three calls: the player's unlocks,
 * the game's schema (names/icons) and global unlock percentages (rarity).
 */
export async function gameAchievements(game: Game): Promise<AchievementSet> {
  if (game.source !== 'steam') return { status: 'unsupported', unlocked: 0, total: 0, items: [] }
  const key = settingsStore().get().steamApiKey?.trim()
  if (!key) return { status: 'no-key', unlocked: 0, total: 0, items: [] }

  const cached = cache.get(game.id)
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data

  const account = await steamAccount()
  if (!account) return { status: 'no-account', unlocked: 0, total: 0, items: [] }

  const appid = encodeURIComponent(game.sourceId)
  const k = encodeURIComponent(key)
  try {
    const [schemaRes, playerRes, globalRes] = await Promise.all([
      fetchWithTimeout(`${API}/GetSchemaForGame/v2/?key=${k}&appid=${appid}&l=english`),
      fetchWithTimeout(`${API}/GetPlayerAchievements/v1/?key=${k}&appid=${appid}&steamid=${account.steamId}&l=english`),
      fetchWithTimeout(`${API}/GetGlobalAchievementPercentagesForApp/v2/?gameid=${appid}`)
    ])

    const schema = schemaRes.ok
      ? (((await schemaRes.json()) as { game?: { availableGameStats?: { achievements?: SchemaAchievement[] } } }).game
          ?.availableGameStats?.achievements ?? [])
      : []
    if (schema.length === 0) return remember(game.id, { status: 'none', unlocked: 0, total: 0, items: [] })

    const playerJson = (await playerRes.json().catch(() => ({}))) as {
      playerstats?: { success?: boolean; error?: string; achievements?: PlayerAchievement[] }
    }
    // A private profile (or private "game details") hides unlocks from the Web API.
    if (!playerRes.ok || playerJson.playerstats?.success === false) {
      const privateProfile = /not public|private/i.test(playerJson.playerstats?.error ?? '') || playerRes.status === 403
      return { status: privateProfile ? 'private' : 'error', unlocked: 0, total: schema.length, items: [] }
    }
    const player = new Map((playerJson.playerstats?.achievements ?? []).map((a) => [a.apiname, a]))

    const globalJson = globalRes.ok
      ? ((await globalRes.json()) as { achievementpercentages?: { achievements?: { name: string; percent: number | string }[] } })
      : {}
    const percent = new Map(
      (globalJson.achievementpercentages?.achievements ?? []).map((a) => [a.name, Number(a.percent)])
    )

    const items: Achievement[] = schema.map((s) => {
      const p = player.get(s.name)
      const unlocked = p?.achieved === 1
      return {
        id: s.name,
        name: s.displayName ?? s.name,
        description: s.description ?? '',
        icon: s.icon ?? '',
        iconLocked: s.icongray ?? s.icon ?? '',
        hidden: s.hidden === 1,
        unlocked,
        unlockedAt: unlocked && p.unlocktime ? p.unlocktime * 1000 : undefined,
        percent: percent.get(s.name)
      }
    })
    const unlocked = items.filter((a) => a.unlocked).length
    return remember(game.id, { status: 'ok', unlocked, total: items.length, items })
  } catch {
    return { status: 'error', unlocked: 0, total: 0, items: [] }
  }
}

function remember(gameId: string, data: AchievementSet): AchievementSet {
  cache.set(gameId, { at: Date.now(), data })
  return data
}
