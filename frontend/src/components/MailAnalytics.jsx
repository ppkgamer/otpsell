import { useState, useEffect } from 'react'
import api from '../lib/api'
import { useLang } from '../context/LangContext'

export function StatCard({ value, label, color }) {
  return (
    <div className="card-dark p-4 sm:p-5 text-center">
      <div className={`text-3xl sm:text-4xl font-bold ${color}`}>{value}</div>
      <div className="text-xs sm:text-sm text-slate-500 mt-1">{label}</div>
    </div>
  )
}

function shiftMonth(month, delta) {
  const [year, number] = month.split('-').map(Number)
  return new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7)
}

function CountColumn({ value, label, highlight }) {
  return (
    <div className="text-center w-12 sm:w-16 flex-shrink-0">
      <div className={`text-base sm:text-lg font-bold ${highlight ? 'text-purple-300' : 'text-slate-200'}`}>{value}</div>
      <div className="text-[10px] sm:text-[11px] text-slate-500 whitespace-nowrap">{label}</div>
    </div>
  )
}

function CustomerRow({ row, monthLabel, open, onToggle }) {
  const { lang } = useLang()
  const th = lang === 'th'
  const locale = th ? 'th-TH' : 'en-GB'
  const { month } = row

  return (
    <div className="card-dark">
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="w-full px-4 py-3 flex items-center gap-2 sm:gap-3 text-left">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white text-sm truncate">{row.username}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-md border border-app text-slate-400 font-semibold">{row.plan}</span>
            {!row.isActive && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-400">disabled</span>}
          </div>
          <div className="text-xs text-slate-600 mt-0.5">
            Gmail {month.gmail} · Hotmail {month.hotmail}
            {month.byAdmin > 0 && ` · ${th ? 'แอดมินเพิ่มให้' : 'by admin'} ${month.byAdmin}`}
          </div>
        </div>
        <CountColumn value={row.today} label={th ? 'วันนี้' : 'Today'} />
        <CountColumn value={month.total} label={monthLabel} highlight />
        <CountColumn value={row.totalMailboxes} label={th ? 'ทั้งหมด' : 'Total'} />
        <span className={`text-xs text-slate-500 inline-block transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>

      {open && (
        <div className="px-4 pb-3 pt-2 border-t border-app">
          {row.accounts.length === 0 ? (
            <p className="text-xs text-slate-600 italic">{th ? 'ไม่มีเมลที่เพิ่มในเดือนนี้' : 'No mail added in this month'}</p>
          ) : (
            <ul className="space-y-1.5 max-h-72 overflow-y-auto">
              {row.accounts.map(account => (
                <li key={account.id} className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="font-mono text-slate-300 break-all">{account.email}</span>
                  <span className="text-slate-500">{account.provider === 'hotmail' ? 'Hotmail' : 'Gmail'}</span>
                  {account.isAdminManaged && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-orange-500/15 text-orange-400 border border-orange-500/25 font-semibold">
                      {th ? 'แอดมินเพิ่มให้' : 'By admin'}
                    </span>
                  )}
                  <span className="text-slate-600 ml-auto whitespace-nowrap">
                    {new Date(account.createdAt).toLocaleString(locale, {
                      timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default function MailAnalytics() {
  const [month, setMonth] = useState(null)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState(null)
  const { t, lang } = useLang()
  const th = lang === 'th'

  useEffect(() => {
    let cancelled = false
    setError('')
    api.get('/admin/analytics/mail-additions', { params: month ? { month } : {} })
      .then(res => { if (!cancelled) setData(res.data) })
      .catch(err => { if (!cancelled) setError(err.response?.data?.error || t('error_occurred')) })
    return () => { cancelled = true }
  }, [month])

  if (error) return <p className="text-sm text-red-400">{error}</p>
  if (!data) return null

  const [year, number] = data.month.split('-').map(Number)
  const monthTitle = new Date(Date.UTC(year, number - 1, 1)).toLocaleDateString(th ? 'th-TH' : 'en-GB', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  })
  const isCurrent = data.month === data.currentMonth
  const monthLabel = isCurrent ? (th ? 'เดือนนี้' : 'Month') : (th ? 'เดือนนั้น' : 'Month')
  const query = search.trim().toLowerCase()
  const rows = query
    ? data.users.filter(u => u.username.toLowerCase().includes(query) || u.email.toLowerCase().includes(query))
    : data.users
  const navButton = 'w-8 h-8 rounded-lg border border-app text-slate-400 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30'

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h3 className="font-bold text-white text-base sm:text-lg">{th ? 'สถิติการเพิ่มเมล' : 'Mail additions'}</h3>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setMonth(shiftMonth(data.month, -1))}
            aria-label={th ? 'เดือนก่อนหน้า' : 'Previous month'} className={navButton}>‹</button>
          <span className="text-sm font-semibold text-slate-200 min-w-[8rem] text-center">{monthTitle}</span>
          <button type="button" onClick={() => setMonth(shiftMonth(data.month, 1))} disabled={isCurrent}
            aria-label={th ? 'เดือนถัดไป' : 'Next month'} className={navButton}>›</button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-2">
        <StatCard value={data.today} label={th ? 'เพิ่มวันนี้' : 'Added today'} color="text-emerald-400" />
        <StatCard value={data.monthSummary.total} label={th ? `เพิ่มใน ${monthTitle}` : `Added in ${monthTitle}`} color="text-purple-400" />
        <StatCard value={data.totalMailboxes} label={th ? 'เมลในระบบทั้งหมด' : 'Total mailboxes'} color="text-blue-400" />
      </div>
      <p className="text-xs text-slate-500 mb-3">
        Gmail {data.monthSummary.gmail} · Hotmail {data.monthSummary.hotmail}
        {' · '}{th ? 'แอดมินเพิ่มให้' : 'By admin'} {data.monthSummary.byAdmin}
      </p>

      {data.users.length > 5 && (
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={th ? 'ค้นหาลูกค้า...' : 'Search customer...'}
          aria-label={th ? 'ค้นหาลูกค้า' : 'Search customer'}
          className="input-dark w-full mb-2"
        />
      )}

      <div className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-slate-500">{th ? 'ไม่พบลูกค้า' : 'No customers found'}</p>}
        {rows.map(row => (
          <CustomerRow
            key={row.id}
            row={row}
            monthLabel={monthLabel}
            open={openId === row.id}
            onToggle={() => setOpenId(openId === row.id ? null : row.id)}
          />
        ))}
      </div>

      <p className="text-[11px] text-slate-600 mt-2">
        {th ? 'นับตามเวลาไทย จากเมลที่ยังอยู่ในระบบ เมลที่ถูกลบไปแล้วจะไม่ถูกนับ' : 'Counted in Thailand time from mailboxes still in the system. Deleted mailboxes are not counted.'}
      </p>
    </div>
  )
}
