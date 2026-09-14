import {
  type ChromeInput,
  type ChromeNavLink,
  type ChromeResult,
  escapeAttribute,
  escapeText,
  renderBrandMark,
  renderSocialLinks,
  renderThemeToggle,
  serialize,
} from '@cogenta/theme-kit'

/**
 * The header and the footer (`theme@1.4`), as quiet as a studio's own.
 *
 * Header, one row on the twelve columns: the studio's name on the left (or
 * its uploaded logo), the `tagline` in the middle columns on a wide screen,
 * the navigation on the right with the `headerAction` as its last link, and
 * the light/dark control. No bar, no button, no sticky shadow. Below the
 * breakpoint the navigation becomes a full-height panel of large links opened
 * by a CSS-only toggle: a visually hidden checkbox paired with a `<label>`,
 * placed before the `<nav>` so the sibling combinator in `base.css` reaches
 * it. There is exactly one `<nav>` in the markup, retiled by CSS.
 *
 * Footer, a hairline and three columns: the name, the tagline and the
 * `footerNote`; the footer navigation; the social profiles with their names.
 * Then the legal line: the copyright year and the studio's name beside
 * Cogenta's credit (`brandingHtml`, placed once, as received). No column
 * carries a heading: a heading is a word, and a theme has no translation for
 * it. Every `theme@1.4` field renders only when present, so a host that
 * predates them still gets the name and the navigation.
 */

function navItems(links: readonly ChromeNavLink[], className: string): string {
  return links
    .filter((link) => link.href !== null || link.kind === 'submenu-placeholder')
    .map((link) => {
      const label = escapeText(link.label)
      const titleAttr = link.title === null ? '' : ` title="${escapeAttribute(link.title)}"`
      if (link.href === null)
        return `<li class="${className}"><span${titleAttr}>${label}</span></li>`
      const href = escapeAttribute(link.href)
      const target = link.openInNewTab ? ' target="_blank" rel="noopener"' : ''
      return `<li class="${className}"><a href="${href}"${target}${titleAttr}>${label}</a></li>`
    })
    .join('')
}

/** `footerNote` as paragraphs: a blank line starts a new one. */
function renderFooterNote(note: string): string {
  const paragraphs = note
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter((paragraph) => paragraph !== '')
  if (paragraphs.length === 0) return ''
  return `<div class="cg-colophon__note">${paragraphs
    .map((paragraph) => `<p>${escapeText(paragraph)}</p>`)
    .join('')}</div>`
}

export function renderChrome(input: ChromeInput): ChromeResult {
  const siteName = escapeText(input.site.name)
  const home = escapeAttribute(input.homeHref)
  const links = navItems(input.headerNav, 'cg-masthead__item')
  const action =
    input.headerAction === undefined
      ? ''
      : `<a class="cg-masthead__action" href="${escapeAttribute(input.headerAction.href)}">${escapeText(
          input.headerAction.label,
        )}</a>`
  const toggle = serialize(renderThemeToggle(input.locale, { className: 'cg-theme-toggle' }))
  const logo = renderBrandMark(input.brand, { className: 'cg-masthead__logo' })
  const mark = logo ?? `<span class="cg-masthead__wordmark">${siteName}</span>`
  const tagline =
    input.tagline === undefined
      ? ''
      : `<p class="cg-masthead__tagline">${escapeText(input.tagline)}</p>`

  const hasMenu = links !== '' || action !== ''
  const menu = hasMenu
    ? `<input type="checkbox" id="cg-nav-toggle" class="cg-nav-toggle-input" aria-label="Menu">` +
      `<label for="cg-nav-toggle" class="cg-nav-toggle-label" aria-hidden="true">` +
      `<span class="cg-nav-toggle-bar"></span><span class="cg-nav-toggle-bar"></span>` +
      `</label>` +
      `<nav class="cg-masthead__nav" id="cg-nav" aria-label="Primary">` +
      `${links === '' ? '' : `<ul class="cg-masthead__links">${links}</ul>`}` +
      `${action}` +
      `</nav>`
    : ''

  const header =
    `<header class="cg-masthead" data-nav="${hasMenu ? 'links' : 'none'}">` +
    `<div class="cg-masthead__inner">` +
    `<a class="cg-masthead__home" href="${home}">${mark}</a>` +
    `${tagline}` +
    `${menu}` +
    `${toggle}` +
    `</div></header>`

  const footerTagline =
    input.tagline === undefined
      ? ''
      : `<p class="cg-colophon__tagline" data-field="tagline">${escapeText(input.tagline)}</p>`
  const note = input.footerNote === undefined ? '' : renderFooterNote(input.footerNote)
  const footerLinks = navItems(input.footerNav, 'cg-colophon__item')
  const social = renderSocialLinks(input.social, {
    className: 'cg-colophon__social',
    itemClassName: 'cg-colophon__social-item',
  })
  const year = new Date().getFullYear()

  const footer =
    `<footer class="cg-colophon"><div class="cg-colophon__inner">` +
    `<div class="cg-colophon__about">` +
    `<a class="cg-colophon__name" href="${home}">${siteName}</a>` +
    `${footerTagline}${note}` +
    `</div>` +
    `${
      footerLinks === ''
        ? ''
        : `<nav class="cg-colophon__nav" aria-label="Footer"><ul class="cg-colophon__links">${footerLinks}</ul></nav>`
    }` +
    `${social === null ? '' : `<div class="cg-colophon__follow">${serialize(social)}</div>`}` +
    `<div class="cg-colophon__legal">` +
    `<p class="cg-colophon__copyright">© ${year} ${siteName}</p>` +
    `<div class="cg-colophon__branding">${input.brandingHtml}</div>` +
    `</div>` +
    `</div></footer>`

  return { header, footer }
}
