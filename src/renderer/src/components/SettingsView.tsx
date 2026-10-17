import { useEffect, useState, type ReactNode } from 'react'
import { Check, Eye, EyeOff, FilePlus, Folder, FolderPlus, RefreshCw, X } from 'lucide-react'
import type { Settings, SteamAccount, UpdateState } from '@shared/types'
import { useUpdateState } from '../lib/updates'
import { useLibrary, visibleGames } from '../store/library'

type KeyStatus = 'idle' | 'checking' | 'valid' | 'invalid'

export function SettingsView(): JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.api.getSettings().then(setSettings)
    window.api.getVersion().then(setVersion)
  }, [])

  const update = async (patch: Partial<Settings>): Promise<void> => {
    setSettings(await window.api.setSettings(patch))
  }

  if (!settings) return <div />

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <ArtworkSection savedKey={settings.steamGridDbKey ?? ''} onSave={(key) => update({ steamGridDbKey: key })} />

      <LibrarySection scanOnStartup={settings.scanOnStartup} onToggle={(v) => update({ scanOnStartup: v })} />

      <GameFoldersSection settings={settings} onChange={setSettings} />

      <AchievementsSection savedKey={settings.steamApiKey ?? ''} onSave={(key) => update({ steamApiKey: key })} />

      <AppSection settings={settings} onChange={update} />

      <AboutSection version={version} />
    </div>
  )
}

function ArtworkSection({ savedKey, onSave }: { savedKey: string; onSave: (key: string) => Promise<void> }): JSX.Element {
  const [key, setKey] = useState(savedKey)
  const [show, setShow] = useState(false)
  const [status, setStatus] = useState<KeyStatus>('idle')
  const dirty = key.trim() !== savedKey

  const save = async (): Promise<void> => {
    const trimmed = key.trim()
    if (trimmed) {
      setStatus('checking')
      const ok = await window.api.testSteamGridDbKey(trimmed)
      setStatus(ok ? 'valid' : 'invalid')
      if (!ok) return
    } else {
      setStatus('idle')
    }
    await onSave(trimmed)
  }

  return (
    <section className="card p-6">
      <h2 className="text-lg font-semibold">Artwork</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Covers download automatically. A free{' '}
        <a
          href="https://www.steamgriddb.com/profile/preferences/api"
          target="_blank"
          rel="noreferrer"
          className="text-accent hover:underline"
        >
          SteamGridDB API key
        </a>{' '}
        fills in covers for any game that doesn&apos;t come with its own art.
      </p>

      <div className="mt-4 flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type={show ? 'text' : 'password'}
            value={key}
            onChange={(e) => {
              setKey(e.target.value)
              setStatus('idle')
            }}
            onKeyDown={(e) => e.key === 'Enter' && dirty && save()}
            placeholder="Paste your SteamGridDB API key"
            spellCheck={false}
            className="h-11 w-full select-text rounded-full border border-line bg-black/30 pl-5 pr-12 text-sm text-ink outline-none placeholder:text-ink-faint"
          />
          <button
            onClick={() => setShow((s) => !s)}
            title={show ? 'Hide key' : 'Show key'}
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted hover:bg-bg-hover hover:text-ink"
          >
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <button onClick={save} disabled={!dirty || status === 'checking'} className="btn-accent">
          {status === 'checking' ? 'Checking…' : 'Save'}
        </button>
      </div>

      <div className="mt-2 h-5 pl-5 text-xs">
        {status === 'valid' && (
          <span className="flex items-center gap-1.5 text-accent">
            <Check size={13} /> Key works. Fetching missing covers…
          </span>
        )}
        {status === 'invalid' && (
          <span className="flex items-center gap-1.5 text-red-400">
            <X size={13} /> SteamGridDB rejected this key.
          </span>
        )}
      </div>
    </section>
  )
}

function LibrarySection({
  scanOnStartup,
  onToggle
}: {
  scanOnStartup: boolean
  onToggle: (value: boolean) => void
}): JSX.Element {
  const { games, scanning, rescan } = useLibrary()
  const count = visibleGames(games).length
  const covered = visibleGames(games).filter((g) => g.coverPath).length

  return (
    <section className="card p-6">
      <h2 className="text-lg font-semibold">Library</h2>

      <Row label="Installed games" hint={`${count} games found · ${covered} with cover art`}>
        <button onClick={rescan} disabled={scanning} className="pill disabled:opacity-60">
          <RefreshCw size={14} className={scanning ? 'animate-spin' : ''} />
          {scanning ? 'Scanning…' : 'Rescan now'}
        </button>
      </Row>

      <Row label="Scan on startup" hint="Look for newly installed or removed games each time Rocket Launcher opens.">
        <Toggle value={scanOnStartup} onChange={onToggle} />
      </Row>
    </section>
  )
}

/** Version + manual update check. The download/restart prompts live in the update banner. */
function AboutSection({ version }: { version: string }): JSX.Element {
  const update = useUpdateState()
  const [packaged, setPackaged] = useState(true)
  useEffect(() => {
    window.api.isPackaged().then(setPackaged)
  }, [])

  const status: Record<UpdateState['status'], string> = {
    idle: '',
    checking: 'Checking for updates…',
    none: 'You’re on the latest version.',
    available: `Version ${update.version} is available.`,
    downloading: `Downloading ${update.version}… ${update.percent ?? 0}%`,
    ready: `Version ${update.version} is ready: restart to install.`,
    error: update.message ?? 'Couldn’t check for updates.'
  }

  return (
    <section className="card p-6">
      <h2 className="text-lg font-semibold">About</h2>
      <Row
        label={`Rocket Launcher v${version}`}
        hint={packaged ? status[update.status] || 'Updates are checked automatically.' : 'Updates only work in the installed app.'}
      >
        {update.status === 'available' ? (
          <button onClick={() => window.api.downloadUpdate()} className="btn-accent h-9 px-4 text-sm">
            Download update
          </button>
        ) : update.status === 'ready' ? (
          <button onClick={() => window.api.installUpdate()} className="btn-accent h-9 px-4 text-sm">
            Restart to update
          </button>
        ) : (
          <button
            onClick={() => window.api.checkForUpdates()}
            disabled={!packaged || update.status === 'checking' || update.status === 'downloading'}
            className="pill disabled:opacity-50"
          >
            <RefreshCw size={14} className={update.status === 'checking' ? 'animate-spin' : ''} />
            Check for updates
          </button>
        )}
      </Row>
    </section>
  )
}

/** Tray / startup behaviour. Start with Windows only works in the installed app. */
function AppSection({
  settings,
  onChange
}: {
  settings: Settings
  onChange: (patch: Partial<Settings>) => Promise<void>
}): JSX.Element {
  const [packaged, setPackaged] = useState(true)
  useEffect(() => {
    window.api.isPackaged().then(setPackaged)
  }, [])

  return (
    <section className="card p-6">
      <h2 className="text-lg font-semibold">App</h2>
      <Row
        label="Keep running in the tray"
        hint="Closing the window leaves Rocket Launcher in the system tray so play time keeps being tracked. Quit from the tray icon."
      >
        <Toggle value={settings.closeToTray} onChange={(v) => onChange({ closeToTray: v })} />
      </Row>
      <Row
        label="Hide while playing"
        hint="Tuck the window into the tray when you start a game from here, and bring it back when the game closes."
      >
        <Toggle value={settings.minimizeToTrayOnLaunch} onChange={(v) => onChange({ minimizeToTrayOnLaunch: v })} />
      </Row>
      <Row
        label="Start with Windows"
        hint={
          packaged
            ? 'Start quietly in the tray when you sign in, so every session is tracked.'
            : 'Available in the installed app (not while running from source).'
        }
      >
        <Toggle
          value={settings.startWithWindows}
          disabled={!packaged}
          onChange={(v) => onChange({ startWithWindows: v })}
        />
      </Row>
    </section>
  )
}

/** Steam Web API key for achievements; the Steam account is detected from Steam's login file. */
function AchievementsSection({ savedKey, onSave }: { savedKey: string; onSave: (key: string) => Promise<void> }): JSX.Element {
  const [account, setAccount] = useState<SteamAccount | null | undefined>(undefined)
  const [key, setKey] = useState(savedKey)
  const [show, setShow] = useState(false)
  const [status, setStatus] = useState<KeyStatus>('idle')
  const dirty = key.trim() !== savedKey

  useEffect(() => {
    window.api.getSteamAccount().then(setAccount)
  }, [])

  const save = async (): Promise<void> => {
    const trimmed = key.trim()
    if (trimmed) {
      setStatus('checking')
      const ok = await window.api.testSteamApiKey(trimmed)
      setStatus(ok ? 'valid' : 'invalid')
      if (!ok) return
    } else {
      setStatus('idle')
    }
    await onSave(trimmed)
  }

  return (
    <section className="card p-6">
      <h2 className="text-lg font-semibold">Steam achievements</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Shows your achievements on Steam games. Needs a free{' '}
        <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noreferrer" className="text-accent hover:underline">
          Steam Web API key
        </a>{' '}
        (any domain name works when Steam asks for one).
      </p>

      <div className="mt-4 flex items-center gap-3 rounded-md bg-white/[0.03] px-4 py-3 text-sm">
        <span className="text-ink-muted">Steam account</span>
        <span className="ml-auto font-medium">
          {account === undefined ? '…' : account ? account.personaName : 'Not found: sign in to Steam on this PC'}
        </span>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type={show ? 'text' : 'password'}
            value={key}
            onChange={(e) => {
              setKey(e.target.value)
              setStatus('idle')
            }}
            onKeyDown={(e) => e.key === 'Enter' && dirty && save()}
            placeholder="Paste your Steam Web API key"
            spellCheck={false}
            className="h-11 w-full select-text rounded-full border border-line bg-black/30 pl-5 pr-12 text-sm text-ink outline-none placeholder:text-ink-faint"
          />
          <button
            onClick={() => setShow((s) => !s)}
            title={show ? 'Hide key' : 'Show key'}
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-muted hover:bg-bg-hover hover:text-ink"
          >
            {show ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
        <button onClick={save} disabled={!dirty || status === 'checking'} className="btn-accent">
          {status === 'checking' ? 'Checking…' : 'Save'}
        </button>
      </div>

      <div className="mt-2 h-5 pl-5 text-xs">
        {status === 'valid' && (
          <span className="flex items-center gap-1.5 text-accent">
            <Check size={13} /> Key works.
          </span>
        )}
        {status === 'invalid' && (
          <span className="flex items-center gap-1.5 text-red-400">
            <X size={13} /> Steam rejected this key.
          </span>
        )}
      </div>
      <p className="text-xs text-ink-faint">
        Your Steam profile’s <span className="text-ink-muted">Game details</span> must be public for Steam to share
        achievements.
      </p>
    </section>
  )
}

/**
 * Games without a launcher: every drive's \Games folder is scanned automatically (each
 * subfolder = one game), plus folders and single exes the user adds here.
 */
function GameFoldersSection({
  settings,
  onChange
}: {
  settings: Settings
  onChange: (s: Settings) => void
}): JSX.Element {
  const [auto, setAuto] = useState<string[]>([])
  const { rescan, apply } = useLibrary()

  useEffect(() => {
    window.api.getAutoGameFolders().then(setAuto)
  }, [])

  const save = async (patch: Partial<Settings>): Promise<void> => {
    onChange(await window.api.setSettings(patch))
    rescan()
  }

  const addFolder = async (): Promise<void> => {
    const folder = await window.api.pickFolder()
    if (!folder) return
    const all = [...auto, ...settings.scanFolders].map((f) => f.toLowerCase())
    if (!all.includes(folder.toLowerCase())) await save({ scanFolders: [...settings.scanFolders, folder] })
  }

  const addGame = async (): Promise<void> => {
    const games = await window.api.addGameFromExe()
    if (!games) return
    apply(games)
    onChange(await window.api.getSettings())
  }

  return (
    <section className="card p-6">
      <h2 className="text-lg font-semibold">Games without a launcher</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Each folder below is scanned for games, one game per subfolder. A <span className="text-ink">Games</span> folder
        at the top of any drive is included automatically. Covers come from SteamGridDB, so add your API key above.
      </p>

      <div className="mt-4 flex flex-col">
        {auto.map((f) => (
          <PathRow key={f} path={f} badge="Automatic" />
        ))}
        {settings.scanFolders.map((f) => (
          <PathRow key={f} path={f} onRemove={() => save({ scanFolders: settings.scanFolders.filter((x) => x !== f) })} />
        ))}
        {auto.length === 0 && settings.scanFolders.length === 0 && (
          <p className="border-t border-white/5 py-3 text-sm text-ink-faint">No game folders yet.</p>
        )}
      </div>

      {settings.manualGames.length > 0 && (
        <>
          <div className="mt-5 text-sm font-medium">Added games</div>
          <div className="mt-1 flex flex-col">
            {settings.manualGames.map((m) => (
              <PathRow
                key={m.exePath}
                title={m.title}
                path={m.exePath}
                onRemove={() => save({ manualGames: settings.manualGames.filter((x) => x.exePath !== m.exePath) })}
              />
            ))}
          </div>
        </>
      )}

      <div className="mt-5 flex gap-2">
        <button onClick={addFolder} className="pill">
          <FolderPlus size={14} /> Add folder…
        </button>
        <button onClick={addGame} className="pill">
          <FilePlus size={14} /> Add a game…
        </button>
      </div>
    </section>
  )
}

function PathRow({
  path,
  title,
  badge,
  onRemove
}: {
  path: string
  title?: string
  badge?: string
  onRemove?: () => void
}): JSX.Element {
  return (
    <div className="flex items-center gap-3 border-t border-white/5 py-2.5">
      <Folder size={15} className="shrink-0 text-ink-faint" />
      <div className="min-w-0 flex-1">
        {title && <div className="truncate text-sm font-medium">{title}</div>}
        <div className={`truncate ${title ? 'text-xs text-ink-muted' : 'text-sm text-ink/90'}`} title={path}>
          {path}
        </div>
      </div>
      {badge && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-ink-muted">{badge}</span>}
      {onRemove && (
        <button
          onClick={onRemove}
          title="Remove"
          aria-label={`Remove ${title ?? path}`}
          className="flex h-7 w-7 items-center justify-center rounded-full text-ink-muted hover:bg-white/10 hover:text-ink"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}

function Row({ label, hint, children }: { label: string; hint: string; children: ReactNode }): JSX.Element {
  return (
    <div className="mt-4 flex items-center justify-between gap-6 border-t border-white/5 pt-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-ink-muted">{hint}</div>
      </div>
      {children}
    </div>
  )
}

function Toggle({
  value,
  onChange,
  disabled = false
}: {
  value: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}): JSX.Element {
  return (
    <button
      role="switch"
      aria-checked={value}
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        value ? 'bg-accent' : 'bg-bg-chip'
      }`}
    >
      <span
        className={`absolute left-0 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          value ? 'translate-x-[22px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
