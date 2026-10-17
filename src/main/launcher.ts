import { shell } from 'electron'
import { spawn } from 'node:child_process'
import path from 'node:path'
import type { Game } from '../shared/types'

function spawnExe(exePath: string, args: string[]): void {
  const child = spawn(exePath, args, { cwd: path.dirname(exePath), detached: true, stdio: 'ignore' })
  // Exes that require admin can't be spawned directly (Windows error 740); opening them via the
  // shell shows the normal UAC prompt instead.
  child.on('error', () => {
    shell.openPath(exePath).catch(() => {})
  })
  child.unref()
}

/** Prefers the store's own launcher (keeps overlays, cloud saves, DRM happy); falls back to the exe. */
export async function launchGame(game: Game): Promise<void> {
  if (game.launchExe) {
    spawnExe(game.launchExe, game.launchExeArgs ?? [])
    return
  }
  if (game.launchUri) {
    await shell.openExternal(game.launchUri)
    return
  }
  if (game.exePath) {
    spawnExe(game.exePath, [])
    return
  }
  throw new Error(`No way to launch ${game.title}`)
}
