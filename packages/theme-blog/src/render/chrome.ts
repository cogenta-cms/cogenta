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
 * This theme's own header and footer — a masthead, not a corporate bar.
 *
 * Header: the site's wordmark set in the display serif, a single
 * `<details>` disclosure carrying both the nav list and the `headerAction`
 * button — collapsed to a hamburger `<summary>` under `min-width: 56rem`,
 * always open (CSS overrides the browser's own "hide unless [open]" rule at
 * that breakpoint) above it. Zero JavaScript: `<details>`/`<summary>` is
 * natively focusable, keyboard-operable (Enter/Space toggles it) and its
 * open state is announced to assistive technology by the browser itself.
 *
 * Footer: three columns — brand + tagline, a footer nav column, and a
 * social-links + credit column — each a real `<div>` in a CSS grid, not a
 * single stacked list. `brandingHtml` is placed exactly once, unaltered.
 *
 * `theme@1.4`'s four optional fields are each rendered only when present: a
 * site or a render that predates them gets exactly the `1.3` masthead/footer
 * shape, byte for byte (see `test/chrome.test.ts`'s "without the new
 * fields" case).
 */

function renderNavItems(links: readonly ChromeNavLink[]): string {
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
  return items === '' ? '' : `<ul class="cg-nav__items">${items}</ul>`
}

/** The header's own call-to-action link (`theme@1.4`) — a filled button, the one place this masthead spends solid colour. */
function renderHeaderAction(action: ChromeInput['headerAction']): string {
  if (action === undefined) return ''
  return (
    `<a class="cg-action cg-menu__action" data-emphasis="primary" ` +
    `href="${escapeAttribute(action.href)}">${escapeText(action.label)}</a>`
  )
}

/** A hamburger mark drawn from three stacked bars — no icon font, no glyph a font might not ship. */
function menuGlyph(): string {
  return '<span class="cg-menu__bars" aria-hidden="true"></span>'
}

export function renderChrome(input: ChromeInput): ChromeResult {
  const siteName = escapeAttribute(input.site.name)
  const siteNameText = escapeText(input.site.name)
  const navItems = renderNavItems(input.headerNav)
  const headerAction = renderHeaderAction(input.headerAction)
  const footerNav = renderNavItems(input.footerNav)
  const mark = renderBrandMark(input.brand, { className: 'cg-site-header__logo' }) ?? siteNameText

  const hasMenu = navItems !== '' || headerAction !== ''
  // Two renderings of the same nav, never both visible at once (CSS,
  // `min-width: 56rem`) — not one panel forced open past its native state.
  // A closed `<details>`'s non-summary content is unrenderable in current
  // Chrome regardless of an author `display` override on that content (the
  // browser skips generating boxes for it, not merely painting them, so no
  // author specificity or origin wins it back) — verified against a real
  // browser: `getComputedStyle` reports `display: flex` on `.cg-menu__panel`
  // while its own and its `<details>` ancestor's layout box is a literal
  // zero-width flex item. `<details open>` written into the markup would
  // dodge that, but then a mobile visitor gets the panel open on load. So
  // the desktop nav is a second, always-native `<nav>`, not this `<details>`
  // pushed into a state it was never opened into.
  const mobileMenu = !hasMenu
    ? ''
    : `<details class="cg-menu">` +
      `<summary class="cg-menu__toggle" aria-label="Menu">${menuGlyph()}</summary>` +
      `<nav class="cg-menu__panel" aria-label="Primary">${navItems}${headerAction}</nav>` +
      `</details>`
  const desktopNav = !hasMenu
    ? ''
    : `<nav class="cg-site-nav" aria-label="Primary">${navItems}${headerAction}</nav>`

  const header =
    `<header class="cg-site-header"><div class="cg-site-header__inner">` +
    `<a class="cg-site-header__home" href="${escapeAttribute(input.homeHref)}">${mark}</a>` +
    `${desktopNav}` +
    `${mobileMenu}` +
    `</div></header>`

  const tagline =
    input.tagline === undefined
      ? ''
      : `<p class="cg-site-footer__tagline" data-field="tagline">${escapeText(input.tagline)}</p>`
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
    `<a class="cg-site-footer__brand-link" href="${escapeAttribute(input.homeHref)}">${siteNameText}</a>` +
    `${tagline}</div>` +
    `${
      footerNav === ''
        ? ''
        : `<nav class="cg-site-footer__nav" aria-label="Footer">${footerNav}</nav>`
    }` +
    `<div class="cg-site-footer__meta">${social}${footerNote}<div class="cg-site-footer__branding">${input.brandingHtml}</div></div>` +
    `</div><div class="cg-site-footer__bottom"><span>${siteName}</span></div></footer>`

  return { header, footer }
}
