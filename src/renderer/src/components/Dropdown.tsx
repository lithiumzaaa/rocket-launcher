import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

/** Pill button with a small option menu (sort order, chart range…). */
export function Dropdown<T extends string>({
  value,
  options,
  onChange,
  prefix
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  /** Muted text before the current value, e.g. "Sort:" */
  prefix?: string
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent): void => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', esc, true)
    }
  }, [open])

  const current = options.find((o) => o.value === value)

  return (
    <div ref={root} className="relative">
      <button onClick={() => setOpen((o) => !o)} className={`pill ${open ? 'pill-active' : ''}`} aria-haspopup="listbox">
        {prefix && <span className="text-ink-faint">{prefix}</span>}
        <span className="text-ink">{current?.label}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full z-40 mt-2 min-w-[180px] overflow-hidden rounded-card border border-white/10 bg-[#1d1d22] p-1 shadow-[0_16px_40px_rgba(0,0,0,0.55)]"
        >
          {options.map((o) => (
            <button
              key={o.value}
              role="option"
              aria-selected={o.value === value}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
              className="flex w-full items-center justify-between gap-4 rounded-md px-3 py-2 text-left text-sm text-ink/90 hover:bg-white/5"
            >
              {o.label}
              {o.value === value && <Check size={14} className="text-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
