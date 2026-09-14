import {
  type ChromeInput,
  type ChromeNavLink,
  type ChromeResult,
  escapeAttribute,
  escapeText,
  renderBrandMark,
  renderSocialLinks,
  renderThemeToggle,
  serialize,
} from '@cogenta/theme-kit'

/**
 * The shop's header and footer (`theme@1.4`).
 *
 * Header: one row on the grid, under a hairline. The shop's name on the left
 * (or its uploaded logo), the navigation on the right in words at the text
 * size, the `headerAction` as the last link, underlined, and the light/dark
 * control. No cart icon, no search box, no account link: this theme draws no
 * control it cannot back, and a cart that does nothing is worse than none.
 * The header stays at the top of the window while the page scrolls, on the
 * page's own ground, with no shadow.
 *
 * Below the wide breakpoint the navigation becomes a panel of large links
 * under the header, opened by a CSS-only toggle: a visually hidden checkbox
 * paired with a `<label>`, placed before the `<nav>` so the sibling
 * combinator reaches it. One `<nav>` in the markup, retiled by CSS.
 *
 * Footer: the shop's name with its `tagline` and `footerNote` (the company,
 * its registration and its address, paragraph by paragraph), the footer
 * navigation, the social profiles with their names; then the legal line, the
 * copyright year and the shop's name beside the host's `brandingHtml`,
 * placed once, as received. Every `theme@1.4` field renders only when
 * present.
 */

function navItems(links: readonly ChromeNavLink[], className: string): string {
  return links
    .filter((link) => link.href !== null || link.kind === 'submenu-placeholder')
    .map((link) => {
      const label = escapeText(link.label)
      const titleAttr = link.title === null ? '' : ` title="${escapeAttribute(link.title)}"`
      if (link.href === null) {
        return `<li class="${className}"><span${titleAttr}>${label}</span></li>`
      }
      const target = link.openInNewTab ? ' target="_blank" rel="noopener"' : ''
      return `<li class="${className}"><a href="${escapeAttribute(link.href)}"${target}${titleAttr}>${label}</a></li>`
    })
    .join('')
}

/** `footerNote` as paragraphs: a blank line starts a new one. */
function renderFooterNote(note: string): string {
  const paragraphs = note
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter((paragraph) => paragraph !== '')
  if (paragraphs.length === 0) return ''
  return `<div class="ce-footer__note">${paragraphs
    .map((paragraph) => `<p>${escapeText(paragraph)}</p>`)
    .join('')}</div>`
}

export function renderChrome(input: ChromeInput): ChromeResult {
  const siteName = escapeText(input.site.name)
  const home = escapeAttribute(input.homeHref)
  const links = navItems(input.headerNav, 'ce-header__item')
  const action =
    input.headerAction === undefined
      ? ''
      : `<a class="ce-header__action" href="${escapeAttribute(input.headerAction.href)}">${escapeText(
          input.headerAction.label,
        )}</a>`
  const toggle = serialize(renderThemeToggle(input.locale, { className: 'cg-theme-toggle' }))
  const logo = renderBrandMark(input.brand, { className: 'ce-header__logo' })
  const mark = logo ?? `<span class="ce-header__wordmark">${siteName}</span>`

  const hasMenu = links !== '' || action !== ''
  const menu = hasMenu
    ? `<input type="checkbox" id="ce-nav-toggle" class="ce-nav-toggle-input" aria-label="Menu">` +
      `<label for="ce-nav-toggle" class="ce-nav-toggle-label" aria-hidden="true">` +
      `<span class="ce-nav-toggle-bar"></span><span class="ce-nav-toggle-bar"></span>` +
      `</label>` +
      `<nav class="ce-header__nav" id="ce-nav" aria-label="Primary">` +
      `${links === '' ? '' : `<ul class="ce-header__links">${links}</ul>`}` +
      `${action}` +
      `</nav>`
    : ''

  const header =
    `<header class="ce-header" data-nav="${hasMenu ? 'links' : 'none'}">` +
    `<div class="ce-header__inner">` +
    `<a class="ce-header__brand" href="${home}">${mark}</a>` +
    `${menu}` +
    `${toggle}` +
    `</div></header>`

  const tagline =
    input.tagline === undefined
      ? ''
      : `<p class="ce-footer__tagline" data-field="tagline">${escapeText(input.tagline)}</p>`
  const note = input.footerNote === undefined ? '' : renderFooterNote(input.footerNote)
  const footerLinks = navItems(input.footerNav, 'ce-footer__item')
  const social = renderSocialLinks(input.social, {
    className: 'ce-footer__social',
    itemClassName: 'ce-footer__social-item',
  })
  const year = new Date().getFullYear()

  const footer =
    `<footer class="ce-footer"><div class="ce-footer__inner">` +
    `<div class="ce-footer__about">` +
    `<a class="ce-footer__name" href="${home}">${siteName}</a>` +
    `${tagline}${note}` +
    `</div>` +
    `${
      footerLinks === ''
        ? ''
        : `<nav class="ce-footer__nav" aria-label="Footer"><ul class="ce-footer__links">${footerLinks}</ul></nav>`
    }` +
    `${social === null ? '' : `<div class="ce-footer__follow">${serialize(social)}</div>`}` +
    `<div class="ce-footer__legal">` +
    `<p class="ce-footer__copyright">© ${year} ${siteName}</p>` +
    `${input.brandingHtml === '' ? '' : `<div class="ce-footer__branding">${input.brandingHtml}</div>`}` +
    `</div>` +
    `</div></footer>`

  return { header, footer }
}
