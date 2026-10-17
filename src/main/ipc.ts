import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from 'electron'
import os from 'node:os'
import path from 'node:path'
import type { ArtKind, Game, Settings } from '../shared/types'
import {
  artOptions,
  clearArt,
  ensureCovers,
  IMAGE_FILE_EXTENSIONS,
  resetHeroAttempts,
  setArtFromFile,
  setArtFromUrl,
  testSteamGridDbKey
} from './artwork'
import { achievementSummary, gameAchievements, invalidateAchievements, steamAccount, testSteamApiKey } from './achievements'
import { libraryStore, settingsStore, updateGame } from './db'
import { checkForUpdates, downloadUpdate, installUpdate, updateState } from './updater'
import { applyStartWithWindows, hideWhilePlaying } from './window'
import { launchGame } from './launcher'
import { ensureDescriptions } from './metadata'
import {
  activityForGame,
  activityForMonth,
  importBattlenetLastPlayed,
  importSteamPlaytime,
  playerStats,
  runningGameIds,
  sessionsForGame
} from './playtime'
import { scanLibrary } from './scanners'
import { autoGameFolders, titleFromFolder } from './scanners/folders'

function findGame(id: string): Game {
  const game = libraryStore()
    .get()
    .games.find((g) => g.id === id)
  if (!game) throw new Error(`Unknown game ${id}`)
  return game
}

const ART_LABEL: Record<ArtKind, string> = { cover: 'a cover', hero: 'a hero image', icon: 'an icon', logo: 'a logo' }

/** Renderer input is untrusted: only the known kinds. */
function artKind(kind: unknown): ArtKind {
  if (kind === 'cover' || kind === 'hero' || kind === 'icon' || kind === 'logo') return kind
  throw new Error(`Unknown art kind ${String(kind)}`)
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload)
}

export const broadcastLibrary = (games: Game[]): void => broadcast('library:updated', games)
export const broadcastRunning = (ids: string[]): void => broadcast('playtime:running', ids)

/** Background art + description fetch; the renderer hears about each via 'library:updated'. */
export function refreshCovers(): void {
  ensureCovers(broadcastLibrary).catch((err) => console.error('[artwork]', err))
  ensureDescriptions(broadcastLibrary).catch((err) => console.error('[metadata]', err))
}

export function registerIpc({ acrylic }: { acrylic: boolean }): void {
  // Sync so the renderer can pick its theme before first paint.
  ipcMain.on('app:acrylic', (e) => (e.returnValue = acrylic))
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('app:user-name', () => {
    const name = os.userInfo().username
    return name.charAt(0).toUpperCase() + name.slice(1)
  })

  ipcMain.handle('settings:get', () => settingsStore().get())
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
    const settings = settingsStore().set(patch)
    if ('steamGridDbKey' in patch) {
      resetHeroAttempts()
      refreshCovers()
    }
    if ('startWithWindows' in patch) applyStartWithWindows(settings.startWithWindows)
    if ('steamApiKey' in patch) invalidateAchievements()
    return settings
  })
  ipcMain.handle('app:packaged', () => app.isPackaged)
  ipcMain.handle('update:get', () => updateState())
  ipcMain.handle('update:check', () => checkForUpdates())
  ipcMain.handle('update:download', () => downloadUpdate())
  ipcMain.handle('update:install', () => installUpdate())
  ipcMain.handle('steam:account', async () => (await steamAccount()) ?? null)
  ipcMain.handle('steam:test-key', (_e, key: string) => testSteamApiKey(key))
  ipcMain.handle('achievements:get', (_e, id: string) => gameAchievements(findGame(id)))
  ipcMain.handle('achievements:summary', () => achievementSummary(libraryStore().get().games))
  ipcMain.handle('artwork:test-key', (_e, key: string) => testSteamGridDbKey(key))

  ipcMain.handle('folders:auto', () => autoGameFolders())
  ipcMain.handle('folders:pick', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const options: OpenDialogOptions = { title: 'Choose a folder that contains your games', properties: ['openDirectory'] }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })
  ipcMain.handle('games:add-exe', async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    const options: OpenDialogOptions = {
      title: 'Choose the game’s .exe',
      properties: ['openFile'],
      filters: [{ name: 'Programs', extensions: ['exe'] }]
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    const exePath = result.filePaths[0]
    if (result.canceled || !exePath) return null
    const { manualGames } = settingsStore().get()
    if (!manualGames.some((m) => m.exePath.toLowerCase() === exePath.toLowerCase())) {
      // Named after its folder ("D:\Stuff\Hades II\Hades2.exe" → "Hades II"); rename later via Edit.
      settingsStore().set({ manualGames: [...manualGames, { exePath, title: titleFromFolder(path.basename(path.dirname(exePath))) }] })
    }
    await scanLibrary()
    refreshCovers()
    return libraryStore().get().games
  })

  ipcMain.handle('library:get', () => libraryStore().get().games)
  ipcMain.handle('library:scan', async () => {
    await scanLibrary()
    await importBattlenetLastPlayed()
    const games = await importSteamPlaytime()
    refreshCovers()
    return games
  })

  ipcMain.handle('game:launch', async (_e, id: string) => {
    await launchGame(findGame(id))
    if (settingsStore().get().minimizeToTrayOnLaunch) hideWhilePlaying(id)
  })
  ipcMain.handle('game:flags', (_e, id: string, flags: { favorite?: boolean; hidden?: boolean }) => {
    const games = updateGame(findGame(id).id, (g) => ({
      ...g,
      ...(typeof flags.favorite === 'boolean' && {
        favorite: flags.favorite,
        favoritedAt: flags.favorite ? (g.favorite ? g.favoritedAt : Date.now()) : undefined
      }),
      ...(typeof flags.hidden === 'boolean' && { hidden: flags.hidden })
    }))
    // A new favourite needs its bar icon.
    if (flags.favorite) refreshCovers()
    return games
  })
  ipcMain.handle('game:open-folder', async (_e, id: string) => {
    const error = await shell.openPath(findGame(id).installDir)
    if (error) throw new Error(error)
  })

  ipcMain.handle('artwork:options', (_e, id: string, kind: ArtKind) => artOptions(findGame(id), artKind(kind)))
  ipcMain.handle('artwork:set-url', (_e, id: string, kind: ArtKind, url: string) =>
    setArtFromUrl(findGame(id), artKind(kind), url)
  )
  ipcMain.handle('artwork:set-file', async (e, id: string, kind: ArtKind) => {
    const game = findGame(id)
    const win = BrowserWindow.fromWebContents(e.sender)
    const options: OpenDialogOptions = {
      title: `Choose ${ART_LABEL[artKind(kind)]} for ${game.title}`,
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: IMAGE_FILE_EXTENSIONS }]
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled || !result.filePaths[0]) return null
    return setArtFromFile(game, artKind(kind), result.filePaths[0])
  })
  ipcMain.handle('artwork:reset', (_e, id: string, kind: ArtKind) => {
    const games = clearArt(findGame(id), artKind(kind))
    refreshCovers()
    return games
  })

  ipcMain.handle('playtime:running', () => runningGameIds())
  ipcMain.handle('playtime:game-activity', (_e, id: string, days: number) =>
    activityForGame(id, Math.min(Math.max(Math.round(days), 1), 366))
  )
  ipcMain.handle('playtime:activity', (_e, year: number, month: number) => activityForMonth(year, month))
  ipcMain.handle('playtime:sessions', (_e, gameId: string, limit: number) => sessionsForGame(gameId, limit))
  ipcMain.handle('playtime:stats', (_e, recentLimit: number) => playerStats(recentLimit))
}
