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
 * The site header and footer — moved here, verbatim, from what used to be
 * `@cogenta/cli`'s own hardcoded `<header class="cg-site-header">`/`<footer
 * class="cg-site-footer">` template (`packages/cli/src/commands/theme-render.ts`,
 * before the chrome extension point existed). Byte-identical output to that
 * template: this is the reference theme, and every site that installed it
 * before a second theme existed must render exactly as it always has.
 *
 * A future theme with a structurally different header (a mega-menu, a cart
 * icon, no header at all) implements its own `renderChrome` instead — this is
 * simply the one this package ships.
 *
 * `theme@1.4` (L25 D2) adds four optional fields, each rendered only when
 * present: `headerAction` as a button-styled link at the end of the header
 * nav, `tagline` under the site name in the footer, `social` as an icon-link
 * row (`renderSocialLinks`), `footerNote` as a short "about" paragraph. A
 * site that sets none of them, and a `1.3` render that never reaches this
 * file at all, both keep the pre-1.4 header/footer byte for byte — see
 * `test/chrome.test.ts`'s own "without the new fields" case.
 */

function renderNavLinks(links: readonly ChromeNavLink[]): string {
  if (links.length === 0) return ''
  const items = links
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
  return items === '' ? '' : `<ul class="cg-menu">${items}</ul>`
}

/** The header's own call-to-action link (`theme@1.4`), styled like the block vocabulary's own primary action. */
function renderHeaderAction(action: ChromeInput['headerAction']): string {
  if (action === undefined) return ''
  return (
    `<a class="cg-action cg-site-header__action" data-emphasis="primary" ` +
    `href="${escapeAttribute(action.href)}">${escapeText(action.label)}</a>`
  )
}

export function renderChrome(input: ChromeInput): ChromeResult {
  const siteName = escapeAttribute(input.site.name)
  const headerNav = renderNavLinks(input.headerNav)
  const footerNav = renderNavLinks(input.footerNav)
  // The uploaded logo replaces the wordmark, and only the wordmark: the
  // footer keeps the site's name in text, so a site whose logo fails to load
  // is still named somewhere on every page.
  const mark = renderBrandMark(input.brand, { className: 'cg-site-header__logo' }) ?? siteName
  const headerAction = renderHeaderAction(input.headerAction)

  const header =
    `<header class="cg-site-header"><div class="cg-site-header__inner">` +
    `<a class="cg-site-header__home" href="${escapeAttribute(input.homeHref)}">${mark}</a>` +
    `${headerNav === '' ? '' : `<nav class="cg-site-header__nav" aria-label="Primary">${headerNav}</nav>`}` +
    `${headerAction}` +
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
    `<footer class="cg-site-footer"><div class="cg-site-footer__inner">` +
    `<span>${siteName}</span>${tagline}` +
    `${footerNav === '' ? '' : `<nav class="cg-site-footer__nav" aria-label="Footer">${footerNav}</nav>`}` +
    `${social}` +
    `${footerNote === '' ? '' : `<div class="cg-site-footer__about">${footerNote}</div>`}` +
    `${input.brandingHtml}</div></footer>`

  return { header, footer }
}
