import { useState } from 'react'
import api from '../lib/api'
import { useLang } from '../context/LangContext'
import { ExpiryBadge, ExpiryFields, InvalidDaysMessage, useExpiryInput } from './AccountExpiry'
import { dateStringFromDays, formatExpiryDate, isExpired, isExpiringSoon } from '../lib/expiry'

const EMAIL_PATTERN = /[^\s,;<>()"']+@[^\s,;<>()"']+/g

// Accepts a partial search, or a pasted list such as the "Expiring" copy text.
function parseQuery(text) {
  return {
    term: text.trim().toLowerCase(),
    emails: [...new Set(text.toLowerCase().match(EMAIL_PATTERN) || [])],
  }
}

function matchesQuery(row, { term, emails }) {
  const email = row.email.toLowerCase()
  if (emails.length > 1) return emails.includes(email)
  if (emails.length === 1) return email.includes(emails[0])
  return !term || email.includes(term)
}

function byExpiry(a, b) {
  if (!a.expiresAt) return b.expiresAt ? 1 : 0
  if (!b.expiresAt) return -1
  return new Date(a.expiresAt) - new Date(b.expiresAt)
}

export default function BulkRenew({ subUser, confirm, onSaved }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(() => new Set())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const input = useExpiryInput(undefined, { linked: false })
  const { t, lang } = useLang()
  const th = lang === 'th'

  const rows = subUser.assignedGmails
    .filter(a => !a.gmailAccount.isAdminManaged)
    .map(a => ({ id: a.id, email: a.gmailAccount.email, expiresAt: a.expiresAt }))
    .sort(byExpiry)
  if (rows.length === 0) return null

  const query = parseQuery(search)
  const shown = rows.filter(row => matchesQuery(row, query))
  const selectedRows = rows.filter(row => selected.has(row.id))
  const notFound = query.emails.length > 1
    ? query.emails.filter(email => !rows.some(row => row.email.toLowerCase() === email))
    : []

  function change(updater) {
    setSelected(prev => updater(new Set(prev)))
    setSuccess('')
  }
  const toggle = id => change(next => { next.has(id) ? next.delete(id) : next.add(id); return next })
  const selectRows = list => change(next => { list.forEach(row => next.add(row.id)); return next })

  function newDateFor(row) {
    if (!input.body) return null
    return input.body.date || dateStringFromDays(input.body.days, row.expiresAt)
  }

  async function apply(assignmentIds, body) {
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      await api.patch('/auth/subusers/expiry', { assignmentIds, ...body })
      input.reset()
      setSelected(new Set())
      setSuccess(th ? `ต่ออายุแล้ว ${assignmentIds.length} บัญชี` : `Renewed ${assignmentIds.length} account(s)`)
      await onSaved()
    } catch (err) {
      setError(err.response?.data?.error || t('error_occurred'))
    } finally {
      setSaving(false)
    }
  }

  function submit(e) {
    e.preventDefault()
    if (!input.body || selectedRows.length === 0 || saving) return
    const n = selectedRows.length
    const body = input.body
    const assignmentIds = selectedRows.map(row => row.id)
    const date = body.date && formatExpiryDate(body.date, lang)
    confirm({
      icon: '📅',
      danger: false,
      title: th ? 'ยืนยันการต่ออายุ' : 'Confirm renewal',
      message: body.date
        ? (th ? `ตั้งวันหมดอายุ ${n} บัญชีของ ${subUser.username} เป็นวันที่ ${date}?` : `Set ${n} account(s) of ${subUser.username} to expire on ${date}?`)
        : (th ? `ต่ออายุ ${n} บัญชีของ ${subUser.username} เพิ่มอีก ${body.days} วัน?` : `Extend ${n} account(s) of ${subUser.username} by ${body.days} days?`),
      confirmLabel: th ? 'ยืนยัน' : 'Confirm',
      cancelLabel: th ? 'ยกเลิก' : 'Cancel',
      onConfirm: () => apply(assignmentIds, body),
    })
  }

  const linkButton = 'text-xs text-purple-400 hover:text-purple-300 transition-colors'

  return (
    <div className="border border-app rounded-xl px-3 py-2.5 mb-3">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="flex items-center justify-between w-full text-left">
        <span className="text-sm font-semibold text-white">{th ? '📅 ต่ออายุหลายบัญชี' : '📅 Renew multiple accounts'}</span>
        <span className={`text-xs text-slate-500 inline-block transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {open && (
        <form onSubmit={submit} className="mt-3 space-y-3">
          <textarea
            value={search}
            onChange={e => setSearch(e.target.value)}
            rows={2}
            placeholder={th ? 'ค้นหาอีเมล หรือวางรายการอีเมลหลายอัน...' : 'Search email, or paste a list of emails...'}
            aria-label={th ? 'ค้นหาหรือวางรายการอีเมล' : 'Search or paste emails'}
            className="input-dark w-full resize-y"
          />

          <div className="flex items-center gap-3 flex-wrap">
            <button type="button" className={linkButton}
              onClick={() => selectRows(rows.filter(row => row.expiresAt && (isExpired(row.expiresAt) || isExpiringSoon(row.expiresAt))))}>
              {th ? 'เลือกที่ใกล้หมด/หมดแล้ว' : 'Select expiring/expired'}
            </button>
            <button type="button" className={linkButton} onClick={() => selectRows(shown)}>
              {th ? `เลือกทั้งหมดที่แสดง (${shown.length})` : `Select all shown (${shown.length})`}
            </button>
            {selected.size > 0 && (
              <button type="button" className="text-xs text-slate-500 hover:text-slate-400 transition-colors"
                onClick={() => change(() => new Set())}>
                {th ? 'ล้างที่เลือก' : 'Clear selection'}
              </button>
            )}
          </div>

          {notFound.length > 0 && (
            <p className="text-xs text-amber-400 break-all">
              {th ? 'ไม่พบ: ' : 'Not found: '}{notFound.join(', ')}
            </p>
          )}

          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {shown.length === 0 && (
              <p className="text-xs text-slate-500 px-1 py-2">{th ? 'ไม่พบบัญชีที่ค้นหา' : 'No matching accounts'}</p>
            )}
            {shown.map(row => {
              const isSelected = selected.has(row.id)
              const newDate = isSelected && newDateFor(row)
              return (
                <label key={row.id}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer select-none transition-colors ${
                    isSelected ? 'bg-purple-500/10 border-purple-500/30' : 'border-app hover:border-slate-600'
                  }`}>
                  <input type="checkbox" checked={isSelected} onChange={() => toggle(row.id)}
                    className="accent-purple-500 flex-shrink-0" />
                  <span className="flex items-center gap-2 flex-wrap min-w-0">
                    <span className="text-sm text-slate-200 font-mono break-all">{row.email}</span>
                    <ExpiryBadge expiresAt={row.expiresAt} />
                    {newDate && (
                      <span className="text-[11px] text-emerald-400 font-semibold">
                        {th ? 'ใหม่' : 'New'}: {formatExpiryDate(newDate, lang)}
                      </span>
                    )}
                  </span>
                </label>
              )
            })}
          </div>

          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <ExpiryFields input={input} prefix={th ? 'ต่ออายุอีก' : 'Extend by'} onEdit={() => setSuccess('')} />
            </div>
            {input.invalid && <InvalidDaysMessage />}
            {input.body?.days && (
              <p className="text-xs text-slate-400 mt-1.5">
                {th ? 'บัญชีที่ยังไม่หมดอายุจะบวกต่อจากวันหมดอายุเดิม' : 'Accounts still active are extended from their current expiry.'}
              </p>
            )}
          </div>

          <button type="submit" disabled={!input.body || selectedRows.length === 0 || saving}
            className="btn-primary w-full py-2.5 text-sm disabled:opacity-40 transition-all">
            {saving
              ? '...'
              : selectedRows.length === 0
                ? (th ? 'เลือกบัญชีก่อน' : 'Select accounts first')
                : !input.body
                  ? (th ? 'ใส่จำนวนวันหรือเลือกวันที่' : 'Enter days or pick a date')
                  : (th ? `ต่ออายุ ${selectedRows.length} บัญชี` : `Renew ${selectedRows.length} account(s)`)}
          </button>

          {success && <p role="status" className="text-xs text-emerald-400">✓ {success}</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </form>
      )}
    </div>
  )
}
