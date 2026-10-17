import type { Game, GameSource } from '../../shared/types'

/** What a scanner knows about a game; user/tracking fields are filled in when merging. */
export type ScannedGame = Pick<Game, 'id' | 'source' | 'sourceId' | 'title' | 'installDir'> &
  Partial<Pick<Game, 'exePath' | 'launchUri' | 'launchExe' | 'launchExeArgs'>>

export interface Scanner {
  id: GameSource
  scan(): Promise<ScannedGame[]>
}

/** Strips trademark symbols that clutter titles (and later break art searches). */
export function cleanTitle(title: string): string {
  return title.replace(/[®™©]/g, '').replace(/\s+/g, ' ').trim()
}
