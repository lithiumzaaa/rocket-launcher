import { useState } from 'react'
import { Download, Loader2, RotateCw, X } from 'lucide-react'
import { useUpdateState } from '../lib/updates'

/**
 * Bottom-right notice: "available" asks before downloading; "ready" offers a restart.
 * "Later" hides it for this version only; it comes back when a newer one appears.
 */
export function UpdateBanner(): JSX.Element | null {
  const update = useUpdateState()
  const [dismissed, setDismissed] = useState<string | undefined>()

  const visible =
    update.status === 'downloading' ||
    ((update.status === 'available' || update.status === 'ready') && dismissed !== `${update.status}:${update.version}`)
  if (!visible) return null

  return (
    <div className="fixed bottom-6 right-6 z-[65] w-[340px] rounded-card border border-white/10 bg-[#1d1d22] p-4 shadow-[0_18px_44px_rgba(0,0,0,0.6)]">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          {update.status === 'downloading' ? (
            <Loader2 size={16} className="animate-spin" />
          ) : update.status === 'ready' ? (
            <RotateCw size={16} />
          ) : (
            <Download size={16} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">
            {update.status === 'ready' ? 'Update ready' : `Rocket Launcher ${update.version ?? ''} is available`}
          </div>
          <div className="mt-0.5 text-xs text-ink-muted">
            {update.status === 'available' && 'Download it now? You can keep playing while it downloads.'}
            {update.status === 'downloading' && `Downloading… ${update.percent ?? 0}%`}
            {update.status === 'ready' && `Restart to finish installing ${update.version ?? 'the update'}, or it installs when you quit.`}
          </div>
          {update.status === 'downloading' && (
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${update.percent ?? 0}%` }} />
            </div>
          )}
          {update.status !== 'downloading' && (
            <div className="mt-3 flex gap-2">
              {update.status === 'available' ? (
                <button onClick={() => window.api.downloadUpdate()} className="btn-accent h-8 px-4 text-xs">
                  Download
                </button>
              ) : (
                <button onClick={() => window.api.installUpdate()} className="btn-accent h-8 px-4 text-xs">
                  Restart to update
                </button>
              )}
              <button onClick={() => setDismissed(`${update.status}:${update.version}`)} className="pill h-8 px-3 text-xs">
                Later
              </button>
            </div>
          )}
        </div>
        {update.status !== 'downloading' && (
          <button
            onClick={() => setDismissed(`${update.status}:${update.version}`)}
            aria-label="Dismiss"
            className="-mr-1 -mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-white/10 hover:text-ink"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
