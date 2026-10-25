import { useEffect, useRef } from 'react'
import clsx from 'clsx'

export interface MenuItem {
  label: string
  onClick: () => void
  disabled?: boolean
  divider?: boolean   // a line above this item
}

/**
 * A small context menu (right click) placed at `left`/`top` inside a relatively positioned parent.
 * It closes on a click elsewhere, on Escape, and moves between items with the arrow keys.
 */
export default function PlotMenu({ left, top, items, label, onClose }: {
  left: number; top: number; items: MenuItem[]; label: string; onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const btns = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
      if (!btns.length) return
      e.preventDefault()
      const i = btns.indexOf(document.activeElement as HTMLButtonElement)
      btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length].focus()
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('blur', onClose)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  return (
    <div
      ref={ref} role="menu" aria-label={label}
      className="absolute z-30 min-w-[240px] max-w-[320px] py-1 rounded-lg border border-border bg-surface shadow-2xl text-xs"
      style={{ left, top }}
      onContextMenu={e => e.preventDefault()}
    >
      {items.map((it, i) => (
        <div key={i}>
          {it.divider && <div className="my-1 border-t border-border" role="separator" />}
          <button
            role="menuitem" disabled={it.disabled}
            onClick={() => { it.onClick(); onClose() }}
            className={clsx('w-full text-left px-3 py-1.5 transition-colors',
              it.disabled ? 'text-muted/50 cursor-default' : 'text-white hover:bg-panel focus:bg-panel focus:outline-none')}
          >
            {it.label}
          </button>
        </div>
      ))}
    </div>
  )
}
