import type { TFunction } from 'i18next'

/**
 * The server's scheduled tasks report what they did as a short English line
 * ("0 published", "3 purged"). The admin never shows that line: it is read
 * back into a sentence in the admin's language, and a line it does not
 * recognise becomes a generic "done" rather than English in a French screen.
 */
export function translateTaskSummary(
  taskName: string,
  summary: string | null,
  t: TFunction,
): string {
  if (summary === null || summary.trim() === '') return t('scheduled.noSummary')
  const text = summary.trim()
  const numbers = [...text.matchAll(/\d+/gu)].map((match) => Number(match[0]))
  const first = numbers[0] ?? 0
  switch (taskName) {
    case 'scheduled-publish':
      return t('scheduled.summary.published', { count: first })
    case 'channel-notifications':
      return t('scheduled.summary.notificationsSent', { count: first })
    case 'commerce-order-emails':
      return t('scheduled.summary.orderEmails', { sent: first, failed: numbers[1] ?? 0 })
    case 'commerce-carts':
      return t('scheduled.summary.abandonedCarts', { count: first })
    case 'commerce-subscriptions':
      return t('scheduled.summary.subscriptions', {
        billed: first,
        retried: numbers[1] ?? 0,
        suspended: numbers[2] ?? 0,
        notices: numbers[3] ?? 0,
      })
    case 'updates-auto-check':
      if (/auto-update is off/iu.test(text)) return t('scheduled.summary.updatesOff')
      if (/auto-updated/iu.test(text)) return t('scheduled.summary.updatesApplied')
      return t('scheduled.summary.updatesChecked')
    default:
      if (/purged|pruned/iu.test(text)) return t('scheduled.summary.purged', { count: first })
      return t('scheduled.noSummary')
  }
}

/** A task's interval as a phrase: "toutes les minutes", "tous les jours". */
export function describeInterval(intervalMs: number, t: TFunction): string {
  const minutes = Math.round(intervalMs / 60_000)
  if (minutes <= 1) return t('scheduled.every.minute')
  if (minutes < 60) return t('scheduled.every.minutes', { count: minutes })
  const hours = Math.round(minutes / 60)
  if (hours === 1) return t('scheduled.every.hour')
  if (hours < 24) return t('scheduled.every.hours', { count: hours })
  const days = Math.round(hours / 24)
  if (days === 1) return t('scheduled.every.day')
  return t('scheduled.every.days', { count: days })
}
