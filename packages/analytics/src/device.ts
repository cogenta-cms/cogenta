/**
 * Device category derived from a User-Agent, and nothing else kept from it.
 *
 * The raw header can carry very specific device/browser build strings and, on
 * some vendors, near-unique combinations — close enough to a fingerprint that
 * storing it defeats the point of the daily session hash (`session-hash.ts`).
 * So the full string is reduced to one of four buckets *before* anything ever
 * reaches a database row, and the caller never gets the original text back.
 */
export const DEVICE_CATEGORIES = ['desktop', 'mobile', 'tablet', 'other'] as const

export type DeviceCategory = (typeof DEVICE_CATEGORIES)[number]

/**
 * Classifies a User-Agent string into a coarse device category.
 *
 * Order matters: a tablet UA usually also matches a mobile pattern (Android
 * tablets carry "Android" without "Mobile"; iPads pre-iPadOS 13 said
 * "iPad" outright), so tablet detection runs first.
 */
export function classifyDevice(userAgent: string | null | undefined): DeviceCategory {
  if (userAgent === null || userAgent === undefined || userAgent.trim().length === 0) {
    return 'other'
  }

  const ua = userAgent.toLowerCase()

  const isTablet =
    ua.includes('ipad') ||
    ua.includes('tablet') ||
    ua.includes('playbook') ||
    ua.includes('kindle') ||
    ua.includes('silk') ||
    (ua.includes('android') && !ua.includes('mobile'))
  if (isTablet) return 'tablet'

  const isMobile =
    ua.includes('mobi') ||
    ua.includes('iphone') ||
    ua.includes('ipod') ||
    ua.includes('android') ||
    ua.includes('windows phone') ||
    ua.includes('blackberry')
  if (isMobile) return 'mobile'

  const isDesktop =
    ua.includes('windows nt') ||
    ua.includes('macintosh') ||
    ua.includes('linux') ||
    ua.includes('cros') ||
    ua.includes('x11')
  if (isDesktop) return 'desktop'

  return 'other'
}
