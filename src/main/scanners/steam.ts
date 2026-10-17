import fs from 'node:fs/promises'
import path from 'node:path'
import { queryValue } from './registry'
import { cleanTitle, type ScannedGame, type Scanner } from './types'
import { parseVdf, vdfObj, vdfStr } from './vdf'

/** Steam installs these as "apps" but they aren't games. */
const TOOL_APP_IDS = new Set([
  '228980', // Steamworks Common Redistributables
  '250820', // SteamVR
  '1070560', // Steam Linux Runtime 1.0 (scout)
  '1391110', // Steam Linux Runtime 2.0 (soldier)
  '1628350', // Steam Linux Runtime 3.0 (sniper)
  '1493710', // Proton Experimental
  '2180100' // Proton Hotfix
])
const TOOL_NAME = /^(Proton\b|Steam Linux Runtime|Steamworks Common)/i

/** StateFlags bit 4 = StateFullyInstalled (it may be combined with "update required" etc). */
const FULLY_INSTALLED = 4

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export async function findSteamRoot(): Promise<string | undefined> {
  const candidates = [
    await queryValue('HKCU\\Software\\Valve\\Steam', 'SteamPath'),
    await queryValue('HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam', 'InstallPath'),
    'C:\\Program Files (x86)\\Steam'
  ]
  for (const c of candidates) {
    if (c && (await exists(path.join(c, 'steamapps')))) return path.normalize(c)
  }
  return undefined
}

/** Every Steam library folder, across all drives, from libraryfolders.vdf. */
async function libraryFolders(root: string): Promise<string[]> {
  const folders = new Map<string, string>([[root.toLowerCase(), root]])
  try {
    const text = await fs.readFile(path.join(root, 'steamapps', 'libraryfolders.vdf'), 'utf8')
    const libs = vdfObj(parseVdf(text), 'libraryfolders')
    for (const entry of Object.values(libs ?? {})) {
      const p = typeof entry === 'object' ? vdfStr(entry, 'path') : undefined
      if (p) folders.set(path.normalize(p).toLowerCase(), path.normalize(p))
    }
  } catch {
    // No libraryfolders.vdf: only the root library.
  }
  return [...folders.values()]
}

async function scanLibrary(lib: string): Promise<ScannedGame[]> {
  const steamapps = path.join(lib, 'steamapps')
  let files: string[]
  try {
    files = (await fs.readdir(steamapps)).filter((f) => /^appmanifest_\d+\.acf$/i.test(f))
  } catch {
    return [] // drive unplugged / folder gone
  }

  const games = await Promise.all(
    files.map(async (file): Promise<ScannedGame | null> => {
      try {
        const app = vdfObj(parseVdf(await fs.readFile(path.join(steamapps, file), 'utf8')), 'AppState')
        const appId = vdfStr(app, 'appid')
        const name = vdfStr(app, 'name')
        const dir = vdfStr(app, 'installdir')
        const flags = Number(vdfStr(app, 'StateFlags') ?? 0)
        if (!appId || !name || !dir) return null
        if (!(flags & FULLY_INSTALLED)) return null
        if (TOOL_APP_IDS.has(appId) || TOOL_NAME.test(name)) return null

        const installDir = path.join(steamapps, 'common', dir)
        if (!(await exists(installDir))) return null

        return {
          id: `steam:${appId}`,
          source: 'steam',
          sourceId: appId,
          title: cleanTitle(name),
          installDir,
          launchUri: `steam://rungameid/${appId}`
        }
      } catch {
        return null
      }
    })
  )
  return games.filter((g): g is ScannedGame => g !== null)
}

export const steamScanner: Scanner = {
  id: 'steam',
  async scan() {
    const root = await findSteamRoot()
    if (!root) return []
    const libs = await libraryFolders(root)
    return (await Promise.all(libs.map(scanLibrary))).flat()
  }
}
