import { useState, useEffect, useCallback } from 'react'
import api from '../lib/api'
import { useLang } from '../context/LangContext'
import { OTPCardSkeleton } from './Skeleton'

// ── helpers ──────────────────────────────────────────────────
const OTP_LIFETIME = 15 * 60 * 1000 // 15 minutes in ms

function getAgeMs(receivedAt) {
  return Date.now() - new Date(receivedAt).getTime()
}

function getStatus(receivedAt) {
  const age = getAgeMs(receivedAt)
  if (age < 2 * 60 * 1000)  return 'new'
  if (age < OTP_LIFETIME)    return 'active'
  return 'expired'
}

function formatCountdown(receivedAt) {
  const remaining = OTP_LIFETIME - getAgeMs(receivedAt)
  if (remaining <= 0) return null
  const m = Math.floor(remaining / 60000)
  const s = Math.floor((remaining % 60000) / 1000)
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatTimeAgo(receivedAt, justNowLabel) {
  const s = Math.floor(getAgeMs(receivedAt) / 1000)
  if (s < 10) return justNowLabel
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}

// ── Temp Code Card (รับรหัสชั่วคราว) ─────────────────────────
function TempCodeCard({ otp }) {
  const { lang } = useLang()
  const status    = getStatus(otp.receivedAt)
  const isExpired = status === 'expired'
  const timeAgo   = formatTimeAgo(otp.receivedAt, lang === 'th' ? 'เพิ่งได้รับ' : 'Just now')
  const label     = lang === 'th' ? 'รหัสเข้าใช้งานชั่วคราว' : 'Temporary Access Code'
  const desc      = lang === 'th' ? 'กดปุ่มด้านล่างเพื่อรับรหัสสำหรับเข้าใช้งานชั่วคราว' : 'Click the button below to get your temporary access code'
  const btnText   = lang === 'th' ? '🔑 รับรหัส' : '🔑 Get Code'
  const expText   = lang === 'th' ? 'ลิงก์อาจหมดอายุแล้ว (15 นาที)' : 'Link may have expired (15 min)'

  return (
    <div className="relative flex flex-col rounded-2xl overflow-hidden transition-all duration-300"
      style={{
        border:     isExpired ? '1px solid rgba(100,100,120,0.25)' : '1px solid rgba(168,85,247,0.35)',
        background: isExpired ? 'rgba(20,20,30,0.6)' : 'rgba(25,5,50,0.7)',
        boxShadow:  isExpired ? 'none' : '0 0 20px rgba(168,85,247,0.08)',
      }}>

      <div className="flex items-center justify-between px-4 pt-4">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-[#E50914] rounded flex items-center justify-center flex-shrink-0">
            <span className="text-white font-black" style={{ fontSize: 9 }}>N</span>
          </div>
          <span className={`text-xs font-bold tracking-wide ${isExpired ? 'text-slate-500' : 'text-purple-400'}`}>
            {label}
          </span>
        </div>
        <span className="text-xs text-slate-600 font-mono">{timeAgo}</span>
      </div>

      <div className="mx-4 mt-3 flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-xl px-3 py-2">
        <span className="text-purple-400 text-sm">🎫</span>
        <span className="text-xs text-purple-300 font-medium">{desc}</span>
      </div>

      {isExpired && (
        <div className="mx-4 mt-2 flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-2">
          <span className="text-orange-400">⏱</span>
          <span className="text-xs text-orange-400">{expText}</span>
        </div>
      )}

      <div className="px-4 pt-3 pb-3 space-y-0.5">
        {otp.subject && <div className="text-xs text-slate-500 truncate">{otp.subject}</div>}
        <div className="text-xs text-slate-400 font-mono truncate">{otp.toEmail || otp.gmailAccount?.email}</div>
      </div>

      <div className="px-4 pb-4 mt-auto">
        <a href={otp.code} target="_blank" rel="noopener noreferrer"
          className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
            isExpired
              ? 'bg-white/5 text-slate-500 border border-white/10 hover:bg-white/10'
              : 'bg-purple-600/80 hover:bg-purple-500 text-white'
          }`}>
          {btnText}
        </a>
      </div>
    </div>
  )
}

// ── Password Reset Card ───────────────────────────────────────
function PasswordResetCard({ otp, tick }) {
  const { lang } = useLang()
  const status = getStatus(otp.receivedAt)
  const isExpired = status === 'expired'
  const timeAgo = formatTimeAgo(otp.receivedAt, lang === 'th' ? 'เพิ่งได้รับ' : 'Just now')
  const senderName = otp.sender?.replace(/<[^>]+>/, '').replace(/"/g, '').trim()
  const label   = lang === 'th' ? 'ลิ้งค์เปลี่ยนรหัสผ่าน' : 'Reset Password Link'
  const btnText = lang === 'th' ? '🔑 เปลี่ยนรหัสผ่าน' : '🔑 Change Password'
  const expText = lang === 'th' ? 'ลิ้งค์อาจหมดอายุแล้ว' : 'Link may have expired'
  const warnMsg = lang === 'th' ? 'มีอุปกรณ์ใหม่เข้าสู่ระบบ' : 'New device signed in'

  return (
    <div className="relative flex flex-col rounded-2xl overflow-hidden transition-all duration-300"
      style={{
        border: isExpired ? '1px solid rgba(100,100,120,0.25)' : '1px solid rgba(59,130,246,0.35)',
        background: isExpired ? 'rgba(20,20,30,0.6)' : 'rgba(5,15,40,0.7)',
        boxShadow: isExpired ? 'none' : '0 0 20px rgba(59,130,246,0.08)',
      }}>

      <div className="flex items-center justify-between px-4 pt-4">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-[#E50914] rounded flex items-center justify-center flex-shrink-0">
            <span className="text-white font-black" style={{ fontSize: 9 }}>N</span>
          </div>
          <span className={`text-xs font-bold tracking-wide ${isExpired ? 'text-slate-500' : 'text-blue-400'}`}>
            {label}
          </span>
        </div>
        <span className="text-xs text-slate-600 font-mono">{timeAgo}</span>
      </div>

      <div className="mx-4 mt-3 flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl px-3 py-2">
        <span className="text-blue-400 text-sm">📱</span>
        <span className="text-xs text-blue-300 font-medium">{warnMsg}</span>
      </div>

      {isExpired && (
        <div className="mx-4 mt-2 flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-2">
          <span className="text-orange-400">⏱</span>
          <span className="text-xs text-orange-400">{expText}</span>
        </div>
      )}

      <div className="px-4 pt-3 pb-3 space-y-0.5">
        {otp.subject && <div className="text-xs text-slate-500 truncate">{otp.subject}</div>}
        {senderName && <div className="text-xs text-slate-600 truncate">{senderName}</div>}
        <div className="text-xs text-slate-400 font-mono truncate">{otp.toEmail || otp.gmailAccount?.email}</div>
      </div>

      <div className="px-4 pb-4 mt-auto">
        <a href={otp.code} target="_blank" rel="noopener noreferrer"
          className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
            isExpired
              ? 'bg-white/5 text-slate-500 border border-white/10 hover:bg-white/10'
              : 'bg-blue-600/80 hover:bg-blue-500 text-white'
          }`}>
          {btnText}
        </a>
      </div>
    </div>
  )
}

// ── OTP Card ──────────────────────────────────────────────────
function OTPCard({ otp, tick }) {
  const [copied, setCopied] = useState(false)
  const { t, lang } = useLang()

  const status   = getStatus(otp.receivedAt)
  const ageMs    = getAgeMs(otp.receivedAt)
  const progress = Math.max(0, 100 - (ageMs / OTP_LIFETIME) * 100) // % remaining
  const countdown = formatCountdown(otp.receivedAt)
  const timeAgo  = formatTimeAgo(otp.receivedAt, lang === 'th' ? 'เพิ่งได้รับ' : 'Just now')

  const senderName = otp.sender?.replace(/<[^>]+>/, '').replace(/"/g, '').trim() || null

  const barColor = progress > 60 ? '#22c55e' : progress > 30 ? '#eab308' : '#ef4444'

  async function copy() {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(otp.code)
      } else {
        const el = document.createElement('textarea')
        el.value = otp.code
        el.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;'
        document.body.appendChild(el)
        el.focus(); el.select()
        document.execCommand('copy')
        document.body.removeChild(el)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* silent */ }
  }

  const cardStyle = {
    new:     { border: '1px solid rgba(52,211,153,0.35)', background: 'rgba(5,46,22,0.6)',  shadow: '0 0 30px rgba(52,211,153,0.1)' },
    active:  { border: '1px solid rgba(99,102,241,0.2)',  background: 'rgba(26,26,62,0.8)', shadow: 'none' },
    expired: { border: '1px solid rgba(100,100,120,0.2)', background: 'rgba(20,20,30,0.6)', shadow: 'none' },
  }[status]

  return (
    <div className="relative flex flex-col rounded-2xl overflow-hidden transition-all duration-300"
      style={{ border: cardStyle.border, background: cardStyle.background, boxShadow: cardStyle.shadow }}>

      {/* Top row: status + time */}
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="flex items-center gap-1.5">
          {status === 'new' && (
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          )}
          <span className={`text-xs font-bold tracking-widest ${
            status === 'new' ? 'text-emerald-400' :
            status === 'active' ? 'text-purple-400' : 'text-slate-600'
          }`}>
            {status === 'new' ? 'NEW' : status === 'active' ? 'ACTIVE' : 'EXPIRED'}
          </span>
        </div>
        <span className="text-xs text-slate-600 font-mono">{timeAgo}</span>
      </div>

      {/* OTP code — main focus */}
      <div className="px-5 py-5 text-center">
        <div
          className={`font-black font-mono tracking-[0.2em] leading-none select-all ${
            status === 'new'    ? 'text-emerald-300' :
            status === 'active' ? 'text-white' : 'text-slate-600'
          }`}
          style={{ fontSize: 'clamp(1.6rem, 5vw, 3rem)' }}
        >
          {otp.code}
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-4 mb-3">
        <div className="h-1 rounded-full bg-white/5 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{ width: `${progress}%`, background: status === 'expired' ? '#333' : barColor }}
          />
        </div>
        <div className="flex justify-between items-center mt-1">
          <span className="text-xs text-slate-400 font-mono">{otp.toEmail || senderName || otp.gmailAccount?.email}</span>
          {countdown && (
            <span className={`text-xs font-mono font-bold ${
              progress > 60 ? 'text-emerald-600' : progress > 30 ? 'text-yellow-600' : 'text-red-500'
            }`}>
              {countdown}
            </span>
          )}
          {!countdown && status === 'expired' && (
            <span className="text-xs text-slate-700">—</span>
          )}
        </div>
      </div>

      {/* Gmail + subject */}
      {(otp.subject || otp.gmailAccount?.email) && (
        <div className="px-4 pb-3 space-y-0.5">
          {otp.subject && (
            <div className="text-xs text-slate-600 truncate">{otp.subject}</div>
          )}
          {otp.toEmail ? (
            <div className="text-xs text-slate-400 font-mono truncate" title="Original recipient">
              {otp.toEmail}
            </div>
          ) : senderName ? (
            <div className="text-xs text-slate-400 font-mono truncate">{otp.gmailAccount?.email}</div>
          ) : null}
        </div>
      )}

      {/* Copy button */}
      <div className="px-4 pb-4 mt-auto">
        <button
          onClick={copy}
          className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 ${
            copied
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : status === 'expired'
              ? 'bg-white/5 text-slate-500 border border-white/10 hover:bg-white/10'
              : 'bg-purple-600/20 hover:bg-purple-600/35 text-purple-300 border border-purple-500/30'
          }`}
        >
          {copied ? `✓  ${t('otp_copied')}` : `📋  ${t('otp_copy')}`}
        </button>
      </div>
    </div>
  )
}

// ── Household Card ─────────────────────────────────────────────
function HouseholdCard({ otp, tick }) {
  const { lang } = useLang()
  const status = getStatus(otp.receivedAt)
  const ageMs  = getAgeMs(otp.receivedAt)
  const progress = Math.max(0, 100 - (ageMs / OTP_LIFETIME) * 100)
  const countdown = formatCountdown(otp.receivedAt)
  const timeAgo = formatTimeAgo(otp.receivedAt, lang === 'th' ? 'เพิ่งได้รับ' : 'Just now')
  const senderName = otp.sender?.replace(/<[^>]+>/, '').replace(/"/g, '').trim()
  const label = lang === 'th' ? 'ลิ้งค์อัพเดตครัวเรือน' : 'Household Update Link'

  return (
    <div className="relative flex flex-col rounded-2xl overflow-hidden transition-all duration-300"
      style={{
        border: status === 'expired' ? '1px solid rgba(234,88,12,0.25)' : '1px solid rgba(220,38,38,0.35)',
        background: status === 'expired' ? 'rgba(20,20,30,0.6)' : 'rgba(40,5,5,0.7)',
        boxShadow: status === 'expired' ? 'none' : '0 0 30px rgba(220,38,38,0.08)',
      }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 bg-[#E50914] rounded flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-black" style={{ fontSize: 9 }}>N</span>
          </div>
          <span className="text-xs font-bold tracking-wide text-red-400">{label}</span>
        </div>
        <span className="text-xs text-slate-600 font-mono">{timeAgo}</span>
      </div>

      {/* Expired warning */}
      {status === 'expired' && (
        <div className="mx-4 mt-3 flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-2">
          <span className="text-orange-400 text-sm">⚠</span>
          <span className="text-xs text-orange-400 font-medium">
            {lang === 'th' ? 'ลิ้งค์อาจหมดอายุแล้ว' : 'Link may have expired'}
          </span>
        </div>
      )}

      {/* Info */}
      <div className="px-4 pt-4 pb-3 space-y-1">
        {senderName && <div className="text-xs text-slate-500 truncate">{senderName}</div>}
        {otp.subject && <div className="text-xs text-slate-600 truncate">{otp.subject}</div>}
        <div className="text-xs text-slate-400 font-mono truncate">{otp.toEmail || otp.gmailAccount?.email}</div>
      </div>

      {/* Progress bar */}
      {countdown && (
        <div className="px-4 mb-3">
          <div className="h-1 rounded-full bg-white/5 overflow-hidden">
            <div className="h-full rounded-full bg-red-500 transition-all duration-1000"
              style={{ width: `${progress}%` }} />
          </div>
          <div className="flex justify-end mt-1">
            <span className="text-xs font-mono font-bold text-red-600">{countdown}</span>
          </div>
        </div>
      )}

      {/* Open link button */}
      <div className="px-4 pb-4 mt-auto">
        <a href={otp.code} target="_blank" rel="noopener noreferrer"
          className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-semibold transition-all ${
            status === 'expired'
              ? 'bg-white/5 text-slate-500 border border-white/10 hover:bg-white/10'
              : 'bg-[#E50914] hover:bg-[#b91c1c] text-white'
          }`}>
          🔗 {lang === 'th' ? 'เปิดลิ้งค์' : 'Open Link'}
        </a>
      </div>
    </div>
  )
}

// ── OTP Grid ───────────────────────────────────────────────────
export default function OTPGrid() {
  const [otps, setOtps] = useState([])
  const [loading, setLoading] = useState(true)
  const [countdown, setCountdown] = useState(5)
  const [tick, setTick] = useState(0)
  const [lastUpdated, setLastUpdated] = useState(null)
  const { t, lang } = useLang()

  const fetchOtps = useCallback(async () => {
    try {
      const res = await api.get('/otp?limit=50')
      setOtps(res.data)
      setLastUpdated(new Date())
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchOtps() }, [fetchOtps])

  // Refresh countdown
  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(p => { if (p <= 1) { fetchOtps(); return 5 } return p - 1 })
    }, 1000)
    return () => clearInterval(t)
  }, [fetchOtps])

  // 1-second tick for progress bars / countdowns
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const active  = otps.filter(o => getStatus(o.receivedAt) !== 'expired')
  const expired = otps.filter(o => getStatus(o.receivedAt) === 'expired')
  const hasNew  = otps.some(o => getStatus(o.receivedAt) === 'new')

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {[1,2,3,4].map(i => <OTPCardSkeleton key={i} />)}
      </div>
    )
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="font-bold text-white text-lg tracking-tight">OTPs</h2>
          <div className="flex items-center gap-1.5">
            {hasNew && (
              <span className="flex items-center gap-1 text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                {lang === 'th' ? 'ใหม่' : 'New'}
              </span>
            )}
            {active.length > 0 && (
              <span className="text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
                {active.length} {lang === 'th' ? 'ใช้งานได้' : 'active'}
              </span>
            )}
            {expired.length > 0 && (
              <span className="text-xs text-slate-700 bg-white/3 px-2 py-0.5 rounded-full">
                {expired.length} {lang === 'th' ? 'หมดอายุ' : 'expired'}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-700 font-mono tabular-nums">
            {String(countdown).padStart(2, '0')}s
          </div>
          <button
            onClick={() => { fetchOtps(); setCountdown(5) }}
            className="text-xs text-purple-400/70 hover:text-purple-300 border border-purple-500/20 hover:border-purple-500/40 px-3 py-1 rounded-lg hover:bg-purple-500/10 transition-all"
          >
            ↻
          </button>
        </div>
      </div>

      {otps.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-white/3 border border-white/8 flex items-center justify-center text-3xl text-slate-700">
            ⏳
          </div>
          <p className="text-slate-500 font-medium">{t('otp_empty_title')}</p>
          <p className="text-slate-700 text-sm">{t('otp_empty_sub')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {otps.map(otp =>
            otp.type === 'household_link'     ? <HouseholdCard    key={otp.id} otp={otp} tick={tick} /> :
            otp.type === 'password_reset_link' ? <PasswordResetCard key={otp.id} otp={otp} tick={tick} /> :
            otp.type === 'temp_code_link'      ? <TempCodeCard      key={otp.id} otp={otp} /> :
            <OTPCard key={otp.id} otp={otp} tick={tick} />
          )}
        </div>
      )}

      {lastUpdated && (
        <p className="text-xs text-slate-800 mt-6 text-right font-mono">
          {t('last_updated')} {lastUpdated.toLocaleTimeString(lang === 'en' ? 'en-US' : 'th-TH')}
        </p>
      )}
    </div>
  )
}
