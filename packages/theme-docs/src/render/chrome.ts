import {
  type ChromeInput,
  type ChromeNavLink,
  type ChromeResult,
  escapeAttribute,
  escapeText,
  renderBrandMark,
  renderSocialLinks,
  serialize,
} from '@cogenta/theme-kit'

/**
 * This theme's own header and footer — structurally distinct from the
 * canonical theme's, not a recolour of it: a docs site's header carries a
 * genuine CSS-only mobile menu (a `<details>` disclosure, never a script),
 * because "Docs / Guides / Reference / Blog" plus a header action does not
 * fit a narrow viewport the way three links do.
 *
 * The mobile panel is a **second, hidden-by-default copy** of the same nav
 * markup, not a repositioned single copy: two static layouts (`display:none`
 * either way at a given viewport width) is the only zero-JS way to put the
 * links inline on a wide screen and inside a disclosure on a narrow one.
 * `display:none` removes the inactive copy from the accessibility tree, so a
 * screen reader is never offered two "Primary" navigations at once — only
 * the sighted, CSS-driven layout differs.
 *
 * Footer: brand column (name + tagline), a footer nav column, social links,
 * a short "about" note, and Cogenta's own credit (or its white-label
 * replacement) — `brandingHtml` placed exactly once, unaltered.
 */

function navItems(links: readonly ChromeNavLink[]): string {
  return links
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
}

function renderNav(links: readonly ChromeNavLink[], className: string, label: string): string {
  const items = navItems(links)
  return items === ''
    ? ''
    : `<nav class="${className}" aria-label="${label}"><ul class="cg-menu">${items}</ul></nav>`
}

/** The header's own call-to-action link (`theme@1.4`), reusing `.cg-action`'s own look. */
function renderHeaderAction(action: ChromeInput['headerAction'], className: string): string {
  if (action === undefined) return ''
  return (
    `<a class="cg-action ${className}" data-emphasis="primary" ` +
    `href="${escapeAttribute(action.href)}">${escapeText(action.label)}</a>`
  )
}

/** Three bars, drawn once for this file — not part of `renderIcon`'s closed vocabulary, since a "menu" glyph names no contract B field. */
const HAMBURGER_SVG =
  '<svg class="cg-nav-toggle__icon" viewBox="0 0 24 24" width="22" height="22" fill="none" ' +
  'stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false">' +
  '<path d="M4 6h16M4 12h16M4 18h16"/></svg>'

export function renderChrome(input: ChromeInput): ChromeResult {
  const siteName = escapeAttribute(input.site.name)
  const siteNameText = escapeText(input.site.name)
  const mark = renderBrandMark(input.brand, { className: 'cg-site-header__logo' }) ?? siteNameText

  const desktopNav = renderNav(input.headerNav, 'cg-site-header__nav', 'Primary')
  const desktopAction = renderHeaderAction(input.headerAction, 'cg-site-header__action')

  const mobileNavItems = navItems(input.headerNav)
  const mobileAction = renderHeaderAction(input.headerAction, 'cg-nav-toggle__action')
  const mobilePanel =
    mobileNavItems === '' && mobileAction === ''
      ? ''
      : `<nav class="cg-nav-toggle__panel" aria-label="Primary">` +
        `${mobileNavItems === '' ? '' : `<ul class="cg-menu">${mobileNavItems}</ul>`}` +
        `${mobileAction}</nav>`

  const toggle =
    mobilePanel === ''
      ? ''
      : `<details class="cg-nav-toggle"><summary class="cg-nav-toggle__button" aria-label="Menu">${HAMBURGER_SVG}</summary>${mobilePanel}</details>`

  const header =
    `<header class="cg-site-header"><div class="cg-site-header__inner">` +
    `<a class="cg-site-header__home" href="${escapeAttribute(input.homeHref)}">${mark}</a>` +
    `${desktopNav}${desktopAction}${toggle}` +
    `</div></header>`

  const footerNav = renderNav(input.footerNav, 'cg-site-footer__nav', 'Footer')
  const tagline =
    input.tagline === undefined
      ? ''
      : `<p class="cg-site-footer__tagline">${escapeText(input.tagline)}</p>`
  const socialElement =
    input.social === undefined
      ? null
      : renderSocialLinks(input.social, {
          className: 'cg-site-footer__social',
          itemClassName: 'cg-site-footer__social-item',
        })
  const social = socialElement === null ? '' : serialize(socialElement)
  const footerNote =
    input.footerNote === undefined
      ? ''
      : `<p class="cg-site-footer__note">${escapeText(input.footerNote)}</p>`

  const footer =
    `<footer class="cg-site-footer"><div class="cg-site-footer__grid">` +
    `<div class="cg-site-footer__brand"><a href="${escapeAttribute(input.homeHref)}">${siteName}</a>${tagline}${social}</div>` +
    `<div class="cg-site-footer__nav-col">${footerNav}</div>` +
    `<div class="cg-site-footer__about-col">${footerNote}<div class="cg-site-footer__branding">${input.brandingHtml}</div></div>` +
    `</div><div class="cg-site-footer__bottom"><span>${siteName}</span></div></footer>`

  return { header, footer }
}
