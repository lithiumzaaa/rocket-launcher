import { useEffect, useState, type MouseEvent } from 'react'
import { Loader2, Play } from 'lucide-react'
import { useIsRunning } from '../store/library'

type LaunchState = 'idle' | 'starting' | 'failed'

/** Launch with feedback; tracks the 'starting' state until the watcher sees the game running. */
function useLaunch(gameId: string): { running: boolean; launch: LaunchState; play: (e?: MouseEvent) => Promise<void> } {
  const running = useIsRunning(gameId)
  const [launch, setLaunch] = useState<LaunchState>('idle')

  useEffect(() => {
    if (running) setLaunch('idle')
  }, [running])

  useEffect(() => {
    if (launch === 'idle') return
    // Launchers can take a while; drop the spinner even if the watcher never sees it start.
    const t = setTimeout(() => setLaunch('idle'), launch === 'starting' ? 20_000 : 4000)
    return () => clearTimeout(t)
  }, [launch])

  const play = async (e?: MouseEvent): Promise<void> => {
    e?.stopPropagation()
    setLaunch('starting')
    try {
      await window.api.launchGame(gameId)
    } catch {
      setLaunch('failed')
    }
  }

  return { running, launch, play }
}

/** Accent pill: "Play" / "Continue playing"; shows "Playing" while the game's process runs. */
export function PlayButton({
  gameId,
  label = 'Play',
  className = ''
}: {
  gameId: string
  label?: string
  className?: string
}): JSX.Element {
  const { running, launch, play } = useLaunch(gameId)

  return (
    <button onClick={play} disabled={running || launch === 'starting'} className={`btn-accent ${className}`}>
      {running ? (
        <>
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent-ink" /> Playing
        </>
      ) : launch === 'starting' ? (
        'Starting…'
      ) : launch === 'failed' ? (
        'Failed to launch'
      ) : (
        <>
          <Play size={14} fill="currentColor" /> {label}
        </>
      )}
    </button>
  )
}

/** Shared look for the round buttons on library cards: dark glass, white icon. */
export const CARD_ROUND_BUTTON =
  'flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white shadow-[0_6px_18px_rgba(0,0,0,0.45)] backdrop-blur transition hover:scale-105 hover:bg-black/80 disabled:hover:scale-100'

/** Round icon-only play button (library card hover). */
export function RoundPlayButton({ gameId }: { gameId: string }): JSX.Element {
  const { running, launch, play } = useLaunch(gameId)
  const title = running ? 'Playing' : launch === 'failed' ? 'Failed to launch' : 'Play'

  return (
    <button
      onClick={play}
      disabled={running || launch === 'starting'}
      title={title}
      aria-label={title}
      className={CARD_ROUND_BUTTON}
    >
      {running ? (
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" />
      ) : launch === 'starting' ? (
        <Loader2 size={18} className="animate-spin" />
      ) : (
        <Play size={18} fill="currentColor" className="ml-0.5" />
      )}
    </button>
  )
}
