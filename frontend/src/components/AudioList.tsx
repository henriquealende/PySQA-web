import { Trash2, Settings } from 'lucide-react'
import clsx from 'clsx'
import { AudioFile } from '../types'
import { useT } from '../i18n'

interface Props {
  files: AudioFile[]
  selectedId: string | null
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onEdit: (id: string) => void
}

function fmt(s: number) {
  const m = Math.floor(s / 60)
  const sec = (s % 60).toFixed(1).padStart(4, '0')
  return `${m}:${sec}`
}

export default function AudioList({ files, selectedId, onSelect, onRemove, onEdit }: Props) {
  const t = useT()
  if (!files.length) return null

  return (
    <ul className="flex flex-col gap-1">
      {files.map((f) => {
        const active = f.audio_id === selectedId
        return (
          <li
            key={f.audio_id}
            onClick={() => onSelect(f.audio_id)}
            className={clsx(
              'group relative flex flex-col rounded px-3 py-2 cursor-pointer transition-colors border',
              active
                ? 'bg-teal/15 border-teal/40'
                : 'bg-panel border-border hover:border-teal/30 hover:bg-panel/80'
            )}
          >
            {/* Name */}
            <span
              className={clsx('text-xs font-semibold truncate pr-12', active ? 'text-white' : 'text-slate-200')}
              title={f.name}
            >
              {f.name.replace(/\.wav$/i, '')}
            </span>
            {/* Meta */}
            <span className="text-[11px] text-muted mt-0.5">
              {fmt(f.duration_s)} · {f.sample_rate / 1000} kHz · {f.channels === 1 ? 'Mono' : t('pp.list.stereo')}
            </span>

            {/* Action buttons — visible on hover */}
            {/* Hidden until hover only where hovering exists; always visible on touch screens */}
            <div className={clsx(
              'absolute right-2 top-1/2 -translate-y-1/2 flex gap-1',
              '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100',
              '[@media(hover:hover)]:group-focus-within:opacity-100 transition-opacity'
            )}>
              <button
                className="p-1 rounded text-muted hover:text-teal hover:bg-teal/10 transition-colors"
                onClick={(e) => { e.stopPropagation(); onEdit(f.audio_id) }}
                title={t('pp.list.processing')}
              >
                <Settings size={13} />
              </button>
              <button
                className="p-1 rounded text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                onClick={(e) => { e.stopPropagation(); onRemove(f.audio_id) }}
                title={t('pp.list.remove')}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
