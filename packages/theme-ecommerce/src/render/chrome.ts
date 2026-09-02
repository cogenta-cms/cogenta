import {
  type ChromeInput,
  type ChromeNavLink,
  type ChromeResult,
  escapeAttribute,
  escapeText,
  renderBrandMark,
} from '@cogenta/theme-kit'

/**
 * The storefront's header and footer — real HTML strings, built independently
 * of the twelve block renderers (contract D's chrome extension point is a
 * separate door from `renderPage`, and this theme uses it to look like a
 * retail site rather than a document).
 *
 * The header commits to more visual weight than a blog masthead: a taller
 * bar, a bold wordmark, an accent rule along the top edge. The footer reads
 * as a real storefront foot — a brand column beside the site's own
 * navigation, then a bottom bar carrying `brandingHtml` untouched (Cogenta's
 * credit or its white-label replacement — placed, never altered or
 * dropped).
 *
 * No cart icon, no search box, no "sign in" link is drawn here: this theme
 * ships no such feature (`@cogenta/commerce` is a separate backend this
 * theme package does not integrate with), and a control that does nothing
 * when pressed is a worse storefront than one with no control at all.
 */

function renderNavLinks(links: readonly ChromeNavLink[], listClass: string): string {
  if (links.length === 0) return ''
  const items = links
    .filter((link) => link.href !== null || link.kind === 'submenu-placeholder')
    .map((link) => {
      const label = escapeText(link.label)
      const titleAttr = link.title === null ? '' : ` title="${escapeAttribute(link.title)}"`
      if (link.href === null) return `<li><span${titleAttr}>${label}</span></li>`
      const href = escapeAttribute(link.href)
      const target = link.openInNewTab ? ' target="_blank" rel="noopener"' : ''
      return `<li><a href="${href}"${target}${titleAttr}>${label}</a></li>`
    })
    .join('')
  return items === '' ? '' : `<ul class="${listClass}">${items}</ul>`
}

export function renderChrome(input: ChromeInput): ChromeResult {
  const siteName = escapeText(input.site.name)
  const homeHref = escapeAttribute(input.homeHref)
  const headerNav = renderNavLinks(input.headerNav, 'ce-menu ce-menu--header')
  const footerNav = renderNavLinks(input.footerNav, 'ce-menu ce-menu--footer')
  // A storefront's header bar is exactly where a retailer expects its logo.
  // The footer's brand link and the bottom bar keep the name in text: a
  // shopper landing on a page whose images failed still knows whose shop
  // this is.
  const mark = renderBrandMark(input.brand, { className: 'ce-header__logo' }) ?? siteName

  const header =
    `<header class="ce-header">` +
    `<div class="ce-header__bar">` +
    `<a class="ce-header__brand" href="${homeHref}">${mark}</a>` +
    `${headerNav === '' ? '' : `<nav class="ce-header__nav" aria-label="Primary">${headerNav}</nav>`}` +
    `</div></header>`

  const footer =
    `<footer class="ce-footer">` +
    `<div class="ce-footer__top">` +
    `<div class="ce-footer__brand">` +
    `<a class="ce-footer__brand-link" href="${homeHref}">${siteName}</a>` +
    `</div>` +
    `${footerNav === '' ? '' : `<nav class="ce-footer__nav" aria-label="Footer">${footerNav}</nav>`}` +
    `</div>` +
    `<div class="ce-footer__bottom">` +
    `<span class="ce-footer__copy">${siteName}</span>` +
    `${input.brandingHtml}` +
    `</div></footer>`

  return { header, footer }
}
