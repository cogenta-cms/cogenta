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
 * This theme's own header and footer — a warm, community-notice-board read
 * rather than a corporate one: a sticky header with a pill-shaped nav and a
 * rounded, filled action button, and a four-column footer (brand+tagline,
 * navigation, social, a short note) on a tinted band, closing with Cogenta's
 * own credit.
 *
 * The mobile nav is a `<details>`/`<summary>` disclosure — the same
 * zero-JavaScript mechanism `faq`/`accordion` already use — rather than a
 * scripted hamburger: expanding, keyboard operation and the open state
 * announced to assistive technology all come from the browser. The same
 * links are rendered twice (once inside the disclosure, once as a plain
 * inline row) and `src/styles/base.css` shows exactly one of the two at any
 * given width via `display:none` — which also removes the hidden copy from
 * the accessibility tree, so nothing is ever announced twice.
 *
 * `theme@1.4` (L25 D2) fields — `headerAction`, `tagline`, `social`,
 * `footerNote` — are each rendered only when present; a render with none of
 * them set still produces a complete header/footer, exactly the additive
 * guarantee the contract promises.
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
  if (items === '') return ''
  return `<nav class="${className}" aria-label="${escapeAttribute(label)}"><ul class="cg-nav__items">${items}</ul></nav>`
}

/** The header's own call-to-action link (`theme@1.4`) — a filled, rounded button, the "Donate"/"Volunteer" treatment. */
function renderHeaderAction(action: ChromeInput['headerAction']): string {
  if (action === undefined) return ''
  return (
    `<a class="cg-action cg-site-header__action" data-emphasis="primary" ` +
    `href="${escapeAttribute(action.href)}">${escapeText(action.label)}</a>`
  )
}

/** A plain hamburger glyph — three bars, drawn as `<path>`s so nothing here needs the icon set's closed vocabulary. */
const MENU_GLYPH =
  '<svg class="cg-nav-toggle__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
  '<path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
  '</svg>'

export function renderChrome(input: ChromeInput): ChromeResult {
  const siteNameText = escapeText(input.site.name)
  const headerNavDesktop = renderNav(input.headerNav, 'cg-nav cg-nav--desktop', 'Primary')
  const headerNavMobile = navItems(input.headerNav)
  const footerNav = renderNav(input.footerNav, 'cg-site-footer__nav', 'Footer')
  const mark = renderBrandMark(input.brand, { className: 'cg-site-header__logo' }) ?? siteNameText
  const headerAction = renderHeaderAction(input.headerAction)

  const mobileToggle =
    headerNavMobile === ''
      ? ''
      : `<details class="cg-nav-toggle">` +
        `<summary class="cg-nav-toggle__button" aria-label="Menu">${MENU_GLYPH}</summary>` +
        `<nav class="cg-nav cg-nav--mobile" aria-label="Primary"><ul class="cg-nav__items">${headerNavMobile}</ul></nav>` +
        `</details>`

  const header =
    `<header class="cg-site-header"><div class="cg-site-header__inner">` +
    `<a class="cg-site-header__home" href="${escapeAttribute(input.homeHref)}">${mark}</a>` +
    `${headerNavDesktop}` +
    `${headerAction}` +
    `${mobileToggle}` +
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
    `<footer class="cg-site-footer">` +
    `<div class="cg-site-footer__grid">` +
    `<div class="cg-site-footer__brand">` +
    `<a class="cg-site-footer__brand-link" href="${escapeAttribute(input.homeHref)}">${siteNameText}</a>` +
    `${tagline}` +
    `</div>` +
    `<div class="cg-site-footer__col">${footerNav}</div>` +
    `<div class="cg-site-footer__col">${social}</div>` +
    `<div class="cg-site-footer__col">${footerNote}</div>` +
    `</div>` +
    `<div class="cg-site-footer__bottom"><span>${siteNameText}</span>${input.brandingHtml}</div>` +
    `</footer>`

  return { header, footer }
}
