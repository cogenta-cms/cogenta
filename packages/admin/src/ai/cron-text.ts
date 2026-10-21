import type { TFunction } from 'i18next'

/**
 * A five-field cron expression, in words, for the shapes Cogenta's own agents
 * use (hourly, daily, weekly, monthly). Anything else keeps its expression
 * inside a sentence — never guessed at.
 */
export function describeCron(cron: string, t: TFunction, language: string): string {
  const parts = cron.trim().split(/\s+/u)
  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts
  const custom = t('aiCron.custom', { cron })
  if (parts.length !== 5 || month !== '*') return custom
  const minuteNumber = Number(minute)
  if (!Number.isInteger(minuteNumber)) return custom
  if (hour === '*' && dayOfMonth === '*' && dayOfWeek === '*' && minuteNumber === 0) {
    return t('aiCron.hourly')
  }
  const hourNumber = Number(hour)
  if (!Number.isInteger(hourNumber)) return custom
  const time = new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(
    new Date(2000, 0, 1, hourNumber, minuteNumber),
  )
  if (dayOfMonth === '*' && dayOfWeek === '*') return t('aiCron.daily', { time })
  if (dayOfMonth === '*' && /^[0-6]$/u.test(dayOfWeek ?? '')) {
    // 2000-01-02 was a Sunday, so day `n` of the week is the 2nd + n.
    const day = new Intl.DateTimeFormat(language, { weekday: 'long' }).format(
      new Date(2000, 0, 2 + Number(dayOfWeek)),
    )
    return t('aiCron.weekly', { day, time })
  }
  if (dayOfWeek === '*' && /^\d{1,2}$/u.test(dayOfMonth ?? '')) {
    return t('aiCron.monthly', { dayOfMonth, time })
  }
  return custom
}
