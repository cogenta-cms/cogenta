import {
  type ChromeInput,
  type ChromeNavLink,
  type ChromeResult,
  escapeAttribute,
  escapeText,
  renderBrandMark,
  renderIcon,
  renderSocialLinks,
  renderThemeToggle,
  serialize,
} from '@cogenta/theme-kit'
import { renderSearchForm, SEARCH_PATH } from './search.js'
import { splitSiteName, word } from './strings.js'

/**
 * The header and footer of a documentation site (`theme@1.4`).
 *
 * Header: one bar held at the top of the window on the page's own ground,
 * under a hairline (no blur, no translucency). The product's name as a text
 * wordmark (or the uploaded logo), a real search field, the top sections of
 * the site, the light/dark control, and the `headerAction` as a quiet
 * outlined control when a site sets one.
 *
 * Below the wide breakpoint the sections and the search field move into a
 * panel opened by a `<details>` disclosure: no script. The panel is a second,
 * hidden-by-default copy of the same links: at any width exactly one copy is
 * displayed, so a screen reader is never offered two primary navigations. A
 * magnifier link to the search page stays in the bar, so a reader on a phone
 * can search without opening the menu.
 *
 * Footer: columns, the way a developer tool's site is organised. The name,
 * the `tagline`, the `footerNote` (a licence line, a support address) and the
 * social profiles; then the footer navigation, split into columns at each
 * unlinked heading (`submenu-placeholder`) an editor adds in the menu screen.
 * Under a hairline, the copyright year and the product's name, beside the
 * host's `brandingHtml`, placed once, as received.
 */

interface FooterGroup {
  readonly heading: string | null
  readonly links: readonly ChromeNavLink[]
}

function usable(links: readonly ChromeNavLink[]): readonly ChromeNavLink[] {
  return links.filter((link) => link.href !== null || link.kind === 'submenu-placeholder')
}

function linkItem(link: ChromeNavLink, className: string): string {
  const label = escapeText(link.label)
  const titleAttr = link.title === null ? '' : ` title="${escapeAttribute(link.title)}"`
  if (link.href === null) return `<li class="${className}"><span${titleAttr}>${label}</span></li>`
  const target = link.openInNewTab ? ' target="_blank" rel="noopener"' : ''
  return `<li class="${className}"><a href="${escapeAttribute(link.href)}"${target}${titleAttr}>${label}</a></li>`
}

/** The footer menu, split into columns at each unlinked heading. */
export function footerGroups(links: readonly ChromeNavLink[]): readonly FooterGroup[] {
  const groups: { heading: string | null; links: ChromeNavLink[] }[] = []
  for (const link of usable(links)) {
    if (link.kind === 'submenu-placeholder' && link.href === null) {
      groups.push({ heading: link.label, links: [] })
      continue
    }
    const current = groups[groups.length - 1]
    if (current === undefined) groups.push({ heading: null, links: [link] })
    else current.links.push(link)
  }
  return groups.filter((group) => group.links.length > 0)
}

/** `footerNote` as paragraphs at blank lines, each keeping its own line breaks. */
function renderFooterNote(note: string): string {
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
  return `<div class="cd-footer__note">${paragraphs
    .map((lines) => `<p>${lines.map((line) => escapeText(line)).join('<br>')}</p>`)
    .join('')}</div>`
}

/** "Relay Docs" as the product in ink and the kind of site in grey; any other name as it is. */
function wordmark(name: string): string {
  const { product, suffix } = splitSiteName(name)
  const productHtml = `<span class="cd-wordmark__product">${escapeText(product)}</span>`
  if (suffix === null) return `<span class="cd-wordmark">${productHtml}</span>`
  return `<span class="cd-wordmark">${productHtml} <span class="cd-wordmark__kind">${escapeText(suffix)}</span></span>`
}

export function renderChrome(input: ChromeInput): ChromeResult {
  const locale = input.locale
  const siteName = escapeText(input.site.name)
  const home = escapeAttribute(input.homeHref)
  const headerLinks = usable(input.headerNav)
    .map((link) => linkItem(link, 'cd-header__item'))
    .join('')

  const logo = renderBrandMark(input.brand, { className: 'cd-header__logo' })
  const mark = logo ?? wordmark(input.site.name)
  const toggle = serialize(renderThemeToggle(locale, { className: 'cg-theme-toggle' }))
  const action =
    input.headerAction === undefined
      ? ''
      : `<a class="cg-action cd-header__action" data-emphasis="outline" href="${escapeAttribute(
          input.headerAction.href,
        )}">${escapeText(input.headerAction.label)}</a>`

  const nav =
    headerLinks === ''
      ? ''
      : `<nav class="cd-header__nav" aria-label="${escapeAttribute(word(locale, 'primary'))}">` +
        `<ul class="cd-header__links">${headerLinks}</ul></nav>`

  const searchIcon = renderIcon('search', { className: 'cd-header__search-icon', size: 20 })
  const searchLink =
    `<a class="cd-header__search-link" href="${SEARCH_PATH}" ` +
    `aria-label="${escapeAttribute(word(locale, 'search'))}">` +
    `${searchIcon === null ? '' : serialize(searchIcon)}</a>`

  const panelLinks =
    headerLinks === ''
      ? ''
      : `<nav class="cd-menu__nav" aria-label="${escapeAttribute(word(locale, 'primary'))}">` +
        `<ul class="cd-menu__links">${usable(input.headerNav)
          .map((link) => linkItem(link, 'cd-menu__item'))
          .join('')}</ul></nav>`
  const panelAction =
    input.headerAction === undefined
      ? ''
      : `<a class="cg-action cd-menu__action" data-emphasis="outline" href="${escapeAttribute(
          input.headerAction.href,
        )}">${escapeText(input.headerAction.label)}</a>`
  const menu =
    `<details class="cd-menu">` +
    `<summary class="cd-menu__button" aria-label="${escapeAttribute(word(locale, 'menu'))}">` +
    `<span class="cd-menu__bar"></span><span class="cd-menu__bar"></span></summary>` +
    `<div class="cd-menu__panel">` +
    `${serialize(renderSearchForm(locale, 'cd-search-menu', 'compact'))}${panelLinks}${panelAction}` +
    `</div></details>`

  const header =
    `<header class="cd-header"><div class="cd-header__inner">` +
    `<a class="cd-header__brand" href="${home}">${mark}</a>` +
    `<div class="cd-header__search">${serialize(renderSearchForm(locale, 'cd-search-header', 'compact'))}</div>` +
    `${nav}` +
    `<div class="cd-header__end">${searchLink}${action}${toggle}${menu}</div>` +
    `</div></header>`

  const tagline =
    input.tagline === undefined
      ? ''
      : `<p class="cd-footer__tagline" data-field="tagline">${escapeText(input.tagline)}</p>`
  const note = input.footerNote === undefined ? '' : renderFooterNote(input.footerNote)
  const social = renderSocialLinks(input.social, {
    className: 'cd-footer__social',
    itemClassName: 'cd-footer__social-item',
  })
  const groups = footerGroups(input.footerNav)
  const footerNav =
    groups.length === 0
      ? ''
      : `<nav class="cd-footer__nav" aria-label="${escapeAttribute(word(locale, 'footer'))}" data-columns="${Math.min(groups.length, 4)}">${groups
          .map(
            (group) =>
              `<div class="cd-footer__group">${
                group.heading === null
                  ? ''
                  : `<p class="cd-footer__heading">${escapeText(group.heading)}</p>`
              }<ul class="cd-footer__links">${group.links
                .map((link) => linkItem(link, 'cd-footer__item'))
                .join('')}</ul></div>`,
          )
          .join('')}</nav>`
  const year = new Date().getFullYear()
  const owner = escapeText(splitSiteName(input.site.name).product)

  const footer =
    `<footer class="cd-footer"><div class="cd-footer__inner">` +
    `<div class="cd-footer__about">` +
    `<a class="cd-footer__name" href="${home}">${siteName}</a>` +
    `${tagline}${note}` +
    `${social === null ? '' : serialize(social)}` +
    `</div>` +
    `${footerNav}` +
    `<div class="cd-footer__legal">` +
    `<p class="cd-footer__copyright">© ${year} ${owner}</p>` +
    `${input.brandingHtml === '' ? '' : `<div class="cd-footer__branding">${input.brandingHtml}</div>`}` +
    `</div>` +
    `</div></footer>`

  return { header, footer }
}
