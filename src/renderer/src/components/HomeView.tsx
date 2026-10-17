import { Info, LayoutGrid } from 'lucide-react'
import type { Game } from '@shared/types'
import { formatPlaytime, totalMinutes } from '@shared/playtime'
import { lastPlayedGame, useLibrary, visibleGames } from '../store/library'
import { useUi } from '../store/ui'
import { AchievementsSummary } from './AchievementsCard'
import { ActivityCard } from './ActivityCard'
import { CoverArt } from './Art'
import { FavoritesBar } from './FavoritesBar'
import { GameHero } from './GameHero'
import { PlayButton } from './PlayButton'

export function HomeView(): JSX.Element {
  const games = useLibrary((s) => s.games)
  const featuredId = useUi((s) => s.featuredId)
  const visible = visibleGames(games)
  // A favourite picked in the bar wins; otherwise the last played game.
  const featured = visible.find((g) => g.id === featuredId && g.favorite)
  const heroGame = featured ?? lastPlayedGame(games)
  const mostPlayed = [...visible]
    .filter((g) => totalMinutes(g) > 0)
    .sort((a, b) => totalMinutes(b) - totalMinutes(a))
    .slice(0, 3)
  const total = visible.reduce((sum, g) => sum + totalMinutes(g), 0)

  return (
    <div className="flex flex-col gap-6">
      <FavoritesBar selectedId={heroGame?.id} />

      {heroGame ? <ContinueHero game={heroGame} /> : <WelcomeHero />}

      <div className="grid grid-cols-[1fr_1.3fr_1.2fr] gap-6">
        {/* The hero game's achievements when it has them (Steam + API key), else library totals. */}
        {(() => {
          const library = <LibraryCard count={visible.length} minutes={total} />
          return heroGame ? <AchievementsSummary gameId={heroGame.id} fallback={library} /> : library
        })()}

        <MostPlayedCard games={mostPlayed} />

        <ActivityCard />
      </div>
    </div>
  )
}

function LibraryCard({ count, minutes }: { count: number; minutes: number }): JSX.Element {
  return (
    <section className="card flex flex-col p-6">
      <h3 className="text-lg font-semibold">Library</h3>
      <div className="mt-3 text-3xl font-semibold">{count}</div>
      <div className="text-xs text-ink-muted">games installed</div>
      <div className="mt-5 text-3xl font-semibold">{formatPlaytime(minutes)}</div>
      <div className="text-xs text-ink-muted">played across all games</div>
    </section>
  )
}

function ContinueHero({ game }: { game: Game }): JSX.Element {
  const openGame = useUi((s) => s.openGame)
  return (
    <GameHero
      game={game}
      actions={
        <>
          <button className="icon-btn" onClick={() => openGame(game.id)} title="Game details">
            <Info size={16} />
          </button>
          <PlayButton gameId={game.id} label={game.lastPlayed ? 'Continue playing' : 'Play'} />
        </>
      }
    />
  )
}

function WelcomeHero(): JSX.Element {
  const setSection = useUi((s) => s.setSection)
  return (
    <section className="card relative h-[340px] overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_75%_10%,rgba(142,232,245,0.22),transparent_55%),radial-gradient(80%_80%_at_10%_100%,rgba(120,90,255,0.18),transparent_60%),linear-gradient(180deg,#1d1f26,#121318)]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
      <div className="absolute inset-x-6 bottom-6 flex items-end justify-between gap-6">
        <div className="max-w-xl">
          <h2 className="text-3xl font-semibold tracking-tight">Welcome to Rocket Launcher</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink/70">
            All your installed games from every launcher, in one place. Play something and it will show up here.
          </p>
        </div>
        <button className="btn-accent" onClick={() => setSection('library')}>
          <LayoutGrid size={16} /> Browse library
        </button>
      </div>
    </section>
  )
}

function MostPlayedCard({ games }: { games: Game[] }): JSX.Element {
  const openGame = useUi((s) => s.openGame)
  const top = games[0] ? totalMinutes(games[0]) : 0

  return (
    <section className="card p-6">
      <h3 className="text-lg font-semibold">Most played</h3>
      {games.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">Play a game to see it here.</p>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          {games.map((g) => {
            const minutes = totalMinutes(g)
            return (
              <button
                key={g.id}
                onClick={() => openGame(g.id)}
                className="flex items-center gap-3 rounded-md p-1.5 text-left transition-colors hover:bg-white/5"
              >
                <div className="relative h-14 w-[38px] shrink-0 overflow-hidden rounded-md">
                  <CoverArt game={g} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{g.title}</div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${(minutes / top) * 100}%` }} />
                  </div>
                </div>
                <div className="w-16 shrink-0 text-right text-xs text-ink-muted">{formatPlaytime(minutes)}</div>
              </button>
            )
          })}
        </div>
      )}
    </section>
  )
}
