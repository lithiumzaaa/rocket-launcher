import { useEffect, useId, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import { formatDuration } from '@shared/playtime'
import { useLibrary } from '../store/library'
import { Dropdown } from './Dropdown'

type Range = '7' | '30'
const RANGES: { value: Range; label: string }[] = [
  { value: '7', label: 'Week' },
  { value: '30', label: 'Month' }
]

const HEIGHT = 230
const PAD = { left: 40, right: 14, top: 14, bottom: 30 }
/** Candidate axis maxima in hours; the first one that fits the data wins. */
const NICE_MAX = [1, 2, 4, 6, 8, 12, 16, 20, 24]

function dayDate(index: number, count: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - (count - 1 - index))
  return d
}

/** Monotone cubic (Fritsch–Carlson) path: smooth like the reference, never dips below zero. */
function monotonePath(pts: [number, number][]): string {
  const n = pts.length
  if (n === 0) return ''
  if (n === 1) return `M${pts[0][0]},${pts[0][1]}`
  const dx: number[] = []
  const slope: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0])
    slope.push((pts[i + 1][1] - pts[i][1]) / dx[i])
  }
  const tangent: number[] = [slope[0]]
  for (let i = 1; i < n - 1; i++) {
    tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) /
      ((2 * dx[i] + dx[i - 1]) / slope[i - 1] + (dx[i] + 2 * dx[i - 1]) / slope[i]))
  }
  tangent.push(slope[n - 2])

  let d = `M${pts[0][0]},${pts[0][1]}`
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i]
    const [x1, y1] = pts[i + 1]
    const h = dx[i] / 3
    d += ` C${x0 + h},${y0 + h * tangent[i]} ${x1 - h},${y1 - h * tangent[i + 1]} ${x1},${y1}`
  }
  return d
}

/** Daily tracked play time for one game, last week or month. */
export function PlaytimeChart({ gameId }: { gameId: string }): JSX.Element {
  const [range, setRange] = useState<Range>('7')
  const [data, setData] = useState<number[]>([])
  const [width, setWidth] = useState(600)
  const [hover, setHover] = useState<number | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const gradientId = useId()
  // Refresh when sessions change (library broadcast) or a game starts/stops.
  const games = useLibrary((s) => s.games)
  const running = useLibrary((s) => s.running)

  useEffect(() => {
    window.api.getGameActivity(gameId, Number(range)).then(setData)
  }, [gameId, range, games, running])

  useLayoutEffect(() => {
    if (!box.current) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(box.current)
    return () => ro.disconnect()
  }, [])

  const count = data.length
  const hours = data.map((m) => m / 60)
  const maxHours = NICE_MAX.find((m) => m >= Math.max(...hours, 0)) ?? Math.ceil(Math.max(...hours))
  const plotW = Math.max(width - PAD.left - PAD.right, 10)
  const plotH = HEIGHT - PAD.top - PAD.bottom
  const x = (i: number): number => PAD.left + (count > 1 ? (i * plotW) / (count - 1) : plotW / 2)
  const y = (h: number): number => PAD.top + (1 - h / maxHours) * plotH
  const points = hours.map((h, i) => [x(i), y(h)] as [number, number])
  const line = monotonePath(points)
  const baseline = PAD.top + plotH
  const area = count ? `${line} L${x(count - 1)},${baseline} L${x(0)},${baseline} Z` : ''
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxHours)
  const total = data.reduce((a, b) => a + b, 0)

  const labelEvery = count > 7 ? 5 : 1
  const showLabel = (i: number): boolean => (count - 1 - i) % labelEvery === 0
  const dayLabel = (i: number): string =>
    dayDate(i, count).toLocaleDateString(undefined, count > 7 ? { day: 'numeric', month: 'short' } : { weekday: 'short' })

  const onMove = (e: MouseEvent<SVGSVGElement>): void => {
    if (!count) return
    const rect = e.currentTarget.getBoundingClientRect()
    const step = count > 1 ? plotW / (count - 1) : plotW
    setHover(Math.min(Math.max(Math.round((e.clientX - rect.left - PAD.left) / step), 0), count - 1))
  }

  const tick = (h: number): string => (h === 0 ? '0' : h < 1 ? `${Math.round(h * 60)}m` : `${+h.toFixed(1)}h`)

  return (
    <section className="card p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Play time</h3>
          <p className="text-xs text-ink-muted">
            {total > 0 ? `${formatDuration(total)} in the last ${range === '7' ? 'week' : 'month'}` : 'Tracked from your sessions'}
          </p>
        </div>
        <Dropdown value={range} options={RANGES} onChange={setRange} />
      </div>

      <div ref={box} className="relative mt-3">
        <svg
          width={width}
          height={HEIGHT}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          role="img"
          aria-label={`Daily play time over the last ${range} days`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8ee8f5" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#8ee8f5" stopOpacity="0" />
            </linearGradient>
          </defs>

          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="rgba(255,255,255,0.06)" />
              <text x={PAD.left - 10} y={y(t)} dy="0.35em" textAnchor="end" className="fill-ink-faint text-[10px]">
                {tick(t)}
              </text>
            </g>
          ))}

          {data.map((_, i) =>
            showLabel(i) ? (
              <text key={i} x={x(i)} y={HEIGHT - 8} textAnchor="middle" className="fill-ink-faint text-[10px]">
                {dayLabel(i)}
              </text>
            ) : null
          )}

          <path d={area} fill={`url(#${gradientId})`} />
          <path d={line} fill="none" stroke="#8ee8f5" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {hover !== null && (
            <g pointerEvents="none">
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={baseline} stroke="rgba(255,255,255,0.25)" />
              <circle cx={x(hover)} cy={y(hours[hover])} r={5} fill="#8ee8f5" stroke="#1b1b1f" strokeWidth={2} />
            </g>
          )}
        </svg>

        {hover !== null && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-ink px-3 py-2 text-xs text-bg shadow-lg"
            style={{ left: Math.min(Math.max(x(hover), 70), width - 70), top: y(hours[hover]) - 12 }}
          >
            <div className="font-semibold">
              {dayDate(hover, count).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
            </div>
            <div className="mt-0.5 text-bg/70">{data[hover] > 0 ? `Played ${formatDuration(data[hover])}` : 'Not played'}</div>
          </div>
        )}

        {total === 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-[38%] text-center text-sm text-ink-muted">
            No tracked sessions in this period
          </div>
        )}

        {/* Table view of the same data for screen readers. */}
        <table className="sr-only">
          <caption>Daily play time</caption>
          <tbody>
            {data.map((m, i) => (
              <tr key={i}>
                <th scope="row">{dayDate(i, count).toDateString()}</th>
                <td>{formatDuration(m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
