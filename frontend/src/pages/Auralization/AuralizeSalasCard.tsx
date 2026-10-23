import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Play, X } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { useAuralStore } from '../../store/useAuralStore'
import { useT } from '../../i18n'
import { isAbort } from '../../api/audioApi'
import { fetchRoomPreview, SynthParams } from '../../api/auralizationApi'
import AbPlayer from './AbPlayer'

/**
 * Card of Auralize Salas, a product of the same team. Colours and tone follow the brand manual of Auralize
 * (Noite, Ciano, Petróleo, Grafite; a provocative question plus a fact; no promise of results).
 * The video is a YouTube embed (privacy-enhanced domain) that is only loaded after a click.
 */

const SALAS_URL = 'https://auralize.com.br/salas'
const link = (content: string) =>
  `${SALAS_URL}?utm_source=pysqa&utm_medium=app&utm_campaign=audio-preparation&utm_content=${content}`

// Auralize Salas #1: criando um projeto. The YouTube player is only loaded when the user clicks (no request to YouTube before that).
const YOUTUBE_ID = 'cP-ZDtmdS1w'
const EMBED = `https://www.youtube-nocookie.com/embed/${YOUTUBE_ID}?autoplay=1&rel=0&modestbranding=1&hl=pt-BR`
const WATCH = `https://www.youtube.com/watch?v=${YOUTUBE_ID}`

const BANDS = ['125', '250', '500', '1000', '2000', '4000']
const room = (volume: number, rt: number[]): SynthParams => ({ volume_m3: volume, distance_m: 2.5, rt60: Object.fromEntries(BANDS.map((b, i) => [b, rt[i]])) })
const UNTREATED = room(60, [1.6, 1.5, 1.4, 1.3, 1.1, 0.9])      // bare walls, hard surfaces
const TREATED = room(60, [0.7, 0.55, 0.4, 0.35, 0.3, 0.28])     // the same room with absorption

const NOITE = '#00161C'
const CIANO = '#00BFC8'

function Bars({ playing }: { playing: boolean }) {
  const heights = [14, 26, 20, 32]
  return (
    <span className="flex items-end gap-1 h-8" aria-hidden="true">
      {heights.map((h, i) => (
        <span
          key={i} className={`w-1.5 rounded-sm origin-bottom ${playing ? 'motion-safe:animate-eq' : ''}`}
          style={{ height: h, background: CIANO, animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  )
}

function VideoThumb() {
  const t = useT()
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)       // the iframe exists only while the dialog is open
  const show = () => { setOpen(true); dialog.current?.showModal() }
  const close = () => { dialog.current?.close() }
  return (
    <>
      <button
        onClick={show} aria-label={t('aur.ad.video.play')}
        className="group relative block w-full aspect-video overflow-hidden rounded-lg border border-[#035D66] bg-[#1E2B2F] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00BFC8]"
      >
        <span className="absolute inset-0 flex items-end justify-center gap-2 pb-6 opacity-30" aria-hidden="true">
          {[22, 40, 30, 52, 36, 60, 28, 44, 24].map((h, i) => (
            <span key={i} className="w-3 rounded-sm" style={{ height: h, background: CIANO }} />
          ))}
        </span>
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-14 h-14 rounded-full flex items-center justify-center motion-safe:transition-transform motion-safe:group-hover:scale-110" style={{ background: CIANO, color: NOITE }}>
            <Play size={22} className="ml-0.5" aria-hidden="true" />
          </span>
        </span>
        <span className="absolute left-3 right-3 top-3 text-[11px] font-semibold uppercase tracking-wider text-[#EEF3F4]">{t('aur.ad.video.title')}</span>
        <span className="absolute left-3 right-3 bottom-2 text-[10px] text-[#9fb0b3]">{t('aur.ad.video.privacy')}</span>
      </button>
      <dialog
        ref={dialog} aria-label={t('aur.ad.video.title')}
        onClick={(e) => { if (e.target === dialog.current) close() }}
        onClose={() => setOpen(false)}
        className="m-auto p-0 bg-transparent backdrop:bg-black/80 max-w-[min(960px,94vw)] w-full"
      >
        <div className="relative rounded-xl overflow-hidden border border-[#035D66]" style={{ background: NOITE }}>
          <button onClick={close} aria-label={t('aur.ad.video.close')} className="absolute right-2 top-2 z-10 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80">
            <X size={16} />
          </button>
          {open && (
            <iframe
              src={EMBED} title={t('aur.ad.video.title')} className="w-full aspect-video bg-black"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          )}
          <a href={WATCH} target="_blank" rel="noopener noreferrer" className="block px-3 py-2 text-[11px] text-[#9fb0b3] hover:text-[#00BFC8]">{t('aur.ad.video.youtube')}</a>
        </div>
      </dialog>
    </>
  )
}

/** The same sound in the same room, bare and treated: two synthetic rooms of PySQA, not a result of Auralize Salas. */
function RoomsDemo() {
  const t = useT()
  const sessionId = useStore((s) => s.sessionId)
  const sourceId = useAuralStore((s) => s.sourceId)
  const [urls, setUrls] = useState<{ bare: string; treated: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [playing, setPlaying] = useState(false)
  const onPlaying = useCallback((p: boolean) => setPlaying(p), [])

  // a different source makes the old comparison stale
  useEffect(() => {
    setUrls((old) => { if (old) { URL.revokeObjectURL(old.bare); URL.revokeObjectURL(old.treated) } return null })
  }, [sourceId])
  useEffect(() => () => { setUrls((old) => { if (old) { URL.revokeObjectURL(old.bare); URL.revokeObjectURL(old.treated) } return null }) }, [])

  const prepare = async () => {
    if (!sourceId) return
    setBusy(true); setError('')
    try {
      const [bare, treated] = await Promise.all([fetchRoomPreview(sessionId, sourceId, UNTREATED), fetchRoomPreview(sessionId, sourceId, TREATED)])
      setUrls({ bare, treated })
    } catch (e: any) { if (!isAbort(e)) setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="rounded-lg border border-[#1E2B2F] bg-[#1E2B2F]/50 p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-[#EEF3F4]">{t('aur.ad.demo.title')}</h4>
        <Bars playing={playing} />
      </div>
      <p className="text-[11px] text-[#9fb0b3] leading-relaxed">{t('aur.ad.demo.help')}</p>
      {urls ? (
        <AbPlayer
          originalUrl={urls.bare} processedUrl={urls.treated} busy={false} initial="original" onPlayingChange={onPlaying}
          order={['original', 'processed']} labels={{ original: t('aur.ad.demo.untreated'), processed: t('aur.ad.demo.treated') }}
        />
      ) : (
        <button
          onClick={() => void prepare()} disabled={!sourceId || busy}
          className="text-xs font-semibold px-3 py-1.5 rounded-md disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00BFC8]"
          style={{ background: CIANO, color: NOITE }}
        >
          {busy ? t('aur.ad.demo.preparing') : t('aur.ad.demo.button')}
        </button>
      )}
      {!sourceId && <p className="text-[11px] text-[#9fb0b3]">{t('aur.ad.demo.noSource')}</p>}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
    </div>
  )
}

export default function AuralizeSalasCard() {
  const t = useT()
  const { adDismissed, setAdDismissed } = useAuralStore()
  if (adDismissed) return null

  const steps = [t('aur.ad.step1'), t('aur.ad.step2'), t('aur.ad.step3')]
  return (
    <section
      id="auralize-salas" tabIndex={-1} aria-labelledby="aur-ad-title"
      className="rounded-xl border p-5 space-y-5 outline-none focus-visible:ring-2 focus-visible:ring-[#00BFC8]"
      style={{ background: NOITE, borderColor: '#035D66' }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <img src="/auralize/auralize-logotipo-degrade.svg" alt="Auralize" width={110} height={47} className="w-[110px] h-auto" />
          <span className="text-[11px] uppercase tracking-wider text-[#9fb0b3] border-l border-[#035D66] pl-3">{t('aur.ad.label')}</span>
        </div>
        <button
          onClick={() => setAdDismissed(true)} aria-label={t('aur.ad.close')} title={t('aur.ad.close')}
          className="w-8 h-8 rounded-md flex items-center justify-center text-[#9fb0b3] hover:text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00BFC8]"
        >
          <X size={16} />
        </button>
      </div>

      <div className={`grid gap-6 md:grid-cols-2 items-start`}>
        <div className="space-y-4">
          <h3 id="aur-ad-title" className="text-2xl md:text-[28px] font-bold leading-tight text-white" style={{ letterSpacing: '-0.025em' }}>
            <mark className="px-1.5 rounded-sm" style={{ background: CIANO, color: NOITE }}>{t('aur.ad.title.mark')}</mark>{t('aur.ad.title.rest')}
          </h3>
          <p className="text-sm leading-relaxed text-[#EEF3F4]">{t('aur.ad.lead')}</p>
          <ol className="space-y-2">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm text-[#EEF3F4]">
                <span className="font-bold tabular-nums shrink-0" style={{ color: CIANO }}>{`0${i + 1}`}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href={link('conhecer')} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold motion-safe:transition-transform motion-safe:hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00BFC8]"
              style={{ background: CIANO, color: NOITE }}
            >
              {t('aur.ad.cta')} <ArrowUpRight size={15} aria-hidden="true" />
            </a>
            <a
              href={link('contato')} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold text-white border border-[#798183] hover:border-[#00BFC8] hover:text-[#00BFC8] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00BFC8]"
            >
              {t('aur.ad.contact')}
            </a>
          </div>
          <p className="text-[11px] text-[#9fb0b3]">{t('aur.ad.noCommit')}</p>
        </div>

        <div className="space-y-3">
          <VideoThumb />
          <RoomsDemo />
        </div>
      </div>
    </section>
  )
}
