import { useEffect, useState, type ReactNode } from 'react'
import {
  CalendarDays,
  CalendarRange,
  Clock,
  Flame,
  Gamepad2,
  Hourglass,
  Layers,
  Moon,
  RotateCcw,
  Sun,
  Sunrise,
  Sunset,
  Target,
  Trophy,
  TrendingDown,
  TrendingUp
} from 'lucide-react'
import type { DayPart, Game, PlayerStats } from '@shared/types'
import { formatDuration, formatLastPlayed, totalMinutes } from '@shared/playtime'
import { useLibrary } from '../store/library'
import { useUi } from '../store/ui'
import { CoverArt } from './Art'
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
export function RecentlyPlayed({
  stats,
  games,
  skipId
}: {
  stats: PlayerStats
  games: Game[]
  skipId?: string
}): JSX.Element | null {
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
  return (
    <section className="card flex flex-col p-6">
      <CardHeader title="This week" aside="last 7 days" />
      <div className="mt-3 flex items-end gap-3">
        <span className="text-3xl font-semibold tracking-tight">{formatDuration(now)}</span>
        <ChangePill now={now} before={before} title={`Previous 7 days: ${formatDuration(before)}`} />
      </div>
      <div className="text-xs text-ink-muted">vs {formatDuration(before)} the week before</div>
      <div className="mt-auto grid grid-cols-2 gap-3 pt-5">
        <MiniStat value={`${stats.weekDaysPlayed}/7`} label="days played" />
        <MiniStat value={stats.weekGames.toLocaleString()} label={stats.weekGames === 1 ? 'game played' : 'games played'} />
      </div>
    </section>
  )
}

export function MonthCard({ stats }: { stats: PlayerStats }): JSX.Element {
  const { monthMinutes: now, prevMonthToDateMinutes: before } = stats
  const month = new Date().toLocaleString(undefined, { month: 'long' })
  return (
    <section className="card flex flex-col p-6">
      <CardHeader title="This month" aside={month} />
      <div className="mt-3 flex items-end gap-3">
        <span className="text-3xl font-semibold tracking-tight">{formatDuration(now)}</span>
        <ChangePill now={now} before={before} title={`Same days last month: ${formatDuration(before)}`} />
      </div>
      <div className="truncate text-xs text-ink-muted" title={`${formatDuration(stats.prevMonthMinutes)} in all of last month`}>
        vs {formatDuration(before)} by this point last month
      </div>
      <div className="mt-auto grid grid-cols-2 gap-3 pt-5">
        <MiniStat icon={CalendarRange} value={formatDuration(stats.yearMinutes)} label={`in ${new Date().getFullYear()}`} />
        <MiniStat
          icon={Layers}
          value={stats.monthGames.toLocaleString()}
          label={stats.monthGames === 1 ? 'game this month' : 'games this month'}
        />
      </div>
    </section>
  )
}

export function StreakCard({ stats }: { stats: PlayerStats }): JSX.Element {
  const { currentStreak: current, longestStreak: longest } = stats
  return (
    <section className="card flex flex-col p-6">
      <CardHeader title="Streak" />
      <div className="mt-3 flex items-center gap-3">
        <span
          className={`flex h-11 w-11 items-center justify-center rounded-full ${
            current > 0 ? 'bg-accent/15 text-accent' : 'bg-white/[0.06] text-ink-faint'
          }`}
        >
          <Flame size={20} />
        </span>
        <div className="text-3xl font-semibold tracking-tight">
          {current} <span className="text-base font-medium text-ink-muted">{current === 1 ? 'day' : 'days'}</span>
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

export function RecordsCard({ stats, games }: { stats: PlayerStats; games: Game[] }): JSX.Element {
  const longest = stats.longestSession
  const longestGame = longest && games.find((g) => g.id === longest.gameId)
  const rows = [
    {
      icon: Sun,
      label: 'Biggest day',
      sub: stats.bestDay && formatDay(stats.bestDay.day),
      value: stats.bestDay && formatDuration(stats.bestDay.minutes)
    },
    {
      icon: CalendarRange,
      label: 'Biggest week',
      sub: stats.bestWeek && `Week of ${formatDay(stats.bestWeek.start)}`,
      value: stats.bestWeek && formatDuration(stats.bestWeek.minutes)
    },
    {
      icon: Layers,
      label: 'Most games in a day',
      sub: stats.mostGamesInDay && formatDay(stats.mostGamesInDay.day),
      value: stats.mostGamesInDay && stats.mostGamesInDay.count.toLocaleString()
    },
    {
      icon: Hourglass,
      label: 'Longest session',
      sub: longest && [longestGame?.title, formatDay(longest.start)].filter(Boolean).join(' · '),
      value: longest && formatDuration(longest.minutes)
    }
  ]

  return (
    <section className="card flex flex-col p-6">
      <CardHeader title="Personal bests" />
      <div className="mt-3 flex flex-1 flex-col justify-between gap-2">
        {rows.map(({ icon: Icon, label, sub, value }) => (
          <div key={label} className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-ink-muted">
              <Icon size={15} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{label}</div>
              <div className="truncate text-[11px] text-ink-muted" title={sub}>
                {sub ?? 'No sessions yet'}
              </div>
            </div>
            <div className="shrink-0 text-sm font-semibold">{value ?? '-'}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

const HOUR_STEPS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000]
const GAME_STEPS = [1, 5, 10, 25, 50, 100, 250, 500, 1000]
const SESSION_STEPS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]

const nextStep = (steps: number[], value: number): number =>
  steps.find((s) => s > value) ?? Math.ceil((value + 1) / steps[steps.length - 1]) * steps[steps.length - 1]

/** Progress toward the next round number on lifetime totals, plus beating the streak record. */
export function MilestonesCard({ stats, games }: { stats: PlayerStats; games: Game[] }): JSX.Element {
  const hours = Math.floor(games.reduce((sum, g) => sum + totalMinutes(g), 0) / 60)
  const played = games.filter((g) => totalMinutes(g) > 0 || g.lastPlayed).length
  const hoursGoal = nextStep(HOUR_STEPS, hours)
  const gamesGoal = nextStep(GAME_STEPS, played)
  const sessionsGoal = nextStep(SESSION_STEPS, stats.sessionCount)
  const streakGoal = stats.longestStreak + 1

  const rows = [
    {
      label: 'Lifetime playtime',
      value: hours,
      goal: hoursGoal,
      unit: 'hrs',
      hint: `${(hoursGoal - hours).toLocaleString()}h to go`
    },
    {
      label: 'Games played',
      value: played,
      goal: gamesGoal,
      unit: '',
      hint: `${gamesGoal - played} to go`
    },
    {
      label: 'Sessions tracked',
      value: stats.sessionCount,
      goal: sessionsGoal,
      unit: '',
      hint: `${(sessionsGoal - stats.sessionCount).toLocaleString()} to go`
    },
    {
      label: 'Beat your best streak',
      value: stats.currentStreak,
      goal: streakGoal,
      unit: 'days',
      hint: `${streakGoal - stats.currentStreak} ${streakGoal - stats.currentStreak === 1 ? 'day' : 'days'} to go`
    }
  ]

  return (
    <section className="card flex flex-col p-6">
      <CardHeader title="Next milestones" />
      <div className="mt-3 flex flex-1 flex-col justify-between gap-3">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium">{r.label}</span>
              <span className="shrink-0 text-[11px] text-ink-muted">{r.hint}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-500"
                  style={{
                    width: `${Math.min(100, (r.value / r.goal) * 100)}%`
                  }}
                />
              </div>
              <span className="w-24 shrink-0 text-right text-[11px] text-ink-faint">
                {r.value.toLocaleString()} / {r.goal.toLocaleString()} {r.unit}
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/** What's been happening lately: rising game, the week's focus, a comeback. */
export function TrendsCard({ stats, games }: { stats: PlayerStats; games: Game[] }): JSX.Element {
  const byId = new Map(games.map((g) => [g.id, g]))
  const { rising, focus, comeback } = stats
  const rows: {
    icon: typeof Sun
    label: string
    game?: Game
    detail: string
    empty: string
  }[] = [
    {
      icon: TrendingUp,
      label: 'On the rise',
      game: rising && byId.get(rising.gameId),
      detail: rising ? `${formatDuration(rising.minutes)} this week · up from ${formatDuration(rising.prevMinutes)}` : '',
      empty: 'Nothing climbing this week'
    },
    {
      icon: Target,
      label: 'This week’s focus',
      game: focus && byId.get(focus.gameId),
      detail: focus ? `${Math.round(focus.share * 100)}% of your week · ${formatDuration(focus.minutes)}` : '',
      empty: 'No play in the last 7 days'
    },
    {
      icon: RotateCcw,
      label: 'Comeback',
      game: comeback && byId.get(comeback.gameId),
      detail: comeback ? `Back after ${comeback.gapDays} days · ${formatLastPlayed(comeback.at)}` : '',
      empty: 'No returns to old games lately'
    }
  ]

  return (
    <section className="card flex flex-col p-6">
      <CardHeader title="Trending" aside="last 7 days" />
      <div className="mt-3 flex flex-1 flex-col justify-between gap-2">
        {rows.map(({ icon: Icon, label, game, detail, empty }) => (
          <GameRow key={label} game={game}>
            <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
              <Icon size={12} /> {label}
            </div>
            <div className="truncate text-sm font-medium">{game ? game.title : <span className="text-ink-muted">-</span>}</div>
            <div className="truncate text-[11px] text-ink-muted">{game ? detail : empty}</div>
          </GameRow>
        ))}
      </div>
    </section>
  )
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const HEAT_LEVELS = ['bg-bg-hover', 'bg-accent/20', 'bg-accent/40', 'bg-accent/70', 'bg-accent']

function heatLevel(minutes: number, max: number): string {
  if (minutes <= 0 || max <= 0) return HEAT_LEVELS[0]
  return HEAT_LEVELS[Math.min(4, 1 + Math.floor((minutes / max) * 4))]
}

/** Weekday × hour heatmap of when the player plays. Spans two columns. */
export function HeatmapCard({ stats, className = '' }: { stats: PlayerStats; className?: string }): JSX.Element {
  const max = Math.max(0, ...stats.heatmap.flat())
  let peak: { day: number; hour: number } | undefined
  stats.heatmap.forEach((row, day) =>
    row.forEach((m, hour) => {
      if (m > 0 && (!peak || m > stats.heatmap[peak.day][peak.hour])) peak = { day, hour }
    })
  )

  return (
    <section className={`card flex flex-col p-6 ${className}`}>
      <div className="flex items-baseline justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h3 className="text-lg font-semibold">When you play</h3>
          <span className="text-xs text-ink-muted">
            {peak ? `Peak: ${WEEKDAYS_LONG[peak.day]}s around ${formatHour(peak.hour)}` : 'No sessions yet'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
          Less
          {HEAT_LEVELS.map((c) => (
            <span key={c} className={`h-2.5 w-2.5 rounded-[3px] ${c}`} />
          ))}
          More
        </div>
      </div>

      {/* Day rows share the card's height, so a taller row grows the cells instead of leaving a gap. */}
      <div className="mt-4 grid min-h-0 flex-1 grid-cols-[2.25rem_repeat(24,minmax(0,1fr))] grid-rows-[repeat(7,minmax(18px,1fr))_auto] gap-[3px]">
        {stats.heatmap.map((row, day) => (
          <div key={day} className="contents">
            <span className="self-center text-[10px] text-ink-faint">{WEEKDAYS[day]}</span>
            {row.map((m, hour) => (
              <div
                key={hour}
                title={`${WEEKDAYS_LONG[day]} ${formatHour(hour)}: ${formatDuration(m)}`}
                className={`rounded-[3px] ${heatLevel(m, max)}`}
              />
            ))}
          </div>
        ))}
        <span />
        {[0, 6, 12, 18].map((h) => (
          <span key={h} className="col-span-6 pt-1 text-[10px] text-ink-faint">
            {formatHour(h)}
          </span>
        ))}
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

export function HabitsCard({ stats }: { stats: PlayerStats }): JSX.Element {
  const totals = DAY_PARTS.map((d) => ({
    ...d,
    minutes: stats.dayParts[d.part]
  }))
  const all = totals.reduce((sum, d) => sum + d.minutes, 0)
  const usual = all > 0 ? totals.reduce((a, b) => (b.minutes > a.minutes ? b : a)) : undefined

  const dayTotals = stats.heatmap.map((row) => row.reduce((a, b) => a + b, 0))
  const weekdays = dayTotals.slice(0, 5).reduce((a, b) => a + b, 0)
  const weekends = dayTotals.slice(5).reduce((a, b) => a + b, 0)
  const weekdayShare = weekdays + weekends > 0 ? Math.round((weekdays / (weekdays + weekends)) * 100) : undefined

  return (
    // Three blocks spread over the card's height, so spare space is shared rather than one gap.
    <section className="card flex flex-col p-6">
      <CardHeader title="Play habits" />
      <div className="mt-3 flex flex-1 flex-col justify-between gap-5">
        <div className="grid grid-cols-2 gap-3">
          <MiniStat
            icon={Hourglass}
            value={stats.sessionCount ? formatDuration(stats.averageSessionMinutes) : '-'}
            label="average session"
          />
          <MiniStat
            icon={Clock}
            value={stats.typicalStartMinutes !== undefined ? formatClock(stats.typicalStartMinutes) : '-'}
            label="usually starts"
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-ink-muted">Weekdays {weekdayShare !== undefined ? `${weekdayShare}%` : ''}</span>
            <span className="text-ink-muted">{weekdayShare !== undefined ? `${100 - weekdayShare}%` : ''} Weekends</span>
          </div>
          <div className="mt-2 flex h-2 gap-1 overflow-hidden rounded-full">
            {weekdayShare === undefined ? (
              <div className="h-full flex-1 rounded-full bg-white/[0.08]" />
            ) : (
              <>
                {weekdays > 0 && (
                  <div
                    title={`Weekdays: ${formatDuration(weekdays)}`}
                    className={`h-full rounded-full ${weekdays >= weekends ? 'bg-accent' : 'bg-ink-faint'}`}
                    style={{ flexGrow: weekdays }}
                  />
                )}
                {weekends > 0 && (
                  <div
                    title={`Weekends: ${formatDuration(weekends)}`}
                    className={`h-full rounded-full ${weekends > weekdays ? 'bg-accent' : 'bg-ink-faint'}`}
                    style={{ flexGrow: weekends }}
                  />
                )}
              </>
            )}
          </div>
        </div>

        <div>
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
      </div>
    </section>
  )
}

/* ---------- shared bits ---------- */

export function CardHeader({ title, aside }: { title: string; aside?: ReactNode }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="truncate text-lg font-semibold">{title}</h3>
      {aside && <span className="shrink-0 text-xs text-ink-muted">{aside}</span>}
    </div>
  )
}

function ChangePill({ now, before, title }: { now: number; before: number; title: string }): JSX.Element | null {
  if (before <= 0 && now <= 0) return null
  const change = before > 0 ? Math.round(((now - before) / before) * 100) : undefined
  const up = now >= before
  return (
    <span
      className={`mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        up ? 'bg-accent/15 text-accent' : 'bg-white/[0.08] text-ink-muted'
      }`}
      title={title}
    >
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {change === undefined ? 'New' : `${change > 0 ? '+' : ''}${change}%`}
    </span>
  )
}

export function MiniStat({ value, label, icon: Icon }: { value: string; label: string; icon?: typeof Sun }): JSX.Element {
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

/** Small cover + text; opens the game page when there is one. */
export function GameRow({ game, children }: { game?: Game; children: ReactNode }): JSX.Element {
  const openGame = useUi((s) => s.openGame)
  const thumb = (
    <div className="relative h-14 w-[38px] shrink-0 overflow-hidden rounded-md bg-white/[0.06]">
      {game ? <CoverArt game={game} /> : <Gamepad2 size={14} className="absolute inset-0 m-auto text-ink-faint" />}
    </div>
  )
  if (!game) {
    return (
      <div className="-mx-1.5 flex items-center gap-3 p-1.5">
        {thumb}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    )
  }
  return (
    <button
      onClick={() => openGame(game.id)}
      className="-mx-1.5 flex items-center gap-3 rounded-md p-1.5 text-left transition-colors hover:bg-white/5"
    >
      {thumb}
      <div className="min-w-0 flex-1">{children}</div>
    </button>
  )
}

export function formatDay(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric'
  })
}

function formatHour(hour: number): string {
  return new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, {
    hour: 'numeric'
  })
}

/** Minutes after midnight (may run past 1440) → "8:30 pm". */
function formatClock(minutes: number): string {
  const m = Math.round(minutes) % 1440
  return new Date(2000, 0, 1, Math.floor(m / 60), m % 60).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
