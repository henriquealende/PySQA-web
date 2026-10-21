import { Loader2 } from 'lucide-react'
import { useStore } from '../store/useStore'

/** Thin bar under the header: tells the user the server is waking up or the files are being put back. */
export default function StatusBanner() {
  const restore = useStore((s) => s.restore)
  const waking  = useStore((s) => s.serverWaking)
  if (!waking && !restore) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 px-4 py-1.5 text-xs bg-amber-400/10 border-b border-amber-400/30 text-amber-300 shrink-0"
    >
      <Loader2 size={13} className="animate-spin shrink-0" />
      {waking
        ? <span>The server is not responding — it is probably restarting. This usually takes under a minute, and your files will come back on their own.</span>
        : <span>Restoring your files after a server restart ({restore!.done} of {restore!.total})…</span>}
    </div>
  )
}
