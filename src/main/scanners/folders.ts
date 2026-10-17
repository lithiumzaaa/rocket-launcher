import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { settingsStore } from '../db'
import { cleanTitle, type ScannedGame, type Scanner } from './types'

/** How deep inside a game folder to look for its exe (UE games keep the real one in Binaries\Win64). */
const MAX_DEPTH = 4

/** Folders inside a game that never hold the game's own exe. */
const SKIP_DIRS = /^(_?redist|_commonredist|redistributables?|directx|dotnet(fx)?|vcredist|prereq(uisites)?|support|installers?|__installer|jre|java|crashpad|easyanticheat|battleye|_steamworks|steamworks shared|steamapps)$/i

/** Exes that are never the game: installers, crash reporters, runtimes, tools. */
const SKIP_EXES = /^(unins\d*|setup|install(er)?|uninstall|.*crash.*|.*report.*|dxsetup|dxwebsetup|vc_?redist.*|vcredist.*|dotnet.*|ue[34]?prereq.*|quicksfv|java[w]?|javaws|easyanticheat.*|beservice.*|7z.*|unitycrashhandler.*|cefprocess|.*helper.*|dumper|updater?)\.exe$/i

/** Bracketed tags in folder names are dropped: "Game [v1.2]" / "Game (x64)" → "Game". */
export function titleFromFolder(name: string): string {
  return cleanTitle(name.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/[_.]+/g, ' '))
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

interface Candidate {
  file: string
  depth: number
  size: number
}

async function findExes(dir: string, depth = 0, out: Candidate[] = []): Promise<Candidate[]> {
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (depth < MAX_DEPTH && !SKIP_DIRS.test(e.name)) await findExes(full, depth + 1, out)
    } else if (e.isFile() && /\.exe$/i.test(e.name) && !SKIP_EXES.test(e.name)) {
      try {
        out.push({ file: full, depth, size: (await fs.stat(full)).size })
      } catch {
        // unreadable file: ignore
      }
    }
  }
  return out
}

/**
 * Picks the exe to launch. Shallow beats deep (a root-level stub like StreetFighterV.exe is
 * the intended entry point even though Binaries\Win64 holds a bigger one), a name matching
 * the folder beats a generic one, then bigger beats smaller.
 */
export function pickMainExe(candidates: Candidate[], folderName: string): string | undefined {
  const folder = norm(titleFromFolder(folderName))
  const score = (c: Candidate): number => {
    const name = norm(path.basename(c.file, '.exe'))
    const nameMatch = name && folder && (folder.includes(name) || name.includes(folder)) ? 6 : 0
    const prefixMatch = !nameMatch && name.slice(0, 4) === folder.slice(0, 4) ? 3 : 0
    const depth = [5, 2, 1, 0, 0][c.depth] ?? 0
    const launcherPenalty = /launcher/i.test(name) ? -1 : 0
    return nameMatch + prefixMatch + depth + launcherPenalty + Math.log10(Math.max(c.size, 1))
  }
  return [...candidates].sort((a, b) => score(b) - score(a))[0]?.file
}

const shortHash = (text: string): string => createHash('sha1').update(text.toLowerCase()).digest('hex').slice(0, 12)

/** Every drive's top-level "Games" folder (D:\Games, E:\Games…), found automatically. */
export async function autoGameFolders(): Promise<string[]> {
  const found: string[] = []
  for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    const p = `${letter}:\\Games`
    try {
      if ((await fs.stat(p)).isDirectory()) found.push(p)
    } catch {
      // no such drive / folder
    }
  }
  return found
}

/** One subfolder of a games folder = one game, if it contains a launchable exe. */
async function scanGameFolder(dir: string): Promise<ScannedGame | null> {
  const exe = pickMainExe(await findExes(dir), path.basename(dir))
  if (!exe) return null
  const installDir = path.normalize(dir)
  return {
    id: `manual:${shortHash(installDir)}`,
    source: 'manual',
    sourceId: installDir,
    title: titleFromFolder(path.basename(dir)),
    installDir,
    exePath: exe
  }
}

export const foldersScanner: Scanner = {
  id: 'manual',
  async scan() {
    const { scanFolders = [], manualGames = [] } = settingsStore().get()
    // Dedupe case-insensitively (D:\Games may be both automatic and user-added).
    const folders = [...(await autoGameFolders()), ...scanFolders]
    const roots = new Map(folders.map((p) => [path.normalize(p).toLowerCase(), p]))

    const results: (ScannedGame | null)[] = []
    for (const root of roots.values()) {
      let subdirs: string[] = []
      try {
        subdirs = (await fs.readdir(root, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => path.join(root, e.name))
      } catch {
        continue // folder removed / drive unplugged
      }
      results.push(...(await Promise.all(subdirs.map(scanGameFolder))))
    }

    // Single games the user added by picking their exe.
    for (const m of manualGames) {
      try {
        await fs.access(m.exePath)
      } catch {
        continue
      }
      results.push({
        id: `manual:exe-${shortHash(m.exePath)}`,
        source: 'manual',
        sourceId: m.exePath,
        title: m.title,
        installDir: path.dirname(m.exePath),
        exePath: m.exePath
      })
    }
    return results.filter((g): g is ScannedGame => g !== null)
  }
}
