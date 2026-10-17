import { Info, LayoutGrid } from 'lucide-react'
import type { Game } from '@shared/types'
import { lastPlayedGame, useLibrary, visibleGames } from '../store/library'
import { useUi } from '../store/ui'
import { AchievementSummaryCard } from './AchievementsCard'
import { ActivityCard } from './ActivityCard'
import { FavoritesBar } from './FavoritesBar'
import { GameHero } from './GameHero'
import { BacklogCard, LibraryCard, MostPlayedCard } from './LibraryStats'
import { PlayButton } from './PlayButton'
import {
  HabitsCard,
  HeatmapCard,
  MilestonesCard,
  MonthCard,
  RecentlyPlayed,
  RecordsCard,
  StreakCard,
  TrendsCard,
  usePlayerStats,
  WeekCard
} from './PlayerStats'

/** The hero's game plus the six recently played after it. */
const RECENT_LIMIT = 7

/**
 * The hero is always the last played game, for a one-click relaunch. Everything below
 * it is the player's own stats across all games; per-game stats live on the game page.
 *
 * Every stats row sits on the same three equal columns (wide cards span two), so card
 * edges line up down the page; cards in a row stretch to the same height.
 */
export function HomeView(): JSX.Element {
  const games = useLibrary((s) => s.games)
  const stats = usePlayerStats(RECENT_LIMIT)
  const visible = visibleGames(games)
  const heroGame = lastPlayedGame(games)

  return (
    <div className="flex flex-col gap-6">
      <FavoritesBar />

      {heroGame ? <ContinueHero game={heroGame} /> : <WelcomeHero />}

      {stats && <RecentlyPlayed stats={stats} games={visible} skipId={heroGame?.id} />}

      {stats && (
        <>
          <div className="grid grid-cols-3 gap-6">
            <WeekCard stats={stats} />
            <MonthCard stats={stats} />
            <StreakCard stats={stats} />
          </div>

          <div className="grid grid-cols-3 gap-6">
            <RecordsCard stats={stats} games={games} />
            <MilestonesCard stats={stats} games={visible} />
            <TrendsCard stats={stats} games={games} />
          </div>

          <div className="grid grid-cols-3 gap-6">
            <HeatmapCard stats={stats} className="col-span-2" />
            <HabitsCard stats={stats} />
          </div>
        </>
      )}

      <div className="grid grid-cols-3 gap-6">
        <MostPlayedCard games={visible} />
        <ActivityCard />
        <LibraryCard games={visible} />
      </div>

      <div className="grid grid-cols-3 gap-6">
        <BacklogCard games={visible} className="col-span-2" />
        <AchievementSummaryCard games={games} />
      </div>
    </div>
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
