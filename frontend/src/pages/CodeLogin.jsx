import { useState, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../lib/api'
import { useLang } from '../context/LangContext'

export default function CodeLogin() {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const inputRef = useRef(null)
  const { lang, toggleLang, t } = useLang()

  useEffect(() => {
    if (localStorage.getItem('token')) navigate('/dashboard')
    inputRef.current?.focus()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (code.trim().length < 6) return
    setError('')
    setLoading(true)
    try {
      const res = await api.post('/auth/code-login', { code: code.trim() })
      localStorage.setItem('token', res.data.token)
      localStorage.setItem('user', JSON.stringify(res.data.user))
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid code')
      setCode('')
      inputRef.current?.focus()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-app flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Lang toggle */}
      <div className="absolute top-4 right-4">
        <button onClick={toggleLang}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-white border border-app hover:border-purple-500/40 px-3 py-1.5 rounded-lg transition-all bg-surface">
          {lang === 'en' ? '🇹🇭 TH' : '🇬🇧 EN'}
        </button>
      </div>

      <div className="relative w-full max-w-xs">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-purple-600/20 border border-purple-500/30 mb-4 glow-purple">
            <span className="text-2xl">🔑</span>
          </div>
          <h1 className="text-xl font-bold text-white">{t('code_title')}</h1>
          <p className="text-slate-500 text-sm mt-1">{t('code_subtitle')}</p>
        </div>

        <div className="card-dark p-6 glow-purple">
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              ref={inputRef}
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="AB1234"
              maxLength={6}
              required
              className="w-full bg-[#0d0d20] border-2 border-app focus:border-purple-500 rounded-xl px-4 py-4 text-center text-3xl font-bold font-mono tracking-[0.3em] text-white uppercase focus:outline-none transition-colors"
            />

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm text-center px-3 py-2.5 rounded-xl">
                {error}
              </div>
            )}

            <button type="submit" disabled={loading || code.length < 6}
              className="btn-primary w-full py-3 disabled:opacity-40">
              {loading ? t('btn_loading') : t('code_btn')}
            </button>
          </form>
        </div>

      </div>
    </div>
  )
}
