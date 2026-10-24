import { useRef, useState } from 'react'
import { ArrowUpRight, X } from 'lucide-react'
import { useAuralStore } from '../../store/useAuralStore'
import { useT } from '../../i18n'

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
// The cover of the video (official, 1280x720), kept here so the card asks nothing of YouTube before the click.
const COVER = '/auralize/auralize-salas-video-capa.jpg'

const NOITE = '#00161C'
const CIANO = '#00BFC8'

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
        <img
          src={COVER} alt="" width={1280} height={720} loading="lazy"
          className="absolute inset-0 w-full h-full object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-105"
        />
        <span className="absolute inset-0 bg-[#00161C]/0 group-hover:bg-[#00161C]/20 motion-safe:transition-colors" />
      </button>
      <p className="text-[10px] text-[#9fb0b3]">{t('aur.ad.video.privacy')}</p>
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

      <div className="grid gap-6 md:grid-cols-2 items-center">
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
        </div>
      </div>
    </section>
  )
}
