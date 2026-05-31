import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../context/LangContext'
import ChangePasswordModal from './ChangePasswordModal'

const ROLE_STYLE = {
  ADMIN:   'bg-red-500/20 text-red-400 border-red-500/30',
  USER:    'bg-purple-500/20 text-purple-400 border-purple-500/30',
  SUBUSER: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
}
const PLAN_STYLE = {
  FREE:  'bg-slate-500/20 text-slate-400',
  BASIC: 'bg-blue-500/20 text-blue-400',
  PRO:   'bg-purple-500/20 text-purple-400',
}

export default function Navbar({ user, activeTab, onTabChange }) {
  const navigate = useNavigate()
  const { lang, toggleLang, t } = useLang()
  const [showPwModal, setShowPwModal] = useState(false)

  function logout() {
    const isSubUser = user.role === 'SUBUSER'
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate(isSubUser ? '/code' : '/')
  }

  const tabs = [{ key: 'otps', label: 'OTPs' }]
  if (user.role !== 'SUBUSER') tabs.push({ key: 'gmail', label: t('nav_gmail') })
  if (user.role === 'USER')    tabs.push({ key: 'subusers', label: t('nav_subusers') })
  if (user.role === 'ADMIN')   tabs.push({ key: 'admin', label: t('nav_admin') })

  return (
    <>
    <div className="sticky top-0 z-20 border-b border-white/5"
      style={{ background: 'rgba(10,10,26,0.9)', backdropFilter: 'blur(20px)' }}>

      <div className="max-w-6xl mx-auto px-4">
        {/* Row 1: Logo + User info */}
        <div className="h-12 flex items-center justify-between gap-3">
          <span className="font-bold text-white text-sm flex items-center gap-1.5 flex-shrink-0">
            <span className="text-purple-400">📱</span>
            <span className="hidden xs:block">OTP Reader</span>
          </span>

          <div className="flex items-center gap-2">
            <button onClick={toggleLang}
              className="text-xs text-slate-600 hover:text-slate-300 border border-app hover:border-purple-500/30 px-2 py-1 rounded-lg transition-all">
              {lang === 'en' ? '🇹🇭' : '🇬🇧'}
            </button>
            {user.role === 'USER' && user.plan && (
              <span className={`hidden sm:block text-xs px-2 py-0.5 rounded-full font-bold ${PLAN_STYLE[user.plan]}`}>
                {user.plan}
              </span>
            )}
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${ROLE_STYLE[user.role]}`}>
              {user.role === 'SUBUSER' ? 'SUB' : user.role}
            </span>
            {user.role !== 'SUBUSER' && (
              <button
                onClick={() => setShowPwModal(true)}
                className="text-sm text-slate-400 hidden md:block max-w-[120px] truncate hover:text-purple-400 transition-colors"
                title={lang === 'th' ? 'เปลี่ยนรหัสผ่าน' : 'Change password'}
              >
                {user.username || user.email}
              </button>
            )}
            {user.role === 'SUBUSER' && (
              <span className="text-sm text-slate-400 hidden md:block max-w-[120px] truncate">
                {user.username}
              </span>
            )}
            <button onClick={logout}
              className="text-xs text-slate-600 hover:text-red-400 transition-colors px-2 py-1 rounded-lg hover:bg-red-400/10 flex-shrink-0">
              {t('nav_logout')}
            </button>
          </div>
        </div>

        {/* Row 2: Tabs — horizontally scrollable */}
        <div className="overflow-x-auto no-scrollbar pb-0">
          <nav className="flex gap-0.5 min-w-max pb-2">
            {tabs.map(tab => (
              <button key={tab.key} onClick={() => onTabChange(tab.key)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-all font-medium whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                    : 'text-slate-500 hover:text-slate-200 hover:bg-white/5'
                }`}>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>

    {showPwModal && <ChangePasswordModal onClose={() => setShowPwModal(false)} />}
    </>
  )
}
