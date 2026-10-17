import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { cleanTitle, exists, type ScannedGame, type Scanner } from './types'

const execFileAsync = promisify(execFile)

/**
 * Xbox app / Game Pass PC games are Store packages with a MicrosoftGame.config (GDK games);
 * plain Store apps don't have one. Start menu entries give the resolved title and the
 * `PackageFamilyName!AppId` the shell launches by.
 */
const SCRIPT = `
$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$packages = @(Get-AppxPackage | Where-Object {
  -not $_.IsFramework -and $_.InstallLocation -and (Test-Path -LiteralPath (Join-Path $_.InstallLocation 'MicrosoftGame.config'))
} | Select-Object Name, PackageFamilyName, InstallLocation)
$families = @($packages | ForEach-Object { $_.PackageFamilyName })
$apps = @(Get-StartApps | Where-Object { $families -contains ($_.AppID -split '!')[0] } | Select-Object Name, AppID)
ConvertTo-Json -Compress -Depth 3 -InputObject @{ packages = $packages; apps = $apps }
`

interface Package {
  Name: string
  PackageFamilyName: string
  InstallLocation: string
}

interface StartApp {
  Name: string
  AppID: string
}

/** First match of an XML attribute/element, skipping unresolved `ms-resource:` strings. */
function pick(xml: string, re: RegExp): string | undefined {
  const value = xml.match(re)?.[1]?.trim()
  return value && !value.startsWith('ms-resource:') ? value : undefined
}

async function readText(file: string): Promise<string> {
  try {
    return await fs.readFile(file, 'utf8')
  } catch {
    return ''
  }
}

async function toGame(pkg: Package, apps: StartApp[]): Promise<ScannedGame | null> {
  const dir = pkg.InstallLocation
  const [config, manifest] = await Promise.all([
    readText(path.join(dir, 'MicrosoftGame.config')),
    readText(path.join(dir, 'AppxManifest.xml'))
  ])
  const exeName = pick(config, /<Executable\b[^>]*\bName="([^"]+)"/i)
  const exeId = pick(config, /<Executable\b[^>]*\bId="([^"]+)"/i)

  const own = apps.filter((a) => a.AppID.startsWith(`${pkg.PackageFamilyName}!`))
  const app = own.find((a) => a.AppID === `${pkg.PackageFamilyName}!${exeId}`) ?? own[0]
  const appId = app?.AppID.split('!')[1] ?? exeId ?? pick(manifest, /<Application\b[^>]*\bId="([^"]+)"/i)
  if (!appId) return null

  const title =
    app?.Name ??
    pick(config, /\bDefaultDisplayName="([^"]+)"/i) ??
    pick(manifest, /<DisplayName>([^<]+)<\/DisplayName>/i) ??
    pkg.Name
  const exe = exeName && path.join(dir, exeName)

  return {
    id: `xbox:${pkg.PackageFamilyName}`,
    source: 'xbox',
    sourceId: pkg.PackageFamilyName,
    title: cleanTitle(title),
    installDir: path.normalize(dir),
    exePath: exe && (await exists(exe)) ? exe : undefined,
    // Packaged games can't be started by exe; the shell activates them like the Start menu does.
    launchExe: path.join(process.env.SystemRoot ?? 'C:\\Windows', 'explorer.exe'),
    launchExeArgs: [`shell:AppsFolder\\${pkg.PackageFamilyName}!${appId}`]
  }
}

/** PowerShell's JSON turns a one-item array into an object. */
function list<T>(value: T | T[] | null | undefined): T[] {
  return value == null ? [] : Array.isArray(value) ? value : [value]
}

export const xboxScanner: Scanner = {
  id: 'xbox',
  async scan() {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(SCRIPT, 'utf16le').toString('base64')],
      { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }
    )
    const data = JSON.parse(stdout.trim() || '{}') as { packages?: Package | Package[]; apps?: StartApp | StartApp[] }
    const apps = list(data.apps)
    const games = await Promise.all(list(data.packages).map((p) => toGame(p, apps)))
    return games.filter((g): g is ScannedGame => g !== null)
  }
}
