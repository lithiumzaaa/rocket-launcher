import { useState } from 'react'
import type { Game } from '@shared/types'

export const artUrl = (file: string): string => `cover://img/${encodeURIComponent(file)}`

/** Cached image that fades in; renders nothing on error so whatever sits underneath shows. */
export function ArtImage({ file, className = '' }: { file: string; className?: string }): JSX.Element | null {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading')
  if (state === 'error') return null
  return (
    <img
      src={artUrl(file)}
      alt=""
      loading="lazy"
      draggable={false}
      onLoad={() => setState('loaded')}
      onError={() => setState('error')}
      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
        state === 'loaded' ? 'opacity-100' : 'opacity-0'
      } ${className}`}
    />
  )
}

function hue(text: string): number {
  let h = 0
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h % 360
}

/** Generated stand-in for games without art. */
export function ArtPlaceholder({ title, showTitle = true }: { title: string; showTitle?: boolean }): JSX.Element {
  const h = hue(title)
  return (
    <div
      className="absolute inset-0 flex items-end p-4"
      style={{
        background: `radial-gradient(120% 80% at 80% 0%, hsl(${h} 55% 38% / 0.9), transparent 60%), linear-gradient(165deg, hsl(${h} 35% 22%), hsl(${(h + 40) % 360} 40% 8%))`
      }}
    >
      {showTitle && (
        <span className="line-clamp-4 text-lg font-bold leading-tight text-white/90 drop-shadow">{title}</span>
      )}
    </div>
  )
}

/** Portrait cover with placeholder underneath. Parent sets size/position (must be relative). */
export function CoverArt({ game }: { game: Game }): JSX.Element {
  return (
    <>
      <ArtPlaceholder title={game.title} />
      {game.coverPath && <ArtImage key={game.coverPath} file={game.coverPath} />}
    </>
  )
}

/**
 * Square game icon: SteamGridDB's transparent icon when we have one, otherwise the top of
 * the cover cropped square. Parent sets size (must be relative).
 */
export function GameIcon({ game }: { game: Game }): JSX.Element {
  if (game.iconPath) return <ArtImage key={game.iconPath} file={game.iconPath} className="!object-contain" />
  return (
    <div className="absolute inset-0 overflow-hidden rounded-md">
      <ArtPlaceholder title={game.title} showTitle={false} />
      {game.coverPath && <ArtImage key={game.coverPath} file={game.coverPath} className="object-top" />}
    </div>
  )
}

/** Transparent title logo, sized by its container; renders nothing if missing or broken. */
export function GameLogo({ game, className = '' }: { game: Game; className?: string }): JSX.Element | null {
  const [failed, setFailed] = useState<string | undefined>()
  if (!game.logoPath || failed === game.logoPath) return null
  return (
    <img
      key={game.logoPath}
      src={artUrl(game.logoPath)}
      alt={game.title}
      draggable={false}
      onError={() => setFailed(game.logoPath)}
      className={`object-contain object-left drop-shadow-[0_4px_16px_rgba(0,0,0,0.6)] ${className}`}
    />
  )
}

/** Wide backdrop: the hero image, else a blurred, zoomed cover, else the gradient. */
export function HeroArt({ game }: { game: Game }): JSX.Element {
  return (
    <>
      <ArtPlaceholder title={game.title} showTitle={false} />
      {game.heroPath ? (
        <ArtImage key={game.heroPath} file={game.heroPath} />
      ) : (
        game.coverPath && <ArtImage key={game.coverPath} file={game.coverPath} className="scale-125 blur-2xl" />
      )}
    </>
  )
}
