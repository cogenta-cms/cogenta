import {
  type ChromeInput,
  type ChromeNavLink,
  type ChromeResult,
  escapeAttribute,
  escapeText,
} from '@cogenta/theme-kit'

/**
 * This theme's own header and footer — a structurally different chrome from
 * the canonical theme's, not a recolour of it.
 *
 * Header: wordmark on the left, a horizontal nav, and — when the site's own
 * navigation carries two or more links — the *last* one is set apart with a
 * vertical rule and rendered as a filled button, the "Contact"/"Book a
 * call" treatment the aesthetic direction asks for. This is a structural
 * convention (last item = primary action), not invented data: with zero or
 * one link there is nothing to separate, and every link the site actually
 * configured still renders, in order.
 *
 * Footer: a real multi-column layout — a brand column (the site's own name,
 * standing in for "Company"), a navigation column built from the same
 * `footerNav` the contract hands every theme, and Cogenta's own credit (or
 * its white-label replacement) in its own column — followed by a full-width
 * rule and a legal-style bottom row. `brandingHtml` is placed exactly once,
 * inside the footer, exactly as received: never altered, never dropped.
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

function renderHeaderNav(links: readonly ChromeNavLink[]): string {
  if (links.length === 0) return ''
  const primary = links.length >= 2 ? links[links.length - 1] : undefined
  const rest = primary === undefined ? links : links.slice(0, -1)
  const items = navItems(rest)
  const nav = items === '' ? '' : `<ul class="cg-nav__items">${items}</ul>`
  if (primary === undefined || primary.href === null) return nav
  const href = escapeAttribute(primary.href)
  const label = escapeText(primary.label)
  const target = primary.openInNewTab ? ' target="_blank" rel="noopener"' : ''
  return (
    `${nav}<span class="cg-nav__divider" aria-hidden="true"></span>` +
    `<a class="cg-nav__cta" href="${href}"${target}>${label}</a>`
  )
}

export function renderChrome(input: ChromeInput): ChromeResult {
  const siteName = escapeAttribute(input.site.name)
  const siteNameText = escapeText(input.site.name)
  const headerNav = renderHeaderNav(input.headerNav)
  const footerItems = navItems(input.footerNav)

  const header =
    `<header class="cg-site-header"><div class="cg-site-header__inner">` +
    `<a class="cg-site-header__home" href="${escapeAttribute(input.homeHref)}">${siteName}</a>` +
    `${headerNav === '' ? '' : `<nav class="cg-nav" aria-label="Primary">${headerNav}</nav>`}` +
    `</div></header>`

  const footer =
    `<footer class="cg-site-footer"><div class="cg-site-footer__grid">` +
    `<div class="cg-site-footer__brand"><a href="${escapeAttribute(input.homeHref)}">${siteNameText}</a></div>` +
    `${
      footerItems === ''
        ? ''
        : `<nav class="cg-site-footer__nav" aria-label="Footer"><ul class="cg-nav__items">${footerItems}</ul></nav>`
    }` +
    `<div class="cg-site-footer__branding">${input.brandingHtml}</div>` +
    `</div><div class="cg-site-footer__bottom"><span>${siteNameText}</span></div></footer>`

  return { header, footer }
}
