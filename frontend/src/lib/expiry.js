const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export const EXPIRY_WARNING_DAYS = 2

function bangkokDayNumber(ms) {
  return Math.floor((ms + BANGKOK_OFFSET_MS) / DAY_MS)
}

// Calendar days left in Thailand time: 0 means it expires today.
export function daysUntil(expiresAt) {
  return bangkokDayNumber(new Date(expiresAt).getTime()) - bangkokDayNumber(Date.now())
}

export function isExpired(expiresAt) {
  return new Date(expiresAt).getTime() <= Date.now()
}

export function isExpiringSoon(expiresAt) {
  return !isExpired(expiresAt) && daysUntil(expiresAt) <= EXPIRY_WARNING_DAYS
}

export function formatExpiryDate(date, lang) {
  return new Date(date).toLocaleDateString(lang === 'en' ? 'en-GB' : 'th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// Same rule as the server: renewals add to the time still remaining.
function renewalBaseMs(expiresAt) {
  return expiresAt && !isExpired(expiresAt) ? new Date(expiresAt).getTime() : Date.now()
}

// Date values are YYYY-MM-DD, always read as Thailand calendar dates.
export function dateStringFromDays(days, expiresAt) {
  return new Date(renewalBaseMs(expiresAt) + BANGKOK_OFFSET_MS + days * DAY_MS).toISOString().slice(0, 10)
}

export function daysFromDateString(dateString, expiresAt) {
  return Math.floor(Date.parse(dateString) / DAY_MS) - bangkokDayNumber(renewalBaseMs(expiresAt))
}

export function daysLeftLabel(expiresAt, lang) {
  const days = daysUntil(expiresAt)
  if (lang === 'en') {
    if (days === 0) return 'expires today'
    return days === 1 ? '1 day left' : `${days} days left`
  }
  return days === 0 ? 'หมดอายุวันนี้' : `เหลืออีก ${days} วัน`
}
