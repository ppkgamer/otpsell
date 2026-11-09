import { useState, useEffect, useRef } from 'react'
import api from '../lib/api'
import { useLang } from '../context/LangContext'
import DatePicker from './DatePicker'
import {
  dateStringFromDays,
  daysFromDateString,
  daysLeftLabel,
  formatExpiryDate,
  isExpired,
  isExpiringSoon,
} from '../lib/expiry'

const MAX_DAYS = 3650
const NOTICE_REFRESH_MS = 30 * 60 * 1000

export function ExpiryBadge({ expiresAt }) {
  const { lang } = useLang()
  if (!expiresAt) return null

  const date = formatExpiryDate(expiresAt, lang)
  if (isExpired(expiresAt)) {
    return (
      <span className="text-[11px] px-2 py-0.5 rounded-md bg-red-500/15 text-red-400 border border-red-500/25 font-semibold">
        {lang === 'th' ? `หมดอายุแล้ว ${date}` : `Expired ${date}`}
      </span>
    )
  }
  const style = isExpiringSoon(expiresAt)
    ? 'bg-amber-500/15 text-amber-400 border-amber-500/25 font-semibold'
    : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-md border ${style}`}>
      {lang === 'th' ? `หมดอายุ ${date}` : `Expires ${date}`} · {daysLeftLabel(expiresAt, lang)}
    </span>
  )
}

// `linked` keeps the two fields in sync for a single account. Bulk renewals turn
// it off because the same day count lands on a different date for each account.
export function useExpiryInput(expiresAt, { linked = true } = {}) {
  const [days, setDays] = useState('')
  const [date, setDate] = useState('')
  const [datePicked, setDatePicked] = useState(false)

  const parsed = /^\d+$/.test(days) ? Number(days) : null
  const validDays = parsed !== null && parsed >= 1 && parsed <= MAX_DAYS
  const body = datePicked && date ? { date } : !datePicked && validDays ? { days: parsed } : null

  function changeDays(value) {
    const next = value.trim()
    const n = /^\d+$/.test(next) ? Number(next) : 0
    setDays(next)
    setDate(linked && n >= 1 && n <= MAX_DAYS ? dateStringFromDays(n, expiresAt) : '')
    setDatePicked(false)
  }

  // A picked date may be earlier than the current expiry, which has no
  // positive day count, so the day field stays blank in that case.
  function changeDate(value) {
    const diff = value ? daysFromDateString(value, expiresAt) : 0
    setDate(value)
    setDatePicked(Boolean(value))
    setDays(linked && diff > 0 ? String(diff) : '')
  }

  function reset() {
    setDays('')
    setDate('')
    setDatePicked(false)
  }

  return {
    days, date, datePicked, body,
    ready: Boolean(body),
    invalid: Boolean(days) && !datePicked && !validDays,
    changeDays, changeDate, reset,
  }
}

export function ExpiryFields({ input, prefix, onEdit }) {
  const { lang } = useLang()
  return (
    <>
      <span className="text-xs text-slate-500">{prefix}</span>
      <input
        type="text"
        inputMode="numeric"
        value={input.days}
        onChange={e => { input.changeDays(e.target.value); onEdit?.() }}
        placeholder="30"
        aria-label={lang === 'th' ? 'จำนวนวัน' : 'Number of days'}
        className="input-dark w-16 !px-2 !py-1 text-sm text-center"
      />
      <span className="text-xs text-slate-500">{lang === 'th' ? 'วัน หรือเลือกวันที่' : 'days, or pick a date'}</span>
      <DatePicker
        value={input.date}
        min={dateStringFromDays(1)}
        max={dateStringFromDays(MAX_DAYS)}
        today={dateStringFromDays(0)}
        onChange={value => { input.changeDate(value); onEdit?.() }}
        label={lang === 'th' ? 'เลือกวันหมดอายุจากปฏิทิน' : 'Pick expiry date from calendar'}
      />
    </>
  )
}

export function InvalidDaysMessage() {
  const { lang } = useLang()
  return (
    <p className="text-xs text-red-400 mt-1.5">
      {lang === 'th' ? `กรอกตัวเลข 1–${MAX_DAYS}` : `Enter a number from 1 to ${MAX_DAYS}`}
    </p>
  )
}

// Optional expiry while assigning. Reports { body, invalid } to the parent.
export function AssignExpiryFields({ onChange }) {
  const input = useExpiryInput()
  const { lang } = useLang()
  const reportKey = JSON.stringify([input.body, input.invalid])

  useEffect(() => {
    onChange({ body: input.body, invalid: input.invalid })
  }, [reportKey])
  useEffect(() => () => onChange(null), [])

  return (
    <div className="px-1">
      <div className="flex items-center gap-2 flex-wrap">
        <ExpiryFields input={input} prefix={lang === 'th' ? 'หมดอายุในอีก' : 'Expires in'} />
        <span className="text-[11px] text-slate-600">{lang === 'th' ? '(ไม่บังคับ)' : '(optional)'}</span>
      </div>
      {input.ready && (
        <p className="text-xs text-purple-300 mt-1.5">
          {lang === 'th' ? 'จะหมดอายุวันที่' : 'Will expire on'} {formatExpiryDate(input.date, lang)}
        </p>
      )}
      {input.invalid && <InvalidDaysMessage />}
    </div>
  )
}

export function ExpiryEditor({ expiresAt, busy, onSave, onClear, confirmClear }) {
  const input = useExpiryInput(expiresAt)
  const { date, datePicked, ready } = input
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const { t, lang } = useLang()

  const renewing = Boolean(expiresAt) && !isExpired(expiresAt)

  async function run(action, successMessage) {
    setError('')
    setSuccess('')
    try {
      await action()
      input.reset()
      setSuccess(successMessage)
    } catch (err) {
      setError(err.response?.data?.error || t('error_occurred'))
    }
  }

  function save(e) {
    e.preventDefault()
    if (!ready || busy) return
    const expiry = formatExpiryDate(date, lang)
    run(
      () => onSave(input.body),
      lang === 'th' ? `บันทึกแล้ว · หมดอายุวันที่ ${expiry}` : `Saved · Expires on ${expiry}`,
    )
  }

  return (
    <form onSubmit={save} className="mt-2 pt-2 border-t border-emerald-500/10">
      <div className="flex items-center gap-2 flex-wrap">
        <ExpiryFields
          input={input}
          onEdit={() => setSuccess('')}
          prefix={renewing
            ? (lang === 'th' ? 'ต่ออายุอีก' : 'Extend by')
            : (lang === 'th' ? 'หมดอายุในอีก' : 'Expires in')}
        />
        <span className="text-[11px] text-slate-600">{lang === 'th' ? '(ไม่บังคับ)' : '(optional)'}</span>
        {ready && (
          <button
            type="submit"
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-lg border border-purple-500/30 text-purple-300 hover:bg-purple-500/10 transition-colors disabled:opacity-40">
            {busy ? '...' : lang === 'th' ? 'บันทึก' : 'Save'}
          </button>
        )}
        {expiresAt && (
          <button
            type="button"
            onClick={() => confirmClear(() => run(onClear, lang === 'th' ? 'ยกเลิกวันหมดอายุแล้ว' : 'Expiry removed'))}
            disabled={busy}
            className="text-xs px-2 py-1.5 text-slate-500 hover:text-slate-300 transition-colors disabled:opacity-40">
            {lang === 'th' ? 'ไม่กำหนดวันหมดอายุ' : 'Remove expiry'}
          </button>
        )}
      </div>
      {ready && (
        <p className="text-xs text-purple-300 mt-1.5">
          {renewing && !datePicked && (
            <span className="text-slate-400">
              {lang === 'th' ? 'ต่อจาก' : 'From'} {formatExpiryDate(expiresAt, lang)} →{' '}
            </span>
          )}
          {lang === 'th' ? 'จะหมดอายุวันที่' : 'Will expire on'} {formatExpiryDate(date, lang)}
        </p>
      )}
      {input.invalid && <InvalidDaysMessage />}
      {success && <p role="status" className="text-xs text-emerald-400 mt-1.5">✓ {success}</p>}
      {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
    </form>
  )
}

function ExpiryLine({ item, showOwner }) {
  const { lang } = useLang()
  const expired = isExpired(item.expiresAt)
  return (
    <li className="flex items-center gap-2 flex-wrap text-xs">
      <span className="font-mono text-slate-200 break-all">{item.email}</span>
      {showOwner && <span className="text-purple-300">→ {item.owner}</span>}
      <span className={expired ? 'text-red-400 font-semibold' : 'text-amber-400 font-semibold'}>
        {expired
          ? (lang === 'th' ? 'หมดอายุแล้ว' : 'Expired')
          : `${daysLeftLabel(item.expiresAt, lang)} (${formatExpiryDate(item.expiresAt, lang)})`}
      </span>
    </li>
  )
}

// items: [{ key, email, expiresAt, owner? }]. Shows only expired or soon-to-expire accounts.
export function ExpiryAlert({ items, showOwner = false, hint }) {
  const { lang } = useLang()
  const alerts = items.filter(i => isExpired(i.expiresAt) || isExpiringSoon(i.expiresAt))
  if (alerts.length === 0) return null

  const anyExpired = alerts.some(i => isExpired(i.expiresAt))
  return (
    <div role="status" className={`rounded-xl border px-4 py-3 mb-4 ${
      anyExpired ? 'bg-red-500/10 border-red-500/25' : 'bg-amber-500/10 border-amber-500/25'
    }`}>
      <p className={`text-sm font-semibold mb-1.5 ${anyExpired ? 'text-red-400' : 'text-amber-400'}`}>
        ⚠️ {lang === 'th'
          ? `มี ${alerts.length} บัญชีที่หมดอายุแล้วหรือใกล้หมดอายุ`
          : `${alerts.length} account(s) expired or expiring soon`}
      </p>
      <ul className="space-y-1">
        {alerts.map(item => <ExpiryLine key={item.key} item={item} showOwner={showOwner} />)}
      </ul>
      {hint && <p className="text-xs text-slate-400 mt-2">{hint}</p>}
    </div>
  )
}

function CopyListButton({ text, label }) {
  const [state, setState] = useState('idle')
  const { lang } = useLang()

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setState('copied')
    } catch {
      setState('failed')
    }
    setTimeout(() => setState('idle'), 2000)
  }

  const feedback = {
    copied: lang === 'th' ? '✓ คัดลอกแล้ว' : '✓ Copied',
    failed: lang === 'th' ? 'คัดลอกไม่สำเร็จ' : 'Copy failed',
  }
  return (
    <button
      type="button"
      onClick={copy}
      className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all flex-shrink-0 ${
        state === 'copied'
          ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
          : 'border-app text-slate-400 hover:border-purple-500/30 hover:text-purple-400'
      }`}>
      {feedback[state] || label}
    </button>
  )
}

// items: [{ key, email, expiresAt, owner }]. Lists accounts expiring soon per customer, ready to paste.
export function ExpiringCopyList({ items }) {
  const { lang } = useLang()

  const groups = new Map()
  items
    .filter(i => isExpiringSoon(i.expiresAt))
    .sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt))
    .forEach(i => groups.set(i.owner, [...(groups.get(i.owner) || []), i]))
  if (groups.size === 0) return null

  const expiryWord = lang === 'th' ? 'หมดอายุ' : 'expires'
  const listText = accounts => accounts
    .map(i => `${i.email} - ${expiryWord} ${formatExpiryDate(i.expiresAt, lang)} (${daysLeftLabel(i.expiresAt, lang)})`)
    .join('\n')
  const allText = [...groups]
    .map(([owner, accounts]) => `${owner}\n${listText(accounts)}`)
    .join('\n\n')

  return (
    <div className="card-dark px-4 py-3 mb-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-sm font-semibold text-white">
          {lang === 'th' ? 'รายการใกล้หมดอายุใน 2 วัน' : 'Expiring within 2 days'}
        </p>
        {groups.size > 1 && (
          <CopyListButton text={allText} label={lang === 'th' ? 'คัดลอกทั้งหมด' : 'Copy all'} />
        )}
      </div>
      <div className="space-y-2">
        {[...groups].map(([owner, accounts]) => {
          const text = listText(accounts)
          return (
            <div key={owner} className="border border-app rounded-xl px-3 py-2.5">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-xs font-semibold text-purple-300 truncate">{owner}</span>
                <CopyListButton text={text} label={lang === 'th' ? 'คัดลอก' : 'Copy'} />
              </div>
              <pre className="text-xs text-slate-300 font-mono whitespace-pre-wrap break-all">{text}</pre>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function SubUserExpiryNotice() {
  const [items, setItems] = useState([])
  const [dismissed, setDismissed] = useState(false)
  const closeRef = useRef(null)
  const { lang } = useLang()

  const alerts = items.filter(i => isExpired(i.expiresAt) || isExpiringSoon(i.expiresAt))
  const visible = !dismissed && alerts.length > 0

  useEffect(() => {
    if (!visible) return
    closeRef.current?.focus()
    const onKeyDown = e => { if (e.key === 'Escape') setDismissed(true) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [visible])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await api.get('/auth/my-expiries')
        if (!cancelled) setItems(res.data.map(i => ({ ...i, key: i.gmailAccountId })))
      } catch (err) {
        console.error(err)
      }
    }
    load()
    const id = setInterval(load, NOTICE_REFRESH_MS)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  if (!visible) return null

  const anyExpired = alerts.some(i => isExpired(i.expiresAt))
  const title = lang === 'th'
    ? `มี ${alerts.length} บัญชีที่หมดอายุแล้วหรือใกล้หมดอายุ`
    : `${alerts.length} account(s) expired or expiring soon`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full max-w-md rounded-2xl border bg-card2 p-5 shadow-2xl ${
          anyExpired ? 'border-red-500/30' : 'border-amber-500/30'
        }`}>
        <button
          ref={closeRef}
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={lang === 'th' ? 'ปิด' : 'Close'}
          className="absolute top-3 right-3 w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors">
          ✕
        </button>
        <p className={`text-sm font-semibold mb-3 pr-8 ${anyExpired ? 'text-red-400' : 'text-amber-400'}`}>
          ⚠️ {title}
        </p>
        <ul className="space-y-2 max-h-[60vh] overflow-y-auto">
          {alerts.map(item => <ExpiryLine key={item.key} item={item} />)}
        </ul>
        <p className="text-xs text-slate-400 mt-3">
          {lang === 'th' ? 'กรุณาติดต่อผู้ดูแลเพื่อต่ออายุ' : 'Please contact your provider to renew.'}
        </p>
      </div>
    </div>
  )
}
