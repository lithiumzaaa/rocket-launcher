import { app, BrowserWindow, nativeTheme, shell } from 'electron'
import { join } from 'path'
import { invalidateAchievements } from './achievements'
import { supportsAcrylic } from './appearance'
import { handleCoverProtocol, registerCoverScheme } from './artwork'
import { settingsStore } from './db'
import { broadcastLibrary, broadcastRunning, refreshCovers, registerIpc } from './ipc'
import { migrateLegacyData } from './migrate'
import { startPlaytime, stopPlaytime } from './playtime'
import { createTray } from './tray'
import { startUpdater } from './updater'
import {
  appIconPath,
  applyStartWithWindows,
  getMainWindow,
  isQuitting,
  markQuitting,
  onRunningGamesChanged,
  setMainWindow,
  showMainWindow,
  startedHidden
} from './window'

const BG = '#0c0c0e'
const TRANSPARENT = '#00000000'
export const TITLEBAR_HEIGHT = 40

function createWindow(acrylic: boolean): void {
  const win = new BrowserWindow({
    width: 1320,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    show: false,
    // Acrylic: DWM blurs the desktop behind the window; the renderer paints translucent layers on top.
    backgroundColor: acrylic ? TRANSPARENT : BG,
    backgroundMaterial: acrylic ? 'acrylic' : 'none',
    autoHideMenuBar: true,
    // Packaged builds take the icon embedded in the exe; dev runs need it pointed at explicitly.
    icon: app.isPackaged ? undefined : appIconPath(),
    // Native caption buttons drawn over our custom titlebar: keeps Win11 snap layouts.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: acrylic ? TRANSPARENT : BG, symbolColor: '#c9cdd6', height: TITLEBAR_HEIGHT },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true
    }
  })
  setMainWindow(win)

  // Started by Windows at sign-in: live in the tray until the user opens it.
  if (!startedHidden()) win.once('ready-to-show', () => win.show())

  // Closing hides to the tray (keeps playtime tracking alive) unless the user really quits.
  win.on('close', (e) => {
    if (!isQuitting() && settingsStore().get().closeToTray) {
      e.preventDefault()
      win.hide()
    }
  })

  // Any link that tries to open a window goes to the default browser instead.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.on('closed', () => setMainWindow(null))
}

registerCoverScheme()

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  migrateLegacyData()

  // Launching the app again (Start menu, desktop shortcut) brings the hidden window back.
  app.on('second-instance', () => {
    if (getMainWindow()) showMainWindow()
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.tristin.rocketlauncher')
    // Dark acrylic tint regardless of the Windows light/dark setting.
    nativeTheme.themeSource = 'dark'
    const acrylic = supportsAcrylic()
    handleCoverProtocol()
    registerIpc({ acrylic })
    createWindow(acrylic)
    createTray()
    applyStartWithWindows(settingsStore().get().startWithWindows)
    startUpdater()
    refreshCovers()
    let running: string[] = []
    startPlaytime({
      onLibrary: broadcastLibrary,
      onRunning: (ids) => {
        // A finished session may have unlocked achievements: drop that game's cache.
        for (const id of running) if (!ids.includes(id)) invalidateAchievements(id)
        running = ids
        broadcastRunning(ids)
        onRunningGamesChanged(ids)
      }
    })
  })

  app.on('before-quit', () => {
    markQuitting()
    stopPlaytime()
  })
  // With close-to-tray off, closing the window quits as before.
  app.on('window-all-closed', () => app.quit())
}
