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
 * This theme's own header and footer (`theme@1.4`), drawn the way a personal
 * publication draws them: a quiet line at the top and a short colophon at
 * the bottom.
 *
 * Header: the publication's name set in the text face (or its uploaded
 * logo), a few navigation links in small interface type, the `headerAction`
 * as an outlined control with square corners, and the light/dark control
 * last. The header does not follow the reader down the page: nothing stays
 * on screen over the text. Below the breakpoint the links collapse into a
 * panel opened by a CSS-only toggle, a visually hidden checkbox paired with
 * a `<label>`, no `<script>`. The label precedes the `<nav>` so the sibling
 * combinator in `base.css` reaches it; the theme toggle follows the `<nav>`,
 * outside the panel, so appearance can be switched without opening it.
 *
 * Footer: the name and `tagline`, the `footerNote` beneath them, the footer
 * navigation, the social profiles with real icons (`renderSocialLinks`),
 * then a legal line under a hairline: the copyright year and the site's
 * name, beside Cogenta's credit (`brandingHtml`, placed exactly once, as
 * received). Every `theme@1.4` field renders only when present, so a host
 * that predates them gets the name and the navigation, nothing broken.
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

function renderNavList(links: readonly ChromeNavLink[]): string {
  const items = navItems(links)
  return items === '' ? '' : `<ul class="cg-nav__items">${items}</ul>`
}

/** The header's own call to action (`theme@1.4`): the one outlined control in the line. */
function renderHeaderAction(action: ChromeInput['headerAction']): string {
  if (action === undefined) return ''
  return (
    `<a class="cg-action cg-site-header__action" data-emphasis="outline" ` +
    `href="${escapeAttribute(action.href)}">${escapeText(action.label)}</a>`
  )
}

/** `footerNote` as paragraphs: a blank line starts a new one. */
function renderFooterNote(note: string): string {
  const paragraphs = note
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter((paragraph) => paragraph !== '')
  if (paragraphs.length === 0) return ''
  return `<div class="cg-site-footer__note">${paragraphs
    .map((paragraph) => `<p>${escapeText(paragraph)}</p>`)
    .join('')}</div>`
}

export function renderChrome(input: ChromeInput): ChromeResult {
  const siteNameText = escapeText(input.site.name)
  const headerNavList = renderNavList(input.headerNav)
  const headerAction = renderHeaderAction(input.headerAction)
  const hasMenu = headerNavList !== '' || headerAction !== ''
  const mark =
    renderBrandMark(input.brand, { className: 'cg-site-header__logo' }) ??
    `<span class="cg-site-header__name">${siteNameText}</span>`
  const themeToggle = serialize(renderThemeToggle(input.locale, { className: 'cg-theme-toggle' }))

  const menu = hasMenu
    ? `<input type="checkbox" id="cg-nav-toggle" class="cg-nav-toggle-input" aria-label="Menu">` +
      `<label for="cg-nav-toggle" class="cg-nav-toggle-label" aria-hidden="true">` +
      `<span class="cg-nav-toggle-bar"></span><span class="cg-nav-toggle-bar"></span>` +
      `</label>` +
      `<nav class="cg-site-header__nav" id="cg-nav" aria-label="Primary">` +
      `${headerNavList}${headerAction}` +
      `</nav>`
    : ''

  const header =
    `<header class="cg-site-header"><div class="cg-site-header__inner">` +
    `<a class="cg-site-header__home" href="${escapeAttribute(input.homeHref)}">${mark}</a>` +
    `${menu}` +
    `${themeToggle}` +
    `</div></header>`

  const tagline =
    input.tagline === undefined
      ? ''
      : `<p class="cg-site-footer__tagline" data-field="tagline">${escapeText(input.tagline)}</p>`
  const note = input.footerNote === undefined ? '' : renderFooterNote(input.footerNote)
  const footerNavList = renderNavList(input.footerNav)
  const social = renderSocialLinks(input.social, {
    className: 'cg-site-footer__social',
    itemClassName: 'cg-site-footer__social-item',
  })
  // The copyright year is the year the page is rendered, which is what a
  // legal line on a live site means.
  const year = new Date().getFullYear()

  const footer =
    `<footer class="cg-site-footer"><div class="cg-site-footer__inner">` +
    `<div class="cg-site-footer__top">` +
    `<div class="cg-site-footer__brand">` +
    `<a class="cg-site-footer__name" href="${escapeAttribute(input.homeHref)}">${siteNameText}</a>` +
    `${tagline}${note}` +
    `</div>` +
    `${
      footerNavList === ''
        ? ''
        : `<nav class="cg-site-footer__nav" aria-label="Footer">${footerNavList}</nav>`
    }` +
    `${social === null ? '' : `<div class="cg-site-footer__social-col">${serialize(social)}</div>`}` +
    `</div>` +
    `<div class="cg-site-footer__bottom">` +
    `<p class="cg-site-footer__legal">© ${year} ${siteNameText}</p>` +
    `<div class="cg-site-footer__branding">${input.brandingHtml}</div>` +
    `</div>` +
    `</div></footer>`

  return { header, footer }
}
