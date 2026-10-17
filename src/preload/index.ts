import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { Api, Game, UpdateState } from '../shared/types'

const api: Api = {
  acrylic: ipcRenderer.sendSync('app:acrylic'),
  getVersion: () => ipcRenderer.invoke('app:version'),
  getUserName: () => ipcRenderer.invoke('app:user-name'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  testSteamGridDbKey: (key) => ipcRenderer.invoke('artwork:test-key', key),
  getAutoGameFolders: () => ipcRenderer.invoke('folders:auto'),
  pickFolder: () => ipcRenderer.invoke('folders:pick'),
  addGameFromExe: () => ipcRenderer.invoke('games:add-exe'),
  getLibrary: () => ipcRenderer.invoke('library:get'),
  onLibraryUpdated: (cb) => {
    const listener = (_e: IpcRendererEvent, games: Game[]): void => cb(games)
    ipcRenderer.on('library:updated', listener)
    return () => ipcRenderer.removeListener('library:updated', listener)
  },
  scanLibrary: () => ipcRenderer.invoke('library:scan'),
  launchGame: (id) => ipcRenderer.invoke('game:launch', id),
  setGameFlags: (id, flags) => ipcRenderer.invoke('game:flags', id, flags),
  openGameFolder: (id) => ipcRenderer.invoke('game:open-folder', id),
  getArtOptions: (id, kind) => ipcRenderer.invoke('artwork:options', id, kind),
  setArtFromUrl: (id, kind, url) => ipcRenderer.invoke('artwork:set-url', id, kind, url),
  setArtFromFile: (id, kind) => ipcRenderer.invoke('artwork:set-file', id, kind),
  resetArt: (id, kind) => ipcRenderer.invoke('artwork:reset', id, kind),
  isPackaged: () => ipcRenderer.invoke('app:packaged'),
  getUpdateState: () => ipcRenderer.invoke('update:get'),
  onUpdateState: (cb) => {
    const listener = (_e: IpcRendererEvent, state: UpdateState): void => cb(state)
    ipcRenderer.on('update:state', listener)
    return () => ipcRenderer.removeListener('update:state', listener)
  },
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  getSteamAccount: () => ipcRenderer.invoke('steam:account'),
  testSteamApiKey: (key) => ipcRenderer.invoke('steam:test-key', key),
  getAchievements: (id) => ipcRenderer.invoke('achievements:get', id),
  getGameActivity: (id, days) => ipcRenderer.invoke('playtime:game-activity', id, days),
  getRunning: () => ipcRenderer.invoke('playtime:running'),
  onRunningChanged: (cb) => {
    const listener = (_e: IpcRendererEvent, ids: string[]): void => cb(ids)
    ipcRenderer.on('playtime:running', listener)
    return () => ipcRenderer.removeListener('playtime:running', listener)
  },
  getActivity: (year, month) => ipcRenderer.invoke('playtime:activity', year, month),
  getSessions: (gameId, limit) => ipcRenderer.invoke('playtime:sessions', gameId, limit)
}

contextBridge.exposeInMainWorld('api', api)
