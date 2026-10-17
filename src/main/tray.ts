import { app, Menu, nativeImage, Tray, type MenuItemConstructorOptions } from 'electron'
import { libraryStore } from './db'
import { launchGame } from './launcher'
import { appIconPath, markQuitting, showMainWindow } from './window'

const RECENT_IN_MENU = 5

let tray: Tray | null = null

/** Built fresh on every right-click so "recent games" is always current. */
function buildMenu(): Menu {
  const recent = libraryStore()
    .get()
    .games.filter((g) => !g.hidden && g.lastPlayed)
    .sort((a, b) => (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0))
    .slice(0, RECENT_IN_MENU)

  const items: MenuItemConstructorOptions[] = [{ label: 'Open Rocket Launcher', click: showMainWindow }]
  if (recent.length) {
    items.push({ type: 'separator' }, { label: 'Recently played', enabled: false })
    for (const g of recent) {
      items.push({
        label: g.title,
        click: () => launchGame(g).catch((err) => console.error('[tray] launch', err))
      })
    }
  }
  items.push(
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        markQuitting()
        app.quit()
      }
    }
  )
  return Menu.buildFromTemplate(items)
}

export function createTray(): void {
  if (tray) return
  tray = new Tray(nativeImage.createFromPath(appIconPath()))
  tray.setToolTip('Rocket Launcher')
  tray.on('click', showMainWindow)
  tray.on('right-click', () => tray?.popUpContextMenu(buildMenu()))
}
