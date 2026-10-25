import { useEffect, useState } from 'react'

/** A number box that keeps what is being typed and follows changes that come from outside (a loaded setup). Empty or invalid is null. */
export default function NumberInput({ value, onChange, placeholder, title, disabled, className = 'w-[46px]' }: {
  value: number | null; onChange: (v: number | null) => void; placeholder?: string; title: string; disabled?: boolean; className?: string
}) {
  const [text, setText] = useState(value == null ? '' : String(value))
  useEffect(() => {
    const parsed = text.trim() === '' ? null : Number(text.replace(',', '.'))
    if ((value ?? null) !== (parsed != null && Number.isFinite(parsed) ? parsed : null)) setText(value == null ? '' : String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <input
      type="text" inputMode="decimal" value={text} placeholder={placeholder} title={title} aria-label={title} disabled={disabled}
      onChange={e => {
        setText(e.target.value)
        const v = e.target.value.trim() === '' ? null : Number(e.target.value.replace(',', '.'))
        onChange(v != null && Number.isFinite(v) ? v : null)
      }}
      className={`${className} bg-dark border border-field rounded px-1 py-0.5 text-[11px] font-normal text-right text-white placeholder:text-muted/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal focus:border-teal`}
    />
  )
}
