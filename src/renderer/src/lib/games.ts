import type { Game } from '@shared/types'
import { totalMinutes } from '@shared/playtime'
import type { SortKey } from '../store/ui'

export const SORT_LABEL: Record<SortKey, string> = {
  name: 'Name',
  recent: 'Recently played',
  playtime: 'Most played',
  added: 'Recently added'
}

const byName = (a: Game, b: Game): number => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })

export function sortGames(games: Game[], key: SortKey): Game[] {
  const list = [...games]
  switch (key) {
    case 'recent':
      return list.sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0) || byName(a, b))
    case 'playtime':
      return list.sort((a, b) => totalMinutes(b) - totalMinutes(a) || byName(a, b))
    case 'added':
      return list.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0) || byName(a, b))
    default:
      return list.sort(byName)
  }
}

/** Lowercase, accents stripped, punctuation ignored: "Pokémon: X" matches "pokemon x". */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Every word of the query must appear in the title (any order). */
export function matchesQuery(game: Game, query: string): boolean {
  const words = normalize(query).split(' ').filter(Boolean)
  if (words.length === 0) return true
  const title = normalize(game.title)
  return words.every((w) => title.includes(w))
}

/** Search ranking: title starts with the query, then a word starts with it, then anywhere. */
export function searchGames(games: Game[], query: string): Game[] {
  const q = normalize(query)
  if (!q) return []
  const score = (g: Game): number => {
    const t = normalize(g.title)
    if (t.startsWith(q)) return 0
    if (t.split(' ').some((w) => w.startsWith(q))) return 1
    return 2
  }
  return games
    .filter((g) => matchesQuery(g, query))
    .sort((a, b) => score(a) - score(b) || byName(a, b))
}
