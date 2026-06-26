import { useToast } from '../store/useToast'
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react'

const ICONS = {
  success: <CheckCircle size={14} className="text-teal shrink-0" />,
  error:   <AlertCircle size={14} className="text-red-400 shrink-0" />,
  info:    <Info        size={14} className="text-blue-400 shrink-0" />,
}

const BORDER = {
  success: 'border-teal/40',
  error:   'border-red-400/40',
  info:    'border-blue-400/40',
}

export default function ToastContainer() {
  const { toasts, remove } = useToast()

  if (!toasts.length) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-2.5 px-3 py-2.5 rounded-lg
            bg-surface border ${BORDER[t.type]} shadow-lg
            animate-in slide-in-from-bottom-2 duration-200 max-w-xs`}
        >
          {ICONS[t.type]}
          <span className="text-xs text-white flex-1">{t.message}</span>
          <button
            onClick={() => remove(t.id)}
            className="text-muted hover:text-white transition-colors ml-1"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
