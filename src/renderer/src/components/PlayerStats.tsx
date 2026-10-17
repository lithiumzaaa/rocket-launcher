import { useEffect, useState } from 'react'
import { CalendarDays, Flame, Hourglass, Moon, Sun, Sunrise, Sunset, Trophy, TrendingDown, TrendingUp } from 'lucide-react'
import type { DayPart, Game, PlayerStats } from '@shared/types'
import { formatDuration, formatLastPlayed } from '@shared/playtime'
import { useLibrary } from '../store/library'
import { GameCard } from './GameCard'

/** Personal stats across all games; re-queried whenever sessions open or close. */
export function usePlayerStats(recentLimit: number): PlayerStats | undefined {
  const [stats, setStats] = useState<PlayerStats>()
  const games = useLibrary((s) => s.games)
  const running = useLibrary((s) => s.running)
  useEffect(() => {
    window.api.getPlayerStats(recentLimit).then(setStats)
  }, [games, running, recentLimit])
  return stats
}

/** Cover row of the games played before the hero's, with when + the last session length. */
export function RecentlyPlayed({ stats, games, skipId }: { stats: PlayerStats; games: Game[]; skipId?: string }): JSX.Element | null {
  const byId = new Map(games.map((g) => [g.id, g]))
  const items = stats.recent
    .filter((r) => r.gameId !== skipId)
    .map((r) => ({ ...r, game: byId.get(r.gameId) }))
    .filter((r): r is typeof r & { game: Game } => !!r.game)
    .slice(0, 6)
  if (items.length === 0) return null

  return (
    <section>
      <h3 className="mb-4 text-lg font-semibold">Recently played</h3>
      <div className="grid grid-cols-6 gap-6">
        {items.map((r, i) => (
          <GameCard
            key={r.gameId}
            game={r.game}
            index={i}
            subtitle={[formatLastPlayed(r.lastPlayed), r.lastSessionMinutes ? formatDuration(r.lastSessionMinutes) : '']
              .filter(Boolean)
              .join(' · ')}
          />
        ))}
      </div>
    </section>
  )
}

export function WeekCard({ stats }: { stats: PlayerStats }): JSX.Element {
  const { weekMinutes: now, prevWeekMinutes: before } = stats
  const change = before > 0 ? Math.round(((now - before) / before) * 100) : undefined
  const up = now >= before

  return (
    <section className="card flex flex-col p-6">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold">This week</h3>
        <span className="text-xs text-ink-muted">last 7 days</span>
      </div>
      <div className="mt-3 flex items-end gap-3">
        <span className="text-3xl font-semibold tracking-tight">{formatDuration(now)}</span>
        {(change !== undefined || now > 0) && (
          <span
            className={`mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              up ? 'bg-accent/15 text-accent' : 'bg-white/[0.08] text-ink-muted'
            }`}
            title={`Previous 7 days: ${formatDuration(before)}`}
          >
            {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {change === undefined ? 'New' : `${change > 0 ? '+' : ''}${change}%`}
          </span>
        )}
      </div>
      <div className="text-xs text-ink-muted">vs {formatDuration(before)} the week before</div>
      <div className="mt-auto grid grid-cols-2 gap-3 pt-5">
        <MiniStat value={`${stats.weekDaysPlayed}/7`} label="days played" />
        <MiniStat value={stats.weekGames.toLocaleString()} label={stats.weekGames === 1 ? 'game played' : 'games played'} />
      </div>
    </section>
  )
}

export function StreakCard({ stats }: { stats: PlayerStats }): JSX.Element {
  const { currentStreak: current, longestStreak: longest } = stats
  return (
    <section className="card flex flex-col p-6">
      <h3 className="text-lg font-semibold">Streak</h3>
      <div className="mt-3 flex items-center gap-3">
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-full ${
            current > 0 ? 'bg-accent/15 text-accent' : 'bg-white/[0.06] text-ink-faint'
          }`}
        >
          <Flame size={20} />
        </span>
        <div>
          <div className="text-3xl font-semibold tracking-tight">
            {current} <span className="text-base font-medium text-ink-muted">{current === 1 ? 'day' : 'days'}</span>
          </div>
        </div>
      </div>
      <div className="mt-1 text-xs text-ink-muted">
        {current > 0 ? 'Days in a row with play' : 'Play today to start a streak'}
      </div>
      <div className="mt-auto grid grid-cols-2 gap-3 pt-5">
        <MiniStat icon={Trophy} value={`${longest} ${longest === 1 ? 'day' : 'days'}`} label="longest streak" />
        <MiniStat icon={CalendarDays} value={stats.sessionCount.toLocaleString()} label="sessions tracked" />
      </div>
    </section>
  )
}

const DAY_PARTS: { part: DayPart; label: string; icon: typeof Sun }[] = [
  { part: 'morning', label: 'Morning', icon: Sunrise },
  { part: 'afternoon', label: 'Afternoon', icon: Sun },
  { part: 'evening', label: 'Evening', icon: Sunset },
  { part: 'night', label: 'Night', icon: Moon }
]

export function HabitsCard({ stats, games }: { stats: PlayerStats; games: Game[] }): JSX.Element {
  const totals = DAY_PARTS.map((d) => ({ ...d, minutes: stats.dayParts[d.part] }))
  const all = totals.reduce((sum, d) => sum + d.minutes, 0)
  const usual = all > 0 ? totals.reduce((a, b) => (b.minutes > a.minutes ? b : a)) : undefined
  const longest = stats.longestSession
  const longestGame = longest && games.find((g) => g.id === longest.gameId)

  return (
    <section className="card flex flex-col p-6">
      <h3 className="text-lg font-semibold">Play habits</h3>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <MiniStat
          icon={Hourglass}
          value={stats.sessionCount ? formatDuration(stats.averageSessionMinutes) : '-'}
          label="average session"
        />
        <MiniStat
          icon={Trophy}
          value={longest ? formatDuration(longest.minutes) : '-'}
          label={longestGame ? `longest · ${longestGame.title}` : 'longest session'}
        />
      </div>

      <div className="mt-auto pt-5">
        <div className="flex items-baseline justify-between text-xs">
          <span className="text-ink-muted">Usually plays</span>
          <span className="font-medium">{usual ? usual.label.toLowerCase() : '-'}</span>
        </div>
        <div className="mt-2 flex h-2 gap-1 overflow-hidden rounded-full">
          {all === 0 ? (
            <div className="h-full flex-1 rounded-full bg-white/[0.08]" />
          ) : (
            totals
              .filter((d) => d.minutes > 0)
              .map((d) => (
                <div
                  key={d.part}
                  title={`${d.label}: ${formatDuration(d.minutes)}`}
                  className={`h-full rounded-full ${d.part === usual?.part ? 'bg-accent' : 'bg-ink-faint'}`}
                  style={{ flexGrow: d.minutes }}
                />
              ))
          )}
        </div>
        <div className="mt-2 grid grid-cols-4 text-center text-[10px] text-ink-faint">
          {totals.map(({ part, label, icon: Icon }) => (
            <span key={part} className={`flex flex-col items-center gap-0.5 ${part === usual?.part ? 'text-ink' : ''}`}>
              <Icon size={12} />
              {label}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

function MiniStat({ value, label, icon: Icon }: { value: string; label: string; icon?: typeof Sun }): JSX.Element {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 truncate text-lg font-semibold">
        {Icon && <Icon size={14} className="shrink-0 text-ink-faint" />}
        {value}
      </div>
      <div className="truncate text-[11px] text-ink-muted" title={label}>
        {label}
      </div>
    </div>
  )
}
