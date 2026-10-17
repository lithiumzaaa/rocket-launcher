import { useRef, type KeyboardEvent } from 'react'
import { EyeOff, Gamepad2, RefreshCw, Search, X } from 'lucide-react'
import type { Game } from '@shared/types'
import { totalMinutes } from '@shared/playtime'
import { matchesQuery, SORT_LABEL, sortGames } from '../lib/games'
import { useLibrary } from '../store/library'
import { useUi, type Filter, type LibraryTab, type SortKey } from '../store/ui'
import { Dropdown } from './Dropdown'
import { GameCard } from './GameCard'

const TITLES: Record<Filter, string> = {
  all: 'My games',
  recent: 'Recently played'
}

const TABS: { tab: LibraryTab; label: string }[] = [
  { tab: 'all', label: 'All games' },
  { tab: 'unplayed', label: 'Never played' },
  { tab: 'hidden', label: 'Hidden' }
]

const SORT_OPTIONS = (Object.keys(SORT_LABEL) as SortKey[]).map((value) => ({ value, label: SORT_LABEL[value] }))

/** Games for the current top filter + sub-tab, before search/sort. */
function baseList(games: Game[], filter: Filter, tab: LibraryTab): Game[] {
  if (filter === 'all' && tab === 'hidden') return games.filter((g) => g.hidden)
  const visible = games.filter((g) => !g.hidden)
  if (filter === 'recent') return visible.filter((g) => g.lastPlayed)
  if (tab === 'unplayed') return visible.filter((g) => totalMinutes(g) === 0)
  return visible
}

function emptyMessage(filter: Filter, tab: LibraryTab, query: string): [string, string] {
  if (query) return ['No matches', `Nothing in this list matches “${query}”.`]
  if (filter === 'recent') return ['Nothing played yet', 'Games you play will show up here.']
  if (tab === 'unplayed') return ['You’ve played everything', 'Every installed game has some playtime.']
  if (tab === 'hidden') return ['No hidden games', 'Hide a game from its right-click menu to tidy up your library.']
  return ['Your library is empty', 'Installed games from your launchers will show up here.']
}

export function LibraryView(): JSX.Element {
  const { filter, tab, sort, query, setTab, setSort, setQuery } = useUi()
  const { games, loaded, scanning } = useLibrary()
  const grid = useRef<HTMLDivElement>(null)

  const base = baseList(games, filter, tab)
  // Recently played is always newest-first; the sort menu applies everywhere else.
  const shown = sortGames(
    base.filter((g) => matchesQuery(g, query)),
    filter === 'recent' ? 'recent' : sort
  )

  const visible = games.filter((g) => !g.hidden)
  const tabCounts: Record<LibraryTab, number> = {
    all: visible.length,
    unplayed: visible.filter((g) => totalMinutes(g) === 0).length,
    hidden: games.length - visible.length
  }

  /** Arrow keys move focus across the grid; column count comes from the live CSS grid. */
  const onGridKey = (e: KeyboardEvent<HTMLDivElement>): void => {
    const index = Number((e.target as HTMLElement).dataset.cardIndex)
    if (Number.isNaN(index) || !grid.current) return
    const cols = getComputedStyle(grid.current).gridTemplateColumns.split(' ').length
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key]
    if (!step) return
    e.preventDefault()
    const next = Math.min(Math.max(index + step, 0), shown.length - 1)
    grid.current.querySelector<HTMLElement>(`[data-card-index="${next}"]`)?.focus()
  }

  const [emptyTitle, emptyText] = emptyMessage(filter, tab, query)
  const busy = scanning || !loaded

  return (
    <div className="flex flex-1 flex-col">
      {/* One row: sub-tabs (or a count) on the left, filter + sort on the right, sharing the underline. */}
      <div className="mb-8 flex h-12 items-stretch gap-6 border-b border-white/5">
        {filter === 'all' ? (
          TABS.map(({ tab: t, label }) => {
            const active = t === tab
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`-mb-px flex items-center gap-2 border-b-2 text-sm font-medium transition-colors ${
                  active ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                {t === 'hidden' && <EyeOff size={14} />}
                {label}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                    active ? 'bg-accent text-accent-ink' : 'bg-white/10 text-ink-muted'
                  }`}
                >
                  {tabCounts[t]}
                </span>
              </button>
            )
          })
        ) : (
          <div className="flex items-center gap-2 text-sm font-medium text-ink-muted">
            {TITLES[filter]}
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-accent-ink">
              {base.length}
            </span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-2 pb-1">
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && query && (e.stopPropagation(), setQuery(''))}
              placeholder="Filter games"
              spellCheck={false}
              className="h-9 w-56 select-text rounded-full border border-line bg-black/25 pl-9 pr-8 text-sm text-ink outline-none placeholder:text-ink-faint"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                aria-label="Clear filter"
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted hover:bg-white/10 hover:text-ink"
              >
                <X size={13} />
              </button>
            )}
          </div>
          {filter !== 'recent' && <Dropdown value={sort} options={SORT_OPTIONS} onChange={setSort} prefix="Sort:" />}
        </div>
      </div>

      {shown.length > 0 ? (
        <div
          ref={grid}
          onKeyDown={onGridKey}
          className="grid grid-cols-[repeat(auto-fill,minmax(164px,1fr))] gap-x-6 gap-y-10 pb-4"
        >
          {shown.map((g, i) => (
            <GameCard key={g.id} game={g} index={i} />
          ))}
        </div>
      ) : (
        <div className="card flex flex-1 items-center justify-center py-24">
          <div className="flex max-w-sm flex-col items-center text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-bg-chip">
              {busy ? (
                <RefreshCw size={24} className="animate-spin text-ink-muted" />
              ) : (
                <Gamepad2 size={26} className="text-ink-muted" />
              )}
            </div>
            <h2 className="text-lg font-semibold">{busy && !query ? 'Looking for games…' : emptyTitle}</h2>
            <p className="mt-1 text-sm text-ink-muted">{emptyText}</p>
          </div>
        </div>
      )}
    </div>
  )
}
