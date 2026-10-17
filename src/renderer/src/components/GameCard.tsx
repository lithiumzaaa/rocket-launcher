import { Info } from 'lucide-react'
import type { Game } from '@shared/types'
import { useIsRunning } from '../store/library'
import { useUi } from '../store/ui'
import { CoverArt } from './Art'
import { CARD_ROUND_BUTTON, RoundPlayButton } from './PlayButton'

/** Library tile: cover + title. Hover shows info/play; right-click opens the game menu. */
export function GameCard({ game, index }: { game: Game; index: number }): JSX.Element {
  const openGame = useUi((s) => s.openGame)
  const openMenu = useUi((s) => s.openMenu)
  const running = useIsRunning(game.id)

  return (
    <div className="group min-w-0">
      <div
        role="button"
        tabIndex={0}
        data-card-index={index}
        aria-label={game.title}
        onClick={() => openGame(game.id)}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return
          if (e.key === 'Enter') openGame(game.id)
          if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
            e.preventDefault()
            const r = e.currentTarget.getBoundingClientRect()
            openMenu({ gameId: game.id, x: r.left + r.width / 2, y: r.top + r.height / 2 })
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          openMenu({ gameId: game.id, x: e.clientX, y: e.clientY })
        }}
        className="relative aspect-[2/3] cursor-pointer overflow-hidden rounded-card bg-bg-card shadow-[0_8px_24px_rgba(0,0,0,0.35)] outline-none transition duration-200 focus-visible:ring-2 focus-visible:ring-accent group-hover:-translate-y-1 group-hover:shadow-[0_14px_32px_rgba(0,0,0,0.5)]"
      >
        <CoverArt game={game} />

        {running && (
          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-ink shadow">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-ink" /> Playing
          </span>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent opacity-0 transition-opacity duration-200 group-focus-within:opacity-100 group-hover:opacity-100" />

        <div className="absolute inset-x-0 bottom-5 flex translate-y-2 items-center justify-center gap-3 opacity-0 transition duration-200 group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation()
              openGame(game.id)
            }}
            title="Game details"
            aria-label="Game details"
            className={CARD_ROUND_BUTTON}
          >
            <Info size={18} />
          </button>
          <RoundPlayButton gameId={game.id} />
        </div>
      </div>

      <div className="mt-3 truncate px-0.5 text-sm font-medium" title={game.title}>
        {game.title}
      </div>
    </div>
  )
}
