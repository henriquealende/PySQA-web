import { useEffect, useState } from 'react'
import clsx from 'clsx'

export type LogoState = 'idle' | 'monitoring' | 'recording' | 'working'

/**
 * The PySQA cube. Orange top = frequency domain, teal sides = time domain (the same colours as the plots).
 * It builds itself once when the app opens, the faces lift apart on hover, and it shows what the app is doing:
 * the sides and top light up in turn while something is being calculated, the top glows while recording.
 */
export default function Logo({ state = 'idle', className }: { state?: LogoState; className?: string }) {
  // The build-up plays once, when the app opens; going back to idle later must not replay it
  const [intro, setIntro] = useState(true)
  useEffect(() => { const t = window.setTimeout(() => setIntro(false), 1300); return () => window.clearTimeout(t) }, [])
  return (
    <svg viewBox="0 0 256 254" aria-hidden="true" data-state={state}
      className={clsx('pysqa-logo overflow-visible', intro && 'logo-intro', className)} fill="none" strokeWidth={10} strokeLinejoin="round">
      <polygon className="logo-face logo-left"  points="4,73 114,121 115,247 4,200" fill="#50B89E" stroke="#50B89E" />
      <polygon className="logo-face logo-right" points="139,121 249,73 249,200 138,247" fill="#50B89E" stroke="#50B89E" />
      <polygon className="logo-face logo-top"   points="127,6 234,56 124,98 19,54" fill="#ED693B" stroke="#ED693B" />
    </svg>
  )
}
