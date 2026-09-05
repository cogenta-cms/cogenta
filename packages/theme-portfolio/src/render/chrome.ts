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
 * The chrome this theme ships (`theme@1.4`): a thin, sticky index bar up
 * top — the site name treated as a typographic mark rather than a logo
 * slot, a running index number, a real desktop `<nav>`, `headerAction`
 * (`"Let's talk"`, a flat filled button) and a CSS-only mobile menu — and a
 * footer that becomes a second headline: the site name set at display
 * scale, repeated as a closing statement, the `tagline` beneath it, then a
 * real row of footer navigation, social icons (`renderSocialLinks`) and the
 * `footerNote` beside the branding fragment.
 *
 * The mobile menu is the same checkbox/label trick every L25 theme uses —
 * a visually-hidden `<input type="checkbox">` paired with a `<label>`
 * styled as a three-bar button; `base.css`'s sibling combinator is what
 * reveals the panel when the box is checked, so there is exactly one real
 * `<nav>` in the markup (the same one desktop and mobile both use, retiled
 * by CSS at the breakpoint), never two copies of the same links.
 *
 * Both fragments are built with the same string-escaping discipline
 * `theme-kit`'s own reference chrome uses (`escapeText`/`escapeAttribute`) —
 * `headerNav`/`footerNav` arrive pre-resolved and are rendered as given,
 * never invented or dropped, and `brandingHtml` is placed, never altered.
 * Every `theme@1.4` field (`tagline`/`social`/`footerNote`/`headerAction`)
 * is optional and additive: a host or a site that never sets one gets
 * exactly the `1.3` markup in that spot, byte for byte (`chrome.test.ts`'s
 * "without the new fields" cases).
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

/** The header's own call-to-action link (`theme@1.4`) — a flat filled button, the theme's one accent-coloured control, at the tail of the nav list. */
function renderHeaderAction(action: ChromeInput['headerAction']): string {
  if (action === undefined) return ''
  return (
    `<a class="cg-action cg-site-header__action" data-emphasis="primary" ` +
    `href="${escapeAttribute(action.href)}">${escapeText(action.label)}</a>`
  )
}

/** A hamburger mark drawn from three stacked bars — no icon font, no glyph a font might not ship. */
function menuGlyph(): string {
  return '<span class="cg-nav-toggle-bar"></span><span class="cg-nav-toggle-bar"></span><span class="cg-nav-toggle-bar"></span>'
}

export function renderChrome(input: ChromeInput): ChromeResult {
  const siteName = escapeText(input.site.name)
  const home = escapeAttribute(input.homeHref)
  const headerNav = renderNavLinks(input.headerNav, 'cg-nav')
  const footerNav = renderNavLinks(input.footerNav, 'cg-nav cg-nav--footer')
  const headerAction = renderHeaderAction(input.headerAction)
  // The asterisk glyph is this theme's own typographic mark. It belongs to
  // the *wordmark* treatment, so an uploaded logo replaces both together —
  // an asterisk stapled to somebody else's logo is not a design decision
  // this theme gets to make on their behalf.
  const logo = renderBrandMark(input.brand, { className: 'cg-site-header__logo' })
  const mark = logo ?? `<span class="cg-site-header__glyph" aria-hidden="true">*</span>${siteName}`

  const hasMenu = headerNav !== '' || headerAction !== ''
  const nav = hasMenu
    ? `<nav class="cg-site-header__nav" id="cg-nav" aria-label="Primary">${headerNav}${headerAction}</nav>`
    : ''
  const toggle = hasMenu
    ? `<input type="checkbox" id="cg-nav-toggle" class="cg-nav-toggle-input" aria-label="Menu">` +
      `<label for="cg-nav-toggle" class="cg-nav-toggle-label" aria-hidden="true">${menuGlyph()}</label>`
    : ''

  const header =
    `<header class="cg-site-header"><div class="cg-site-header__inner">` +
    `<a class="cg-site-header__mark" href="${home}">${mark}</a>` +
    `${toggle}${nav}` +
    `</div></header>`

  const tagline =
    input.tagline === undefined
      ? ''
      : `<p class="cg-site-footer__tagline" data-field="tagline">${escapeText(input.tagline)}</p>`
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
    `<a class="cg-site-footer__statement" href="${home}">${siteName}</a>` +
    `${tagline}` +
    `<div class="cg-site-footer__row">` +
    `${footerNav === '' ? '' : `<nav aria-label="Footer">${footerNav}</nav>`}` +
    `${social === '' ? '' : `<div class="cg-site-footer__social-col">${social}</div>`}` +
    `<div class="cg-site-footer__meta">${footerNote}<div class="cg-site-footer__branding">${input.brandingHtml}</div></div>` +
    `</div></div></footer>`

  return { header, footer }
}
