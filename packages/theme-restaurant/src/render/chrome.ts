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
 * The restaurant's header and footer (`theme@1.4`).
 *
 * Header: one quiet row on the grid, under a hairline. The restaurant's name
 * on the left in the display serif (or its uploaded logo), the pages in words
 * at the text size, then the `headerAction` ("Reserve") as the one underlined
 * link after a hairline, and the light/dark control. The action sits outside
 * the navigation list on purpose: on a phone it stays in the header row
 * beside the menu toggle, because booking a table is what most visitors came
 * to do.
 *
 * Below the wide breakpoint the pages become a panel of large serif links
 * under the header, opened by a CSS-only toggle: a visually hidden checkbox
 * paired with a `<label>`, placed before the `<nav>` so the sibling
 * combinator reaches it. One `<nav>` in the markup, retiled by CSS. Under
 * the links the open panel repeats the `footerNote` (the address card), which
 * the stylesheet shows in the panel only.
 *
 * Footer: a charcoal band. The name and the `tagline`; the `footerNote` set as
 * the restaurant's address card (a blank line starts a new paragraph, a line
 * break stays a line break, so an address and a set of opening hours keep
 * their shape); the footer navigation; the social profiles with their names;
 * then the legal line, with the copyright year and the name beside the host's
 * `brandingHtml`, placed once, as received. Every `theme@1.4` field renders
 * only when present.
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

/** `footerNote` as paragraphs at blank lines, each keeping its own line breaks. */
function renderFooterNote(note: string, className: string): string {
  const paragraphs = note
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== ''),
    )
    .filter((lines) => lines.length > 0)
  if (paragraphs.length === 0) return ''
  return `<div class="${className}">${paragraphs
    .map((lines) => `<p>${lines.map((line) => escapeText(line)).join('<br>')}</p>`)
    .join('')}</div>`
}

export function renderChrome(input: ChromeInput): ChromeResult {
  const siteName = escapeText(input.site.name)
  const home = escapeAttribute(input.homeHref)
  const links = navItems(input.headerNav, 'cr-header__item')
  const action =
    input.headerAction === undefined
      ? ''
      : `<a class="cr-header__action" href="${escapeAttribute(input.headerAction.href)}">${escapeText(
          input.headerAction.label,
        )}</a>`
  const toggle = serialize(renderThemeToggle(input.locale, { className: 'cg-theme-toggle' }))
  const logo = renderBrandMark(input.brand, { className: 'cr-header__logo' })
  const mark = logo ?? `<span class="cr-header__wordmark">${siteName}</span>`

  // On a phone the open panel also carries the address card, because the
  // address and the hours are what a guest on the street opens the menu for.
  // It is the footer's own note, shown only in the panel.
  const panelCard =
    input.footerNote === undefined ? '' : renderFooterNote(input.footerNote, 'cr-header__card')

  const menu =
    links === ''
      ? ''
      : `<input type="checkbox" id="cr-nav-toggle" class="cr-nav-toggle-input" aria-label="Navigation">` +
        `<label for="cr-nav-toggle" class="cr-nav-toggle-label" aria-hidden="true">` +
        `<span class="cr-nav-toggle-bar"></span><span class="cr-nav-toggle-bar"></span>` +
        `</label>` +
        `<nav class="cr-header__nav" id="cr-nav" aria-label="Primary">` +
        `<ul class="cr-header__links">${links}</ul>` +
        `${panelCard}` +
        `</nav>`

  const header =
    `<header class="cr-header" data-nav="${links === '' ? 'none' : 'links'}" data-action="${
      action === '' ? 'none' : 'link'
    }">` +
    `<div class="cr-header__inner">` +
    `<a class="cr-header__brand" href="${home}">${mark}</a>` +
    `${menu}` +
    `${action}` +
    `${toggle}` +
    `</div></header>`

  const tagline =
    input.tagline === undefined
      ? ''
      : `<p class="cr-footer__tagline" data-field="tagline">${escapeText(input.tagline)}</p>`
  const note =
    input.footerNote === undefined ? '' : renderFooterNote(input.footerNote, 'cr-footer__note')
  const footerLinks = navItems(input.footerNav, 'cr-footer__item')
  const social = renderSocialLinks(input.social, {
    className: 'cr-footer__social',
    itemClassName: 'cr-footer__social-item',
  })
  const year = new Date().getFullYear()

  const footer =
    `<footer class="cr-footer"><div class="cr-footer__inner">` +
    `<div class="cr-footer__about">` +
    `<a class="cr-footer__name" href="${home}">${siteName}</a>` +
    `${tagline}` +
    `</div>` +
    `${note}` +
    `${
      footerLinks === ''
        ? ''
        : `<nav class="cr-footer__nav" aria-label="Footer"><ul class="cr-footer__links">${footerLinks}</ul></nav>`
    }` +
    `${social === null ? '' : `<div class="cr-footer__follow">${serialize(social)}</div>`}` +
    `<div class="cr-footer__legal">` +
    `<p class="cr-footer__copyright">© ${year} ${siteName}</p>` +
    `${input.brandingHtml === '' ? '' : `<div class="cr-footer__branding">${input.brandingHtml}</div>`}` +
    `</div>` +
    `</div></footer>`

  return { header, footer }
}
