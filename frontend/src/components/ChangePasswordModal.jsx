import { useState, useEffect, useRef } from 'react'
import api from '../lib/api'
import { useLang } from '../context/LangContext'

export default function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const { lang } = useLang()
  const firstRef = useRef(null)

  useEffect(() => {
    firstRef.current?.focus()
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const set = f => e => setForm(p => ({ ...p, [f]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setError('')

    if (form.newPassword !== form.confirmPassword) {
      setError(lang === 'th' ? 'รหัสผ่านใหม่ไม่ตรงกัน' : 'New passwords do not match')
      return
    }
    if (form.newPassword.length < 6) {
      setError(lang === 'th' ? 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' : 'Password must be at least 6 characters')
      return
    }

    setLoading(true)
    try {
      await api.patch('/auth/password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      })
      setSuccess(true)
      setTimeout(onClose, 1800)
    } catch (err) {
      setError(err.response?.data?.error || (lang === 'th' ? 'เกิดข้อผิดพลาด' : 'An error occurred'))
    } finally {
      setLoading(false)
    }
  }

  const labels = {
    title:   lang === 'th' ? 'เปลี่ยนรหัสผ่าน' : 'Change Password',
    current: lang === 'th' ? 'รหัสผ่านปัจจุบัน' : 'Current Password',
    new:     lang === 'th' ? 'รหัสผ่านใหม่' : 'New Password',
    confirm: lang === 'th' ? 'ยืนยันรหัสผ่านใหม่' : 'Confirm New Password',
    save:    lang === 'th' ? 'บันทึก' : 'Save',
    cancel:  lang === 'th' ? 'ยกเลิก' : 'Cancel',
    saving:  lang === 'th' ? 'กำลังบันทึก...' : 'Saving...',
    done:    lang === 'th' ? '✓ เปลี่ยนรหัสผ่านสำเร็จ' : '✓ Password changed successfully',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>

      <div className="w-full max-w-sm rounded-2xl border border-white/10 p-6"
        style={{ background: 'rgba(22,22,50,0.97)', animation: 'dialogIn 0.15s ease-out' }}>

        {/* Icon + Title */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center text-lg">
            🔐
          </div>
          <h3 className="text-white font-bold text-lg">{labels.title}</h3>
        </div>

        {success ? (
          <div className="flex flex-col items-center py-6 gap-3">
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-2xl">
              ✓
            </div>
            <p className="text-emerald-400 font-medium text-center">{labels.done}</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {[
              { f: 'currentPassword', label: labels.current, ref: firstRef },
              { f: 'newPassword',     label: labels.new },
              { f: 'confirmPassword', label: labels.confirm },
            ].map(({ f, label, ref }) => (
              <div key={f}>
                <label className="block text-xs text-slate-400 mb-1.5">{label}</label>
                <input
                  ref={ref}
                  type="password"
                  value={form[f]}
                  onChange={set(f)}
                  placeholder="••••••••"
                  required
                  className="input-dark w-full"
                />
              </div>
            ))}

            {error && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2.5">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 text-sm font-medium transition-all">
                {labels.cancel}
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 btn-primary py-2.5 text-sm disabled:opacity-50">
                {loading ? labels.saving : labels.save}
              </button>
            </div>
          </form>
        )}
      </div>

      <style>{`@keyframes dialogIn{from{opacity:0;transform:scale(.92) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
    </div>
  )
}
