import { useEffect, useState, type ReactNode } from 'react'
import { formatPlaytime } from '@shared/playtime'
import { useLibrary } from '../store/library'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function level(minutes: number): string {
  if (minutes <= 0) return 'bg-bg-hover'
  if (minutes < 120) return 'hatch bg-bg-hover'
  if (minutes < 240) return 'bg-ink-faint'
  return 'bg-accent'
}

/** Calendar heatmap of tracked play time for the current month (Monday-first). */
export function ActivityCard(): JSX.Element {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth()
  const [days, setDays] = useState<number[]>([])
  // Re-query whenever the library changes: sessions closing update it.
  const games = useLibrary((s) => s.games)
  const running = useLibrary((s) => s.running)

  useEffect(() => {
    window.api.getActivity(year, month).then(setDays)
  }, [games, running, year, month])

  const offset = (new Date(year, month, 1).getDay() + 6) % 7
  const today = now.getDate()
  const total = days.reduce((a, b) => a + b, 0)

  return (
    <section className="card flex flex-col p-6">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold">Activity in {now.toLocaleString(undefined, { month: 'long' })}</h3>
        <span className="text-xs text-ink-muted">{formatPlaytime(total)}</span>
      </div>
      <div className="mt-3 flex items-center gap-4 text-[11px] text-ink-muted">
        <Legend className="bg-bg-hover">0h</Legend>
        <Legend className="hatch bg-bg-hover">&lt; 2h</Legend>
        <Legend className="bg-ink-faint">2h+</Legend>
        <Legend className="bg-accent">4h+</Legend>
      </div>
      {/* Rows share the card's height, so a taller row grows the cells instead of leaving a gap. */}
      <div className="mt-3 grid min-h-0 flex-1 auto-rows-fr grid-cols-7 gap-1.5">
        {Array.from({ length: offset }, (_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {days.map((m, i) => (
          <div
            key={i}
            title={`${i + 1} ${now.toLocaleString(undefined, { month: 'short' })}: ${formatPlaytime(m)}`}
            className={`min-h-[26px] rounded-md ${level(m)} ${i + 1 === today ? 'ring-1 ring-white/40' : ''}`}
          />
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-7 text-center text-[10px] text-ink-faint">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
    </section>
  )
}

function Legend({ className, children }: { className: string; children: ReactNode }): JSX.Element {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${className}`} />
      {children}
    </span>
  )
}
