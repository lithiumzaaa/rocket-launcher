import { useState, type ReactNode } from 'react'
import { Shuffle, Sparkles } from 'lucide-react'
import type { Game } from '@shared/types'
import { formatPlaytime, totalMinutes } from '@shared/playtime'
import { useUi } from '../store/ui'
import { CoverArt } from './Art'
import { PlayButton } from './PlayButton'
import { CardHeader, formatDay, GameRow, MiniStat } from './PlayerStats'

const DAY_MS = 24 * 60 * 60 * 1000
const FORGOTTEN_AFTER_MS = 90 * DAY_MS
const FORGOTTEN_MIN_MINUTES = 120
const NEW_ARRIVAL_MS = 30 * DAY_MS
/** Rows in each Backlog list. */
const LIST_ROWS = 3

const isPlayed = (g: Game): boolean => totalMinutes(g) > 0 || !!g.lastPlayed

/** Library size, lifetime playtime and how much of the library has been played (ring). */
export function LibraryCard({ games }: { games: Game[] }): JSX.Element {
  const total = games.reduce((sum, g) => sum + totalMinutes(g), 0)
  const played = games.filter(isPlayed).length
  const pct = games.length ? Math.round((played / games.length) * 100) : 0
  const r = 34
  const circumference = 2 * Math.PI * r

  // Ring first, then a 2×2 of totals; spare height is shared between the blocks, not left as one gap.
  return (
    <section className="card flex flex-col p-6">
      <CardHeader title="Library" />
      <div className="mt-4 flex flex-1 flex-col justify-between gap-5">
        <div className="flex items-center gap-5">
          <div className="relative h-[84px] w-[84px] shrink-0">
            <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90">
              <circle cx="42" cy="42" r={r} fill="none" strokeWidth="8" className="stroke-white/10" />
              <circle
                cx="42"
                cy="42"
                r={r}
                fill="none"
                strokeWidth="8"
                strokeLinecap="round"
                className="stroke-accent transition-[stroke-dashoffset] duration-500"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - pct / 100)}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold">{pct}%</span>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium">Library played</div>
            <div className="text-xs text-ink-muted">
              {played.toLocaleString()} of {games.length.toLocaleString()} games launched at least once
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-4">
          <MiniStat value={games.length.toLocaleString()} label="games installed" />
          <MiniStat value={formatPlaytime(total)} label="played in total" />
          <MiniStat value={(games.length - played).toLocaleString()} label="never played" />
          <MiniStat value={played ? formatPlaytime(Math.round(total / played)) : '-'} label="average per played game" />
        </div>
      </div>
    </section>
  )
}

export function MostPlayedCard({ games }: { games: Game[] }): JSX.Element {
  const openGame = useUi((s) => s.openGame)
  const top = [...games]
    .filter((g) => totalMinutes(g) > 0)
    .sort((a, b) => totalMinutes(b) - totalMinutes(a))
    .slice(0, 4)
  const max = top[0] ? totalMinutes(top[0]) : 0

  return (
    <section className="card flex flex-col p-6">
      <CardHeader title="Most played" aside="all time" />
      {top.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">Play a game to see it here.</p>
      ) : (
        <div className="mt-3 flex flex-1 flex-col justify-between gap-2">
          {top.map((g) => {
            const minutes = totalMinutes(g)
            return (
              <button
                key={g.id}
                onClick={() => openGame(g.id)}
                className="-mx-1.5 flex items-center gap-3 rounded-md p-1.5 text-left transition-colors hover:bg-white/5"
              >
                <div className="relative h-14 w-[38px] shrink-0 overflow-hidden rounded-md">
                  <CoverArt game={g} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{g.title}</div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(minutes / max) * 100}%` }} />
                  </div>
                </div>
                <div className="w-16 shrink-0 text-right text-xs text-ink-muted">{formatPlaytime(minutes)}</div>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}

/**
 * Backlog: an unplayed pick to try, big games left alone for months, and games
 * installed recently but never launched. Spans two columns.
 */
export function BacklogCard({ games, className = '' }: { games: Game[]; className?: string }): JSX.Element {
  const now = Date.now()
  const unplayed = games.filter((g) => !isPlayed(g)).sort((a, b) => a.title.localeCompare(b.title))
  // Start on a pick that changes daily; the shuffle button moves on from there.
  const [offset, setOffset] = useState(() => Math.floor(now / DAY_MS))
  const pick = unplayed.length ? unplayed[offset % unplayed.length] : undefined

  const forgotten = games
    .filter((g) => totalMinutes(g) >= FORGOTTEN_MIN_MINUTES && g.lastPlayed && now - g.lastPlayed > FORGOTTEN_AFTER_MS)
    .sort((a, b) => totalMinutes(b) - totalMinutes(a))
    .slice(0, LIST_ROWS)

  // Everything found by the very first scan shares one timestamp; only later finds are "new".
  const firstScan = Math.min(...games.map((g) => g.addedAt ?? Infinity))
  const arrivals = games
    .filter((g) => !isPlayed(g) && g.addedAt && g.addedAt > firstScan && now - g.addedAt < NEW_ARRIVAL_MS)
    .sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0))
    .slice(0, LIST_ROWS)

  return (
    <section className={`card flex flex-col p-6 ${className}`}>
      <CardHeader title="Backlog" aside={`${unplayed.length.toLocaleString()} never played`} />
      <div className="mt-4 grid flex-1 grid-cols-3 gap-6">
        <Column title="Try something new">
          {pick ? (
            // Fixed-size cover with the title and actions below it. Sized so the stack is about
            // as tall as the three-row lists beside it, keeping the columns level.
            <div className="flex min-w-0 flex-col items-start">
              <div className="relative aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-md">
                <CoverArt game={pick} />
              </div>
              <div className="mt-3 flex w-full min-w-0 flex-col">
                <PickTitle game={pick} />
                <div className="mt-0.5 text-[11px] text-ink-muted">Never played</div>
                <div className="mt-3 flex items-center gap-2">
                  <PlayButton gameId={pick.id} className="h-9 px-4 text-sm" />
                  {unplayed.length > 1 && (
                    <button
                      onClick={() => setOffset((o) => o + 1 + Math.floor(Math.random() * (unplayed.length - 1)))}
                      className="icon-btn h-9 w-9"
                      title="Pick another"
                      aria-label="Pick another"
                    >
                      <Shuffle size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <Empty>You’ve played everything in your library.</Empty>
          )}
        </Column>

        <Column title="Forgotten favourites" spread={forgotten.length === LIST_ROWS}>
          {forgotten.length ? (
            forgotten.map((g) => (
              <GameRow key={g.id} game={g}>
                <div className="truncate text-sm font-medium">{g.title}</div>
                <div className="truncate text-[11px] text-ink-muted">
                  {formatPlaytime(totalMinutes(g))} · last {formatDay(g.lastPlayed ?? 0)}
                </div>
              </GameRow>
            ))
          ) : (
            <Empty>Nothing you’ve sunk hours into has been left for 90+ days.</Empty>
          )}
        </Column>

        <Column title="New arrivals" spread={arrivals.length === LIST_ROWS}>
          {arrivals.length ? (
            arrivals.map((g) => (
              <GameRow key={g.id} game={g}>
                <div className="flex items-center gap-1.5 truncate text-sm font-medium">
                  <Sparkles size={12} className="shrink-0 text-accent" />
                  <span className="truncate">{g.title}</span>
                </div>
                <div className="truncate text-[11px] text-ink-muted">Added {formatDay(g.addedAt ?? 0)} · not played yet</div>
              </GameRow>
            ))
          ) : (
            <Empty>No new unplayed games in the last 30 days.</Empty>
          )}
        </Column>
      </div>
    </section>
  )
}

function PickTitle({ game }: { game: Game }): JSX.Element {
  const openGame = useUi((s) => s.openGame)
  return (
    <button
      onClick={() => openGame(game.id)}
      title={game.title}
      className="w-full truncate text-left text-sm font-medium hover:underline"
    >
      {game.title}
    </button>
  )
}

/** A full list (`spread`) stretches to the column height so its last row lines up with its neighbours. */
function Column({ title, spread = false, children }: { title: string; spread?: boolean; children: ReactNode }): JSX.Element {
  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-ink-faint">{title}</div>
      <div className={`flex flex-1 flex-col gap-1 ${spread ? 'justify-between' : ''}`}>{children}</div>
    </div>
  )
}

function Empty({ children }: { children: ReactNode }): JSX.Element {
  return <p className="text-sm text-ink-muted">{children}</p>
}
