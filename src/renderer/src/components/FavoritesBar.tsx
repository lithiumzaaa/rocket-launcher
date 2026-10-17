import { useEffect, useRef, useState } from 'react'
import { Plus, Search, X } from 'lucide-react'
import type { Game } from '@shared/types'
import { matchesQuery, sortGames } from '../lib/games'
import { useLibrary, visibleGames } from '../store/library'
import { useUi } from '../store/ui'
import { GameIcon } from './Art'

/**
 * Home favourites strip (after Battle.net's): an icon per favourite in the order they were
 * added. Clicking one shows it in the hero; right-click for its menu (remove, play…);
 * "+" opens the add list.
 */
export function FavoritesBar({ selectedId }: { selectedId?: string }): JSX.Element {
  const games = useLibrary((s) => s.games)
  const setFeatured = useUi((s) => s.setFeatured)
  const openMenu = useUi((s) => s.openMenu)
  const [adding, setAdding] = useState(false)

  const favorites = visibleGames(games)
    .filter((g) => g.favorite)
    .sort((a, b) => (a.favoritedAt ?? 0) - (b.favoritedAt ?? 0))

  return (
    <section className="card relative flex h-[72px] shrink-0 items-center px-5">
      <span className="mr-4 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">Favourites</span>

      {favorites.map((g) => (
        <FavoriteTile
          key={g.id}
          game={g}
          selected={g.id === selectedId}
          onClick={() => setFeatured(g.id)}
          onMenu={(x, y) => openMenu({ gameId: g.id, x, y })}
        />
      ))}

      {favorites.length === 0 && !adding && (
        <span className="mr-3 text-sm text-ink-faint">Pin the games you play most</span>
      )}

      <div className="relative ml-3">
        <button
          onClick={() => setAdding((a) => !a)}
          className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
            adding ? 'bg-white/15 text-ink' : 'bg-white/[0.08] text-ink-muted hover:bg-white/15 hover:text-ink'
          }`}
          title={adding ? 'Close' : 'Add a favourite'}
          aria-label={adding ? 'Close' : 'Add a favourite'}
          aria-expanded={adding}
        >
          {adding ? <X size={16} /> : <Plus size={17} />}
        </button>
        {adding && <AddFavoriteMenu games={games} onClose={() => setAdding(false)} />}
      </div>
    </section>
  )
}

function FavoriteTile({
  game,
  selected,
  onClick,
  onMenu
}: {
  game: Game
  selected: boolean
  onClick: () => void
  onMenu: (x: number, y: number) => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      onContextMenu={(e) => {
        e.preventDefault()
        onMenu(e.clientX, e.clientY)
      }}
      aria-label={game.title}
      aria-pressed={selected}
      className={`group relative flex h-[72px] w-[72px] shrink-0 items-center justify-center transition-colors ${
        selected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
      }`}
    >
      <span className="float-on-hover relative h-10 w-10">
        <GameIcon game={game} />
      </span>
      {/* Selection underline, like Battle.net's */}
      <span
        className={`absolute inset-x-0 bottom-0 h-0.5 transition-colors ${
          selected ? 'bg-accent' : 'bg-transparent'
        }`}
      />
      <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1 text-xs font-medium text-bg opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {game.title}
      </span>
    </button>
  )
}

/** Dropdown list of every visible non-favourite game, with a filter box. */
function AddFavoriteMenu({ games, onClose }: { games: Game[]; onClose: () => void }): JSX.Element {
  const toggleFavorite = useLibrary((s) => s.toggleFavorite)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    const onDown = (e: MouseEvent): void => {
      // The "+"/"✕" button toggles on its own; ignore clicks on it.
      const target = e.target as Node
      if (!root.current?.contains(target) && !root.current?.parentElement?.contains(target)) onClose()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [onClose])

  const candidates = sortGames(
    visibleGames(games).filter((g) => !g.favorite && matchesQuery(g, query)),
    'name'
  )

  return (
    <div
      ref={root}
      className="absolute left-0 top-full z-40 mt-3 w-[340px] overflow-hidden rounded-card border border-white/10 bg-[#1d1d22] shadow-[0_18px_44px_rgba(0,0,0,0.6)]"
    >
      <div className="px-4 pb-2 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
        Add a favourite
      </div>
      <div className="relative mx-3 mb-2">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input
          ref={input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a game"
          spellCheck={false}
          className="h-9 w-full select-text rounded-md border border-line bg-black/30 pl-8 pr-3 text-sm text-ink outline-none placeholder:text-ink-faint"
        />
      </div>
      <div className="max-h-[360px] overflow-y-auto px-1.5 pb-1.5">
        {candidates.length === 0 ? (
          <p className="px-3 py-4 text-sm text-ink-muted">
            {query ? `No games match “${query}”.` : 'Every game is already a favourite.'}
          </p>
        ) : (
          candidates.map((g) => (
            <button
              key={g.id}
              onClick={() => {
                toggleFavorite(g.id)
                onClose()
              }}
              className="flex w-full items-center gap-3 rounded-md px-2.5 py-1.5 text-left text-sm text-ink/90 hover:bg-white/5"
            >
              <span className="relative h-7 w-7 shrink-0">
                <GameIcon game={g} />
              </span>
              <span className="truncate">{g.title}</span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
