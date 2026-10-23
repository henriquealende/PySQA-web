import { useRef } from 'react'
import { useT } from '../../i18n'

/** Top view of the listener. Click or drag to place the source; azimuth 0 is in front, positive to the right. */
export default function HrtfMap({ azimuth, onChange }: { azimuth: number; onChange: (az: number) => void }) {
  const t = useT()
  const ref = useRef<SVGSVGElement>(null)
  const dragging = useRef(false)
  const C = 100, R = 72

  const place = (e: React.PointerEvent) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    const x = ((e.clientX - box.left) / box.width) * 200 - C
    const y = ((e.clientY - box.top) / box.height) * 200 - C
    if (Math.hypot(x, y) < 6) return
    const az = (Math.atan2(x, -y) * 180) / Math.PI
    onChange(Math.round(az))
  }

  const rad = (azimuth * Math.PI) / 180
  const sx = C + R * Math.sin(rad)
  const sy = C - R * Math.cos(rad)

  return (
    <svg
      ref={ref} viewBox="0 0 200 200" className="w-full max-w-[220px] touch-none select-none cursor-crosshair"
      role="slider" aria-label={t('aur.map.aria')} aria-valuemin={-180} aria-valuemax={180} aria-valuenow={azimuth}
      tabIndex={0}
      onPointerDown={(e) => { dragging.current = true; (e.target as Element).setPointerCapture?.(e.pointerId); place(e) }}
      onPointerMove={(e) => { if (dragging.current) place(e) }}
      onPointerUp={() => { dragging.current = false }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); onChange(wrap(azimuth + 5)) }
        if (e.key === 'ArrowLeft') { e.preventDefault(); onChange(wrap(azimuth - 5)) }
      }}
    >
      <circle cx={C} cy={C} r={R} fill="none" stroke="#2b3c50" strokeDasharray="3 3" />
      <circle cx={C} cy={C} r={R / 2} fill="none" stroke="#2b3c50" strokeDasharray="3 3" />
      <line x1={C} y1={C - R - 8} x2={C} y2={C + R + 8} stroke="#2b3c50" />
      <line x1={C - R - 8} y1={C} x2={C + R + 8} y2={C} stroke="#2b3c50" />
      <ellipse cx={C - 13} cy={C} rx="3" ry="6" fill="#1c2a38" stroke="#55728d" />
      <ellipse cx={C + 13} cy={C} rx="3" ry="6" fill="#1c2a38" stroke="#55728d" />
      <circle cx={C} cy={C} r="12" fill="#1c2a38" stroke="#55728d" />
      <path d={`M${C - 4} ${C - 11} L${C} ${C - 18} L${C + 4} ${C - 11}`} fill="none" stroke="#8ab4c9" />
      <line x1={C} y1={C} x2={sx} y2={sy} stroke="#50b89e" strokeOpacity="0.6" />
      <circle cx={sx} cy={sy} r="7" fill="#50b89e" />
      <text x={C - 4} y={14} fill="#8ab4c9" fontSize="10">0°</text>
      <text x={C + R + 10} y={C + 4} fill="#8ab4c9" fontSize="10">90°</text>
      <text x={C - R - 24} y={C + 4} fill="#8ab4c9" fontSize="10">−90°</text>
      <text x={C - 8} y={C + R + 20} fill="#8ab4c9" fontSize="10">180°</text>
      <text x={C + 18} y={C + 4} fill="#8ab4c9" fontSize="9">{t('aur.map.right')}</text>
      <text x={C - 40} y={C + 4} fill="#8ab4c9" fontSize="9">{t('aur.map.left')}</text>
    </svg>
  )
}

function wrap(a: number) {
  return ((((a + 180) % 360) + 360) % 360) - 180
}
