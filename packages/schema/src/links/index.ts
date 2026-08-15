/**
 * Broken link detection (L14 task 3) — see `check.ts` for why it crawls the
 * entries rather than the full-text index, and why nothing here schedules
 * itself.
 */

export type {
  BrokenLink,
  BrokenLinkReason,
  LinkCheckOptions,
  LinkCheckReport,
  LinkFetch,
} from './check.js'
export { checkLinks } from './check.js'
export type { ContentLink } from './extract.js'
export { extractLinks } from './extract.js'
