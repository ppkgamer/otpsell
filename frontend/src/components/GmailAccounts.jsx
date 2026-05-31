import { useState, useEffect } from 'react'
import api from '../lib/api'
import { useLang } from '../context/LangContext'
import ConfirmDialog from './ConfirmDialog'
import { ListRowSkeleton } from './Skeleton'

export default function GmailAccounts() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [actionId, setActionId] = useState(null)
  const [dialog, setDialog] = useState(null)
  const { t, lang } = useLang()
  const locale = lang === 'en' ? 'en-US' : 'th-TH'

  async function load() {
    try {
      const res = await api.get('/gmail/accounts')
      setAccounts(res.data)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function connectGmail() {
    setConnecting(true)
    try {
      const res = await api.get('/gmail/connect')
      window.location.href = res.data.url
    } catch (err) {
      alert(err.response?.data?.error || t('error_occurred'))
      setConnecting(false)
    }
  }

  function deleteAccount(id, email) {
    setDialog({
      icon: '🗑️',
      title: lang === 'th' ? 'ลบ Gmail Account' : 'Remove Gmail Account',
      message: lang === 'th'
        ? `ต้องการลบ ${email} ออกจากระบบ?\nOTP ทั้งหมดของบัญชีนี้จะถูกลบด้วย`
        : `Remove ${email} from system?\nAll OTPs from this account will be deleted.`,
      confirmLabel: lang === 'th' ? 'ลบ' : 'Remove',
      cancelLabel:  lang === 'th' ? 'ยกเลิก' : 'Cancel',
      onConfirm: async () => {
        setActionId(id)
        try { await api.delete(`/gmail/accounts/${id}`); await load() }
        finally { setActionId(null) }
      },
    })
  }

  return (
    <div>
      <ConfirmDialog dialog={dialog} onClose={() => setDialog(null)} />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="flex-1">
          <h2 className="font-bold text-white text-lg">{t('gmail_title')}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{t('gmail_subtitle')}</p>
        </div>
        <button onClick={connectGmail} disabled={connecting}
          className="btn-primary px-4 py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50 w-full sm:w-auto">
          {connecting
            ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />{t('gmail_connecting')}</>
            : t('gmail_connect')}
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <ListRowSkeleton key={i} />)}</div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 sm:py-24 text-center px-4">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-2xl sm:text-3xl mb-4">📬</div>
          <p className="text-slate-400 font-medium">{t('gmail_empty_title')}</p>
          <p className="text-slate-600 text-sm mt-1">{t('gmail_empty_sub')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {accounts.map(acc => (
            <div key={acc.id}
              className={`card-dark px-4 py-3.5 flex items-center gap-3 transition-opacity ${actionId === acc.id ? 'opacity-40' : ''}`}>
              <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-slate-100 truncate font-mono">{acc.email}</div>
                <div className="text-xs text-slate-600 mt-0.5">
                  {acc._count.otps} {t('gmail_otps')}
                  {acc.lastPolledAt && (
                    <span className="hidden sm:inline"> · {t('gmail_last_poll')} {new Date(acc.lastPolledAt).toLocaleTimeString(locale)}</span>
                  )}
                </div>
              </div>
              <button onClick={() => deleteAccount(acc.id, acc.email)} disabled={actionId === acc.id}
                className="text-xs px-2.5 sm:px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0">
                {t('gmail_delete')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
