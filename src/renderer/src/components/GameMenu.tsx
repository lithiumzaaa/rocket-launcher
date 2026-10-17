import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Eye, EyeOff, FolderOpen, Heart, Info, Palette, Play, type LucideIcon } from 'lucide-react'
import { useGame, useLibrary } from '../store/library'
import { useUi } from '../store/ui'

/** Right-click / "more" menu for a game. One instance lives in App; opened via useUi().openMenu. */
export function GameMenu(): JSX.Element | null {
  const menu = useUi((s) => s.menu)
  const closeMenu = useUi((s) => s.closeMenu)
  const openGame = useUi((s) => s.openGame)
  const setCustomising = useUi((s) => s.setCustomising)
  const onThisGamesPage = useUi((s) => s.section === 'game' && s.gameId === s.menu?.gameId)
  const game = useGame(menu?.gameId)
  const { toggleFavorite, setHidden } = useLibrary()
  const root = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })

  // Keep the menu inside the window.
  useLayoutEffect(() => {
    if (!menu || !root.current) return
    const { width, height } = root.current.getBoundingClientRect()
    setPos({
      x: Math.min(menu.x, window.innerWidth - width - 8),
      y: Math.min(menu.y, window.innerHeight - height - 8)
    })
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent): void => {
      if (!root.current?.contains(e.target as Node)) closeMenu()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        closeMenu()
      }
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', closeMenu)
    window.addEventListener('wheel', closeMenu, { passive: true })
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', closeMenu)
      window.removeEventListener('wheel', closeMenu)
    }
  }, [menu, closeMenu])

  if (!menu || !game) return null

  const run = (fn: () => unknown) => () => {
    closeMenu()
    fn()
  }

  return (
    <div
      ref={root}
      role="menu"
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[80] min-w-[210px] overflow-hidden rounded-card border border-white/10 bg-[#1d1d22] p-1 shadow-[0_18px_44px_rgba(0,0,0,0.6)]"
    >
      <div className="truncate px-3 pb-1.5 pt-2 text-xs font-medium text-ink-faint">{game.title}</div>
      <Item icon={Play} onClick={run(() => window.api.launchGame(game.id))}>
        Play
      </Item>
      {!onThisGamesPage && (
        <Item icon={Info} onClick={run(() => openGame(game.id))}>
          Game details
        </Item>
      )}
      <Item icon={Heart} onClick={run(() => toggleFavorite(game.id))}>
        {game.favorite ? 'Remove from favourites' : 'Add to favourites'}
      </Item>
      <Separator />
      <Item icon={Palette} onClick={run(() => setCustomising(game.id))}>
        Customise…
      </Item>
      <Item icon={FolderOpen} onClick={run(() => window.api.openGameFolder(game.id))}>
        Open install folder
      </Item>
      <Separator />
      <Item icon={game.hidden ? Eye : EyeOff} onClick={run(() => setHidden(game.id, !game.hidden))}>
        {game.hidden ? 'Show in library' : 'Hide from library'}
      </Item>
    </div>
  )
}

function Item({ icon: Icon, onClick, children }: { icon: LucideIcon; onClick: () => void; children: ReactNode }): JSX.Element {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-ink/90 hover:bg-white/5"
    >
      <Icon size={15} className="shrink-0 text-ink-muted" />
      {children}
    </button>
  )
}

function Separator(): JSX.Element {
  return <div className="mx-2 my-1 h-px bg-white/10" />
}
