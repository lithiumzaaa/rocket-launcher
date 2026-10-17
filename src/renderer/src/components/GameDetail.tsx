import { useEffect, useState, type ReactNode } from 'react'
import { CalendarClock, ChevronLeft, Clock, Heart, Hourglass, ListOrdered, MoreHorizontal, Timer } from 'lucide-react'
import type { Game, Session } from '@shared/types'
import { formatDuration, formatLastPlayed, formatPlaytime, totalMinutes } from '@shared/playtime'
import { useGame, useIsRunning, useLibrary, visibleGames } from '../store/library'
import { useUi } from '../store/ui'
import { AchievementsCard } from './AchievementsCard'
import { GameHero } from './GameHero'
import { PlayButton } from './PlayButton'
import { PlaytimeChart } from './PlaytimeChart'

/** All tracked sessions are needed for the stat tiles; the list shows the newest few. */
const SESSION_FETCH_LIMIT = 10_000
const RECENT_SESSIONS = 6

export function GameDetail(): JSX.Element {
  const { gameId, back, openMenu } = useUi()
  const game = useGame(gameId)
  const running = useIsRunning(gameId ?? '')
  const games = useLibrary((s) => s.games)
  const toggleFavorite = useLibrary((s) => s.toggleFavorite)
  const [sessions, setSessions] = useState<Session[]>([])

  useEffect(() => {
    if (gameId) window.api.getSessions(gameId, SESSION_FETCH_LIMIT).then(setSessions)
  }, [gameId, games])

  if (!game) {
    return (
      <div>
        <BackButton onClick={back} />
        <p className="mt-6 text-sm text-ink-muted">This game is no longer installed.</p>
      </div>
    )
  }

  const tracked = sessions.reduce((sum, s) => sum + s.minutes, 0)
  const average = sessions.length ? tracked / sessions.length : 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <BackButton onClick={back} />
        <span className="text-sm text-ink-muted">Back</span>
      </div>

      <GameHero
        game={game}
        actions={
          <>
            <button
              className={`icon-btn ${game.favorite ? 'text-accent hover:text-accent' : ''}`}
              onClick={() => toggleFavorite(game.id)}
              title={game.favorite ? 'Remove from favourites' : 'Add to favourites'}
              aria-pressed={game.favorite}
            >
              <Heart size={16} fill={game.favorite ? 'currentColor' : 'none'} />
            </button>
            <button
              className="icon-btn"
              title="More"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                openMenu({ gameId: game.id, x: r.left, y: r.bottom + 8 })
              }}
            >
              <MoreHorizontal size={16} />
            </button>
            <PlayButton gameId={game.id} />
          </>
        }
      />

      <div className="grid grid-cols-4 gap-6">
        <StatTile label="Time played" icon={Clock} value={formatDuration(totalMinutes(game))} />
        <StatTile label="Last played" icon={CalendarClock} value={running ? 'Now' : formatLastPlayed(game.lastPlayed)} />
        <StatTile label="Sessions" icon={ListOrdered} value={sessions.length.toLocaleString()} />
        <StatTile label="Average session" icon={Hourglass} value={sessions.length ? formatDuration(average) : '-'} />
      </div>

      <div className="grid grid-cols-[2fr_1fr] gap-6">
        <PlaytimeChart gameId={game.id} />
        <OverviewCard game={game} games={games} />
      </div>

      <AchievementsCard gameId={game.id} />

      <section className="card p-6">
        <h3 className="text-lg font-semibold">Recent sessions</h3>
        {sessions.length === 0 ? (
          <p className="mt-3 text-sm text-ink-muted">
            {running ? 'Your current session will appear here when you stop playing.' : 'No sessions tracked yet.'}
          </p>
        ) : (
          <div className="mt-2 grid grid-cols-2 gap-x-8">
            {sessions.slice(0, RECENT_SESSIONS).map((s) => (
              <div key={s.start} className="flex items-center justify-between border-b border-white/5 py-2.5 text-sm">
                <span className="flex items-center gap-2.5 text-ink/90">
                  <Timer size={14} className="text-ink-faint" />
                  {new Date(s.start).toLocaleString(undefined, {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                </span>
                <span className="text-ink-muted">{formatDuration(s.minutes)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function BackButton({ onClick }: { onClick: () => void }): JSX.Element {
  return (
    <button onClick={onClick} className="icon-btn" title="Back" aria-label="Back">
      <ChevronLeft size={18} />
    </button>
  )
}

function StatTile({ label, value, icon: Icon }: { label: string; value: ReactNode; icon: typeof Clock }): JSX.Element {
  return (
    <div className="card px-5 py-4">
      <div className="flex items-center justify-between text-xs text-ink-muted">
        {label}
        <Icon size={14} className="text-ink-faint" />
      </div>
      <div className="mt-1.5 truncate text-2xl font-semibold tracking-tight">{value}</div>
    </div>
  )
}

const RING_SIZE = 168
const RING_STROKE = 12

/** Hours in the centre; the ring is this game's share of all play time in the library. */
function OverviewCard({ game, games }: { game: Game; games: Game[] }): JSX.Element {
  const visible = visibleGames(games)
  const mine = totalMinutes(game)
  const all = visible.reduce((sum, g) => sum + totalMinutes(g), 0)
  const share = all > 0 ? mine / all : 0
  const rank =
    mine > 0 ? [...visible].sort((a, b) => totalMinutes(b) - totalMinutes(a)).findIndex((g) => g.id === game.id) + 1 : 0

  const r = (RING_SIZE - RING_STROKE) / 2
  const circumference = 2 * Math.PI * r
  const hours = mine / 60

  return (
    <section className="card flex flex-col p-6">
      <h3 className="text-lg font-semibold">Overview</h3>
      <div className="relative mx-auto mt-4" style={{ width: RING_SIZE, height: RING_SIZE }}>
        <svg width={RING_SIZE} height={RING_SIZE} className="-rotate-90" aria-hidden>
          <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={RING_STROKE} />
          {share > 0 && (
            <circle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={r}
              fill="none"
              stroke="#8ee8f5"
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={`${Math.max(share * circumference, RING_STROKE)} ${circumference}`}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tracking-tight">
            {hours >= 10 ? Math.round(hours).toLocaleString() : +hours.toFixed(1)}
          </span>
          <span className="text-xs text-ink-muted">hours</span>
        </div>
      </div>
      <div className="mt-auto grid grid-cols-2 gap-3 pt-5 text-center">
        <div>
          <div className="flex items-center justify-center gap-1.5 text-lg font-semibold">
            <span className="h-2 w-2 rounded-full bg-accent" />
            {Math.round(share * 100)}%
          </div>
          <div className="text-[11px] text-ink-muted">of your play time</div>
        </div>
        <div>
          <div className="text-lg font-semibold">{rank ? `#${rank}` : '-'}</div>
          <div className="text-[11px] text-ink-muted">most played</div>
        </div>
      </div>
      <p className="sr-only">
        {game.title}: {formatPlaytime(mine)}, {Math.round(share * 100)} percent of all play time
        {rank ? `, number ${rank} most played` : ''}.
      </p>
    </section>
  )
}
