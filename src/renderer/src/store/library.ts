import { create } from 'zustand'
import type { Game } from '@shared/types'

interface LibraryState {
  games: Game[]
  /** Ids of games currently running (from the main-process watcher). */
  running: string[]
  loaded: boolean
  scanning: boolean
  init: () => Promise<void>
  rescan: () => Promise<void>
  /** Replace the library with a list the main process just returned. */
  apply: (games: Game[]) => void
  toggleFavorite: (id: string) => Promise<void>
  setHidden: (id: string, hidden: boolean) => Promise<void>
}

let initStarted = false

export const useLibrary = create<LibraryState>((set, get) => ({
  games: [],
  running: [],
  loaded: false,
  scanning: false,

  init: async () => {
    if (initStarted) return
    initStarted = true
    window.api.onLibraryUpdated((games) => set({ games }))
    window.api.onRunningChanged((running) => set({ running }))
    const [games, settings, running] = await Promise.all([
      window.api.getLibrary(),
      window.api.getSettings(),
      window.api.getRunning()
    ])
    set({ games, running, loaded: true })
    if (settings.scanOnStartup || games.length === 0) await get().rescan()
  },

  rescan: async () => {
    if (get().scanning) return
    set({ scanning: true })
    try {
      set({ games: await window.api.scanLibrary() })
    } finally {
      set({ scanning: false })
    }
  },

  apply: (games) => set({ games }),

  toggleFavorite: async (id) => {
    const game = get().games.find((g) => g.id === id)
    if (game) set({ games: await window.api.setGameFlags(id, { favorite: !game.favorite }) })
  },

  setHidden: async (id, hidden) => {
    set({ games: await window.api.setGameFlags(id, { hidden }) })
  }
}))

export const visibleGames = (games: Game[]): Game[] => games.filter((g) => !g.hidden)

export const lastPlayedGame = (games: Game[]): Game | undefined =>
  visibleGames(games)
    .filter((g) => g.lastPlayed)
    .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))[0]

export const useGame = (id: string | undefined): Game | undefined =>
  useLibrary((s) => (id ? s.games.find((g) => g.id === id) : undefined))

export const useIsRunning = (id: string): boolean => useLibrary((s) => s.running.includes(id))
