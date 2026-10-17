import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

/**
 * Runs `reg` with a UTF-8 console: in the default OEM codepage, piped output mangles
 * non-ASCII names (`Battlefield™ 6` → `BattlefieldT 6`).
 */
async function reg(args: string[], maxBuffer?: number): Promise<string> {
  const command = `chcp 65001>nul & reg ${args.map((a) => `"${a}"`).join(' ')}`
  const { stdout } = await execFileAsync('cmd.exe', ['/d', '/s', '/c', `"${command}"`], {
    windowsHide: true,
    windowsVerbatimArguments: true,
    maxBuffer
  })
  return stdout
}

/** Reads one registry value via `reg query` (no native module). Undefined if the key/value is missing. */
export async function queryValue(key: string, name: string): Promise<string | undefined> {
  try {
    const stdout = await reg(['query', key, '/v', name])
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = stdout.match(new RegExp(`^\\s*${escaped}\\s+REG_\\w+\\s+(.*)$`, 'mi'))
    return match?.[1].trim()
  } catch {
    return undefined
  }
}

/**
 * Every subkey under `key` with its string values (`reg query <key> /s`), e.g. all
 * Uninstall entries in one call. Map key is the subkey's last path segment.
 */
export async function querySubkeys(key: string): Promise<Map<string, Record<string, string>>> {
  const result = new Map<string, Record<string, string>>()
  let stdout: string
  try {
    stdout = await reg(['query', key, '/s'], 32 * 1024 * 1024)
  } catch {
    return result
  }
  let current: Record<string, string> | undefined
  for (const line of stdout.split(/\r?\n/)) {
    if (/^HKEY_/i.test(line)) {
      const name = line.slice(line.lastIndexOf('\\') + 1).trim()
      current = {}
      result.set(name, current)
      continue
    }
    // "    Name    REG_SZ    Value" (names may contain single spaces)
    const m = line.match(/^ {4}(.+?) {4}(REG_\w+) {4}(.*)$/)
    if (m && current) current[m[1]] = m[3].trim()
  }
  return result
}

const UNINSTALL_KEYS = [
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
]

/** Strips the quotes/icon index Windows puts on DisplayIcon: `"C:\x\Game.exe",0`. */
export function iconExe(displayIcon: string | undefined): string | undefined {
  const p = displayIcon?.replace(/,\s*-?\d+$/, '').replace(/^"|"$/g, '').trim()
  return p && /\.exe$/i.test(p) ? p : undefined
}

/** Windows' "installed apps" entries from all three hives. */
export async function uninstallEntries(): Promise<Record<string, string>[]> {
  const maps = await Promise.all(UNINSTALL_KEYS.map(querySubkeys))
  return maps.flatMap((m) => [...m.values()])
}
