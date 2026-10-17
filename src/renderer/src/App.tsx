import { useEffect, useRef } from 'react'
import { CustomiseDialog } from './components/CustomiseDialog'
import { GameDetail } from './components/GameDetail'
import { GameMenu } from './components/GameMenu'
import { HomeView } from './components/HomeView'
import { LibraryView } from './components/LibraryView'
import { SearchPalette } from './components/SearchPalette'
import { SettingsView } from './components/SettingsView'
import { Sidebar } from './components/Sidebar'
import { TitleBar } from './components/TitleBar'
import { TopBar } from './components/TopBar'
import { UpdateBanner } from './components/UpdateBanner'
import { useLibrary } from './store/library'
import { useUi } from './store/ui'

const isTyping = (el: EventTarget | null): boolean =>
  el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

export default function App(): JSX.Element {
  const section = useUi((s) => s.section)
  const gameId = useUi((s) => s.gameId)
  const main = useRef<HTMLElement>(null)

  useEffect(() => {
    useLibrary.getState().init()
  }, [])

  // New page starts at the top.
  useEffect(() => {
    main.current?.scrollTo({ top: 0 })
  }, [section, gameId])

  // Global shortcuts. Overlays (menu, dialog, search, dropdowns) handle their own Esc in the
  // capture phase and stop it, so this only sees Esc when nothing is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const ui = useUi.getState()
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        ui.setSearchOpen(!ui.searchOpen)
        return
      }
      if (e.key === 'Escape' && !isTyping(e.target) && ui.section === 'game') {
        e.preventDefault()
        ui.back()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex min-h-0 flex-1 pb-3 pr-3">
        <Sidebar />
        <main ref={main} className="flex min-w-0 flex-1 flex-col overflow-y-auto rounded-lg bg-bg-panel px-8 pb-10 pt-6">
          <TopBar />
          {section === 'home' && <HomeView />}
          {section === 'library' && <LibraryView />}
          {section === 'settings' && <SettingsView />}
          {section === 'game' && <GameDetail />}
        </main>
      </div>

      <SearchPalette />
      <GameMenu />
      <CustomiseDialog />
      <UpdateBanner />
    </div>
  )
}
