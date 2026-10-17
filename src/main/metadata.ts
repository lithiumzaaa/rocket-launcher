import { net } from 'electron'
import type { Game } from '../shared/types'
import { fetchWithTimeout } from './artwork'
import { libraryStore, updateGame } from './db'

/** Games we already tried this session (so missing descriptions aren't re-fetched on every scan). */
const attempted = new Set<string>()
let running = false

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Batched Steam store lookup: appid → short description. */
async function steamDescriptions(appIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (let i = 0; i < appIds.length; i += 50) {
    const input = {
      ids: appIds.slice(i, i + 50).map((appid) => ({ appid: Number(appid) })),
      context: { country_code: 'US', language: 'english' },
      data_request: { include_basic_info: true }
    }
    try {
      const res = await fetchWithTimeout(
        `https://api.steampowered.com/IStoreBrowseService/GetItems/v1/?input_json=${encodeURIComponent(JSON.stringify(input))}`
      )
      if (!res.ok) continue
      const json = (await res.json()) as {
        response?: { store_items?: { appid: number; basic_info?: { short_description?: string } }[] }
      }
      for (const item of json.response?.store_items ?? []) {
        const text = item.basic_info?.short_description
        if (text) out.set(String(item.appid), decodeEntities(text))
      }
    } catch {
      // Offline: try again next session.
    }
  }
  return out
}

function epicSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Epic's public product content, addressed by a slug guessed from the title (404 when the guess is wrong). */
async function epicDescription(title: string): Promise<string | undefined> {
  try {
    const res = await net.fetch(
      `https://store-content-ipv4.ak.epicgames.com/api/en-US/content/products/${epicSlug(title)}`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!res.ok) return undefined
    const json = (await res.json()) as { pages?: { type?: string; data?: { about?: { shortDescription?: string } } }[] }
    const page = json.pages?.find((p) => p.type === 'productHome') ?? json.pages?.[0]
    const text = page?.data?.about?.shortDescription
    return text ? decodeEntities(text) : undefined
  } catch {
    return undefined
  }
}

/** Fills in short descriptions for games that don't have one yet; saves each as it arrives. */
export async function ensureDescriptions(notify: (games: Game[]) => void): Promise<void> {
  if (running) return
  running = true
  try {
    const missing = libraryStore()
      .get()
      .games.filter((g) => !g.description && !attempted.has(g.id))
    if (missing.length === 0) return
    for (const g of missing) attempted.add(g.id)

    const found = new Map<string, string>()
    const steam = missing.filter((g) => g.source === 'steam')
    if (steam.length) {
      const byAppId = await steamDescriptions(steam.map((g) => g.sourceId))
      for (const g of steam) {
        const text = byAppId.get(g.sourceId)
        if (text) found.set(g.id, text)
      }
    }
    for (const g of missing.filter((g) => g.source === 'epic')) {
      const text = await epicDescription(g.title)
      if (text) found.set(g.id, text)
    }

    if (found.size === 0) return
    let games = libraryStore().get().games
    for (const [id, description] of found) games = updateGame(id, (g) => ({ ...g, description }))
    notify(games)
  } finally {
    running = false
  }
}
