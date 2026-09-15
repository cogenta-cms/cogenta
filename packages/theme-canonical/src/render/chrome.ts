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
import { word } from './strings.js'

/**
 * The site header and footer of the reference theme.
 *
 * **Header.** One bar on the page's own ground, closed by a hairline: the
 * site's name (or its uploaded logo) at the start, then the primary pages,
 * then the `headerAction` (`theme@1.4`) as the page's one filled button and
 * the light/dark control. The bar scrolls away with the page: a default theme
 * has no reason to keep a strip of the window for itself.
 *
 * Below the wide breakpoint the pages move into a panel under the bar, opened
 * by a CSS-only control: a checkbox named by a visible "Menu" label, placed
 * before the `<nav>` so the sibling combinator reaches it. No script. The
 * source order (name, menu, pages, action, light/dark) is also the visual
 * order at both widths, so keyboard focus never jumps around the bar.
 *
 * **Footer.** On a band a step off the page. The site's name, its `tagline`,
 * the `footerNote` (an address or a legal mention, kept to its own lines) and
 * the social profiles on the first columns; the footer menu on the last ones.
 * An unlinked item of the footer menu (a `submenu-placeholder` such as
 * "Company") starts a column and names it, so an editor builds the columns in
 * the menu screen; a menu without one is a single column. Under a hairline,
 * the legal line: the year and the site's name, then the host's
 * `brandingHtml`, placed once and as received.
 *
 * **Footer widgets** (`theme@1.6`). The footer columns an editor fills in the
 * widgets screen (`footer-1`..`footer-4`) are one row of their own, under the
 * identity and the menu and above the legal line, on the same grid. A footer
 * with no widget renders exactly as it did before.
 *
 * Every optional field renders only when present: a site that sets none of
 * them gets no empty wrapper for any of them (`test/chrome.test.ts`).
 */

interface FooterGroup {
  readonly heading: string | null
  readonly links: readonly ChromeNavLink[]
}

/** Links a visitor can follow, plus the unlinked headings that name a column. */
function usable(links: readonly ChromeNavLink[]): readonly ChromeNavLink[] {
  return links.filter((link) => link.href !== null || link.kind === 'submenu-placeholder')
}

function linkItem(link: ChromeNavLink): string {
  const label = escapeText(link.label)
  const titleAttr = link.title === null ? '' : ` title="${escapeAttribute(link.title)}"`
  if (link.href === null) return `<li><span${titleAttr}>${label}</span></li>`
  const target = link.openInNewTab ? ' target="_blank" rel="noopener"' : ''
  return `<li><a href="${escapeAttribute(link.href)}"${target}${titleAttr}>${label}</a></li>`
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
  return `<div class="cg-site-footer__about">${paragraphs
    .map(
      (lines) =>
        `<p class="cg-site-footer__note">${lines.map((line) => escapeText(line)).join('<br>')}</p>`,
    )
    .join('')}</div>`
}

function renderHeader(input: ChromeInput): string {
  const siteName = escapeText(input.site.name)
  const home = escapeAttribute(input.homeHref)
  // The uploaded logo replaces the wordmark, and only the wordmark: the
  // footer keeps the site's name in text, so a page whose logo fails to load
  // still names the site.
  const mark = renderBrandMark(input.brand, { className: 'cg-site-header__logo' }) ?? siteName
  const links = usable(input.headerNav).map(linkItem).join('')
  const actionHref =
    input.headerAction === undefined ? '' : escapeAttribute(input.headerAction.href)
  const actionLabel = input.headerAction === undefined ? '' : escapeText(input.headerAction.label)
  // On a phone the bar holds the name, the menu control and the light/dark
  // control; the action moves to the foot of the menu panel. It is the same
  // link twice in the source, and the stylesheet shows exactly one of them at
  // any width (`display: none` hides the other from assistive technology
  // too), so it is never announced twice.
  const menuAction =
    input.headerAction === undefined
      ? ''
      : `<p class="cg-site-header__menu-action"><a class="cg-action" data-emphasis="primary" href="${actionHref}">${actionLabel}</a></p>`
  const menu =
    links === ''
      ? ''
      : `<input type="checkbox" id="cg-nav-toggle" class="cg-nav-toggle" aria-controls="cg-site-nav">` +
        `<label for="cg-nav-toggle" class="cg-nav-toggle__label">${escapeText(word(input.locale, 'menu'))}</label>` +
        `<nav class="cg-site-header__nav" id="cg-site-nav" aria-label="${escapeAttribute(
          word(input.locale, 'primaryNavigation'),
        )}"><ul class="cg-menu">${links}</ul>${menuAction}</nav>`
  const action =
    input.headerAction === undefined
      ? ''
      : `<a class="cg-action cg-site-header__action" data-emphasis="primary" href="${actionHref}">${actionLabel}</a>`
  const toggle = serialize(renderThemeToggle(input.locale, { className: 'cg-theme-toggle' }))

  return (
    `<header class="cg-site-header" data-nav="${links === '' ? 'none' : 'links'}"><div class="cg-site-header__inner">` +
    `<a class="cg-site-header__home" href="${home}">${mark}</a>` +
    menu +
    `<div class="cg-site-header__end">${action}${toggle}</div>` +
    `</div></header>`
  )
}

function renderFooter(input: ChromeInput): string {
  const siteName = escapeText(input.site.name)
  const tagline =
    input.tagline === undefined
      ? ''
      : `<p class="cg-site-footer__tagline">${escapeText(input.tagline)}</p>`
  const note = input.footerNote === undefined ? '' : renderFooterNote(input.footerNote)
  const socialLinks = renderSocialLinks(input.social, {
    className: 'cg-site-footer__social',
    itemClassName: 'cg-site-footer__social-item',
  })
  const social = socialLinks === null ? '' : serialize(socialLinks)
  const groups = footerGroups(input.footerNav)
  const nav =
    groups.length === 0
      ? ''
      : `<nav class="cg-site-footer__nav" aria-label="${escapeAttribute(
          word(input.locale, 'footerNavigation'),
        )}" data-columns="${Math.min(groups.length, 3)}">${groups
          .map(
            (group) =>
              `<div class="cg-site-footer__group">${
                group.heading === null
                  ? ''
                  : `<p class="cg-site-footer__heading">${escapeText(group.heading)}</p>`
              }<ul class="cg-menu">${group.links.map(linkItem).join('')}</ul></div>`,
          )
          .join('')}</nav>`
  const widgets = renderFooterWidgets(input.widgets, {
    className: 'cg-site-footer__widgets',
    headingLevel: 'h2',
  })
  const year = new Date().getFullYear()

  return (
    `<footer class="cg-site-footer"><div class="cg-site-footer__inner">` +
    `<div class="cg-site-footer__identity"><p class="cg-site-footer__name">${siteName}</p>${tagline}${note}${social}</div>` +
    nav +
    (widgets === null ? '' : serialize(widgets)) +
    `<div class="cg-site-footer__legal"><p class="cg-site-footer__copyright">© ${year} ${siteName}</p>${input.brandingHtml}</div>` +
    `</div></footer>`
  )
}

export function renderChrome(input: ChromeInput): ChromeResult {
  return { header: renderHeader(input), footer: renderFooter(input) }
}
