import { useState } from 'react'
import { Bug, X, Loader2 } from 'lucide-react'
import { useLocation } from 'react-router-dom'
import { useDialog } from '../hooks/useDialog'
import { useStore } from '../store/useStore'
import { toast } from '../store/useToast'
import { sendBugReport } from '../api/feedbackApi'
import { useT } from '../i18n'

const fieldCls =
  'w-full bg-panel border border-field rounded px-2 py-1 text-xs text-white placeholder:text-muted/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal focus:border-teal'

function BugReportDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const dialogRef = useDialog(onClose)
  const { pathname } = useLocation()
  const [message, setMessage] = useState('')
  const [contact, setContact] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!message.trim()) { setError(t('bug.empty')); return }
    setBusy(true); setError('')
    try {
      // What was on screen, so the report can be reproduced
      const s = useStore.getState()
      const file = s.files.find((f) => f.audio_id === s.selectedId)
      const context = [
        file && `${file.name} (${file.channels} ch, ${file.sample_rate} Hz, ${file.duration_s.toFixed(1)} s)`,
        `view=${s.viewMode}`, `metric=${s.metricKey}`, `field=${s.fieldType}`, `tonality=${s.precision}`,
      ].filter(Boolean).join(' · ')
      await sendBugReport({
        message, contact: contact.trim() || undefined, page: pathname, context,
        session_id: s.sessionId, viewport: `${window.innerWidth}x${window.innerHeight}`,
      })
      toast.success(t('bug.sent'))
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t('bug.title')}
        className="bg-surface border border-border rounded-xl w-[420px] max-w-[94vw] shadow-2xl outline-none" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold text-white">{t('bug.title')}</span>
          <button onClick={onClose} className="text-muted hover:text-white" aria-label={t('bug.close')}><X size={15} /></button>
        </div>
        <div className="p-4 space-y-3">
          <label className="block space-y-1">
            <span className="text-[11px] uppercase tracking-wider text-muted">{t('bug.what')}</span>
            <textarea value={message} onChange={(e) => { setMessage(e.target.value); setError('') }} rows={5} maxLength={4000}
              placeholder={t('bug.placeholder')} className={fieldCls + ' resize-y'} />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] uppercase tracking-wider text-muted">{t('bug.contact')}</span>
            <input type="text" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={200}
              placeholder={t('bug.contactPlaceholder')} className={fieldCls} />
          </label>
          <p className="text-[11px] text-muted">{t('bug.autoInfo')}</p>
          {error && <p className="text-[11px] text-red-400" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="px-3 py-1 text-xs text-muted hover:text-white border border-border rounded transition-colors">{t('bug.cancel')}</button>
            <button onClick={submit} disabled={busy}
              className="btn btn-primary btn-sm">
              {busy && <Loader2 size={12} className="animate-spin" />}{t('bug.send')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Same button, same place (the bottom of the left column) on every page. */
export default function BugReportButton() {
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-auto pt-3 border-t border-border">
      <button onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 px-3 py-1.5 text-xs text-muted hover:text-white border border-border rounded hover:bg-panel transition-colors">
        <Bug size={13} aria-hidden="true" />{t('bug.button')}
      </button>
      {open && <BugReportDialog onClose={() => setOpen(false)} />}
    </div>
  )
}
