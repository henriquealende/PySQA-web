import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

/**
 * Keyboard behaviour of a modal window: it takes focus when it opens, Escape closes it, Tab stays inside it,
 * and focus goes back to what had it before. Put the returned ref (and tabIndex -1) on the dialog box.
 */
export function useDialog<T extends HTMLElement = HTMLDivElement>(onClose: () => void) {
  const ref = useRef<T>(null)
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    const box = ref.current
    box?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close.current(); return }
      if (e.key !== 'Tab' || !box) return
      const items = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
      if (!items.length) { e.preventDefault(); return }
      const first = items[0], last = items[items.length - 1]
      const at = document.activeElement
      if (e.shiftKey && (at === first || at === box)) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); before?.focus?.() }
  }, [])

  return ref
}
