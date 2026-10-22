import { useCallback, useState } from 'react'
import { Upload, ArrowLeft } from 'lucide-react'
import clsx from 'clsx'
import { useT } from '../i18n'

interface Props {
  onFiles: (files: File[]) => void
  disabled?: boolean
  /** Headline of the call to action */
  title?: string
  /** What can be dropped, as shown to the user, e.g. "WAV files" */
  what?: string
  /** File extensions accepted, lower case with the dot */
  extensions?: string[]
}

/** Large, centred "start here" call to action shown while a page has nothing loaded yet. */
export default function ImportCallout({
  onFiles, disabled, title, what, extensions = ['.wav'],
}: Props) {
  const t = useT()
  const titleText = title ?? t('pp.import.title')
  const whatText = what ?? t('pp.import.what')
  const [dragging, setDragging] = useState(false)

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list) return
      const ok = Array.from(list).filter((f) => extensions.some((ext) => f.name.toLowerCase().endsWith(ext)))
      if (ok.length) onFiles(ok)
    },
    [onFiles, extensions]
  )

  return (
    <div className="flex h-full items-center justify-center p-4">
      <label
        data-testid="import-callout"
        className={clsx(
          'flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-8 py-10 max-w-md w-full text-center cursor-pointer transition-colors',
          dragging ? 'border-teal bg-teal/10' : 'border-teal/70 bg-teal/5 hover:bg-teal/10',
          !dragging && 'animate-glow-ring motion-reduce:animate-none',
          disabled && 'opacity-40 pointer-events-none'
        )}
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
      >
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-teal/15">
          <Upload size={30} className="text-teal animate-bob-up motion-reduce:animate-none" />
        </span>
        <span className="text-white text-base font-semibold">{titleText}</span>
        <span className="text-muted text-xs">
          {t('pp.import.dropPre', { what: whatText })} <span className="text-teal">{t('pp.drop.browse')}</span>
        </span>
        <span className="hidden lg:flex items-center gap-1 text-[11px] text-muted/80">
          <ArrowLeft size={12} className="text-teal" /> {t('pp.import.leftPanel')}
        </span>
        <input
          type="file"
          accept={extensions.join(',')}
          multiple
          className="hidden"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = '' }}
          disabled={disabled}
        />
      </label>
    </div>
  )
}
