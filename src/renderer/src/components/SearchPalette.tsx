import { useEffect, useRef, useState, type ReactNode } from 'react'
import { CornerDownLeft, Play, Search } from 'lucide-react'
import type { Game } from '@shared/types'
import { formatLastPlayed, formatPlaytime, totalMinutes } from '@shared/playtime'
import { searchGames, sortGames } from '../lib/games'
import { useLibrary, visibleGames } from '../store/library'
import { useUi } from '../store/ui'
import { CoverArt } from './Art'

const MAX_RESULTS = 8

/** Ctrl+K quick search over the blurred app: Enter opens a game, Ctrl+Enter plays it. */
export function SearchPalette(): JSX.Element | null {
  const open = useUi((s) => s.searchOpen)
  const setOpen = useUi((s) => s.setSearchOpen)
  const openGame = useUi((s) => s.openGame)
  const games = useLibrary((s) => s.games)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    requestAnimationFrame(() => input.current?.focus())
  }, [open])

  if (!open) return null

  const visible = visibleGames(games)
  const recent = sortGames(
    visible.filter((g) => g.lastPlayed),
    'recent'
  ).slice(0, 6)
  const results = query.trim() ? searchGames(visible, query).slice(0, MAX_RESULTS) : recent
  const close = (): void => setOpen(false)

  const choose = (game: Game | undefined, play: boolean): void => {
    if (!game) return
    close()
    if (play) window.api.launchGame(game.id)
    else openGame(game.id)
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/45 px-6 pt-[12vh] backdrop-blur-md"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div className="w-full max-w-[640px] overflow-hidden rounded-card border border-white/10 bg-[#18181c]/95 shadow-[0_30px_80px_rgba(0,0,0,0.6)]">
        <div className="flex items-center gap-3 border-b border-white/5 px-5">
          <Search size={18} className="shrink-0 text-ink-faint" />
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                close()
              } else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((i) => Math.min(i + 1, results.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((i) => Math.max(i - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                choose(results[active], e.ctrlKey || e.metaKey)
              }
            }}
            placeholder="Search your games…"
            spellCheck={false}
            className="h-14 flex-1 select-text bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint"
          />
          <kbd className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] font-medium text-ink-faint">ESC</kbd>
        </div>

        {!query.trim() && recent.length > 0 && (
          <div className="flex flex-wrap gap-2 px-5 pt-4">
            {recent.slice(0, 4).map((g) => (
              <button key={g.id} onClick={() => choose(g, false)} className="pill h-8 px-3 text-xs">
                {g.title}
              </button>
            ))}
          </div>
        )}

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-ink-muted">
              {query.trim() ? `No games match “${query}”.` : 'Start typing to find a game.'}
            </p>
          ) : (
            <>
              <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-[0.12em] text-ink-faint">
                {query.trim() ? 'Games' : 'Recently played'}
              </div>
              {results.map((g, i) => (
                <ResultRow
                  key={g.id}
                  game={g}
                  active={i === active}
                  onHover={() => setActive(i)}
                  onOpen={() => choose(g, false)}
                  onPlay={() => choose(g, true)}
                />
              ))}
            </>
          )}
        </div>

        <div className="flex items-center gap-5 border-t border-white/5 px-5 py-2.5 text-[11px] text-ink-faint">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>
              <CornerDownLeft size={10} />
            </Kbd>
            open
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>Ctrl</Kbd>
            <Kbd>
              <CornerDownLeft size={10} />
            </Kbd>
            play
          </span>
        </div>
      </div>
    </div>
  )
}

function ResultRow({
  game,
  active,
  onHover,
  onOpen,
  onPlay
}: {
  game: Game
  active: boolean
  onHover: () => void
  onOpen: () => void
  onPlay: () => void
}): JSX.Element {
  const row = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (active) row.current?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const minutes = totalMinutes(game)
  return (
    <div
      ref={row}
      role="option"
      aria-selected={active}
      onMouseMove={onHover}
      onClick={onOpen}
      className={`group flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 ${active ? 'bg-white/[0.07]' : ''}`}
    >
      <div className="relative h-12 w-8 shrink-0 overflow-hidden rounded">
        <CoverArt game={game} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{game.title}</div>
        <div className="truncate text-xs text-ink-muted">
          {minutes > 0 ? `${formatPlaytime(minutes)} · last played ${formatLastPlayed(game.lastPlayed).toLowerCase()}` : 'Not played yet'}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onPlay()
        }}
        title="Play"
        aria-label={`Play ${game.title}`}
        className={`flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-ink transition-opacity ${
          active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <Play size={13} fill="currentColor" className="ml-0.5" />
      </button>
    </div>
  )
}

function Kbd({ children }: { children: ReactNode }): JSX.Element {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-white/10 px-1 text-[10px] font-medium text-ink-muted">
      {children}
    </kbd>
  )
}
