import type { ReactNode } from 'react'
import { Clock } from 'lucide-react'
import type { Game } from '@shared/types'
import { formatLastPlayed, formatPlaytime, totalMinutes } from '@shared/playtime'
import { useIsRunning } from '../store/library'
import { GameLogo, HeroArt } from './Art'

/** Wide game banner used on Home and the game page: art, last played, logo, title + hours, actions. */
export function GameHero({ game, actions }: { game: Game; actions: ReactNode }): JSX.Element {
  const running = useIsRunning(game.id)

  return (
    <section className="card relative h-[360px] shrink-0 overflow-hidden">
      <HeroArt game={game} />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/35 to-transparent" />

      <div className="absolute left-6 top-5 text-sm text-ink/85">
        {running ? 'Playing now' : `Last played ${formatLastPlayed(game.lastPlayed).toLowerCase()}`}
      </div>

      <div className="absolute inset-x-6 bottom-6 flex items-end justify-between gap-6">
        <div className="min-w-0 max-w-xl">
          <GameLogo game={game} className="mb-4 max-h-28 max-w-[380px]" />
          <div className="flex min-w-0 items-center gap-3">
            <h2 className="truncate text-xl font-semibold tracking-tight drop-shadow">{game.title}</h2>
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-ink">
              <Clock size={12} strokeWidth={2.5} /> {formatPlaytime(totalMinutes(game))} played
            </span>
          </div>
          {game.description && (
            <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-ink/75 drop-shadow" title={game.description}>
              {game.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">{actions}</div>
      </div>
    </section>
  )
}
