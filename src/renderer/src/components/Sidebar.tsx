import { House, LayoutGrid, Search, Settings, type LucideIcon } from 'lucide-react'
import rocketIcon from '../assets/rocket-icon.png'
import { useUi, type Section } from '../store/ui'

const NAV: { section: Exclude<Section, 'game'>; label: string; icon: LucideIcon }[] = [
  { section: 'home', label: 'Home', icon: House },
  { section: 'library', label: 'Game library', icon: LayoutGrid }
]

/** Narrow icon rail. z-20 so its tooltips draw over the main panel that follows it in the DOM. */
export function Sidebar(): JSX.Element {
  const { section, setSection, searchOpen, setSearchOpen } = useUi()

  return (
    <aside className="relative z-20 flex w-[76px] shrink-0 flex-col items-center py-2">
      {/* Brand mark: deliberately larger than the 18px nav icons below it. */}
      <div className="flex h-14 w-14 shrink-0 items-center justify-center" title="Rocket Launcher">
        <img src={rocketIcon} alt="Rocket Launcher" draggable={false} className="h-12 w-auto" />
      </div>

      <Divider className="my-4" />

      <nav className="flex flex-col gap-1.5">
        <RailItem label="Search  (Ctrl+K)" icon={Search} active={searchOpen} onClick={() => setSearchOpen(true)} />
        {NAV.map(({ section: s, label, icon }) => (
          <RailItem key={s} label={label} icon={icon} active={s === section} onClick={() => setSection(s)} />
        ))}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-1.5 pb-1">
        <Divider className="mb-2.5" />
        <RailItem
          label="Settings"
          icon={Settings}
          active={section === 'settings'}
          onClick={() => setSection('settings')}
        />
      </div>
    </aside>
  )
}

function RailItem({
  label,
  icon: Icon,
  active,
  onClick
}: {
  label: string
  icon: LucideIcon
  active: boolean
  onClick: () => void
}): JSX.Element {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`group relative flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
        active ? 'bg-bg-chip text-ink' : 'text-ink-muted hover:bg-bg-card hover:text-ink'
      }`}
    >
      <Icon size={18} strokeWidth={2} className="shrink-0" />
      <span className="pointer-events-none absolute left-full z-50 ml-3 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1 text-xs font-medium text-bg opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {label}
      </span>
    </button>
  )
}

function Divider({ className = '' }: { className?: string }): JSX.Element {
  return <div className={`h-px w-10 shrink-0 bg-white/10 ${className}`} />
}
