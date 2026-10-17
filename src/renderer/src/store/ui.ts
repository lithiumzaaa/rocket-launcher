import { create } from 'zustand'

export type Section = 'home' | 'library' | 'settings' | 'game'
/** Favourites aren't a library filter: they live in the Home favourites bar. */
export type Filter = 'all' | 'recent'
/** Sub-tabs inside "My games". */
export type LibraryTab = 'all' | 'unplayed' | 'hidden'
export type SortKey = 'name' | 'recent' | 'playtime' | 'added'

const SORT_KEY = 'rocket-launcher:sort'
const SORTS: SortKey[] = ['name', 'recent', 'playtime', 'added']

function readSort(): SortKey {
  try {
    const v = localStorage.getItem(SORT_KEY) as SortKey | null
    return v && SORTS.includes(v) ? v : 'name'
  } catch {
    return 'name'
  }
}

export interface MenuState {
  gameId: string
  x: number
  y: number
}

interface UiState {
  section: Section
  /** Where "Back" from a game page returns to. */
  previousSection: Exclude<Section, 'game'>
  filter: Filter
  tab: LibraryTab
  sort: SortKey
  /** Inline library filter text. */
  query: string
  gameId?: string
  /** Favourite picked in the Home bar; the hero shows it instead of the last played game. */
  featuredId?: string
  searchOpen: boolean
  menu?: MenuState
  /** Game whose Customise dialog is open. */
  customisingId?: string
  setSection: (section: Exclude<Section, 'game'>) => void
  setFilter: (filter: Filter) => void
  setTab: (tab: LibraryTab) => void
  setSort: (sort: SortKey) => void
  setQuery: (query: string) => void
  openGame: (id: string) => void
  back: () => void
  setFeatured: (id: string | undefined) => void
  setSearchOpen: (open: boolean) => void
  openMenu: (menu: MenuState) => void
  closeMenu: () => void
  setCustomising: (id: string | undefined) => void
}

export const useUi = create<UiState>((set, get) => ({
  section: 'home',
  previousSection: 'home',
  filter: 'all',
  tab: 'all',
  sort: readSort(),
  query: '',
  searchOpen: false,
  setSection: (section) => set({ section }),
  setFilter: (filter) => set({ filter, tab: 'all', section: 'library' }),
  setTab: (tab) => set({ tab }),
  setSort: (sort) => {
    try {
      localStorage.setItem(SORT_KEY, sort)
    } catch {
      // per-viewer convenience only
    }
    set({ sort })
  },
  setQuery: (query) => set({ query }),
  openGame: (gameId) => {
    const { section, previousSection } = get()
    set({
      gameId,
      section: 'game',
      searchOpen: false,
      menu: undefined,
      previousSection: section === 'game' ? previousSection : section
    })
  },
  back: () => set({ section: get().previousSection }),
  setFeatured: (featuredId) => set({ featuredId }),
  setSearchOpen: (searchOpen) => set({ searchOpen, menu: undefined }),
  openMenu: (menu) => set({ menu }),
  closeMenu: () => set({ menu: undefined }),
  setCustomising: (customisingId) => set({ customisingId, menu: undefined })
}))
