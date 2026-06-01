import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Navbar from '../components/Navbar'
import OTPGrid from '../components/OTPGrid'
import GmailAccounts from '../components/GmailAccounts'
import SubUsers from '../components/SubUsers'
import AdminPanel from '../components/AdminPanel'
import api from '../lib/api'
import { useLang } from '../context/LangContext'

export default function Dashboard() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [user, setUser] = useState(null)
  const [activeTab, setActiveTab] = useState('otps')
  const [toast, setToast] = useState(null)
  const { t } = useLang()

  function showToast(type, message) {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (!stored) { navigate('/'); return }
    setUser(JSON.parse(stored))

    api.get('/auth/me').then(res => {
      setUser(res.data)
      localStorage.setItem('user', JSON.stringify(res.data))
    }).catch(() => {})

    const gmailStatus   = searchParams.get('gmail')
    const hotmailStatus = searchParams.get('hotmail')
    if (gmailStatus === 'connected') {
      const email = searchParams.get('email')
      showToast('success', t('toast_gmail_connected').replace('{email}', decodeURIComponent(email)))
      setActiveTab('gmail')
      setSearchParams({})
    } else if (gmailStatus === 'error') {
      showToast('error', t('toast_gmail_error'))
      setSearchParams({})
    } else if (hotmailStatus === 'connected') {
      const email = searchParams.get('email')
      showToast('success', t('toast_gmail_connected').replace('{email}', decodeURIComponent(email)))
      setActiveTab('gmail')
      setSearchParams({})
    } else if (hotmailStatus === 'error') {
      showToast('error', t('toast_gmail_error'))
      setSearchParams({})
    }
  }, [])

  if (!user) return null

  return (
    <div className="min-h-screen bg-app">
      <Navbar user={user} activeTab={activeTab} onTabChange={setActiveTab} />

      {toast && (
        <div className={`fixed top-16 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === 'success'
            ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
            : 'bg-red-500/10 text-red-400 border border-red-500/30'
        }`}>
          {toast.type === 'success' ? '✓' : '✗'} {toast.message}
        </div>
      )}

      <main className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6 relative">
        {activeTab === 'otps' && <OTPGrid />}
        {activeTab === 'gmail' && user.role !== 'SUBUSER' && <GmailAccounts />}
        {activeTab === 'subusers' && user.role === 'USER' && <SubUsers />}
        {activeTab === 'admin' && user.role === 'ADMIN' && <AdminPanel />}
      </main>
    </div>
  )
}
