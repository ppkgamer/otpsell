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
            {user.subUsers.map(su => (
              <div key={su.id} className={`card-dark px-4 py-3 ${!su.isActive ? 'opacity-50' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${su.isActive ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    <span className="text-sm font-medium text-slate-200 truncate">{su.username}</span>
                    <span className="font-mono text-xs text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-lg flex-shrink-0">{su.code}</span>
                  </div>
                  <span className="text-xs text-slate-600 flex-shrink-0">{su.assignedGmails.length} {t('admin_assigned')}</span>
                </div>
                {su.assignedGmails.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 pl-4">
                    {su.assignedGmails.map(a => (
                      <span key={a.gmailAccount.id} className="text-xs bg-card2 text-slate-500 px-2 py-0.5 rounded-lg font-mono border border-app truncate max-w-[160px]">
                        {a.gmailAccount.email}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
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
