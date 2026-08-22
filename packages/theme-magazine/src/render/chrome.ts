import {
  type ChromeInput,
  type ChromeNavLink,
  type ChromeResult,
  escapeAttribute,
  escapeText,
} from '@cogenta/theme-kit'

/**
 * The masthead. A magazine's front matter is a nameplate — the title set in
 * the display serif, centred, with a hairline rule above and below — and a
 * single row of section links underneath it, the way a print contents strip
 * reads. That is a structurally different header from a left-aligned wordmark
 * plus a right-aligned menu (`theme-canonical`'s own layout): the nameplate
 * gets its own row so it can be set large without competing with the nav for
 * width, and the nav becomes a second, quieter row.
 */
function renderNavLinks(links: readonly ChromeNavLink[], className: string): string {
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
  return items === '' ? '' : `<ul class="${className}">${items}</ul>`
}

export function renderChrome(input: ChromeInput): ChromeResult {
  const siteNameText = escapeText(input.site.name)
  const headerNav = renderNavLinks(input.headerNav, 'cg-masthead__menu')
  const footerNav = renderNavLinks(input.footerNav, 'cg-colophon__menu')
  const homeHref = escapeAttribute(input.homeHref)

  const header =
    `<header class="cg-masthead">` +
    `<div class="cg-masthead__top">` +
    `<span class="cg-masthead__kicker">Dispatches, field notes &amp; long reads</span>` +
    `</div>` +
    `<div class="cg-masthead__nameplate">` +
    `<a class="cg-masthead__wordmark" href="${homeHref}">${siteNameText}</a>` +
    `</div>` +
    `${headerNav === '' ? '' : `<nav class="cg-masthead__nav" aria-label="Primary"><div class="cg-masthead__nav-inner">${headerNav}</div></nav>`}` +
    `</header>`

  const footer =
    `<footer class="cg-colophon">` +
    `<div class="cg-colophon__grid">` +
    `<div class="cg-colophon__about">` +
    `<a class="cg-colophon__wordmark" href="${homeHref}">${siteNameText}</a>` +
    `<p class="cg-colophon__tagline">Reporting, essays and field notes.</p>` +
    `</div>` +
    `${footerNav === '' ? '' : `<nav class="cg-colophon__nav" aria-label="Footer"><p class="cg-colophon__heading">Sections</p>${footerNav}</nav>`}` +
    `<div class="cg-colophon__branding">${input.brandingHtml}</div>` +
    `</div>` +
    `</footer>`

  return { header, footer }
}
