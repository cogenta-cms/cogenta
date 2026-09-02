import {
  type ChromeInput,
  type ChromeNavLink,
  type ChromeResult,
  escapeAttribute,
  escapeText,
  renderBrandMark,
} from '@cogenta/theme-kit'

/**
 * The chrome this theme ships: a thin, sticky index bar up top — the site
 * name treated as a typographic mark rather than a logo slot, a running
 * index number, and a right-aligned nav — and a footer that becomes a second
 * headline: the site name set at display scale, repeated as a closing
 * statement, with the real footer navigation and the branding fragment
 * beneath it.
 *
 * Both fragments are built with the same string-escaping discipline
 * `theme-kit`'s own reference chrome uses (`escapeText`/`escapeAttribute`) —
 * `headerNav`/`footerNav` arrive pre-resolved and are rendered as given,
 * never invented or dropped, and `brandingHtml` is placed, never altered.
 */

function renderNavLinks(links: readonly ChromeNavLink[], className: string): string {
  if (links.length === 0) return ''
  const items = links
    .filter((link) => link.href !== null || link.kind === 'submenu-placeholder')
    .map((link, index) => {
      const label = escapeText(link.label)
      const titleAttr = link.title === null ? '' : ` title="${escapeAttribute(link.title)}"`
      const number = String(index + 1).padStart(2, '0')
      if (link.href === null) {
        return `<li><span class="cg-nav__index" aria-hidden="true">${number}</span><span${titleAttr}>${label}</span></li>`
      }
      const href = escapeAttribute(link.href)
      const target = link.openInNewTab ? ' target="_blank" rel="noopener"' : ''
      return (
        `<li><span class="cg-nav__index" aria-hidden="true">${number}</span>` +
        `<a href="${href}"${target}${titleAttr}>${label}</a></li>`
      )
    })
    .join('')
  return items === '' ? '' : `<ul class="${className}">${items}</ul>`
}

export function renderChrome(input: ChromeInput): ChromeResult {
  const siteName = escapeText(input.site.name)
  const home = escapeAttribute(input.homeHref)
  const headerNav = renderNavLinks(input.headerNav, 'cg-nav')
  const footerNav = renderNavLinks(input.footerNav, 'cg-nav cg-nav--footer')
  // The asterisk glyph is this theme's own typographic mark. It belongs to
  // the *wordmark* treatment, so an uploaded logo replaces both together —
  // an asterisk stapled to somebody else's logo is not a design decision
  // this theme gets to make on their behalf.
  const logo = renderBrandMark(input.brand, { className: 'cg-site-header__logo' })
  const mark = logo ?? `<span class="cg-site-header__glyph" aria-hidden="true">*</span>${siteName}`

  const header =
    `<header class="cg-site-header"><div class="cg-site-header__inner">` +
    `<a class="cg-site-header__mark" href="${home}">${mark}</a>` +
    `${headerNav === '' ? '' : `<nav class="cg-site-header__nav" aria-label="Primary">${headerNav}</nav>`}` +
    `</div></header>`

  const footer =
    `<footer class="cg-site-footer"><div class="cg-site-footer__inner">` +
    `<a class="cg-site-footer__statement" href="${home}">${siteName}</a>` +
    `<div class="cg-site-footer__row">` +
    `${footerNav === '' ? '' : `<nav aria-label="Footer">${footerNav}</nav>`}` +
    `<div class="cg-site-footer__branding">${input.brandingHtml}</div>` +
    `</div></div></footer>`

  return { header, footer }
}
