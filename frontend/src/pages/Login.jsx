import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../lib/api'
import { useLang } from '../context/LangContext'

export default function Login() {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ email: '', username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { lang, toggleLang, t } = useLang()

  useEffect(() => {
    if (localStorage.getItem('token')) navigate('/dashboard')
  }, [])

  const set = field => e => setForm(p => ({ ...p, [field]: e.target.value }))

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await api.post(mode === 'login' ? '/auth/login' : '/auth/register', form)
      localStorage.setItem('token', res.data.token)
      localStorage.setItem('user', JSON.stringify(res.data.user))
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || 'Error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-app flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Lang toggle */}
      <div className="absolute top-4 right-4">
        <button
          onClick={toggleLang}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-white border border-app hover:border-purple-500/40 px-3 py-1.5 rounded-lg transition-all bg-surface"
        >
          <span>{lang === 'en' ? '🇹🇭 TH' : '🇬🇧 EN'}</span>
        </button>
      </div>

      <div className="relative w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-purple-600/20 border border-purple-500/30 mb-4 glow-purple">
            <span className="text-2xl">📱</span>
          </div>
          <h1 className="text-2xl font-bold text-white">OTP Reader</h1>
          <p className="text-slate-500 text-sm mt-1">Automatic OTP extraction system</p>
        </div>

        <div className="card-dark p-6 glow-purple">
          <div className="flex bg-[#0d0d20] rounded-xl p-1 mb-6">
            {[['login', t('sign_in')], ['register', t('register')]].map(([m, l]) => (
              <button key={m} onClick={() => { setMode(m); setError('') }}
                className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                  mode === m ? 'bg-purple-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                }`}>
                {l}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">{t('email')}</label>
              <input type="email" value={form.email} onChange={set('email')}
                placeholder="your@email.com" required className="input-dark w-full" />
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">{t('username')}</label>
                <input type="text" value={form.username} onChange={set('username')}
                  placeholder="username" required className="input-dark w-full" />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">{t('password')}</label>
              <input type="password" value={form.password} onChange={set('password')}
                placeholder="••••••••" required className="input-dark w-full" />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm px-3 py-2.5 rounded-xl">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              className="btn-primary w-full py-2.5 disabled:opacity-50">
              {loading ? t('btn_loading') : mode === 'login' ? t('btn_signin') : t('btn_register')}
            </button>
          </form>
        </div>

        <Link to="/code"
          className="mt-5 flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-purple-400 transition-colors">
          {t('login_code_link')}
        </Link>
      </div>
    </div>
  )
}
