import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/** The app was called "one-lib" before it became Rocket Launcher; Electron names userData after the product. */
const LEGACY_DIR_NAME = 'one-lib'
const DATA_FILES = ['games.json', 'settings.json', 'sessions.json']
const DATA_DIRS = ['covers']

/**
 * One-time copy of library, playtime, settings and cached art from the old
 * userData folder. Runs before any store is opened; never overwrites new data.
 */
export function migrateLegacyData(): void {
  const target = app.getPath('userData')
  const legacy = path.join(app.getPath('appData'), LEGACY_DIR_NAME)
  if (path.resolve(legacy) === path.resolve(target)) return
  if (fs.existsSync(path.join(target, 'games.json'))) return
  if (!fs.existsSync(path.join(legacy, 'games.json'))) return

  try {
    fs.mkdirSync(target, { recursive: true })
    for (const file of DATA_FILES) {
      const from = path.join(legacy, file)
      if (fs.existsSync(from)) fs.copyFileSync(from, path.join(target, file))
    }
    for (const dir of DATA_DIRS) {
      const from = path.join(legacy, dir)
      if (fs.existsSync(from)) fs.cpSync(from, path.join(target, dir), { recursive: true, force: false })
    }
  } catch (err) {
    // Worst case the library is rebuilt by a scan; playtime from Steam re-imports.
    console.error('[migrate]', err)
  }
}
