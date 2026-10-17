import fs from 'node:fs/promises'
import path from 'node:path'
import { iconExe, uninstallEntries } from './registry'
import { cleanTitle, exists, type ScannedGame, type Scanner } from './types'

/**
 * Blizzard's product uid (Uninstall entry / .build.info) → the product code Battle.net's
 * `--exec="launch <code>"` understands. Unknown uids launch the game's exe instead.
 */
const LAUNCH_CODES: Record<string, string> = {
  wow: 'WoW',
  wow_classic: 'WoWC',
  wow_classic_era: 'WoWC',
  prometheus: 'Pro',
  pro: 'Pro',
  fenris: 'Fen',
  osi: 'OSI',
  diablo3: 'D3',
  d3: 'D3',
  s2: 'S2',
  s1: 'S1',
  hs_beta: 'WTCG',
  wtcg: 'WTCG',
  heroes: 'Hero',
  hero: 'Hero',
  w3: 'W3',
  anbs: 'ANBS',
  rtro: 'RTRO'
}

/** Where the client keeps per-game state (LastPlayed) and its default install folder. */
const CLIENT_CONFIG = path.join(process.env.APPDATA ?? '', 'Battle.net', 'Battle.net.config')

interface ClientConfig {
  Client?: { Install?: { DefaultInstallPath?: string } }
  Games?: Record<string, { LastPlayed?: string }>
}

export async function readBattlenetConfig(): Promise<ClientConfig> {
  try {
    return JSON.parse((await fs.readFile(CLIENT_CONFIG, 'utf8')).replace(/^﻿/, '')) as ClientConfig
  } catch {
    return {}
  }
}

/**
 * Every Blizzard game root has a `.build.info` table (`Name!TYPE:n|…` header, then rows);
 * its Product column is the uid. Undefined if the folder isn't a live install.
 */
async function buildInfoProduct(dir: string): Promise<string | undefined> {
  let text: string
  try {
    text = await fs.readFile(path.join(dir, '.build.info'), 'utf8')
  } catch {
    return undefined
  }
  const [header, ...rows] = text.split(/\r?\n/).filter((l) => l.trim())
  const columns = header?.split('|').map((c) => c.split('!')[0].trim().toLowerCase()) ?? []
  const product = columns.indexOf('product')
  const active = columns.indexOf('active')
  const cells = rows.map((r) => r.split('|'))
  const row = cells.find((c) => active < 0 || c[active] === '1') ?? cells[0]
  return (product >= 0 && row?.[product]?.trim()) || ''
}

/** The top-level exe named after the folder (`Diablo IV\Diablo IV.exe`), else the only real exe. */
async function guessExe(dir: string): Promise<string | undefined> {
  let files: string[]
  try {
    files = (await fs.readdir(dir)).filter((f) => /\.exe$/i.test(f) && !/launcher|crash|error|uninstall|setup/i.test(f))
  } catch {
    return undefined
  }
  const named = files.find((f) => path.parse(f).name.toLowerCase() === path.basename(dir).toLowerCase())
  const pick = named ?? (files.length === 1 ? files[0] : undefined)
  return pick && path.join(dir, pick)
}

interface Candidate {
  uid: string
  title: string
  dir: string
  exe?: string
}

export const battlenetScanner: Scanner = {
  id: 'battlenet',
  async scan() {
    const [entries, config] = await Promise.all([uninstallEntries(), readBattlenetConfig()])
    const client = entries.find((e) => /--uid=battle\.net\b/i.test(e.UninstallString ?? ''))
    const clientExe = path.join(client?.InstallLocation ?? 'C:\\Program Files (x86)\\Battle.net', 'Battle.net.exe')
    const hasClient = await exists(clientExe)

    // 1. Uninstall entries (what the client registers on install).
    const candidates: Candidate[] = []
    for (const e of entries) {
      const uid = (e.UninstallString ?? '').match(/Blizzard Uninstaller\.exe"?.*--uid=([\w.-]+)/i)?.[1]
      if (!uid || uid === 'battle.net' || !e.DisplayName || !e.InstallLocation) continue
      candidates.push({ uid, title: e.DisplayName, dir: e.InstallLocation, exe: iconExe(e.DisplayIcon) })
    }

    // 2. Game roots in the client's install folder that lack an entry (e.g. "Locate the game").
    const installRoot = config.Client?.Install?.DefaultInstallPath
    if (installRoot) {
      let dirs: string[] = []
      try {
        dirs = (await fs.readdir(installRoot, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name)
      } catch {
        // folder gone
      }
      for (const name of dirs) {
        const dir = path.join(installRoot, name)
        const uid = await buildInfoProduct(dir)
        if (uid) candidates.push({ uid, title: name, dir })
      }
    }

    const seen = new Set<string>()
    const games = await Promise.all(
      candidates.map(async (c): Promise<ScannedGame | null> => {
        const dir = path.normalize(c.dir)
        const key = `${c.uid.toLowerCase()}|${dir.toLowerCase().replace(/\\+$/, '')}`
        if (seen.has(key)) return null
        seen.add(key)

        // Entries and leftover folders (saved settings, addons) outlive an uninstall:
        // only a live .build.info or the game's exe proves it's installed.
        const exe = c.exe && (await exists(c.exe)) ? c.exe : await guessExe(dir)
        if ((await buildInfoProduct(dir)) === undefined && !exe) return null

        const code = LAUNCH_CODES[c.uid.toLowerCase()]
        if (!exe && !(hasClient && code)) return null
        return {
          id: `battlenet:${c.uid}`,
          source: 'battlenet',
          sourceId: c.uid,
          title: cleanTitle(c.title),
          installDir: dir,
          exePath: exe,
          // Through the client so login/updates happen; exe is the fallback.
          ...(hasClient && code && { launchExe: clientExe, launchExeArgs: [`--exec=launch ${code}`] })
        }
      })
    )
    // One game per uid: an entry and the folder scan can both find it.
    const byId = new Map<string, ScannedGame>()
    for (const g of games) if (g && !byId.has(g.id)) byId.set(g.id, g)
    return [...byId.values()]
  }
}
