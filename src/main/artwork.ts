import { app, net, protocol } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ArtKind, CoverOption, Game } from '../shared/types'
import { libraryStore, settingsStore, updateGame } from './db'
import { readEpicCatalogArt, type EpicCatalogArt } from './scanners/epic'

export const COVER_SCHEME = 'cover'
const SGDB = 'https://www.steamgriddb.com/api/v2'
const STEAM_ASSETS = 'https://shared.steamstatic.com/store_item_assets/'
const CONCURRENCY = 4

const coversDir = (): string => path.join(app.getPath('userData'), 'covers')

/** Must run before app 'ready'. */
export function registerCoverScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: COVER_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
  ])
}

/** Serves cached art as cover://img/<file> so the renderer never touches file:// paths. */
export function handleCoverProtocol(): void {
  protocol.handle(COVER_SCHEME, (req) => {
    const name = decodeURIComponent(new URL(req.url).pathname.slice(1))
    if (!/^[\w.-]+$/.test(name)) return new Response(null, { status: 400 })
    return net.fetch(pathToFileURL(path.join(coversDir(), name)).toString())
  })
}

/** Animated art is still one of these (animated WebP / GIF / APNG). */
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/apng': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/vnd.microsoft.icon': 'ico',
  'image/x-icon': 'ico'
}

/** API calls give up after this; one stalled request must never wedge the art queue. */
const API_TIMEOUT_MS = 15_000
/** Image downloads get longer: animated heroes can be tens of MB. */
const DOWNLOAD_TIMEOUT_MS = 90_000

/** net.fetch with a hard timeout. */
export function fetchWithTimeout(url: string, init: RequestInit = {}, ms = API_TIMEOUT_MS): Promise<Response> {
  return net.fetch(url, { ...init, signal: AbortSignal.timeout(ms) })
}

/** Downloads an image into the cache; returns the cached file name, or undefined if it isn't a usable image. */
async function download(url: string, baseName: string, headers?: Record<string, string>): Promise<string | undefined> {
  try {
    const res = await fetchWithTimeout(url, { headers }, DOWNLOAD_TIMEOUT_MS)
    if (!res.ok) return undefined
    const ext = EXT[(res.headers.get('content-type') ?? '').split(';')[0].trim()]
    if (!ext) return undefined
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 2048) return undefined // placeholder/error images

    const file = `${baseName}.${ext}`
    const dest = path.join(coversDir(), file)
    await fs.mkdir(coversDir(), { recursive: true })
    await fs.writeFile(`${dest}.tmp`, buf)
    await fs.rename(`${dest}.tmp`, dest)
    return file
  } catch {
    return undefined
  }
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await fs.access(path.join(coversDir(), file))
    return true
  } catch {
    return false
  }
}

/**
 * Steam's store API gives the current (hashed) asset path for each app, which newer
 * games need; the legacy fixed URL 404s for them. Batched, no key required.
 */
interface SteamArt {
  cover?: string
  hero?: string
}

async function steamArtUrls(appIds: string[]): Promise<Map<string, SteamArt>> {
  const urls = new Map<string, SteamArt>()
  for (let i = 0; i < appIds.length; i += 50) {
    const input = {
      ids: appIds.slice(i, i + 50).map((appid) => ({ appid: Number(appid) })),
      context: { country_code: 'US' },
      data_request: { include_assets: true }
    }
    try {
      const res = await fetchWithTimeout(
        `https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`
      )
      if (!res.ok) continue
      const json = (await res.json()) as {
        response?: {
          store_items?: {
            appid: number
            assets?: {
              asset_url_format?: string
              library_capsule_2x?: string
              library_capsule?: string
              library_hero?: string
            }
          }[]
        }
      }
      for (const item of json.response?.store_items ?? []) {
        const a = item.assets
        if (!a?.asset_url_format) continue
        const url = (file?: string): string | undefined =>
          file ? STEAM_ASSETS + a.asset_url_format!.replace('${FILENAME}', file) : undefined
        urls.set(String(item.appid), {
          cover: url(a.library_capsule_2x ?? a.library_capsule),
          hero: url(a.library_hero)
        })
      }
    } catch {
      // Network hiccup: fall through to the other sources.
    }
  }
  return urls
}

const SGDB_QUERY: Record<ArtKind, [endpoint: string, query: string]> = {
  cover: ['grids', 'dimensions=600x900&nsfw=false&humor=false'],
  hero: ['heroes', 'nsfw=false&humor=false'],
  // All file types: most SteamGridDB icons are .ico, which Chromium renders fine.
  icon: ['icons', 'nsfw=false&humor=false'],
  logo: ['logos', 'nsfw=false&humor=false']
}

type ArtTypes = 'static' | 'animated'

/** SteamGridDB game id for non-Steam games, cached per title for the session. */
const sgdbIdCache = new Map<string, number | null>()

async function sgdbGameId(key: string, title: string): Promise<number | null> {
  if (sgdbIdCache.has(title)) return sgdbIdCache.get(title)!
  const search = await fetchWithTimeout(`${SGDB}/search/autocomplete/${encodeURIComponent(title)}`, {
    headers: { Authorization: `Bearer ${key}` }
  })
  if (!search.ok) return null // not cached: may be a transient failure
  const id = ((await search.json()) as { data?: { id: number }[] }).data?.[0]?.id ?? null
  sgdbIdCache.set(title, id)
  return id
}

/** SteamGridDB images of one kind for a game, best-voted first. */
async function sgdbArtList(key: string, game: Game, kind: ArtKind, types: ArtTypes = 'static'): Promise<CoverOption[]> {
  const headers = { Authorization: `Bearer ${key}` }
  const [endpoint, base] = SGDB_QUERY[kind]
  const query = `${base}&types=${types}`
  try {
    let artUrl: string
    if (game.source === 'steam') {
      artUrl = `${SGDB}/${endpoint}/steam/${game.sourceId}?${query}`
    } else {
      const id = await sgdbGameId(key, game.title)
      if (!id) return []
      artUrl = `${SGDB}/${endpoint}/game/${id}?${query}`
    }
    const res = await fetchWithTimeout(artUrl, { headers })
    if (!res.ok) return []
    const data = ((await res.json()) as { data?: { url: string; thumb?: string; mime?: string }[] }).data ?? []
    return data.map((d) => ({
      url: d.url,
      thumb: d.thumb ?? d.url,
      mime: d.mime,
      animated: types === 'animated'
    }))
  } catch {
    return []
  }
}

/** Automatic pick: static only (animated art is opt-in via Edit), and a PNG icon beats an .ico. */
async function sgdbArtUrl(key: string, game: Game, kind: ArtKind): Promise<string | undefined> {
  const list = await sgdbArtList(key, game, kind)
  if (kind === 'icon') return (list.find((o) => o.mime === 'image/png') ?? list[0])?.url
  return list[0]?.url
}

/** Which Game field holds each kind of art. */
const ART_FIELD = { cover: 'coverPath', hero: 'heroPath', icon: 'iconPath', logo: 'logoPath' } as const satisfies Record<
  ArtKind,
  keyof Game
>

/** Most options shown per kind in the picker (SteamGridDB rarely has more than this per game). */
const MAX_OPTIONS = 100

/**
 * SteamGridDB choices for the edit dialog (empty without an API key): every static image,
 * then animated ones for covers and heroes.
 */
export async function artOptions(game: Game, kind: ArtKind): Promise<CoverOption[]> {
  const key = settingsStore().get().steamGridDbKey?.trim()
  if (!key) return []
  const [stills, animated] = await Promise.all([
    sgdbArtList(key, game, kind, 'static'),
    kind === 'icon' || kind === 'logo' ? Promise.resolve([]) : sgdbArtList(key, game, kind, 'animated')
  ])
  return [...stills, ...animated].slice(0, MAX_OPTIONS)
}

const customBase = (game: Game, kind: ArtKind): string =>
  `${game.id.replace(/[^\w-]/g, '_')}_custom_${kind}_${Date.now()}`

/** Downloads a chosen image as this game's cover / hero / icon. */
export async function setArtFromUrl(game: Game, kind: ArtKind, url: string): Promise<Game[]> {
  if (!/^https:\/\//.test(url)) throw new Error('Image URL must be https')
  const file = await download(url, customBase(game, kind))
  if (!file) throw new Error('Could not download that image')
  return updateGame(game.id, (g) => ({ ...g, [ART_FIELD[kind]]: file }))
}

export const IMAGE_FILE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'ico']
const IMAGE_EXT = new RegExp(`\\.(${IMAGE_FILE_EXTENSIONS.join('|')})$`, 'i')

/** Copies a local image (animated GIF/WebP included) into the art cache. */
export async function setArtFromFile(game: Game, kind: ArtKind, filePath: string): Promise<Game[]> {
  const ext = filePath.match(IMAGE_EXT)?.[1]?.toLowerCase().replace('jpeg', 'jpg')
  if (!ext) throw new Error('Pick a PNG, JPG, WebP, GIF or ICO image')
  const file = `${customBase(game, kind)}.${ext}`
  await fs.mkdir(coversDir(), { recursive: true })
  await fs.copyFile(filePath, path.join(coversDir(), file))
  return updateGame(game.id, (g) => ({ ...g, [ART_FIELD[kind]]: file }))
}

/** Forget the current art; the next ensureCovers run fetches the default again. */
export function clearArt(game: Game, kind: ArtKind): Game[] {
  // Allow another attempt this session even if the default fetch failed earlier.
  if (kind === 'hero') attemptedHeroes.delete(game.id)
  if (kind === 'icon') attemptedIcons.delete(game.id)
  if (kind === 'logo') attemptedLogos.delete(game.id)
  return updateGame(game.id, (g) => ({ ...g, [ART_FIELD[kind]]: undefined }))
}

export async function testSteamGridDbKey(key: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${SGDB}/search/autocomplete/portal`, { headers: { Authorization: `Bearer ${key}` } })
    return res.ok
  } catch {
    return false
  }
}

/** Steam's fixed-path files, tried after the store API's hashed paths. Icons have none. */
const LEGACY_STEAM_FILES: Partial<Record<ArtKind, string[]>> = {
  cover: ['library_600x900_2x.jpg'],
  hero: ['library_hero.jpg'],
  logo: ['logo_2x.png', 'logo.png']
}

const FILE_SUFFIX: Record<ArtKind, string> = { cover: '', hero: '_hero', icon: '_icon', logo: '_logo' }

/** Store-provided art URLs gathered once per run, keyed by sourceId. */
interface StoreArt {
  steam: Map<string, SteamArt>
  epic: Map<string, EpicCatalogArt>
}

async function findArt(game: Game, kind: ArtKind, store: StoreArt, sgdbKey?: string): Promise<string | undefined> {
  const baseName = game.id.replace(/[^\w-]/g, '_') + FILE_SUFFIX[kind]
  const urls: string[] = []
  if (game.source === 'steam') {
    const fromApi = kind === 'cover' || kind === 'hero' ? store.steam.get(game.sourceId)?.[kind] : undefined
    if (fromApi) urls.push(fromApi)
    for (const file of LEGACY_STEAM_FILES[kind] ?? []) urls.push(`${STEAM_ASSETS}steam/apps/${game.sourceId}/${file}`)
  }
  if (game.source === 'epic' && kind !== 'icon') {
    const fromCatalog = store.epic.get(game.sourceId)?.[kind]
    if (fromCatalog) urls.push(fromCatalog)
  }
  for (const url of urls) {
    const file = await download(url, baseName)
    if (file) return file
  }
  if (sgdbKey) {
    const url = await sgdbArtUrl(sgdbKey, game, kind)
    if (url) return download(url, baseName)
  }
  return undefined
}

async function hasFile(file: string | undefined): Promise<boolean> {
  return !!file && (await fileExists(file))
}

let running = false
let rerun = false
const attemptedHeroes = new Set<string>()
const attemptedIcons = new Set<string>()
const attemptedLogos = new Set<string>()

/** A new SteamGridDB key may find heroes/icons/logos that failed before. */
export function resetHeroAttempts(): void {
  attemptedHeroes.clear()
  attemptedIcons.clear()
  attemptedLogos.clear()
}

/**
 * Fetches art for every game without a cached cover, CONCURRENCY at a time, saving
 * each one as it lands. Calls during a run queue exactly one follow-up run.
 */
export async function ensureCovers(notify: (games: Game[]) => void): Promise<void> {
  if (running) {
    rerun = true
    return
  }
  running = true
  try {
    do {
      rerun = false
      const games = libraryStore().get().games
      const sgdbKey = settingsStore().get().steamGridDbKey?.trim() || undefined
      const missing: { game: Game; cover: boolean; hero: boolean; icon: boolean; logo: boolean }[] = []
      for (const g of games) {
        const cover = !(await hasFile(g.coverPath))
        const hero = !attemptedHeroes.has(g.id) && !(await hasFile(g.heroPath))
        // Icons only matter for the favourites bar, and only SteamGridDB has them.
        const icon = !!sgdbKey && g.favorite && !attemptedIcons.has(g.id) && !(await hasFile(g.iconPath))
        const logo = !attemptedLogos.has(g.id) && !(await hasFile(g.logoPath))
        if (cover || hero || icon || logo) missing.push({ game: g, cover, hero, icon, logo })
      }
      if (missing.length === 0) break

      const steamIds = missing.filter((m) => m.game.source === 'steam').map((m) => m.game.sourceId)
      const store: StoreArt = {
        steam: steamIds.length ? await steamArtUrls(steamIds) : new Map(),
        epic: missing.some((m) => m.game.source === 'epic') ? await readEpicCatalogArt() : new Map()
      }

      let next = 0
      const worker = async (): Promise<void> => {
        while (next < missing.length) {
          const { game, cover, hero, icon, logo } = missing[next++]
          const coverPath = cover ? await findArt(game, 'cover', store, sgdbKey) : undefined
          const heroPath = hero ? await findArt(game, 'hero', store, sgdbKey) : undefined
          const iconPath = icon ? await findArt(game, 'icon', store, sgdbKey) : undefined
          const logoPath = logo ? await findArt(game, 'logo', store, sgdbKey) : undefined
          // Heroes/icons/logos are optional (many games have none); don't retry them every run this session.
          if (hero) attemptedHeroes.add(game.id)
          if (icon) attemptedIcons.add(game.id)
          if (logo) attemptedLogos.add(game.id)
          if (!coverPath && !heroPath && !iconPath && !logoPath) continue
          // updateGame re-reads: a scan may have rewritten the library while we were downloading.
          notify(
            updateGame(game.id, (g) => ({
              ...g,
              ...(coverPath && { coverPath }),
              ...(heroPath && { heroPath }),
              ...(iconPath && { iconPath }),
              ...(logoPath && { logoPath })
            }))
          )
        }
      }
      await Promise.all(Array.from({ length: CONCURRENCY }, worker))
    } while (rerun)
  } finally {
    running = false
  }
}
