import fs from 'node:fs/promises'
import path from 'node:path'
import { iconExe, querySubkeys, uninstallEntries } from './registry'
import { cleanTitle, exists, type ScannedGame, type Scanner } from './types'

/** Per-game folders named like the game's EAInstaller folder, holding `base-<offerId>`. */
const INSTALL_DATA = path.join(process.env.ProgramData ?? 'C:\\ProgramData', 'EA Desktop', 'InstallData')

/** `"…\EAInstaller\Battlefield 6\Cleanup.exe" uninstall_game` → `Battlefield 6`. */
const CLEANUP = /EAInstaller\\([^\\]+)\\Cleanup\.exe"?\s+uninstall_game/i

/** The offer id `origin2://` launches by (e.g. `Origin.SFT.50.0001545`); undefined if EA's layout changed. */
async function offerId(slug: string): Promise<string | undefined> {
  try {
    const base = (await fs.readdir(path.join(INSTALL_DATA, slug))).find((d) => d.toLowerCase().startsWith('base-'))
    return base?.slice('base-'.length)
  } catch {
    return undefined
  }
}

export const eaScanner: Scanner = {
  id: 'ea',
  async scan() {
    const [entries, handler] = await Promise.all([
      uninstallEntries(),
      querySubkeys('HKCR\\origin2\\shell\\open\\command')
    ])
    // The EA app still answers Origin's protocol.
    const hasClient = handler.size > 0

    const games = await Promise.all(
      entries.map(async (e): Promise<ScannedGame | null> => {
        const slug = (e.UninstallString ?? '').match(CLEANUP)?.[1]
        if (!slug || !e.DisplayName || !e.InstallLocation) return null
        if (!(await exists(e.InstallLocation))) return null

        const exe = iconExe(e.DisplayIcon)
        const offer = await offerId(slug)
        return {
          // Keyed by the install slug so a missing offer id never changes the game's id.
          id: `ea:${slug}`,
          source: 'ea',
          sourceId: offer ?? slug,
          title: cleanTitle(e.DisplayName),
          installDir: path.normalize(e.InstallLocation),
          exePath: exe && (await exists(exe)) ? exe : undefined,
          // Through the EA app so login, anti-cheat bootstrap and updates happen.
          ...(hasClient && offer && { launchUri: `origin2://game/launch?offerIds=${encodeURIComponent(offer)}` })
        }
      })
    )
    return games.filter((g): g is ScannedGame => g !== null)
  }
}
