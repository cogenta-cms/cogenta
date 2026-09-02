import {
  type ChromeInput,
  type ChromeNavLink,
  type ChromeResult,
  escapeAttribute,
  escapeText,
  renderBrandMark,
} from '@cogenta/theme-kit'

/**
 * The site header and footer — moved here, verbatim, from what used to be
 * `@cogenta/cli`'s own hardcoded `<header class="cg-site-header">`/`<footer
 * class="cg-site-footer">` template (`packages/cli/src/commands/theme-render.ts`,
 * before the chrome extension point existed). Byte-identical output to that
 * template: this is the reference theme, and every site that installed it
 * before a second theme existed must render exactly as it always has.
 *
 * A future theme with a structurally different header (a mega-menu, a cart
 * icon, no header at all) implements its own `renderChrome` instead — this is
 * simply the one this package ships.
 */

function renderNavLinks(links: readonly ChromeNavLink[]): string {
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
  return items === '' ? '' : `<ul class="cg-menu">${items}</ul>`
}

export function renderChrome(input: ChromeInput): ChromeResult {
  const siteName = escapeAttribute(input.site.name)
  const headerNav = renderNavLinks(input.headerNav)
  const footerNav = renderNavLinks(input.footerNav)
  // The uploaded logo replaces the wordmark, and only the wordmark: the
  // footer keeps the site's name in text, so a site whose logo fails to load
  // is still named somewhere on every page.
  const mark = renderBrandMark(input.brand, { className: 'cg-site-header__logo' }) ?? siteName

  const header =
    `<header class="cg-site-header"><div class="cg-site-header__inner">` +
    `<a class="cg-site-header__home" href="${escapeAttribute(input.homeHref)}">${mark}</a>` +
    `${headerNav === '' ? '' : `<nav class="cg-site-header__nav" aria-label="Primary">${headerNav}</nav>`}` +
    `</div></header>`

  const footer =
    `<footer class="cg-site-footer"><div class="cg-site-footer__inner">` +
    `<span>${siteName}</span>` +
    `${footerNav === '' ? '' : `<nav class="cg-site-footer__nav" aria-label="Footer">${footerNav}</nav>`}` +
    `${input.brandingHtml}</div></footer>`

  return { header, footer }
}
