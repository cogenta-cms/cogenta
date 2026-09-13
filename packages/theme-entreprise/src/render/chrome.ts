import {
  type ChromeInput,
  type ChromeNavLink,
  type ChromeResult,
  escapeAttribute,
  escapeText,
  type HtmlElement,
  h,
  renderBrandMark,
  renderSocialLinks,
  renderThemeToggle,
  serialize,
} from '@cogenta/theme-kit'

/**
 * This theme's own header and footer (`theme@1.4`), drawn the way a firm's
 * website is: a quiet bar and a proper colophon.
 *
 * Header: the firm's name set as a wordmark in the display serif (or its
 * uploaded logo), the primary navigation in small interface text, the
 * `headerAction` as the one filled control, and the light/dark control last.
 * Below the breakpoint the navigation collapses into a panel opened by a
 * CSS-only toggle: a visually hidden checkbox paired with a `<label>`, no
 * `<script>`. The label must precede the `<nav>` for the sibling combinator
 * in `base.css` to reach it; the theme toggle follows the `<nav>`, outside
 * the panel it does not control, so a visitor can switch appearance without
 * opening the menu first.
 *
 * Footer: a twelve-column colophon. The name and `tagline` on the left, the
 * footer navigation, the `footerNote` and the social profiles (real icons,
 * via `renderSocialLinks`), then a legal line under a hairline with the
 * copyright year and the site's name beside Cogenta's credit
 * (`brandingHtml`, placed exactly once, exactly as received).
 *
 * `footerNote` is plain text. When an editor separates it into paragraphs
 * with blank lines, each paragraph becomes its own block, and a paragraph of
 * several lines gets its first line set as a label: an office city above its
 * address, a heading above a legal mention. One line stays one paragraph.
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

/** The header's own call to action (`theme@1.4`): the one filled control in the bar. */
function renderHeaderAction(action: ChromeInput['headerAction']): string {
  if (action === undefined) return ''
  return (
    `<a class="cg-action cg-site-header__action" data-emphasis="primary" ` +
    `href="${escapeAttribute(action.href)}">${escapeText(action.label)}</a>`
  )
}

/** `footerNote` as paragraphs: blank lines separate them, and a multi-line paragraph's first line is its label. */
export function renderFooterNote(note: string): HtmlElement | null {
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
  if (paragraphs.length === 0) return null
  return h(
    'div',
    { class: 'cg-site-footer__note', 'data-paragraphs': String(Math.min(paragraphs.length, 4)) },
    paragraphs.map((lines) => {
      const [first, ...rest] = lines as [string, ...string[]]
      if (rest.length === 0) return h('p', { class: 'cg-site-footer__note-text' }, first)
      return h(
        'p',
        { class: 'cg-site-footer__note-text' },
        h('span', { class: 'cg-site-footer__note-label' }, first),
        rest.flatMap((line, index) => (index === 0 ? [line] : [h('br'), line])),
      )
    }),
  )
}

export function renderChrome(input: ChromeInput): ChromeResult {
  const siteNameText = escapeText(input.site.name)
  const headerNavList = renderNavList(input.headerNav)
  const headerAction = renderHeaderAction(input.headerAction)
  const footerNavList = renderNavList(input.footerNav)
  const mark =
    renderBrandMark(input.brand, { className: 'cg-site-header__logo' }) ??
    `<span class="cg-site-header__name">${siteNameText}</span>`
  const themeToggle = serialize(renderThemeToggle(input.locale, { className: 'cg-theme-toggle' }))

  const header =
    `<header class="cg-site-header"><div class="cg-site-header__inner">` +
    `<a class="cg-site-header__home" href="${escapeAttribute(input.homeHref)}">${mark}</a>` +
    `<input type="checkbox" id="cg-nav-toggle" class="cg-nav-toggle-input" aria-label="Menu">` +
    `<label for="cg-nav-toggle" class="cg-nav-toggle-label" aria-hidden="true">` +
    `<span class="cg-nav-toggle-bar"></span><span class="cg-nav-toggle-bar"></span>` +
    `</label>` +
    `<nav class="cg-site-header__nav" id="cg-nav" aria-label="Primary">` +
    `${headerNavList}${headerAction}` +
    `</nav>` +
    `${themeToggle}` +
    `</div></header>`

  const tagline =
    input.tagline === undefined
      ? ''
      : `<p class="cg-site-footer__tagline" data-field="tagline">${escapeText(input.tagline)}</p>`
  const socialList = renderSocialLinks(input.social, {
    className: 'cg-site-footer__social',
    itemClassName: 'cg-site-footer__social-item',
  })
  const note = input.footerNote === undefined ? null : renderFooterNote(input.footerNote)
  // The copyright year is the year the page is rendered, which is what a
  // legal line on a live site means.
  const year = new Date().getFullYear()

  const footer =
    `<footer class="cg-site-footer"><div class="cg-site-footer__inner">` +
    `<div class="cg-site-footer__top">` +
    `<div class="cg-site-footer__brand">` +
    `<a class="cg-site-footer__name" href="${escapeAttribute(input.homeHref)}">${siteNameText}</a>${tagline}` +
    `</div>` +
    `${
      footerNavList === ''
        ? ''
        : `<nav class="cg-site-footer__nav" aria-label="Footer">${footerNavList}</nav>`
    }` +
    `${note === null ? '' : serialize(note)}` +
    `${socialList === null ? '' : `<div class="cg-site-footer__social-col">${serialize(socialList)}</div>`}` +
    `</div>` +
    `<div class="cg-site-footer__bottom">` +
    `<p class="cg-site-footer__legal">© ${year} ${siteNameText}</p>` +
    `<div class="cg-site-footer__branding">${input.brandingHtml}</div>` +
    `</div>` +
    `</div></footer>`

  return { header, footer }
}
