import { useEffect, useState } from 'react'
import type { AchievementSet } from '@shared/types'
import { useLibrary } from '../store/library'

/**
 * A game's Steam achievements. Re-asks when the running set changes, so unlocks from a
 * session that just ended show up (the main process drops its cache at that moment).
 */
export function useAchievements(gameId: string | undefined): AchievementSet | null {
  const running = useLibrary((s) => s.running)
  const [data, setData] = useState<AchievementSet | null>(null)

  useEffect(() => {
    if (!gameId) return
    let cancelled = false
    window.api.getAchievements(gameId).then((d) => !cancelled && setData(d))
    return () => {
      cancelled = true
    }
  }, [gameId, running])

  // Don't show the previous game's data while the next one loads.
  useEffect(() => setData(null), [gameId])

  return data
}

export interface Rarity {
  label: string
  className: string
}

/** Steam-style rarity buckets from the global unlock percentage. */
export function rarity(percent: number | undefined): Rarity | undefined {
  if (percent === undefined || Number.isNaN(percent)) return undefined
  if (percent < 5) return { label: 'Very rare', className: 'bg-accent/15 text-accent' }
  if (percent < 15) return { label: 'Rare', className: 'bg-white/10 text-ink' }
  if (percent < 40) return { label: 'Uncommon', className: 'bg-white/[0.06] text-ink-muted' }
  return { label: 'Common', className: 'bg-white/[0.06] text-ink-faint' }
}
