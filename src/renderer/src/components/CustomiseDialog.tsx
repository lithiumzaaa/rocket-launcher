import { useEffect, useState, type ReactNode } from 'react'
import { ImageUp, Loader2, RotateCcw, X } from 'lucide-react'
import type { ArtKind, CoverOption, Game } from '@shared/types'
import { useGame, useLibrary } from '../store/library'
import { useUi } from '../store/ui'
import { CoverArt, GameIcon, GameLogo, HeroArt } from './Art'

type ArtState = 'idle' | 'busy' | 'error'

const TABS: { kind: ArtKind; label: string }[] = [
  { kind: 'cover', label: 'Cover' },
  { kind: 'hero', label: 'Hero' },
  { kind: 'logo', label: 'Logo' },
  { kind: 'icon', label: 'Icon' }
]

/** Per kind: where it's used, the current-art preview frame, and the option tile shape. */
const ART: Record<ArtKind, { name: string; usedFor: string; preview: string; grid: string; tile: string; fit: string }> = {
  cover: {
    name: 'cover',
    usedFor: 'Shown in the library grid',
    preview: 'aspect-[2/3] h-24',
    grid: 'grid-cols-[repeat(auto-fill,minmax(92px,1fr))]',
    tile: 'aspect-[2/3]',
    fit: 'object-cover'
  },
  hero: {
    name: 'hero',
    usedFor: 'Shown behind the title on Home and the game page',
    preview: 'aspect-[96/31] h-24',
    grid: 'grid-cols-[repeat(auto-fill,minmax(220px,1fr))]',
    tile: 'aspect-[96/31]',
    fit: 'object-cover'
  },
  icon: {
    name: 'icon',
    usedFor: 'Shown in the Home favourites bar',
    preview: 'aspect-square h-24 bg-black/30 p-3',
    grid: 'grid-cols-[repeat(auto-fill,minmax(72px,1fr))]',
    tile: 'aspect-square bg-black/30 p-2',
    fit: 'object-contain'
  },
  logo: {
    name: 'logo',
    usedFor: 'Shown above the title on Home and the game page',
    preview: 'aspect-[16/9] h-24 bg-black/40 p-3',
    grid: 'grid-cols-[repeat(auto-fill,minmax(180px,1fr))]',
    tile: 'aspect-[16/9] bg-black/40 p-3',
    fit: 'object-contain'
  }
}

/** Pick a game's cover, hero, logo and icon. Every change applies as soon as it's picked. */
export function CustomiseDialog(): JSX.Element | null {
  const customisingId = useUi((s) => s.customisingId)
  const setCustomising = useUi((s) => s.setCustomising)
  const game = useGame(customisingId)
  const apply = useLibrary((s) => s.apply)

  const [kind, setKind] = useState<ArtKind>('cover')
  const [options, setOptions] = useState<Partial<Record<ArtKind, CoverOption[]>>>({})
  const [hasKey, setHasKey] = useState(false)
  const [state, setState] = useState<ArtState>('idle')

  useEffect(() => {
    if (!customisingId) return
    setKind('cover')
    setOptions({})
    setState('idle')
    window.api.getSettings().then((s) => setHasKey(!!s.steamGridDbKey?.trim()))
  }, [customisingId])

  // SteamGridDB options load per tab, the first time it's opened.
  useEffect(() => {
    if (!customisingId || !hasKey || options[kind]) return
    let cancelled = false
    window.api.getArtOptions(customisingId, kind).then((list) => {
      if (!cancelled) setOptions((o) => ({ ...o, [kind]: list }))
    })
    return () => {
      cancelled = true
    }
  }, [customisingId, hasKey, kind, options])

  useEffect(() => {
    if (!customisingId) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setCustomising(undefined)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [customisingId, setCustomising])

  if (!customisingId || !game) return null

  const close = (): void => setCustomising(undefined)
  const a = ART[kind]
  const list = options[kind]
  const busy = state === 'busy'

  const run = async (fn: () => Promise<Game[] | null>): Promise<void> => {
    setState('busy')
    try {
      const games = await fn()
      if (games) apply(games)
      setState('idle')
    } catch {
      setState('error')
    }
  }

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-black/60 p-8 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Customise ${game.title}`}
        className="flex h-[min(680px,100%)] w-full max-w-[880px] flex-col overflow-hidden rounded-card border border-white/10 bg-[#18181c] shadow-[0_30px_80px_rgba(0,0,0,0.6)]"
      >
        <header className="px-7 pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-medium uppercase tracking-[0.14em] text-ink-faint">Customise</div>
              <h2 className="mt-1 truncate text-xl font-semibold">{game.title}</h2>
            </div>
            <button onClick={close} className="icon-btn h-8 w-8 shrink-0" aria-label="Close">
              <X size={15} />
            </button>
          </div>

          <nav className="mt-5 flex gap-7 border-b border-white/5">
            {TABS.map((t) => (
              <button
                key={t.kind}
                onClick={() => {
                  setKind(t.kind)
                  setState('idle')
                }}
                className={`-mb-px border-b-2 pb-3 text-sm font-medium transition-colors ${
                  t.kind === kind ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </header>

        {/* Current art + actions */}
        <div className="flex items-center gap-5 px-7 py-5">
          <div className={`relative shrink-0 overflow-hidden rounded-md bg-bg-card ${a.preview}`}>
            <div className="relative h-full w-full">
              {kind === 'cover' && <CoverArt game={game} />}
              {kind === 'hero' && <HeroArt game={game} />}
              {kind === 'icon' && <GameIcon game={game} />}
              {kind === 'logo' &&
                (game.logoPath ? (
                  <GameLogo game={game} className="h-full w-full !object-center" />
                ) : (
                  <span className="flex h-full items-center justify-center text-xs text-ink-faint">No logo</span>
                ))}
            </div>
            {busy && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 size={20} className="animate-spin" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Current {a.name}</div>
            <div className="mt-0.5 text-xs text-ink-muted">{a.usedFor}</div>
            {state === 'error' && <div className="mt-1 text-xs text-red-400">Couldn’t use that image.</div>}
          </div>
          <div className="flex shrink-0 gap-2">
            <button className="pill" disabled={busy} onClick={() => run(() => window.api.setArtFromFile(game.id, kind))}>
              <ImageUp size={14} /> Choose image
            </button>
            <button
              className="pill"
              disabled={busy}
              onClick={() => run(() => window.api.resetArt(game.id, kind))}
              title="Go back to the automatic art"
            >
              <RotateCcw size={14} /> Reset
            </button>
          </div>
        </div>

        {/* SteamGridDB options: the only part that scrolls */}
        <div className="flex min-h-0 flex-1 flex-col border-t border-white/5">
          <div className="flex items-baseline gap-2 px-7 pb-3 pt-5">
            <span className="text-sm font-medium">SteamGridDB</span>
            {list && list.length > 0 && <span className="text-xs text-ink-faint">{list.length}</span>}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-6">
            {!hasKey ? (
              <Note>Add a SteamGridDB API key in Settings to browse community art.</Note>
            ) : !list ? (
              <Note>
                <Loader2 size={14} className="animate-spin" /> Loading…
              </Note>
            ) : list.length === 0 ? (
              <Note>SteamGridDB has no {a.name} art for this game.</Note>
            ) : (
              <div className={`grid gap-3 ${a.grid}`}>
                {list.map((o) => (
                  <button
                    key={o.url}
                    disabled={busy}
                    onClick={() => run(() => window.api.setArtFromUrl(game.id, kind, o.url))}
                    className={`relative overflow-hidden rounded-md bg-bg-card ring-accent transition hover:ring-2 focus-visible:ring-2 ${a.tile}`}
                    title={`Use this ${o.animated ? 'animated ' : ''}${a.name}`}
                  >
                    <OptionThumb src={o.thumb} className={`h-full w-full ${a.fit}`} />
                    {o.animated && (
                      <span className="absolute bottom-1.5 left-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                        Animated
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-white/5 px-7 py-4">
          <span className="mr-auto text-xs text-ink-faint">Changes apply straight away.</span>
          <button onClick={close} className="btn-accent h-9 px-5 text-sm">
            Done
          </button>
        </footer>
      </div>
    </div>
  )
}

/**
 * SteamGridDB previews: still art has image thumbs, but animated art's thumbs are
 * .webm videos, which an <img> can't show, so those play muted in a loop.
 */
function OptionThumb({ src, className }: { src: string; className: string }): JSX.Element {
  if (/\.(webm|mp4)(\?|$)/i.test(src)) {
    return <video src={src} autoPlay muted loop playsInline preload="auto" className={className} />
  }
  return <img src={src} alt="" loading="lazy" draggable={false} className={className} />
}

function Note({ children }: { children: ReactNode }): JSX.Element {
  return <p className="flex items-center gap-2 py-6 text-sm text-ink-muted">{children}</p>
}
