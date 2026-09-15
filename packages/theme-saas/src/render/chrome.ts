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

/**
 * The header and footer of a software company's site (`theme@1.4`).
 *
 * Header: one quiet bar held at the top of the window on the page's own
 * ground, under a hairline (no blur, no translucency). The product's name as
 * a text wordmark (or its uploaded logo), the pages in interface text beside
 * it, then on the right the `headerAction` as the one filled blue button and
 * the light/dark control.
 *
 * Below the wide breakpoint the pages become a panel under the bar, opened by
 * a CSS-only toggle: a visually hidden checkbox paired with a `<label>`,
 * placed before the `<nav>` so the sibling combinator reaches it. The action
 * and the light/dark control stay in the bar, outside the panel: a visitor
 * can book a demo or change the appearance without opening the menu.
 *
 * Footer: columns, the way a software company's footer is organised. The
 * name, the `tagline`, the `footerNote` (a registered address, a support
 * line) and the social profiles on the first four columns; then the footer
 * navigation in columns. A `submenu-placeholder` in the footer menu (an
 * unlinked item such as "Product" or "Legal") starts a column and names it,
 * and the links after it fill that column, so an editor builds the columns
 * in the menu screen; a footer menu without placeholders is one column of
 * links. Under a hairline, the legal line: the copyright year and the name,
 * beside the host's `brandingHtml`, placed once, as received.
 */

interface FooterGroup {
  readonly heading: string | null
  readonly links: readonly ChromeNavLink[]
}

function linkItem(link: ChromeNavLink, className: string): string {
  const label = escapeText(link.label)
  const titleAttr = link.title === null ? '' : ` title="${escapeAttribute(link.title)}"`
  if (link.href === null) return `<li class="${className}"><span${titleAttr}>${label}</span></li>`
  const target = link.openInNewTab ? ' target="_blank" rel="noopener"' : ''
  return `<li class="${className}"><a href="${escapeAttribute(link.href)}"${target}${titleAttr}>${label}</a></li>`
}

function usable(links: readonly ChromeNavLink[]): readonly ChromeNavLink[] {
  return links.filter((link) => link.href !== null || link.kind === 'submenu-placeholder')
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
  return `<div class="cs-footer__note">${paragraphs
    .map((lines) => `<p>${lines.map((line) => escapeText(line)).join('<br>')}</p>`)
    .join('')}</div>`
}

export function renderChrome(input: ChromeInput): ChromeResult {
  const siteName = escapeText(input.site.name)
  const home = escapeAttribute(input.homeHref)
  const links = usable(input.headerNav)
    .map((link) => linkItem(link, 'cs-header__item'))
    .join('')
  const action =
    input.headerAction === undefined
      ? ''
      : `<a class="cg-action cs-header__action" data-emphasis="primary" href="${escapeAttribute(
          input.headerAction.href,
        )}">${escapeText(input.headerAction.label)}</a>`
  const toggle = serialize(renderThemeToggle(input.locale, { className: 'cg-theme-toggle' }))
  const logo = renderBrandMark(input.brand, { className: 'cs-header__logo' })
  const mark = logo ?? `<span class="cs-header__wordmark">${siteName}</span>`

  const menu =
    links === ''
      ? ''
      : `<input type="checkbox" id="cs-nav-toggle" class="cs-nav-toggle-input" aria-label="Menu">` +
        `<label for="cs-nav-toggle" class="cs-nav-toggle-label" aria-hidden="true">` +
        `<span class="cs-nav-toggle-bar"></span><span class="cs-nav-toggle-bar"></span>` +
        `</label>` +
        `<nav class="cs-header__nav" id="cs-nav" aria-label="Primary">` +
        `<ul class="cs-header__links">${links}</ul>` +
        `</nav>`

  const header =
    `<header class="cs-header" data-nav="${links === '' ? 'none' : 'links'}">` +
    `<div class="cs-header__inner">` +
    `<a class="cs-header__brand" href="${home}">${mark}</a>` +
    `${menu}` +
    `<div class="cs-header__end">${action}${toggle}</div>` +
    `</div></header>`

  const tagline =
    input.tagline === undefined
      ? ''
      : `<p class="cs-footer__tagline" data-field="tagline">${escapeText(input.tagline)}</p>`
  const note = input.footerNote === undefined ? '' : renderFooterNote(input.footerNote)
  const social = renderSocialLinks(input.social, {
    className: 'cs-footer__social',
    itemClassName: 'cs-footer__social-item',
  })
  const groups = footerGroups(input.footerNav)
  const nav =
    groups.length === 0
      ? ''
      : `<nav class="cs-footer__nav" aria-label="Footer" data-columns="${Math.min(groups.length, 4)}">${groups
          .map(
            (group) =>
              `<div class="cs-footer__group">${
                group.heading === null
                  ? ''
                  : `<p class="cs-footer__heading">${escapeText(group.heading)}</p>`
              }<ul class="cs-footer__links">${group.links
                .map((link) => linkItem(link, 'cs-footer__item'))
                .join('')}</ul></div>`,
          )
          .join('')}</nav>`
  const year = new Date().getFullYear()
  // The footer widget columns (`theme@1.6`) are a row of their own under the
  // company and the pages, on the same twelve columns, above the legal line.
  const footerWidgets = renderFooterWidgets(input.widgets, {
    className: 'cs-footer__widgets',
    headingLevel: 'h2',
  })

  const footer =
    `<footer class="cs-footer"><div class="cs-footer__inner">` +
    `<div class="cs-footer__about">` +
    `<a class="cs-footer__name" href="${home}">${siteName}</a>` +
    `${tagline}${note}` +
    `${social === null ? '' : serialize(social)}` +
    `</div>` +
    `${nav}` +
    `${footerWidgets === null ? '' : serialize(footerWidgets)}` +
    `<div class="cs-footer__legal">` +
    `<p class="cs-footer__copyright">© ${year} ${siteName}</p>` +
    `${input.brandingHtml === '' ? '' : `<div class="cs-footer__branding">${input.brandingHtml}</div>`}` +
    `</div>` +
    `</div></footer>`

  return { header, footer }
}
