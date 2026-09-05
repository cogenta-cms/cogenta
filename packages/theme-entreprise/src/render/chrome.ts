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
 * This theme's own header and footer (`theme@1.4`) — a structurally
 * different chrome from the canonical theme's, not a recolour of it.
 *
 * Header: a sticky bar with the corporate wordmark/logo on the left, a real
 * desktop `<nav>`, `headerAction` (`theme@1.4`) rendered as a filled button
 * — the one place this hairline-first chrome spends a solid accent surface
 * — and, below the breakpoint the stylesheet sets, a CSS-only mobile menu:
 * a checkbox (`#cg-nav-toggle`, visually hidden but still focusable and
 * Space-operable) paired with a `<label>` styled as a three-bar button. No
 * `<script>` anywhere: the sibling combinator in `base.css` is what shows
 * the nav panel when the box is checked. This replaces the previous
 * "the last header link doubles as the call to action" convention — with a
 * real `headerAction` field, inventing a role for a plain nav link is no
 * longer the honest reading of the data.
 *
 * Footer: a real four-column layout — a brand column (site name + `tagline`,
 * `theme@1.4`), the site's own footer navigation, `social` (`theme@1.4`, via
 * `renderSocialLinks`), and a fourth column carrying `footerNote`
 * (`theme@1.4`) above Cogenta's own credit (or its white-label replacement).
 * `brandingHtml` is placed exactly once, inside the footer, exactly as
 * received: never altered, never dropped.
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

/** The header's own call-to-action link (`theme@1.4`) — a filled button, distinct from the ordinary nav list. */
function renderHeaderAction(action: ChromeInput['headerAction']): string {
  if (action === undefined) return ''
  return (
    `<a class="cg-action cg-site-header__action" data-emphasis="primary" ` +
    `href="${escapeAttribute(action.href)}">${escapeText(action.label)}</a>`
  )
}

export function renderChrome(input: ChromeInput): ChromeResult {
  const siteNameText = escapeText(input.site.name)
  const headerNavList = renderNavList(input.headerNav)
  const headerAction = renderHeaderAction(input.headerAction)
  const footerNavList = renderNavList(input.footerNav)
  // A B2B header is a corporate identity slot before it is a wordmark slot.
  const mark = renderBrandMark(input.brand, { className: 'cg-site-header__logo' }) ?? siteNameText

  const header =
    `<header class="cg-site-header"><div class="cg-site-header__inner">` +
    `<a class="cg-site-header__home" href="${escapeAttribute(input.homeHref)}">${mark}</a>` +
    `<input type="checkbox" id="cg-nav-toggle" class="cg-nav-toggle-input" aria-label="Menu">` +
    `<label for="cg-nav-toggle" class="cg-nav-toggle-label" aria-hidden="true">` +
    `<span class="cg-nav-toggle-bar"></span><span class="cg-nav-toggle-bar"></span><span class="cg-nav-toggle-bar"></span>` +
    `</label>` +
    `<nav class="cg-site-header__nav" id="cg-nav" aria-label="Primary">` +
    `${headerNavList}${headerAction}` +
    `</nav>` +
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
    `<footer class="cg-site-footer"><div class="cg-site-footer__grid">` +
    `<div class="cg-site-footer__brand">` +
    `<a href="${escapeAttribute(input.homeHref)}">${siteNameText}</a>${tagline}` +
    `</div>` +
    `${
      footerNavList === ''
        ? ''
        : `<nav class="cg-site-footer__nav" aria-label="Footer">${footerNavList}</nav>`
    }` +
    `${social === '' ? '' : `<div class="cg-site-footer__social-col">${social}</div>`}` +
    `<div class="cg-site-footer__meta">${footerNote}<div class="cg-site-footer__branding">${input.brandingHtml}</div></div>` +
    `</div><div class="cg-site-footer__bottom"><span>${siteNameText}</span></div></footer>`

  return { header, footer }
}
