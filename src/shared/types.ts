export type GameSource = 'steam' | 'epic' | 'gog' | 'ubisoft' | 'ea' | 'battlenet' | 'xbox' | 'manual'

export interface Game {
  /** `${source}:${sourceId}` */
  id: string
  source: GameSource
  sourceId: string
  title: string
  installDir: string
  exePath?: string
  launchUri?: string
  /** Launch through another program, e.g. Battle.net.exe --exec="launch WoW". Beats launchUri. */
  launchExe?: string
  launchExeArgs?: string[]
  /** Short store blurb, shown under the title in the hero. */
  description?: string
  coverPath?: string
  heroPath?: string
  /** Square icon for the Home favourites bar (SteamGridDB; only fetched for favourites). */
  iconPath?: string
  /** Transparent title logo shown above the name in the hero. */
  logoPath?: string
  /** Minutes tracked by Rocket Launcher's process watcher. */
  playtimeMinutes: number
  /** Lifetime minutes reported by the store (Steam's localconfig.vdf). */
  importedPlaytimeMinutes: number
  /** Epoch ms. */
  lastPlayed?: number
  favorite: boolean
  /** Epoch ms when it was favourited: the favourites bar keeps this order. */
  favoritedAt?: number
  hidden: boolean
  /** Epoch ms when a scan first found this game. */
  addedAt?: number
}

export interface UpdateState {
  /** idle: not checked yet · none: up to date · available: found, not downloaded · ready: downloaded */
  status: 'idle' | 'checking' | 'none' | 'available' | 'downloading' | 'ready' | 'error'
  version?: string
  percent?: number
  message?: string
}

export interface SteamAccount {
  steamId: string
  personaName: string
}

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  iconLocked: string
  /** Steam marks spoiler achievements hidden: name/description stay secret until unlocked. */
  hidden: boolean
  unlocked: boolean
  /** Epoch ms. */
  unlockedAt?: number
  /** Share of all players who unlocked it, 0–100. */
  percent?: number
}

export interface AchievementSet {
  /**
   * ok · none: game has no achievements · no-key / no-account: setup missing ·
   * private: Steam profile hides game details · unsupported: not a Steam game · error: request failed
   */
  status: 'ok' | 'none' | 'no-key' | 'no-account' | 'private' | 'unsupported' | 'error'
  unlocked: number
  total: number
  items: Achievement[]
}

/** A game's art: portrait cover, wide hero banner, square icon, transparent title logo. */
export type ArtKind = 'cover' | 'hero' | 'icon' | 'logo'

export interface CoverOption {
  url: string
  thumb: string
  mime?: string
  /** Animated WebP / GIF / APNG. */
  animated?: boolean
}

export interface Session {
  gameId: string
  /** Epoch ms. */
  start: number
  end: number
  minutes: number
}

export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night'

/** Home dashboard: the player's own stats across every game, from tracked sessions. */
export interface PlayerStats {
  /** Minutes in the last 7 days (today included) and the 7 before. */
  weekMinutes: number
  prevWeekMinutes: number
  /** Days with play in the last 7. */
  weekDaysPlayed: number
  /** Distinct games played in the last 7 days. */
  weekGames: number
  /** Consecutive days with play, ending today (or yesterday, until today is over). */
  currentStreak: number
  longestStreak: number
  sessionCount: number
  averageSessionMinutes: number
  longestSession?: { gameId: string; minutes: number; start: number }
  /** Minutes played per part of the day; all zero with no sessions. */
  dayParts: Record<DayPart, number>
  /** Most recently played games, newest first, with their latest tracked session. */
  recent: { gameId: string; lastPlayed: number; lastSessionMinutes?: number }[]
}

export interface ManualGame {
  exePath: string
  title: string
}

export interface Settings {
  steamGridDbKey?: string
  /** Extra folders whose subfolders are games (every drive's \Games is always included). */
  scanFolders: string[]
  /** Single games added by picking their exe. */
  manualGames: ManualGame[]
  /** Hide to the tray while a game launched from Rocket Launcher is running. */
  minimizeToTrayOnLaunch: boolean
  /** Start in the tray when Windows signs in (installed app only). */
  startWithWindows: boolean
  /** Closing the window keeps the app running in the tray. */
  closeToTray: boolean
  scanOnStartup: boolean
  /** Steam Web API key, for achievements. */
  steamApiKey?: string
}

export const DEFAULT_SETTINGS: Settings = {
  scanFolders: [],
  manualGames: [],
  minimizeToTrayOnLaunch: false,
  startWithWindows: false,
  closeToTray: true,
  scanOnStartup: true
}

/** Surface exposed to the renderer as `window.api`. */
export interface Api {
  /** Window has a Windows 11 acrylic backdrop, so app surfaces should be translucent. */
  acrylic: boolean
  getVersion(): Promise<string>
  getUserName(): Promise<string>
  getSettings(): Promise<Settings>
  setSettings(patch: Partial<Settings>): Promise<Settings>
  testSteamGridDbKey(key: string): Promise<boolean>
  /** Every drive's \Games folder (always scanned). */
  getAutoGameFolders(): Promise<string[]>
  /** Folder picker; null if cancelled. */
  pickFolder(): Promise<string | null>
  /** Exe picker → adds it as a game and rescans; null if cancelled. */
  addGameFromExe(): Promise<Game[] | null>
  getLibrary(): Promise<Game[]>
  /** Fires when the main process changes the library (e.g. a cover finished downloading). Returns unsubscribe. */
  onLibraryUpdated(cb: (games: Game[]) => void): () => void
  scanLibrary(): Promise<Game[]>
  launchGame(id: string): Promise<void>
  /** Favourite / hide toggles. Returns the updated library. */
  setGameFlags(id: string, flags: { favorite?: boolean; hidden?: boolean }): Promise<Game[]>
  openGameFolder(id: string): Promise<void>
  /** SteamGridDB options for one kind of art (empty without an API key). */
  getArtOptions(id: string, kind: ArtKind): Promise<CoverOption[]>
  setArtFromUrl(id: string, kind: ArtKind, url: string): Promise<Game[]>
  /** Opens a file picker; null if cancelled. */
  setArtFromFile(id: string, kind: ArtKind): Promise<Game[] | null>
  /** Drops custom art and re-fetches the default. */
  resetArt(id: string, kind: ArtKind): Promise<Game[]>
  /** True in the installed app (Start with Windows and updates only work there). */
  isPackaged(): Promise<boolean>
  getUpdateState(): Promise<UpdateState>
  onUpdateState(cb: (state: UpdateState) => void): () => void
  checkForUpdates(): Promise<void>
  downloadUpdate(): Promise<void>
  installUpdate(): Promise<void>
  getSteamAccount(): Promise<SteamAccount | null>
  testSteamApiKey(key: string): Promise<boolean>
  getAchievements(id: string): Promise<AchievementSet>
  /** Minutes played per day for the last `days` days (last entry = today). */
  getGameActivity(id: string, days: number): Promise<number[]>
  /** Ids of games whose processes are running right now. */
  getRunning(): Promise<string[]>
  onRunningChanged(cb: (ids: string[]) => void): () => void
  /** Minutes played per day of the given month (index 0 = 1st), from tracked sessions. */
  getActivity(year: number, month: number): Promise<number[]>
  /** Most recent tracked sessions for a game, newest first. */
  getSessions(gameId: string, limit: number): Promise<Session[]>
  /** Personal stats across all games for the Home dashboard. */
  getPlayerStats(recentLimit: number): Promise<PlayerStats>
}
