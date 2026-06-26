import { useCallback, useState } from 'react'
import { Upload } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  onFiles: (files: File[]) => void
  disabled?: boolean
}

export default function FileDropzone({ onFiles, disabled }: Props) {
  const [dragging, setDragging] = useState(false)

  const handleFiles = useCallback(
    (list: FileList | null) => {
      if (!list) return
      const wavs = Array.from(list).filter((f) => f.name.toLowerCase().endsWith('.wav'))
      if (wavs.length) onFiles(wavs)
    },
    [onFiles]
  )

  return (
    <label
      className={clsx(
        'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed cursor-pointer transition-colors py-6 px-4',
        dragging ? 'border-teal bg-teal/10' : 'border-border hover:border-teal/50',
        disabled && 'opacity-40 pointer-events-none'
      )}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
    >
      <Upload size={22} className="text-teal" />
      <span className="text-muted text-xs text-center">
        Drop WAV files here<br />or <span className="text-teal">click to browse</span>
      </span>
      <input
        type="file"
        accept=".wav"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        disabled={disabled}
      />
    </label>
  )
}
