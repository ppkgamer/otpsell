import { useEffect } from 'react'

/**
 * Usage:
 * const [dialog, setDialog] = useState(null)
 * setDialog({ message: 'ลบ Gmail นี้?', onConfirm: () => ... })
 * <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
 */
export default function ConfirmDialog({ dialog, onClose }) {
  useEffect(() => {
    if (!dialog) return
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog, onClose])

  if (!dialog) return null

  const {
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel  = 'Cancel',
    danger       = true,
    icon         = '⚠️',
    onConfirm,
  } = dialog

  function handleConfirm() {
    onConfirm?.()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-white/10 p-6 shadow-2xl"
        style={{
          background: 'rgba(22,22,50,0.95)',
          backdropFilter: 'blur(20px)',
          animation: 'dialogIn 0.15s ease-out',
        }}
      >
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl ${
            danger ? 'bg-red-500/15 border border-red-500/25' : 'bg-purple-500/15 border border-purple-500/25'
          }`}>
            {icon}
          </div>
        </div>

        {/* Title */}
        {title && (
          <h3 className="text-white font-bold text-center text-lg mb-2">{title}</h3>
        )}

        {/* Message */}
        <p className="text-slate-400 text-sm text-center leading-relaxed mb-6">{message}</p>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 text-sm font-medium transition-all"
          >
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              danger
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-purple-600 hover:bg-purple-700 text-white'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes dialogIn {
          from { opacity: 0; transform: scale(0.92) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
      `}</style>
    </div>
  )
}
