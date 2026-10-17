import fs from 'node:fs/promises'
import path from 'node:path'
import { uninstallEntries } from './registry'
import { cleanTitle, type ScannedGame, type Scanner } from './types'

/**
 * Blizzard's uninstaller uid (from the Uninstall entry) → the product code Battle.net's
 * `--exec="launch <code>"` understands. Unknown uids launch the game's exe instead.
 */
const LAUNCH_CODES: Record<string, string> = {
  wow: 'WoW',
  wow_classic: 'WoWC',
  prometheus: 'Pro',
  pro: 'Pro',
  fenris: 'Fen',
  osi: 'OSI',
  diablo3: 'D3',
  s2: 'S2',
  s1: 'S1',
  hs_beta: 'WTCG',
  heroes: 'Hero',
  w3: 'W3',
  anbs: 'ANBS',
  rtro: 'RTRO'
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

/** Strips the quotes/icon index Windows puts on DisplayIcon: `"C:\x\Game.exe",0`. */
function iconExe(displayIcon: string | undefined): string | undefined {
  const p = displayIcon?.replace(/,\s*-?\d+$/, '').replace(/^"|"$/g, '').trim()
  return p && /\.exe$/i.test(p) ? p : undefined
}

export const battlenetScanner: Scanner = {
  id: 'battlenet',
  async scan() {
    const entries = await uninstallEntries()
    const client = entries.find((e) => /--uid=battle\.net\b/i.test(e.UninstallString ?? ''))
    const clientExe = path.join(client?.InstallLocation ?? 'C:\\Program Files (x86)\\Battle.net', 'Battle.net.exe')
    const hasClient = await exists(clientExe)

    const games = await Promise.all(
      entries.map(async (e): Promise<ScannedGame | null> => {
        const uid = (e.UninstallString ?? '').match(/Blizzard Uninstaller\.exe"?.*--uid=([\w.-]+)/i)?.[1]
        if (!uid || uid === 'battle.net' || !e.DisplayName || !e.InstallLocation) return null
        // Uninstall entries outlive deleted folders (e.g. a moved WoW install).
        if (!(await exists(e.InstallLocation))) return null

        const exe = iconExe(e.DisplayIcon)
        const code = LAUNCH_CODES[uid.toLowerCase()]
        return {
          id: `battlenet:${uid}`,
          source: 'battlenet',
          sourceId: uid,
          title: cleanTitle(e.DisplayName),
          installDir: path.normalize(e.InstallLocation),
          exePath: exe && (await exists(exe)) ? exe : undefined,
          // Through the client so login/updates happen; exe is the fallback.
          ...(hasClient && code && { launchExe: clientExe, launchExeArgs: [`--exec=launch ${code}`] })
        }
      })
    )
    return games.filter((g): g is ScannedGame => g !== null)
  }
}
