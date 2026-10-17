import type { Game } from './types'

/**
 * Steam counts its own launches, and Rocket Launcher also tracks them, so summing
 * would double count. Steam's lifetime figure wins when it's larger; for other
 * stores (imported = 0) it's just what we tracked.
 */
export function totalMinutes(game: Game): number {
  return Math.max(game.importedPlaytimeMinutes, game.playtimeMinutes)
}

export function formatPlaytime(minutes: number): string {
  if (minutes <= 0) return '0 hrs'
  if (minutes < 60) return `${minutes} min`
  const hours = minutes / 60
  return `${hours < 10 ? hours.toFixed(1).replace(/\.0$/, '') : Math.round(hours).toLocaleString()} hrs`
}

/** Exact form for stats and tooltips: "14h 45m", "45m". */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes))
  const h = Math.floor(m / 60)
  if (h === 0) return `${m}m`
  return m % 60 === 0 ? `${h.toLocaleString()}h` : `${h.toLocaleString()}h ${m % 60}m`
}

export function formatLastPlayed(ms: number | undefined, now = Date.now()): string {
  if (!ms) return 'Never'
  const day = 24 * 60 * 60 * 1000
  const startOfToday = new Date(now).setHours(0, 0, 0, 0)
  if (ms >= startOfToday) return 'Today'
  if (ms >= startOfToday - day) return 'Yesterday'
  const days = Math.floor((startOfToday - ms) / day) + 1
  if (days < 7) return `${days} days ago`
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: days > 300 ? 'numeric' : undefined })
}
