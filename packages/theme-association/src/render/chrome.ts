import {
  type ChromeInput,
  type ChromeNavLink,
  type ChromeResult,
  escapeAttribute,
  escapeText,
  renderBrandMark,
  renderFooterWidgets,
  renderSocialLinks,
  renderThemeToggle,
  serialize,
} from '@cogenta/theme-kit'
import { associationString } from './strings.js'

/**
 * The header and footer of a charity's site (`theme@1.4`).
 *
 * Header: one row on the paper under a hairline. The organisation's name in
 * the display face (or its uploaded logo), the pages in plain words, then the
 * `headerAction` as the yellow button, the one standing ask of a charity's
 * site, and the light/dark control. The action sits outside the navigation
 * list on purpose: on a phone it stays in the header row beside the menu
 * button.
 *
 * Below the wide breakpoint the pages become a panel of large links under the
 * header, opened by a CSS-only toggle: a visually hidden checkbox paired with
 * a `<label>` that says "Menu" (and "Close" once open), placed before the
 * `<nav>` so the sibling combinator reaches it. One `<nav>` in the markup,
 * retiled by CSS. The panel repeats the `tagline` under the links.
 *
 * Footer: the green band. The name, the `tagline`, the `footerNote` (a blank
 * line starts a new paragraph, a line break stays a line break, so the
 * registered charity number, the address and the contact lines keep their
 * shape), the social profiles with their names; then the footer navigation in
 * columns: a `submenu-placeholder` (an unlinked item such as "Get involved")
 * starts a column and names it, the links after it fill it. Under a hairline,
 * the legal line: the copyright year and the name, beside the host's
 * `brandingHtml`, placed once, as received. Every `theme@1.4` field renders
 * only when present.
 *
 * Footer widget columns (`theme@1.6`) are one row under the name and the
 * menu, above the legal line, in the band's own small type; with none, the
 * footer is exactly what it was before widgets existed.
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
  return `<div class="ca-footer__note">${paragraphs
    .map((lines) => `<p>${lines.map(noteLine).join('<br>')}</p>`)
    .join('')}</div>`
}

/**
 * A line of the footer note that is nothing but an email address or a
 * telephone number is what a visitor taps to reach the organisation, so it
 * becomes a link; every other line stays text.
 */
function noteLine(line: string): string {
  const text = escapeText(line)
  if (/^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i.test(line)) {
    return `<a href="mailto:${escapeAttribute(line)}">${text}</a>`
  }
  const digits = line.replace(/[\s().-]/g, '')
  if (/^\+?\d{7,15}$/.test(digits)) return `<a href="tel:${digits}">${text}</a>`
  return text
}

export function renderChrome(input: ChromeInput): ChromeResult {
  const siteName = escapeText(input.site.name)
  const home = escapeAttribute(input.homeHref)
  const links = usable(input.headerNav)
    .map((link) => linkItem(link, 'ca-header__item'))
    .join('')
  const action =
    input.headerAction === undefined
      ? ''
      : `<a class="ca-header__action" href="${escapeAttribute(input.headerAction.href)}">${escapeText(
          input.headerAction.label,
        )}</a>`
  const toggle = serialize(renderThemeToggle(input.locale, { className: 'cg-theme-toggle' }))
  const logo = renderBrandMark(input.brand, { className: 'ca-header__logo' })
  const mark = logo ?? `<span class="ca-header__wordmark">${siteName}</span>`
  const panelTagline =
    input.tagline === undefined
      ? ''
      : `<p class="ca-header__tagline">${escapeText(input.tagline)}</p>`

  const menu =
    links === ''
      ? ''
      : `<input type="checkbox" id="ca-nav-toggle" class="ca-nav-toggle-input" aria-label="${escapeAttribute(
          associationString(input.locale, 'menu'),
        )}">` +
        `<label for="ca-nav-toggle" class="ca-nav-toggle-label" aria-hidden="true">` +
        `<span class="ca-nav-toggle-open">${escapeText(associationString(input.locale, 'menu'))}</span>` +
        `<span class="ca-nav-toggle-close">${escapeText(associationString(input.locale, 'close'))}</span>` +
        `</label>` +
        `<nav class="ca-header__nav" id="ca-nav" aria-label="${escapeAttribute(
          associationString(input.locale, 'primaryNav'),
        )}">` +
        `<ul class="ca-header__links">${links}</ul>` +
        `${panelTagline}` +
        `</nav>`

  const header =
    `<header class="ca-header" data-nav="${links === '' ? 'none' : 'links'}" data-action="${
      action === '' ? 'none' : 'link'
    }">` +
    `<div class="ca-header__inner">` +
    `<a class="ca-header__brand" href="${home}">${mark}</a>` +
    `${menu}` +
    `${action}` +
    `${toggle}` +
    `</div></header>`

  const tagline =
    input.tagline === undefined
      ? ''
      : `<p class="ca-footer__tagline" data-field="tagline">${escapeText(input.tagline)}</p>`
  const note = input.footerNote === undefined ? '' : renderFooterNote(input.footerNote)
  const social = renderSocialLinks(input.social, {
    className: 'ca-footer__social',
    itemClassName: 'ca-footer__social-item',
  })
  const groups = footerGroups(input.footerNav)
  const nav =
    groups.length === 0
      ? ''
      : `<nav class="ca-footer__nav" aria-label="${escapeAttribute(
          associationString(input.locale, 'footerNav'),
        )}" data-columns="${Math.min(groups.length, 3)}">${groups
          .map(
            (group) =>
              `<div class="ca-footer__group">${
                group.heading === null
                  ? ''
                  : `<p class="ca-footer__heading">${escapeText(group.heading)}</p>`
              }<ul class="ca-footer__links">${group.links
                .map((link) => linkItem(link, 'ca-footer__item'))
                .join('')}</ul></div>`,
          )
          .join('')}</nav>`
  const year = new Date().getFullYear()
  const widgets = renderFooterWidgets(input.widgets, {
    className: 'ca-footer__widgets',
    headingLevel: 'h2',
  })

  const footer =
    `<footer class="ca-footer"><div class="ca-footer__inner">` +
    `<div class="ca-footer__about">` +
    `<a class="ca-footer__name" href="${home}">${siteName}</a>` +
    `${tagline}${note}` +
    `${social === null ? '' : serialize(social)}` +
    `</div>` +
    `${nav}` +
    `${widgets === null ? '' : serialize(widgets)}` +
    `<div class="ca-footer__legal">` +
    `<p class="ca-footer__copyright">© ${year} ${siteName}</p>` +
    `${input.brandingHtml === '' ? '' : `<div class="ca-footer__branding">${input.brandingHtml}</div>`}` +
    `</div>` +
    `</div></footer>`

  return { header, footer }
}
