import { useState } from 'react'
import { Lock, Trophy } from 'lucide-react'
import type { Achievement, AchievementSet } from '@shared/types'
import { formatLastPlayed } from '@shared/playtime'
import { rarity, useAchievements } from '../lib/achievements'
import { useUi } from '../store/ui'

type Tab = 'unlocked' | 'locked'
const COLLAPSED_COUNT = 10

/** Game page: progress header, Unlocked / Locked tabs, achievement list. Steam games only. */
export function AchievementsCard({ gameId }: { gameId: string }): JSX.Element | null {
  const data = useAchievements(gameId)
  const [tab, setTab] = useState<Tab>('unlocked')
  const [expanded, setExpanded] = useState(false)

  if (!data || data.status === 'unsupported' || data.status === 'none') return null
  if (data.status !== 'ok') return <SetupCard data={data} />

  const unlocked = data.items
    .filter((a) => a.unlocked)
    .sort((a, b) => (b.unlockedAt ?? 0) - (a.unlockedAt ?? 0))
  // Rarest first among locked: the interesting targets.
  const locked = data.items.filter((a) => !a.unlocked).sort((a, b) => (a.percent ?? 100) - (b.percent ?? 100))
  const list = tab === 'unlocked' ? unlocked : locked
  const shown = expanded ? list : list.slice(0, COLLAPSED_COUNT)

  return (
    <section className="card p-6">
      <div className="flex items-end justify-between gap-6">
        <div>
          <h3 className="text-lg font-semibold">Achievements</h3>
          <p className="text-xs text-ink-muted">From your Steam profile</p>
        </div>
        <Progress data={data} className="w-64" />
      </div>

      <div className="mt-5 flex gap-6 border-b border-white/5">
        {(
          [
            ['unlocked', 'Unlocked', unlocked.length],
            ['locked', 'Locked', locked.length]
          ] as const
        ).map(([t, label, count]) => (
          <button
            key={t}
            onClick={() => {
              setTab(t)
              setExpanded(false)
            }}
            className={`-mb-px flex items-center gap-2 border-b-2 pb-2.5 text-sm font-medium transition-colors ${
              tab === t ? 'border-accent text-ink' : 'border-transparent text-ink-muted hover:text-ink'
            }`}
          >
            {label}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
                tab === t ? 'bg-accent text-accent-ink' : 'bg-white/10 text-ink-muted'
              }`}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="py-6 text-sm text-ink-muted">
          {tab === 'unlocked' ? 'No achievements unlocked yet.' : 'Every achievement unlocked. Nice.'}
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {shown.map((a) => (
            <AchievementRow key={a.id} a={a} />
          ))}
        </div>
      )}

      {list.length > COLLAPSED_COUNT && (
        <button onClick={() => setExpanded((e) => !e)} className="pill mt-4">
          {expanded ? 'Show fewer' : `Show all ${list.length}`}
        </button>
      )}
    </section>
  )
}

function Progress({ data, className = '' }: { data: AchievementSet; className?: string }): JSX.Element {
  const pct = data.total ? Math.round((data.unlocked / data.total) * 100) : 0
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between text-sm">
        <span>
          <span className="text-xl font-semibold">{data.unlocked}</span>
          <span className="text-ink-muted">/{data.total}</span>
        </span>
        <span className="text-ink-muted">{pct}%</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function AchievementIcon({ a, size }: { a: Achievement; size: string }): JSX.Element {
  const src = a.unlocked ? a.icon : a.iconLocked
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-md bg-bg-chip ${size}`}>
      {src ? (
        <img src={src} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
      ) : (
        <Trophy size={16} className="absolute inset-0 m-auto text-ink-faint" />
      )}
    </div>
  )
}

function AchievementRow({ a }: { a: Achievement }): JSX.Element {
  const secret = a.hidden && !a.unlocked
  const r = rarity(a.percent)
  return (
    <div className="flex items-center gap-3 rounded-md bg-white/[0.03] p-3">
      <AchievementIcon a={a} size="h-12 w-12" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 truncate text-sm font-medium">
          {!a.unlocked && <Lock size={12} className="shrink-0 text-ink-faint" />}
          <span className="truncate">{secret ? 'Hidden achievement' : a.name}</span>
        </div>
        <div className="line-clamp-2 text-xs text-ink-muted">
          {secret ? 'Keep playing to reveal it.' : a.description || ' '}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {r && <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.className}`}>{r.label}</span>}
        <span className="text-[11px] text-ink-faint">
          {a.unlocked && a.unlockedAt
            ? formatLastPlayed(a.unlockedAt)
            : a.percent !== undefined
              ? `${a.percent.toFixed(1)}% of players`
              : ''}
        </span>
      </div>
    </div>
  )
}

/** Shown on Steam games when achievements can't load yet: missing key/account, private profile, error. */
function SetupCard({ data }: { data: AchievementSet }): JSX.Element {
  const setSection = useUi((s) => s.setSection)
  const message: Record<string, string> = {
    'no-key': 'Add a Steam Web API key in Settings to see your achievements here.',
    'no-account': 'Sign in to Steam on this PC so Rocket Launcher can find your account.',
    private:
      'Steam won’t share your achievements because your profile’s game details are private. In Steam, open your profile → Edit Profile → Privacy Settings and set Game details to Public.',
    error: 'Couldn’t reach Steam to load achievements. Try again later.'
  }
  return (
    <section className="card flex items-center gap-4 p-6">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bg-chip">
        <Trophy size={18} className="text-ink-muted" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold">Achievements</h3>
        <p className="text-sm text-ink-muted">{message[data.status]}</p>
      </div>
      {data.status === 'no-key' && (
        <button onClick={() => setSection('settings')} className="pill shrink-0">
          Open Settings
        </button>
      )}
    </section>
  )
}
