import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'

/** The one app window; created in index.ts, shown/hidden from the tray, IPC and playtime. */
let mainWindow: BrowserWindow | null = null
let quitting = false

export function setMainWindow(win: BrowserWindow | null): void {
  mainWindow = win
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

export function showMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

export function hideMainWindow(): void {
  mainWindow?.hide()
}

/** If no game process shows up this long after launch, bring the window back anyway. */
const LAUNCH_GIVE_UP_MS = 3 * 60_000

let hiddenFor: { gameId: string; seen: boolean; timer: NodeJS.Timeout } | undefined

/** "Minimise to tray while playing": hide now, come back when this game's process ends. */
export function hideWhilePlaying(gameId: string): void {
  if (hiddenFor) clearTimeout(hiddenFor.timer)
  hideMainWindow()
  const timer = setTimeout(() => {
    if (hiddenFor && !hiddenFor.seen) {
      hiddenFor = undefined
      showMainWindow()
    }
  }, LAUNCH_GIVE_UP_MS)
  hiddenFor = { gameId, seen: false, timer }
}

/** Fed by the playtime watcher whenever the set of running games changes. */
export function onRunningGamesChanged(ids: string[]): void {
  if (!hiddenFor) return
  if (ids.includes(hiddenFor.gameId)) {
    hiddenFor.seen = true
  } else if (hiddenFor.seen) {
    clearTimeout(hiddenFor.timer)
    hiddenFor = undefined
    showMainWindow()
  }
}

/** Set on a real quit (tray Quit, installer, shutdown) so closing the window doesn't just hide it. */
export function markQuitting(): void {
  quitting = true
}

export function isQuitting(): boolean {
  return quitting
}

/** The .ico: next to the app in an installed build (extraResources), in build/ during development. */
export function appIconPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'icon.ico') : join(app.getAppPath(), 'build', 'icon.ico')
}

/** Started by Windows at sign-in: stay in the tray instead of opening the window. */
export const STARTED_HIDDEN_ARG = '--hidden'
export const startedHidden = (): boolean => process.argv.includes(STARTED_HIDDEN_ARG)

/**
 * Registers/unregisters the Windows "run at sign-in" entry. Only meaningful in the installed
 * app: in development it would point Windows at the bare Electron binary.
 */
export function applyStartWithWindows(enabled: boolean): void {
  if (!app.isPackaged) return
  app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, args: [STARTED_HIDDEN_ARG] })
}
