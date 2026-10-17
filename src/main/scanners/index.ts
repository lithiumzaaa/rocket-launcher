import path from 'node:path'
import type { Game, GameSource } from '../../shared/types'
import { libraryStore } from '../db'
import { battlenetScanner } from './battlenet'
import { epicScanner } from './epic'
import { foldersScanner } from './folders'
import { steamScanner } from './steam'
import type { ScannedGame, Scanner } from './types'

/** Launchers first: when a folder-scanned game is also a launcher game, the launcher's entry wins. */
const SCANNERS: Scanner[] = [steamScanner, epicScanner, battlenetScanner, foldersScanner]

/**
 * Runs every scanner, then merges with the saved library: tracking/user fields
 * (playtime, favorite, hidden…) survive, uninstalled games drop out. A scanner
 * that throws keeps its previous games rather than wiping them.
 */
export async function scanLibrary(): Promise<Game[]> {
  const results = await Promise.allSettled(SCANNERS.map((s) => s.scan()))

  const found: ScannedGame[] = []
  const failed = new Set<GameSource>()
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') found.push(...r.value)
    else {
      failed.add(SCANNERS[i].id)
      console.error(`[scan:${SCANNERS[i].id}]`, r.reason)
    }
  })

  const previous = libraryStore().get().games
  const prevById = new Map(previous.map((g) => [g.id, g]))
  const seenDirs = new Set<string>()
  const games: Game[] = []

  const dirKey = (dir: string): string => path.normalize(dir).toLowerCase().replace(/\\+$/, '') + '\\'
  const add = (game: Game): void => {
    const dir = dirKey(game.installDir)
    if (seenDirs.has(dir)) return
    // Folder/manual games must not be a launcher game's folder, inside one, or contain one.
    if (game.source === 'manual') {
      for (const seen of seenDirs) if (seen.startsWith(dir) || dir.startsWith(seen)) return
    }
    seenDirs.add(dir)
    games.push(game)
  }

  const now = Date.now()
  for (const scanned of found) {
    // Fields from removed features (store links, renames/launch options) are dropped on merge.
    const {
      storeUrl: _storeUrl,
      overrides: _overrides,
      sourceTitle: _sourceTitle,
      ...prev
    } = (prevById.get(scanned.id) ?? {}) as Partial<Game> & { storeUrl?: string; overrides?: unknown; sourceTitle?: string }
    add({
      playtimeMinutes: 0,
      importedPlaytimeMinutes: 0,
      favorite: false,
      hidden: false,
      addedAt: now,
      ...prev,
      ...scanned
    })
  }
  for (const g of previous) if (failed.has(g.source)) add(g)

  games.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
  libraryStore().set({ games })
  return games
}
