import { useEffect, useState } from 'react'
import { Pause, Play, Square } from 'lucide-react'
import clsx from 'clsx'
import { useLiveFilter } from '../hooks/useLiveFilter'
import { fetchFilterSos } from '../api/processingApi'
import { useT } from '../i18n'

/**
 * Plays the file in a loop through the filter being set in the Processing window, and follows every change of the values,
 * so the filter can be tuned by ear before it is applied.
 */
export default function LiveFilterPreview({ sessionId, audioId, sampleRate, filterType, cutoff, method, fundamental, qFactor }: {
  sessionId: string; audioId: string; sampleRate: number
  filterType: string; cutoff?: number | [number, number]; method: string; fundamental?: number; qFactor: number
}) {
  const t = useT()
  const { playing, bypass, error, toggle, stop, setBypass, setFilter } = useLiveFilter(`/api/audio/${sessionId}/${audioId}/stream`, sampleRate)
  const [problem, setProblem] = useState('')

  // Ask the server for the sections of the filter 250 ms after the last change
  const key = JSON.stringify([filterType, cutoff, method, fundamental, qFactor])
  useEffect(() => {
    const ctrl = new AbortController()
    const id = window.setTimeout(async () => {
      try {
        const r = await fetchFilterSos(sessionId, audioId, { filterType, cutoff, method, fundamental, qFactor }, ctrl.signal)
        setFilter(r.sos, r.passes)
        setProblem('')
      } catch (e: any) {
        if (e?.name !== 'AbortError') setProblem(e?.message ?? t('pp.proc.live.failed'))
      }
    }, 250)
    return () => { window.clearTimeout(id); ctrl.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, audioId, key])

  const seg = (active: boolean) => clsx('px-3 py-1 text-xs transition-colors', active ? 'bg-teal text-dark font-semibold' : 'bg-panel text-muted hover:text-white')
  return (
    <div className="border border-border rounded-lg p-3 bg-dark/40 space-y-2" role="group" aria-label={t('pp.proc.live.title')}>
      <p className="text-[11px] text-muted uppercase tracking-wider">{t('pp.proc.live.title')}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={toggle} aria-label={playing ? t('pp.proc.live.pause') : t('pp.proc.live.play')}
          className="w-8 h-8 rounded-full bg-teal text-dark flex items-center justify-center">
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button onClick={stop} aria-label={t('pp.proc.live.stop')}
          className="w-8 h-8 rounded-full text-muted hover:text-white hover:bg-panel flex items-center justify-center transition-colors">
          <Square size={13} />
        </button>
        <div className="flex rounded overflow-hidden border border-border" role="group" aria-label={t('pp.proc.live.version')}>
          <button onClick={() => setBypass(false)} aria-pressed={!bypass} className={seg(!bypass)}>{t('pp.proc.live.with')}</button>
          <button onClick={() => setBypass(true)} aria-pressed={bypass} className={seg(bypass)}>{t('pp.proc.live.without')}</button>
        </div>
      </div>
      {(problem || error) && <p className="text-[11px] text-amber-400">{problem || t('pp.proc.live.failed')}</p>}
      <p className="text-[11px] text-muted">{t('pp.proc.live.hint')}</p>
    </div>
  )
}
