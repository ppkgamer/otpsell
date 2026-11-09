import { useState, useEffect, useRef } from 'react'
import { useLang } from '../context/LangContext'
import { formatExpiryDate } from '../lib/expiry'

const POPUP_WIDTH = 256
const VIEWPORT_MARGIN = 16
const SUNDAY = Date.UTC(2023, 0, 1)
const DAY_MS = 24 * 60 * 60 * 1000

const toValue = (year, month, day) => new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10)
const monthIndex = (value) => Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1

// value, min and max are YYYY-MM-DD strings. Labels follow the site language,
// which a native <input type="date"> cannot do.
export default function DatePicker({ value, min, max, today, onChange, label }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(0)
  const [shift, setShift] = useState(0)
  const rootRef = useRef(null)
  const { lang } = useLang()
  const locale = lang === 'en' ? 'en-GB' : 'th-TH'

  useEffect(() => {
    if (!open) return
    const onPointerDown = e => { if (!rootRef.current?.contains(e.target)) setOpen(false) }
    const onKeyDown = e => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function toggle() {
    if (!open) {
      setView(monthIndex(value || min))
      const { left } = rootRef.current.getBoundingClientRect()
      setShift(Math.min(0, document.documentElement.clientWidth - VIEWPORT_MARGIN - left - POPUP_WIDTH))
    }
    setOpen(!open)
  }

  function pick(next) {
    onChange(next)
    setOpen(false)
  }

  const year = Math.floor(view / 12)
  const month = view % 12
  const firstOfMonth = new Date(Date.UTC(year, month, 1))
  const dayCount = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const monthTitle = firstOfMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(SUNDAY + i * DAY_MS).toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' }))
  const navButton = 'w-7 h-7 rounded-lg text-slate-400 hover:bg-white/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent'

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        className="input-dark !px-2 !py-1 text-sm flex items-center gap-1.5">
        <span aria-hidden="true">📅</span>
        <span className={value ? '' : 'text-slate-500'}>
          {value ? formatExpiryDate(value, lang) : (lang === 'th' ? 'เลือกวันที่' : 'Pick a date')}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label={label}
          style={{ width: POPUP_WIDTH, left: shift }}
          className="absolute top-full mt-1 z-40 bg-card2 border border-app rounded-xl p-3 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => setView(view - 1)} disabled={view <= monthIndex(min)}
              aria-label={lang === 'th' ? 'เดือนก่อนหน้า' : 'Previous month'} className={navButton}>‹</button>
            <span className="text-sm font-semibold text-slate-100">{monthTitle}</span>
            <button type="button" onClick={() => setView(view + 1)} disabled={view >= monthIndex(max)}
              aria-label={lang === 'th' ? 'เดือนถัดไป' : 'Next month'} className={navButton}>›</button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center">
            {weekdays.map(day => <div key={day} className="text-[11px] text-slate-500 py-1">{day}</div>)}
            {Array.from({ length: firstOfMonth.getUTCDay() }, (_, i) => <div key={`blank-${i}`} />)}
            {Array.from({ length: dayCount }, (_, i) => {
              const dayValue = toValue(year, month, i + 1)
              const selected = dayValue === value
              return (
                <button
                  key={dayValue}
                  type="button"
                  onClick={() => pick(dayValue)}
                  disabled={dayValue < min || dayValue > max}
                  aria-pressed={selected}
                  aria-label={formatExpiryDate(dayValue, lang)}
                  className={`h-8 rounded-lg text-xs transition-colors disabled:text-slate-700 disabled:hover:bg-transparent ${
                    selected ? 'bg-purple-500 text-white font-semibold'
                      : dayValue === today ? 'border border-purple-500/40 text-purple-300'
                      : 'text-slate-200 hover:bg-purple-500/20'
                  }`}>
                  {i + 1}
                </button>
              )
            })}
          </div>

          {value && (
            <button type="button" onClick={() => pick('')}
              className="text-xs text-slate-500 hover:text-slate-300 mt-2 transition-colors">
              {lang === 'th' ? 'ล้างวันที่' : 'Clear date'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
