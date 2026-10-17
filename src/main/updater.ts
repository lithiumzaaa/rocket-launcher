import { app, BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import type { UpdateState } from '../shared/types'
import { markQuitting } from './window'

// electron-updater is CommonJS; the default import is how its named export reaches ESM-style code.
const { autoUpdater } = electronUpdater

const CHECK_EVERY_MS = 4 * 60 * 60_000

let state: UpdateState = { status: 'idle' }

function setState(next: UpdateState): void {
  state = next
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('update:state', state)
}

export const updateState = (): UpdateState => state

/**
 * Checks the public releases repo (electron-builder.yml → publish) on startup and every few
 * hours. Nothing downloads until the user clicks Download; once downloaded it installs on
 * restart, or on the next quit if they ignore it. Development runs have nothing to update.
 */
export function startUpdater(): void {
  if (!app.isPackaged) return

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    // Don't flash "checking" over an update the user already knows about.
    if (state.status === 'idle' || state.status === 'none' || state.status === 'error') setState({ status: 'checking' })
  })
  autoUpdater.on('update-available', (info) => setState({ status: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => setState({ status: 'none' }))
  autoUpdater.on('download-progress', (p) =>
    setState({ status: 'downloading', version: state.version, percent: Math.round(p.percent) })
  )
  autoUpdater.on('update-downloaded', (info) => setState({ status: 'ready', version: info.version }))
  autoUpdater.on('error', (err) => {
    console.error('[updater]', err)
    setState({ status: 'error', version: state.version, message: 'Couldn’t check for updates.' })
  })

  checkForUpdates()
  setInterval(checkForUpdates, CHECK_EVERY_MS)
}

export function checkForUpdates(): void {
  if (!app.isPackaged) {
    setState({ status: 'none' })
    return
  }
  // Already found / fetching one: nothing new to learn.
  if (state.status === 'available' || state.status === 'downloading' || state.status === 'ready') return
  autoUpdater.checkForUpdates().catch(() => {})
}

export function downloadUpdate(): void {
  if (state.status !== 'available' && state.status !== 'error') return
  setState({ status: 'downloading', version: state.version, percent: 0 })
  autoUpdater.downloadUpdate().catch(() => {})
}

export function installUpdate(): void {
  if (state.status !== 'ready') return
  // Otherwise close-to-tray would swallow the quit the installer needs.
  markQuitting()
  autoUpdater.quitAndInstall()
}
