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
 * The storefront's header and footer — real HTML strings, built independently
 * of the seventeen block renderers (contract D's chrome extension point is a
 * separate door from `renderPage`, and this theme uses it to look like a
 * retail site rather than a document).
 *
 * `theme@1.4` (L25 "templates pro") adds four fields, all optional: a
 * `headerAction` button ("Shop now"), a CSS-only mobile menu (a checkbox +
 * `<label>`, the same zero-JS mechanism `theme-saas` ships — not
 * `<details>`/`<summary>`: a *closed* `<details>` cannot render its
 * non-`<summary>` content at all in current Chrome, verified against a real
 * browser while building `theme-docs`, and the fix there was to stop using
 * `<details>` for the always-visible desktop nav; here there is only ever
 * one nav panel, shown or hidden by a sibling selector, so the checkbox
 * avoids that failure mode outright rather than working around it), and a
 * real four-column footer: brand + `tagline`, the site's own footer nav,
 * `social` (via `renderSocialLinks`), and a fourth column carrying
 * `footerNote` above `brandingHtml` — placed exactly once, exactly as
 * received, never altered or dropped.
 *
 * A site or a render that predates `1.4` gets exactly the `1.1` header/footer
 * shape, byte for byte (`test/chrome.test.ts`'s "without the new fields"
 * case) — every one of the four fields is rendered only when present.
 *
 * No cart icon, no search box, no "sign in" link is drawn here: this theme
 * ships no such feature (`@cogenta/commerce` is a separate backend this
 * theme package does not integrate with), and a control that does nothing
 * when pressed is a worse storefront than one with no control at all.
 */

function renderNavLinks(links: readonly ChromeNavLink[], listClass: string): string {
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
  return items === '' ? '' : `<ul class="${listClass}">${items}</ul>`
}

/** The header's own call-to-action link (`theme@1.4`) — a filled button, the loudest single control in the bar. */
function renderHeaderAction(action: ChromeInput['headerAction']): string {
  if (action === undefined) return ''
  return (
    `<a class="cg-action ce-header__action" data-emphasis="primary" ` +
    `href="${escapeAttribute(action.href)}">${escapeText(action.label)}</a>`
  )
}

/** A hamburger mark drawn from three stacked bars — no icon font, no glyph a font might not ship. */
function toggleGlyph(): string {
  return (
    '<span class="ce-nav-toggle-bar"></span>' +
    '<span class="ce-nav-toggle-bar"></span>' +
    '<span class="ce-nav-toggle-bar"></span>'
  )
}

export function renderChrome(input: ChromeInput): ChromeResult {
  const siteName = escapeText(input.site.name)
  const homeHref = escapeAttribute(input.homeHref)
  const headerNav = renderNavLinks(input.headerNav, 'ce-menu ce-menu--header')
  const footerNav = renderNavLinks(input.footerNav, 'ce-menu ce-menu--footer')
  const headerAction = renderHeaderAction(input.headerAction)
  // A storefront's header bar is exactly where a retailer expects its logo.
  // The footer's brand link and the bottom bar keep the name in text: a
  // shopper landing on a page whose images failed still knows whose shop
  // this is.
  const mark = renderBrandMark(input.brand, { className: 'ce-header__logo' }) ?? siteName

  // One nav panel, not two: below the breakpoint (`base.css`) it becomes a
  // dropdown under the checkbox toggle; above it, the sibling selector shows
  // it inline in the bar. Nothing at all is rendered — no toggle, no empty
  // `<nav>` — when there is neither a real link nor a header action, which is
  // what keeps `ce-header__nav`'s absence a true signal in `chrome.test.ts`.
  const hasMenu = headerNav !== '' || headerAction !== ''
  const toggle = !hasMenu
    ? ''
    : `<input type="checkbox" id="ce-nav-toggle" class="ce-nav-toggle-input" aria-label="Menu">` +
      `<label for="ce-nav-toggle" class="ce-nav-toggle-label" aria-hidden="true">${toggleGlyph()}</label>`
  const nav = !hasMenu
    ? ''
    : `<nav class="ce-header__nav" id="ce-nav" aria-label="Primary">${headerNav}${headerAction}</nav>`

  const header =
    `<header class="ce-header">` +
    `<div class="ce-header__bar">` +
    `<a class="ce-header__brand" href="${homeHref}">${mark}</a>` +
    `${toggle}` +
    `${nav}` +
    `</div></header>`

  const tagline =
    input.tagline === undefined
      ? ''
      : `<p class="ce-footer__tagline" data-field="tagline">${escapeText(input.tagline)}</p>`
  const social =
    input.social === undefined
      ? ''
      : serialize(
          renderSocialLinks(input.social, {
            className: 'ce-footer__social',
            itemClassName: 'ce-footer__social-item',
          }) ?? { kind: 'text', value: '' },
        )
  const footerNote =
    input.footerNote === undefined
      ? ''
      : `<p class="ce-footer__note">${escapeText(input.footerNote)}</p>`

  const footer =
    `<footer class="ce-footer">` +
    `<div class="ce-footer__top">` +
    `<div class="ce-footer__brand">` +
    `<a class="ce-footer__brand-link" href="${homeHref}">${siteName}</a>` +
    `${tagline}` +
    `</div>` +
    `${footerNav === '' ? '' : `<nav class="ce-footer__nav" aria-label="Footer">${footerNav}</nav>`}` +
    `${social === '' ? '' : `<div class="ce-footer__social-col">${social}</div>`}` +
    `<div class="ce-footer__meta">${footerNote}${input.brandingHtml}</div>` +
    `</div>` +
    `<div class="ce-footer__bottom">` +
    `<span class="ce-footer__copy">${siteName}</span>` +
    `</div></footer>`

  return { header, footer }
}
