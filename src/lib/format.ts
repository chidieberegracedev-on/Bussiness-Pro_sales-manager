/**
 * Formats a timestamp in the BUSINESS timezone (what "today" means for this
 * business — DATA_MODEL.md §5) using the USER's locale for separators and
 * ordering (AC-4.7).
 */
export function formatDateTime(
  value: string | Date,
  timeZone: string,
  locale: string = navigator.language,
): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function formatDate(value: string | Date, timeZone: string, locale: string = navigator.language): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: 'medium' }).format(date)
}

export function formatRelativeTime(value: string | Date, locale: string = navigator.language): string {
  const date = typeof value === 'string' ? new Date(value) : value
  const diffMs = date.getTime() - Date.now()
  const diffSec = Math.round(diffMs / 1000)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })

  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 60 * 60 * 24 * 365],
    ['month', 60 * 60 * 24 * 30],
    ['week', 60 * 60 * 24 * 7],
    ['day', 60 * 60 * 24],
    ['hour', 60 * 60],
    ['minute', 60],
  ]

  for (const [unit, secondsInUnit] of units) {
    if (Math.abs(diffSec) >= secondsInUnit) {
      return rtf.format(Math.round(diffSec / secondsInUnit), unit)
    }
  }
  return rtf.format(diffSec, 'second')
}

/** Start-of-day boundary for `date` in the given IANA timezone, as a UTC ISO string. */
export function businessDayStartUtc(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const y = parts.find((p) => p.type === 'year')!.value
  const m = parts.find((p) => p.type === 'month')!.value
  const d = parts.find((p) => p.type === 'day')!.value
  // Interpret Y-M-D midnight as being in `timeZone`, then convert to UTC by
  // finding the offset at that instant via a round trip through the locale formatter.
  const naiveUtc = new Date(`${y}-${m}-${d}T00:00:00Z`)
  const offsetMinutes = getTimeZoneOffsetMinutes(naiveUtc, timeZone)
  return new Date(naiveUtc.getTime() - offsetMinutes * 60_000).toISOString()
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = dtf.formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0'
  const asUtc = Date.UTC(
    Number(get('year')),
    Number(get('month')) - 1,
    Number(get('day')),
    Number(get('hour')) % 24,
    Number(get('minute')),
    Number(get('second')),
  )
  return (asUtc - date.getTime()) / 60_000
}
