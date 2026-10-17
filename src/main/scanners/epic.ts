import fs from 'node:fs/promises'
import path from 'node:path'
import { cleanTitle, type ScannedGame, type Scanner } from './types'

const EPIC_DATA = path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'Epic', 'EpicGamesLauncher', 'Data')
const MANIFESTS = path.join(EPIC_DATA, 'Manifests')
const CATALOG_CACHE = path.join(EPIC_DATA, 'Catalog', 'catcache.bin')

interface EpicManifest {
  AppName?: string
  DisplayName?: string
  InstallLocation?: string
  LaunchExecutable?: string
  CatalogNamespace?: string
  CatalogItemId?: string
  bIsIncompleteInstall?: boolean
  AppCategories?: string[]
  MainGameAppName?: string
}

export interface EpicCatalogArt {
  cover?: string
  hero?: string
  logo?: string
}

/**
 * The launcher's local catalog cache (base64 JSON) has key art for every owned
 * item, keyed by catalog item id. Tall box art is the portrait cover.
 */
export async function readEpicCatalogArt(): Promise<Map<string, EpicCatalogArt>> {
  const art = new Map<string, EpicCatalogArt>()
  try {
    const raw = await fs.readFile(CATALOG_CACHE, 'utf8')
    const items = JSON.parse(Buffer.from(raw.trim(), 'base64').toString('utf8')) as {
      id: string
      keyImages?: { type: string; url: string }[]
    }[]
    for (const item of items) {
      const image = (type: string): string | undefined => item.keyImages?.find((k) => k.type === type)?.url
      art.set(item.id, {
        cover: image('DieselGameBoxTall') ?? image('OfferImageTall'),
        hero: image('DieselGameBox') ?? image('OfferImageWide'),
        logo: image('ProductLogo') ?? image('DieselGameBoxLogo')
      })
    }
  } catch {
    // Launcher not installed or cache format changed: other art sources take over.
  }
  return art
}

async function readManifest(file: string): Promise<ScannedGame | null> {
  let m: EpicManifest
  try {
    m = JSON.parse(await fs.readFile(path.join(MANIFESTS, file), 'utf8'))
  } catch {
    return null
  }
  if (!m.AppName || !m.DisplayName || !m.InstallLocation || !m.CatalogNamespace || !m.CatalogItemId) return null
  if (m.bIsIncompleteInstall) return null
  // DLC manifests point at their parent game; Unreal Engine / tools aren't "games".
  if (m.MainGameAppName && m.MainGameAppName !== m.AppName) return null
  if (m.AppCategories && !m.AppCategories.includes('games')) return null
  try {
    await fs.access(m.InstallLocation)
  } catch {
    return null
  }

  return {
    id: `epic:${m.AppName}`,
    source: 'epic',
    sourceId: m.CatalogItemId,
    title: cleanTitle(m.DisplayName),
    installDir: path.normalize(m.InstallLocation),
    exePath: m.LaunchExecutable ? path.join(m.InstallLocation, m.LaunchExecutable) : undefined,
    // Through the launcher so ownership checks, cloud saves and overlays work.
    launchUri: `com.epicgames.launcher://apps/${encodeURIComponent(
      `${m.CatalogNamespace}:${m.CatalogItemId}:${m.AppName}`
    )}?action=launch&silent=true`
  }
}

export const epicScanner: Scanner = {
  id: 'epic',
  async scan() {
    let files: string[]
    try {
      files = (await fs.readdir(MANIFESTS)).filter((f) => f.toLowerCase().endsWith('.item'))
    } catch {
      return [] // Epic launcher not installed
    }
    const games = await Promise.all(files.map(readManifest))
    return games.filter((g): g is ScannedGame => g !== null)
  }
}
