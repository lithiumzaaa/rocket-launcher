import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { DEFAULT_SETTINGS, type Game, type Session, type Settings } from '../shared/types'

/** Tiny JSON-file store with atomic writes. One file per store under userData. */
export class JsonStore<T extends object> {
  private data: T
  private readonly file: string

  constructor(name: string, defaults: T) {
    this.file = path.join(app.getPath('userData'), `${name}.json`)
    this.data = { ...defaults, ...this.read() }
  }

  get(): T {
    return this.data
  }

  set(patch: Partial<T>): T {
    this.data = { ...this.data, ...patch }
    this.write()
    return this.data
  }

  replace(data: T): T {
    this.data = data
    this.write()
    return this.data
  }

  private read(): Partial<T> {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'))
    } catch {
      return {}
    }
  }

  private write(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2))
    fs.renameSync(tmp, this.file)
  }
}

let settings: JsonStore<Settings> | undefined
let library: JsonStore<{ games: Game[] }> | undefined

export function settingsStore(): JsonStore<Settings> {
  settings ??= new JsonStore<Settings>('settings', DEFAULT_SETTINGS)
  return settings
}

export function libraryStore(): JsonStore<{ games: Game[] }> {
  library ??= new JsonStore<{ games: Game[] }>('games', { games: [] })
  return library
}

export interface ActiveSession {
  start: number
  /** Last time the process was seen; a crash closes the session here. */
  heartbeat: number
}

export interface SessionsData {
  sessions: Session[]
  active: Record<string, ActiveSession>
}

let sessions: JsonStore<SessionsData> | undefined

export function sessionsStore(): JsonStore<SessionsData> {
  sessions ??= new JsonStore<SessionsData>('sessions', { sessions: [], active: {} })
  return sessions
}

/** Applies `fn` to one game and saves; returns the full updated list. */
export function updateGame(id: string, fn: (game: Game) => Game): Game[] {
  const games = libraryStore()
    .get()
    .games.map((g) => (g.id === id ? fn(g) : g))
  libraryStore().set({ games })
  return games
}
