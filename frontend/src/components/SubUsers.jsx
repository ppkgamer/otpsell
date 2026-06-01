import { useState, useEffect } from 'react'
import api from '../lib/api'
import { useLang } from '../context/LangContext'
import ConfirmDialog from './ConfirmDialog'
import { ListRowSkeleton } from './Skeleton'

function CodeBadge({ code }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="font-mono font-bold text-lg sm:text-xl tracking-[0.2em] text-purple-300 bg-purple-500/10 border border-purple-500/30 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl">
        {code}
      </span>
      <button onClick={copy}
        className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
          copied ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' : 'border-app text-slate-400 hover:border-purple-500/30 hover:text-purple-400'
        }`}>
        {copied ? '✓' : 'copy'}
      </button>
    </div>
  )
}

export default function SubUsers() {
  const [subUsers, setSubUsers] = useState([])
  const [gmailAccounts, setGmailAccounts] = useState([])
  const [planInfo, setPlanInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [username, setUsername] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [busy, setBusy] = useState({})
  const [multiSel, setMultiSel] = useState({})

  const toggleSel = (suId, gmailId) =>
    setMultiSel(p => {
      const cur = p[suId] || []
      return { ...p, [suId]: cur.includes(gmailId) ? cur.filter(id => id !== gmailId) : [...cur, gmailId] }
    })
  const selAll   = (suId, list) => setMultiSel(p => ({ ...p, [suId]: list.map(g => g.id) }))
  const clearSel = (suId)       => setMultiSel(p => ({ ...p, [suId]: [] }))
  const [search, setSearch] = useState('')
  const [dialog, setDialog] = useState(null)
  const [expandedGmails, setExpandedGmails] = useState({})
  const { t, lang } = useLang()

  const toggleGmailList = (suId) => setExpandedGmails(p => ({ ...p, [suId]: !p[suId] }))

  const PLAN_STYLE = { FREE: 'bg-slate-500/20 text-slate-400', BASIC: 'bg-blue-500/20 text-blue-400', PRO: 'bg-purple-500/20 text-purple-400' }

  async function load() {
    try {
      const [subRes, gmailRes] = await Promise.all([api.get('/auth/subusers'), api.get('/gmail/accounts')])
      setSubUsers(subRes.data.subUsers ?? subRes.data)
      setPlanInfo(subRes.data.plan ?? null)
      setGmailAccounts(gmailRes.data)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function createSubUser(e) {
    e.preventDefault()
    setCreateError('')
    setCreating(true)
    try {
      await api.post('/auth/subuser', { username })
      setUsername('')
      setShowCreate(false)
      await load()
    } catch (err) {
      setCreateError(err.response?.data?.error || t('error_occurred'))
    } finally { setCreating(false) }
  }

  const op = async (key, fn) => {
    setBusy(p => ({ ...p, [key]: true }))
    try { await fn(); await load() } finally { setBusy(p => ({ ...p, [key]: false })) }
  }

  const q = search.trim().toLowerCase()
  const filtered = q
    ? subUsers.filter(su =>
        su.username.toLowerCase().includes(q) ||
        su.code.toLowerCase().includes(q)
      )
    : subUsers

  const getAvailable = su => {
    // Gmail ที่ assign ให้ sub-user อื่นแล้ว (ห้ามซ้ำ)
    const assignedToOthers = new Set(
      subUsers
        .filter(other => other.id !== su.id)
        .flatMap(other => other.assignedGmails.map(a => a.gmailAccount.id))
    )
    // Gmail ที่ assign ให้ sub-user นี้แล้ว
    const myIds = new Set(su.assignedGmails.map(a => a.gmailAccount.id))
    return gmailAccounts.filter(g => !assignedToOthers.has(g.id) && !myIds.has(g.id))
  }

  return (
    <div>
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-5">
        <div className="flex-1">
          <h2 className="font-bold text-white text-lg">{t('sub_title')}</h2>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <p className="text-xs text-slate-500">{t('sub_subtitle')}</p>
            {planInfo && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${PLAN_STYLE[planInfo] || ''}`}>{planInfo}</span>
            )}
          </div>
        </div>
        <button onClick={() => { setShowCreate(p => !p); setCreateError('') }}
          className={`text-sm px-4 py-2.5 rounded-xl font-medium transition-all w-full sm:w-auto ${showCreate ? 'btn-ghost' : 'btn-primary'}`}>
          {showCreate ? t('sub_cancel') : t('sub_create')}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={createSubUser} className="bg-purple-500/5 border border-purple-500/20 rounded-2xl p-4 sm:p-5 mb-5">
          <h3 className="font-semibold text-white mb-1">{t('sub_create_title')}</h3>
          <p className="text-xs text-slate-500 mb-4">{t('sub_create_sub')}</p>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <input type="text" value={username} onChange={e => setUsername(e.target.value)}
              placeholder={t('sub_name_placeholder')} required autoFocus
              className="input-dark flex-1" />
            <button type="submit" disabled={creating}
              className="btn-primary px-5 py-2.5 disabled:opacity-50 w-full sm:w-auto">
              {creating ? t('sub_btn_creating') : t('sub_btn_create')}
            </button>
          </div>
          {createError && (
            <div className="mt-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{createError}</div>
          )}
        </form>
      )}

      {!loading && subUsers.length > 0 && (
        <div className="relative mb-4">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none text-sm">🔍</span>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={lang === 'th' ? 'ค้นหาชื่อหรือ Code...' : 'Search name or code...'}
            className="input-dark w-full pl-9 pr-9"
          />
          {search && (
            <button onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors text-sm">
              ✕
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1,2].map(i => <ListRowSkeleton key={i} />)}</div>
      ) : subUsers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 sm:py-24 text-center px-4">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-2xl sm:text-3xl mb-4">👥</div>
          <p className="text-slate-400 font-medium">{t('sub_empty_title')}</p>
          <p className="text-slate-600 text-sm mt-1">{t('sub_empty_sub')}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <div className="w-12 h-12 rounded-2xl bg-slate-500/10 border border-slate-500/20 flex items-center justify-center text-2xl mb-3">🔍</div>
          <p className="text-slate-400 font-medium">
            {lang === 'th' ? `ไม่พบ "${search}"` : `No results for "${search}"`}
          </p>
          <button onClick={() => setSearch('')} className="text-xs text-purple-400 mt-2 hover:text-purple-300">
            {lang === 'th' ? 'ล้างการค้นหา' : 'Clear search'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(su => {
            const available = getAvailable(su)
            return (
              <div key={su.id} className={`card-dark p-4 sm:p-5 ${!su.isActive ? 'opacity-50' : ''}`}>
                {/* Sub-user header */}
                <div className="flex items-center justify-between mb-4 gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${su.isActive ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    <span className="font-semibold text-white truncate">{su.username}</span>
                    <span className="text-xs text-slate-600 hidden sm:block">{su.isActive ? t('sub_active') : t('sub_inactive')}</span>
                  </div>
                  <div className="flex gap-1.5 flex-shrink-0">
                    <button onClick={() => op(`t-${su.id}`, () => api.patch(`/auth/subuser/${su.id}/toggle`))}
                      disabled={busy[`t-${su.id}`]}
                      className={`text-xs px-2 sm:px-2.5 py-1 rounded-lg border transition-all ${su.isActive ? 'border-orange-500/30 text-orange-400' : 'border-emerald-500/30 text-emerald-400'}`}>
                      {su.isActive ? t('sub_toggle_off') : t('sub_toggle_on')}
                    </button>
                    <button onClick={() => setDialog({
                      icon: '👤',
                      title: lang === 'th' ? 'ลบ Sub-user' : 'Delete Sub-user',
                      message: lang === 'th'
                        ? `ต้องการลบ "${su.username}" ?\nการกระทำนี้ไม่สามารถยกเลิกได้`
                        : `Delete "${su.username}"?\nThis action cannot be undone.`,
                      confirmLabel: lang === 'th' ? 'ลบ' : 'Delete',
                      cancelLabel:  lang === 'th' ? 'ยกเลิก' : 'Cancel',
                      onConfirm: () => op(`d-${su.id}`, () => api.delete(`/auth/subuser/${su.id}`)),
                    })} disabled={busy[`d-${su.id}`]}
                      className="text-xs px-2 sm:px-2.5 py-1 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10">
                      {t('sub_delete')}
                    </button>
                  </div>
                </div>

                {/* Code */}
                <div className="mb-4">
                  <div className="text-xs text-slate-500 font-medium mb-2">{t('sub_code_label')}</div>
                  <CodeBadge code={su.code} />
                  <p className="text-xs text-slate-600 mt-1.5">{t('sub_code_hint')}</p>
                </div>

                {/* Assigned Gmails */}
                <div className="mb-3">
                  <button
                    onClick={() => su.assignedGmails.length > 0 && toggleGmailList(su.id)}
                    className={`flex items-center justify-between w-full text-left mb-2 group ${su.assignedGmails.length > 0 ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <span className="text-xs text-slate-500 font-medium">
                      {t('sub_gmail_label')} ({su.assignedGmails.length})
                    </span>
                    {su.assignedGmails.length > 0 && (
                      <span className={`text-xs text-slate-500 group-hover:text-slate-400 transition-transform duration-200 ${expandedGmails[su.id] ? 'rotate-180' : ''} inline-block`}>
                        ▼
                      </span>
                    )}
                  </button>
                  {su.assignedGmails.length === 0 ? (
                    <div className="text-xs text-slate-700 italic py-1">{t('sub_gmail_none')}</div>
                  ) : expandedGmails[su.id] ? (
                    <div className="space-y-1.5">
                      {su.assignedGmails.map(a => (
                        <div key={a.gmailAccount.id}
                          className="flex items-center justify-between gap-3 bg-emerald-500/8 border border-emerald-500/20 rounded-xl px-3 py-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                            <span className="text-sm text-emerald-300 font-mono truncate">
                              {a.gmailAccount.email}
                            </span>
                          </div>
                          <button
                            onClick={() => setDialog({
                              icon: '📧',
                              title: lang === 'th' ? 'ยกเลิก Gmail นี้' : 'Remove Gmail',
                              message: lang === 'th'
                                ? `ยกเลิกการ assign "${a.gmailAccount.email}" ออกจาก ${su.username}?`
                                : `Remove "${a.gmailAccount.email}" from ${su.username}?`,
                              confirmLabel: lang === 'th' ? 'ยกเลิก Assign' : 'Remove',
                              cancelLabel:  lang === 'th' ? 'ปิด' : 'Cancel',
                              onConfirm: () => op(`u-${su.id}-${a.gmailAccount.id}`, () =>
                                api.delete(`/auth/subuser/${su.id}/assign/${a.gmailAccount.id}`)
                              ),
                            })}
                            disabled={busy[`u-${su.id}-${a.gmailAccount.id}`]}
                            className="flex-shrink-0 text-xs px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40 min-w-[52px] text-center"
                          >
                            {busy[`u-${su.id}-${a.gmailAccount.id}`] ? '...' : lang === 'th' ? 'ลบ' : 'Remove'}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      onClick={() => toggleGmailList(su.id)}
                      className="flex flex-wrap gap-1.5 cursor-pointer"
                    >
                      {su.assignedGmails.slice(0, 3).map(a => (
                        <span key={a.gmailAccount.id} className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-2 py-1 font-mono">
                          {a.gmailAccount.email}
                        </span>
                      ))}
                      {su.assignedGmails.length > 3 && (
                        <span className="text-xs text-slate-500 bg-slate-500/10 border border-slate-500/20 rounded-lg px-2 py-1">
                          +{su.assignedGmails.length - 3} {lang === 'th' ? 'อีเมล' : 'more'}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Add Gmail — multi-select */}
                {gmailAccounts.length === 0 ? (
                  <div className="text-xs text-orange-400 bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-2">
                    {t('sub_gmail_no_gmail')}
                  </div>
                ) : available.length > 0 ? (
                  <div className="space-y-2">
                    {/* Header row */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-slate-500 font-medium">
                        {lang === 'th' ? 'เพิ่ม Gmail' : 'Add Gmail'}
                        {(multiSel[su.id]?.length > 0) && (
                          <span className="ml-1.5 text-purple-400 font-semibold">· {multiSel[su.id].length} {lang === 'th' ? 'เลือก' : 'selected'}</span>
                        )}
                      </span>
                      <div className="flex gap-2.5">
                        <button onClick={() => selAll(su.id, available)}
                          className="text-xs text-purple-400 hover:text-purple-300 transition-colors">
                          {t('sub_select_all')}
                        </button>
                        {(multiSel[su.id]?.length > 0) && (
                          <button onClick={() => clearSel(su.id)}
                            className="text-xs text-slate-500 hover:text-slate-400 transition-colors">
                            {t('sub_clear_sel')}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Checkbox list */}
                    <div className="space-y-1.5">
                      {available.map(g => {
                        const isSel = (multiSel[su.id] || []).includes(g.id)
                        return (
                          <label key={g.id}
                            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer select-none transition-all active:scale-[0.98] ${
                              isSel ? 'bg-purple-500/10 border-purple-500/30' : 'border-app hover:border-slate-600'
                            }`}>
                            {/* Custom checkbox */}
                            <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                              isSel ? 'bg-purple-500 border-purple-500' : 'border-slate-600'
                            }`}>
                              {isSel && <span className="text-white text-[9px] font-black leading-none">✓</span>}
                            </div>
                            <input type="checkbox" checked={isSel}
                              onChange={() => toggleSel(su.id, g.id)}
                              className="sr-only" />
                            <span className="text-sm text-slate-300 font-mono truncate">{g.email}</span>
                          </label>
                        )
                      })}
                    </div>

                    {/* Assign button */}
                    <button
                      onClick={() => op(`a-${su.id}`, async () => {
                        const selected = multiSel[su.id] || []
                        if (!selected.length) return
                        for (const gmailId of selected) {
                          await api.post(`/auth/subuser/${su.id}/assign`, { gmailAccountId: gmailId })
                        }
                        clearSel(su.id)
                      })}
                      disabled={busy[`a-${su.id}`] || !(multiSel[su.id]?.length)}
                      className="btn-primary w-full py-2.5 text-sm disabled:opacity-40 transition-all">
                      {busy[`a-${su.id}`]
                        ? <span className="flex items-center justify-center gap-2">
                            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            {lang === 'th' ? 'กำลัง assign...' : 'Assigning...'}
                          </span>
                        : multiSel[su.id]?.length
                          ? t('sub_assign_n').replace('{n}', multiSel[su.id].length)
                          : t('sub_select_first')
                      }
                    </button>
                  </div>
                ) : (
                  <div className="text-xs text-slate-600 italic">{t('sub_gmail_full')}</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
