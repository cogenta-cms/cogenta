/**
 * `@cogenta/theme-kit` — the shared contract D primitives every Cogenta theme
 * package implements against.
 *
 * Moved out of `@cogenta/theme-canonical` (which had carried a "temporary
 * home, must be replaced... not duplicated" copy of most of this since L3)
 * the day a second theme package was first written: five independent copies
 * of the same escaping/rich-text/comments logic is exactly the drift that
 * comment warned about, and this package is what makes "one copy, five
 * consumers" true instead.
 */

export * from './actions.js'
export * from './archive.js'
export * from './chrome.js'
export * from './comments.js'
export * from './contract.js'
export * from './entry.js'
export * from './entry-header.js'
export * from './heading.js'
export * from './html.js'
export * from './icons.js'
export * from './media.js'
export * from './page.js'
export * from './rich-text.js'
