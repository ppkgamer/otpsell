import { createContext, useContext, useState, useCallback } from 'react'
import { translations } from '../lib/lang'

const LangContext = createContext()

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'en')

  function toggleLang() {
    const next = lang === 'en' ? 'th' : 'en'
    localStorage.setItem('lang', next)
    setLang(next)
  }

  const t = useCallback(
    (key) => translations[lang]?.[key] ?? translations.en[key] ?? key,
    [lang]
  )

  return (
    <LangContext.Provider value={{ lang, toggleLang, t }}>
      {children}
    </LangContext.Provider>
  )
}

export const useLang = () => useContext(LangContext)
