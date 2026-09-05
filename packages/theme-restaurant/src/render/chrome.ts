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
 * This theme's own header and footer, built for `theme@1.4` from the start
 * rather than retrofitted: `headerAction` renders as a button beside the
 * primary nav, `tagline`/`social`/`footerNote` fill the footer's brand
 * column, and — the one thing none of the four L23 themes had yet — a
 * genuinely CSS-only mobile menu.
 *
 * The mobile menu is a `<details>`/`<summary>` disclosure, not a checkbox
 * hack: expanding, keyboard operation (`Enter`/`Space` on the `<summary>`)
 * and the open/closed state announced to assistive technology all come from
 * the browser, at zero bytes of JavaScript. It carries the *same* links as
 * the desktop nav plus the header action — never a second, drifting list —
 * and is shown only below the breakpoint `base.css` sets for `.cg-nav`.
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

/** Three bars, drawn directly rather than pulled from an icon font (R9/R10) — the universal "menu" glyph. */
const HAMBURGER_GLYPH =
  '<svg class="cg-mobile-nav__glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
  'stroke-width="1.5" stroke-linecap="round" aria-hidden="true" focusable="false">' +
  '<path d="M4 7h16"/><path d="M4 12h16"/><path d="M4 17h16"/></svg>'

/** The header's own call-to-action link (`theme@1.4`), styled like the block vocabulary's own primary action. */
function renderHeaderAction(action: ChromeInput['headerAction']): string {
  if (action === undefined) return ''
  return (
    `<a class="cg-action cg-nav__cta" data-emphasis="primary" ` +
    `href="${escapeAttribute(action.href)}">${escapeText(action.label)}</a>`
  )
}

/**
 * The mobile drawer — the same nav links and header action as the desktop
 * header, in one `<details>` disclosure. Absent entirely when there is
 * nothing to show, exactly like the desktop `<nav>` above it.
 */
function renderMobileNav(input: ChromeInput): string {
  const items = navItems(input.headerNav)
  const actionItem =
    input.headerAction === undefined ? '' : `<li>${renderHeaderAction(input.headerAction)}</li>`
  if (items === '' && actionItem === '') return ''
  return (
    `<details class="cg-mobile-nav">` +
    `<summary class="cg-mobile-nav__toggle" aria-label="Menu">${HAMBURGER_GLYPH}</summary>` +
    `<div class="cg-mobile-nav__panel"><ul class="cg-mobile-nav__items">${items}${actionItem}</ul></div>` +
    `</details>`
  )
}

export function renderChrome(input: ChromeInput): ChromeResult {
  const siteNameText = escapeText(input.site.name)
  const headerNav = navItems(input.headerNav)
  const footerNav = navItems(input.footerNav)
  // The uploaded logo replaces the wordmark, and only the wordmark: the
  // footer keeps the site's name in text, so a site whose logo fails to
  // load is still named somewhere on every page.
  const mark = renderBrandMark(input.brand, { className: 'cg-site-header__logo' }) ?? siteNameText
  const headerAction = renderHeaderAction(input.headerAction)
  const mobileNav = renderMobileNav(input)

  const header =
    `<header class="cg-site-header"><div class="cg-site-header__inner">` +
    `<a class="cg-site-header__home" href="${escapeAttribute(input.homeHref)}">${mark}</a>` +
    `${
      headerNav === ''
        ? ''
        : `<nav class="cg-nav" aria-label="Primary"><ul class="cg-nav__items">${headerNav}</ul></nav>`
    }` +
    `${headerAction}` +
    `${mobileNav}` +
    `</div></header>`

  const tagline =
    input.tagline === undefined
      ? ''
      : `<p class="cg-site-footer__tagline">${escapeText(input.tagline)}</p>`
  const social =
    input.social === undefined
      ? ''
      : serialize(
          renderSocialLinks(input.social, {
            className: 'cg-site-footer__social',
            itemClassName: 'cg-site-footer__social-item',
          }) ?? { kind: 'text', value: '' },
        )
  const footerNote =
    input.footerNote === undefined
      ? ''
      : `<p class="cg-site-footer__note">${escapeText(input.footerNote)}</p>`

  const footer =
    `<footer class="cg-site-footer"><div class="cg-site-footer__grid">` +
    `<div class="cg-site-footer__brand">` +
    `<a class="cg-site-footer__brand-name" href="${escapeAttribute(input.homeHref)}">${siteNameText}</a>` +
    `${tagline}${social}</div>` +
    `${
      footerNav === ''
        ? ''
        : `<nav class="cg-site-footer__nav" aria-label="Footer"><ul class="cg-nav__items">${footerNav}</ul></nav>`
    }` +
    `<div class="cg-site-footer__about">${footerNote}</div>` +
    `</div><div class="cg-site-footer__bottom">` +
    `<span>${siteNameText}</span>` +
    `<div class="cg-site-footer__branding">${input.brandingHtml}</div>` +
    `</div></footer>`

  return { header, footer }
}
