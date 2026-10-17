import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useLibrary } from '../store/library'
import { useUi, type Filter } from '../store/ui'

const TABS: { filter: Filter; label: string }[] = [
  { filter: 'all', label: 'My games' },
  { filter: 'recent', label: 'Recently played' }
]

export function TopBar(): JSX.Element {
  const { section, filter, setFilter } = useUi()
  const scanning = useLibrary((s) => s.scanning)
  const rescan = useLibrary((s) => s.rescan)
  const [name, setName] = useState('')

  useEffect(() => {
    window.api.getUserName().then(setName)
  }, [])

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 pb-8">
      <div className="min-w-0">
        <div className="truncate text-[15px] font-semibold">Hi, {name || 'there'}!</div>
        <div className="truncate text-xs text-ink-muted">Here’s your last progress</div>
      </div>

      <div className="flex items-center gap-2">
        {TABS.map(({ filter: f, label }) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`pill ${section === 'library' && filter === f ? 'pill-active' : ''}`}
          >
            {label}
          </button>
        ))}
        <button
          onClick={rescan}
          disabled={scanning}
          className="ml-1 flex h-9 w-9 items-center justify-center rounded-full border border-line text-ink-muted transition-colors hover:border-bg-hover hover:bg-bg-hover hover:text-ink disabled:opacity-60"
          title={scanning ? 'Scanning for games…' : 'Rescan for games'}
          aria-label="Rescan for games"
        >
          <RefreshCw size={15} className={scanning ? 'animate-spin' : ''} />
        </button>
      </div>

      <div />
    </div>
  )
}
