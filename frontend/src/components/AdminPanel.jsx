import { useState, useEffect } from 'react'
import api from '../lib/api'
import { useLang } from '../context/LangContext'
import { StatCardSkeleton, UserCardSkeleton } from './Skeleton'

const PLAN_STYLE = {
  FREE:  'bg-slate-500/20 text-slate-400 border-slate-500/30',
  BASIC: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  PRO:   'bg-purple-500/20 text-purple-400 border-purple-500/30',
}

function CreateUserButton({ onCreated }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ email: '', username: '', password: '', plan: 'FREE' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { lang } = useLang()

  const set = f => e => setForm(p => ({ ...p, [f]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/admin/users', form)
      setForm({ email: '', username: '', password: '', plan: 'FREE' })
      setOpen(false)
      onCreated()
    } catch (err) {
      setError(err.response?.data?.error || 'Error')
    } finally { setLoading(false) }
  }

  return (
    <>
      <button onClick={() => { setOpen(true); setError('') }}
        className="btn-primary text-sm px-4 py-2 flex items-center gap-1.5">
        + {lang === 'th' ? 'สร้าง User' : 'Create User'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
          onClick={e => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className="w-full max-w-sm rounded-2xl border border-white/10 p-6"
            style={{ background: 'rgba(22,22,50,0.97)', animation: 'dialogIn 0.15s ease-out' }}>

            <h3 className="text-white font-bold text-lg mb-5">
              {lang === 'th' ? 'สร้าง User ใหม่' : 'Create New User'}
            </h3>

            <form onSubmit={submit} className="space-y-3">
              {[
                { f: 'email',    type: 'email',    ph: 'user@email.com',   label: 'Email' },
                { f: 'username', type: 'text',     ph: 'username',          label: 'Username' },
                { f: 'password', type: 'password', ph: '••••••••',          label: 'Password' },
              ].map(({ f, type, ph, label }) => (
                <div key={f}>
                  <label className="block text-xs text-slate-400 mb-1">{label}</label>
                  <input type={type} value={form[f]} onChange={set(f)} placeholder={ph}
                    required className="input-dark w-full" />
                </div>
              ))}

              <div>
                <label className="block text-xs text-slate-400 mb-1">Plan</label>
                <select value={form.plan} onChange={set('plan')}
                  className="input-dark w-full">
                  <option value="FREE">FREE — 1 Gmail · 1 Sub-user</option>
                  <option value="BASIC">BASIC — 5 Gmails · 10 Sub-users</option>
                  <option value="PRO">PRO — Unlimited</option>
                </select>
              </div>

              {error && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setOpen(false)}
                  className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 text-sm font-medium transition-all">
                  {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
                </button>
                <button type="submit" disabled={loading}
                  className="flex-1 btn-primary py-2.5 disabled:opacity-50">
                  {loading ? '...' : lang === 'th' ? 'สร้าง' : 'Create'}
                </button>
              </div>
            </form>
          </div>
          <style>{`@keyframes dialogIn{from{opacity:0;transform:scale(.92) translateY(8px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
        </div>
      )}
    </>
  )
}

function StatCard({ value, label, color }) {
  return (
    <div className="card-dark p-4 sm:p-5 text-center">
      <div className={`text-3xl sm:text-4xl font-bold ${color}`}>{value}</div>
      <div className="text-xs sm:text-sm text-slate-500 mt-1">{label}</div>
    </div>
  )
}

function UserDetail({ userId, onBack, onRefresh }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(null)
  const [expandedSu, setExpandedSu] = useState(null)
  const [adminMultiSel, setAdminMultiSel] = useState({})
  const [confirmDel, setConfirmDel] = useState(null)
  const { t, lang } = useLang()
  const locale = lang === 'en' ? 'en-US' : 'th-TH'
  const PLAN_LIMIT_KEY = { FREE: 'plan_limit_free', BASIC: 'plan_limit_basic', PRO: 'plan_limit_pro' }

  async function load() {
    try { const res = await api.get(`/admin/users/${userId}`); setUser(res.data) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [userId])

  async function changePlan(plan) {
    setBusy(`plan-${plan}`)
    try { await api.patch(`/admin/users/${userId}/plan`, { plan }); await load(); onRefresh() }
    finally { setBusy(null) }
  }

  async function toggleUser() {
    setBusy('toggle')
    try { await api.patch(`/admin/users/${userId}/toggle`); await load(); onRefresh() }
    finally { setBusy(null) }
  }

  async function deleteSu(suId) {
    setBusy(`del-${suId}`)
    try { await api.delete(`/admin/subusers/${suId}`); await load() }
    finally { setBusy(null); setConfirmDel(null) }
  }

  async function removeAssign(suId, gmailId) {
    setBusy(`ua-${suId}-${gmailId}`)
    try { await api.delete(`/admin/subusers/${suId}/assign/${gmailId}`); await load() }
    finally { setBusy(null) }
  }

  async function assignGmails(suId) {
    const selected = adminMultiSel[suId] || []
    if (!selected.length) return
    setBusy(`aa-${suId}`)
    try {
      for (const gmailId of selected) {
        await api.post(`/admin/subusers/${suId}/assign`, { gmailAccountId: gmailId })
      }
      setAdminMultiSel(p => ({ ...p, [suId]: [] }))
      await load()
    } finally { setBusy(null) }
  }

  const toggleAdminSel = (suId, gmailId) =>
    setAdminMultiSel(p => {
      const cur = p[suId] || []
      return { ...p, [suId]: cur.includes(gmailId) ? cur.filter(id => id !== gmailId) : [...cur, gmailId] }
    })

  if (loading) return (
    <div className="space-y-4">
      <div className="card-dark p-6 space-y-3">
        <div className="flex gap-3"><StatCardSkeleton /><div className="flex-1" /></div>
        <div className="grid grid-cols-3 gap-2">{[1,2,3].map(i => <StatCardSkeleton key={i} />)}</div>
      </div>
      <div className="space-y-2">{[1,2].map(i => <UserCardSkeleton key={i} />)}</div>
    </div>
  )
  if (!user) return null

  return (
    <div>
      {/* Confirm delete dialog */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
          onClick={e => { if (e.target === e.currentTarget) setConfirmDel(null) }}>
          <div className="w-full max-w-sm rounded-2xl border border-white/10 p-6"
            style={{ background: 'rgba(22,22,50,0.97)' }}>
            <div className="text-2xl mb-3">👤</div>
            <h3 className="text-white font-bold mb-2">{lang === 'th' ? 'ลบ Sub-user' : 'Delete Sub-user'}</h3>
            <p className="text-slate-400 text-sm mb-5">
              {lang === 'th' ? `ลบ "${confirmDel.username}" ? ไม่สามารถยกเลิกได้` : `Delete "${confirmDel.username}"? This cannot be undone.`}
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDel(null)}
                className="flex-1 py-2.5 rounded-xl border border-white/10 text-slate-400 hover:bg-white/5 text-sm transition-all">
                {lang === 'th' ? 'ยกเลิก' : 'Cancel'}
              </button>
              <button onClick={() => deleteSu(confirmDel.id)} disabled={busy === `del-${confirmDel.id}`}
                className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 text-sm font-medium transition-all disabled:opacity-50">
                {busy === `del-${confirmDel.id}` ? '...' : lang === 'th' ? 'ลบ' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-white mb-5 transition-colors">
        {t('admin_back')}
      </button>

      {/* User card */}
      <div className="card-dark p-4 sm:p-6 mb-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-xl font-bold text-white">{user.username}</h2>
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold border ${PLAN_STYLE[user.plan]}`}>{user.plan}</span>
              {!user.isActive && <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">disabled</span>}
            </div>
            <div className="text-sm text-slate-500 mt-1 truncate">{user.email}</div>
            <div className="text-xs text-slate-600 mt-1">
              {user._count.gmailAccounts} Gmails · {user._count.subUsers} Sub-users
              · {t('admin_joined')} {new Date(user.createdAt).toLocaleDateString(locale)}
            </div>
          </div>
          <button onClick={toggleUser} disabled={busy === 'toggle'}
            className="btn-ghost text-xs px-3 py-1.5 flex-shrink-0">
            {user.isActive ? t('admin_disable') : t('admin_enable')}
          </button>
        </div>

        {/* Plan selector */}
        <div className="mt-5">
          <div className="text-xs font-medium text-slate-500 mb-2">{t('admin_plan_label')}</div>
          <div className="grid grid-cols-3 gap-2">
            {['FREE','BASIC','PRO'].map(plan => (
              <button key={plan} onClick={() => changePlan(plan)}
                disabled={user.plan === plan || busy === `plan-${plan}`}
                className={`py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-bold border transition-all ${
                  user.plan === plan ? `${PLAN_STYLE[plan]} cursor-default` : 'bg-transparent border-app text-slate-500 hover:border-purple-500/40 hover:text-purple-400'
                } disabled:opacity-60`}>
                {busy === `plan-${plan}` ? '...' : plan}
                <div className="text-xs font-normal mt-0.5 opacity-70 hidden sm:block">{t(PLAN_LIMIT_KEY[plan])}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Gmails */}
      <div className="mb-5">
        <h3 className="font-semibold text-white mb-3">{t('admin_gmails_label')} ({user.gmailAccounts.length})</h3>
        {user.gmailAccounts.length === 0 ? (
          <p className="text-sm text-slate-600 italic">{t('admin_no_gmail')}</p>
        ) : (
          <div className="space-y-2">
            {user.gmailAccounts.map(g => (
              <div key={g.id} className="card-dark px-4 py-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                  <span className="text-sm font-mono text-slate-300 truncate">{g.email}</span>
                </div>
                <span className="text-xs text-slate-600 flex-shrink-0">{g._count.otps} OTPs</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sub-users */}
      <div>
        <h3 className="font-semibold text-white mb-3">{t('admin_sub_label')} ({user.subUsers.length})</h3>
        {user.subUsers.length === 0 ? (
          <p className="text-sm text-slate-600 italic">{t('admin_no_sub')}</p>
        ) : (
          <div className="space-y-2">
            {user.subUsers.map(su => {
              const assignedIds = new Set(su.assignedGmails.map(a => a.gmailAccount.id))
              const assignedToOthers = new Set(
                user.subUsers
                  .filter(o => o.id !== su.id)
                  .flatMap(o => o.assignedGmails.map(a => a.gmailAccount.id))
              )
              const available = user.gmailAccounts.filter(g => !assignedToOthers.has(g.id) && !assignedIds.has(g.id))
              const isExp = expandedSu === su.id

              return (
                <div key={su.id} className={`card-dark ${!su.isActive ? 'opacity-60' : ''}`}>
                  {/* Header row */}
                  <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${su.isActive ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    <span className="text-sm font-medium text-slate-200 truncate flex-1 min-w-0">{su.username}</span>
                    <span className="font-mono text-xs text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-lg flex-shrink-0">{su.code}</span>
                    <button
                      onClick={() => setExpandedSu(p => p === su.id ? null : su.id)}
                      className="text-xs px-2.5 py-1 rounded-lg border border-app text-slate-400 hover:border-purple-500/30 hover:text-purple-400 transition-colors flex-shrink-0">
                      {isExp ? '▲' : `▼ ${lang === 'th' ? 'จัดการ' : 'Manage'}`}
                    </button>
                    <button
                      onClick={() => setConfirmDel({ id: su.id, username: su.username })}
                      disabled={busy === `del-${su.id}`}
                      className="text-xs px-2.5 py-1 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0 disabled:opacity-40">
                      {lang === 'th' ? 'ลบ' : 'Delete'}
                    </button>
                  </div>

                  {/* Collapsed: show assigned gmail chips */}
                  {!isExp && su.assignedGmails.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 px-4 pb-3 pl-8">
                      {su.assignedGmails.map(a => (
                        <span key={a.gmailAccount.id}
                          className="text-xs bg-card2 text-slate-500 px-2 py-0.5 rounded-lg font-mono border border-app truncate max-w-[180px]">
                          {a.gmailAccount.email}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Expanded: full manage UI */}
                  {isExp && (
                    <div className="px-4 pb-4 pt-2 border-t border-app space-y-3">

                      {/* Assigned gmails with remove */}
                      {su.assignedGmails.length > 0 && (
                        <div>
                          <div className="text-xs text-slate-500 font-medium mb-1.5">
                            {lang === 'th' ? 'Gmail ที่ assign แล้ว' : 'Assigned Gmail'}
                          </div>
                          <div className="space-y-1.5">
                            {su.assignedGmails.map(a => (
                              <div key={a.gmailAccount.id}
                                className="flex items-center justify-between gap-2 bg-emerald-500/8 border border-emerald-500/20 rounded-xl px-3 py-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                                  <span className="text-xs text-emerald-300 font-mono truncate">{a.gmailAccount.email}</span>
                                </div>
                                <button
                                  onClick={() => removeAssign(su.id, a.gmailAccount.id)}
                                  disabled={busy === `ua-${su.id}-${a.gmailAccount.id}`}
                                  className="flex-shrink-0 text-xs px-2.5 py-1 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40">
                                  {busy === `ua-${su.id}-${a.gmailAccount.id}` ? '...' : lang === 'th' ? 'ลบ' : 'Remove'}
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Add gmail multi-select */}
                      {user.gmailAccounts.length === 0 ? (
                        <p className="text-xs text-slate-600 italic">
                          {lang === 'th' ? 'User ยังไม่มี Gmail' : 'User has no Gmail accounts'}
                        </p>
                      ) : available.length === 0 ? (
                        su.assignedGmails.length > 0 && (
                          <p className="text-xs text-slate-600 italic">
                            {lang === 'th' ? 'Assign ครบทุก Gmail แล้ว' : 'All Gmails assigned'}
                          </p>
                        )
                      ) : (
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs text-slate-500 font-medium">
                              {lang === 'th' ? 'เพิ่ม Gmail' : 'Add Gmail'}
                              {adminMultiSel[su.id]?.length > 0 && (
                                <span className="text-purple-400 ml-1.5 font-semibold">
                                  · {adminMultiSel[su.id].length} {lang === 'th' ? 'เลือก' : 'selected'}
                                </span>
                              )}
                            </span>
                            <div className="flex gap-2.5">
                              <button onClick={() => setAdminMultiSel(p => ({ ...p, [su.id]: available.map(g => g.id) }))}
                                className="text-xs text-purple-400 hover:text-purple-300 transition-colors">
                                {lang === 'th' ? 'ทั้งหมด' : 'All'}
                              </button>
                              {adminMultiSel[su.id]?.length > 0 && (
                                <button onClick={() => setAdminMultiSel(p => ({ ...p, [su.id]: [] }))}
                                  className="text-xs text-slate-500 hover:text-slate-400 transition-colors">
                                  {lang === 'th' ? 'ล้าง' : 'Clear'}
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            {available.map(g => {
                              const isSel = (adminMultiSel[su.id] || []).includes(g.id)
                              return (
                                <label key={g.id}
                                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer select-none transition-all active:scale-[0.98] ${
                                    isSel ? 'bg-purple-500/10 border-purple-500/30' : 'border-app hover:border-slate-600'
                                  }`}>
                                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                    isSel ? 'bg-purple-500 border-purple-500' : 'border-slate-600'
                                  }`}>
                                    {isSel && <span className="text-white text-[9px] font-black leading-none">✓</span>}
                                  </div>
                                  <input type="checkbox" checked={isSel}
                                    onChange={() => toggleAdminSel(su.id, g.id)}
                                    className="sr-only" />
                                  <span className="text-sm text-slate-300 font-mono truncate">{g.email}</span>
                                </label>
                              )
                            })}
                          </div>
                          <button
                            onClick={() => assignGmails(su.id)}
                            disabled={busy === `aa-${su.id}` || !adminMultiSel[su.id]?.length}
                            className="btn-primary w-full py-2.5 text-sm mt-2 disabled:opacity-40 transition-all">
                            {busy === `aa-${su.id}`
                              ? <span className="flex items-center justify-center gap-2">
                                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  {lang === 'th' ? 'กำลัง assign...' : 'Assigning...'}
                                </span>
                              : adminMultiSel[su.id]?.length
                                ? `+ ${lang === 'th' ? 'กำหนด' : 'Assign'} ${adminMultiSel[su.id].length} Gmail`
                                : lang === 'th' ? 'เลือก Gmail ด้านบนก่อน' : 'Select Gmail above'
                            }
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function UserList({ users, onSelect }) {
  const { t } = useLang()
  if (users.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-2xl sm:text-3xl mb-4">👥</div>
        <p className="text-slate-400">{t('admin_empty')}</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {users.map(user => (
        <button key={user.id} onClick={() => onSelect(user.id)}
          className="w-full card-dark px-4 sm:px-5 py-3.5 sm:py-4 flex items-center justify-between hover:border-purple-500/30 transition-all text-left group gap-3">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${user.isActive ? 'bg-emerald-400' : 'bg-slate-600'}`} />
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-white text-sm sm:text-base">{user.username}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${PLAN_STYLE[user.plan]}`}>{user.plan}</span>
                {!user.isActive && <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">disabled</span>}
              </div>
              <div className="text-xs text-slate-600 mt-0.5 truncate">
                <span className="hidden sm:inline">{user.email} · </span>
                {user._count.gmailAccounts} Gmails · {user._count.subUsers} Sub-users
              </div>
            </div>
          </div>
          <span className="text-slate-600 group-hover:text-purple-400 text-xl flex-shrink-0 transition-colors">›</span>
        </button>
      ))}
    </div>
  )
}

export default function AdminPanel() {
  const [stats, setStats] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const { t } = useLang()

  async function loadList() {
    try {
      const [s, u] = await Promise.all([api.get('/admin/stats'), api.get('/admin/users')])
      setStats(s.data); setUsers(u.data)
    } finally { setLoading(false) }
  }
  useEffect(() => { loadList() }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {[1,2,3].map(i => <StatCardSkeleton key={i} />)}
        </div>
        <div className="space-y-2">
          {[1,2,3].map(i => <UserCardSkeleton key={i} />)}
        </div>
      </div>
    )
  }

  if (selectedId) return <UserDetail userId={selectedId} onBack={() => setSelectedId(null)} onRefresh={loadList} />

  return (
    <div className="space-y-6 sm:space-y-8">
      {stats && (
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <StatCard value={stats.userCount} label={t('admin_users')} color="text-blue-400" />
          <StatCard value={stats.activeGmailCount} label={t('admin_active_gmails')} color="text-emerald-400" />
          <StatCard value={stats.totalOtpCount} label={t('admin_total_otps')} color="text-purple-400" />
        </div>
      )}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-white text-base sm:text-lg">{t('admin_title')} ({users.length})</h3>
          <CreateUserButton onCreated={loadList} />
        </div>
        <UserList users={users} onSelect={setSelectedId} />
      </div>
    </div>
  )
}
