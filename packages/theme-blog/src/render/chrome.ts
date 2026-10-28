import {
  type ChromeInput,
  type ChromeNavLink,
  type ChromeResult,
  escapeAttribute,
  escapeText,
  renderBrandMark,
  renderFooterWidgets,
  renderLanguageSwitcher,
  renderSocialLinks,
  renderThemeToggle,
  serialize,
} from '@cogenta/theme-kit'

/**
 * This theme's own header and footer (`theme@1.4`), drawn the way a technology
 * magazine draws them.
 *
 * Header, in two tiers. The masthead is the one sticky element of the site:
 * the publication's name set large in the condensed display face (or its
 * uploaded logo), and on the right what a reader uses at any time: the
 * language switcher (`theme@1.10`), the light/dark control and the
 * `headerAction` as the one filled button of the page. Under it the section
 * bar carries the header menu as a row of channels; it scrolls away with the
 * page, and on a narrow screen it scrolls sideways (a plain overflow, so there
 * is no menu to open and no `<script>`). A site's menu is whatever its editor
 * wrote; a blueprint that seeds topics gets a topic bar for free.
 *
 * Footer, a solid ink panel: the publication's name and tagline, the
 * `footerNote`, the invitation (`headerAction` again, then the RSS feed), the
 * footer navigation, the social profiles with real icons
 * (`renderSocialLinks`), footer widget columns (`theme@1.6`) when the site
 * placed any, a legal line beside Cogenta's credit (`brandingHtml`, placed
 * exactly once, as received), and the name once more, set across the whole
 * width as the colophon's signature. Every `theme@1.4` field renders only
 * when present, so a host that predates them gets the name and the navigation,
 * nothing broken.
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

/** The header's own call to action (`theme@1.4`): the one outlined control in the line. */
function renderHeaderAction(action: ChromeInput['headerAction']): string {
  if (action === undefined) return ''
  return (
    `<a class="cg-action cg-site-header__action" data-emphasis="outline" ` +
    `href="${escapeAttribute(action.href)}">${escapeText(action.label)}</a>`
  )
}

/** `footerNote` as paragraphs: a blank line starts a new one. */
function renderFooterNote(note: string): string {
  const paragraphs = note
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
    .filter((paragraph) => paragraph !== '')
  if (paragraphs.length === 0) return ''
  return `<div class="cg-site-footer__note">${paragraphs
    .map((paragraph) => `<p>${escapeText(paragraph)}</p>`)
    .join('')}</div>`
}

export function renderChrome(input: ChromeInput): ChromeResult {
  const siteNameText = escapeText(input.site.name)
  const navList = renderNavList(input.headerNav)
  const headerAction = renderHeaderAction(input.headerAction)
  const mark =
    renderBrandMark(input.brand, { className: 'cg-site-header__logo' }) ??
    `<span class="cg-site-header__name">${siteNameText}</span>`
  const themeToggle = serialize(renderThemeToggle(input.locale, { className: 'cg-theme-toggle' }))
  // Several languages (`theme@1.10`): in the masthead, so a reader can change
  // language from any scroll position.
  const switcher = renderLanguageSwitcher(input.languages, {
    locale: input.locale,
    className: 'cg-lang',
    itemClassName: 'cg-lang__item',
  })
  const languageSwitcher = switcher === null ? '' : serialize(switcher)

  const header =
    `<header class="cg-site-header"><div class="cg-site-header__inner">` +
    `<a class="cg-site-header__home" href="${escapeAttribute(input.homeHref)}">${mark}</a>` +
    `<div class="cg-site-header__tools">${languageSwitcher}${themeToggle}${headerAction}</div>` +
    `</div></header>` +
    (navList === ''
      ? ''
      : `<nav class="cg-sections" id="cg-nav" aria-label="Primary"><div class="cg-sections__inner">${navList}</div></nav>`)

  const tagline =
    input.tagline === undefined
      ? ''
      : `<p class="cg-site-footer__tagline" data-field="tagline">${escapeText(input.tagline)}</p>`
  const note = input.footerNote === undefined ? '' : renderFooterNote(input.footerNote)
  const footerNavList = renderNavList(input.footerNav)
  const social = renderSocialLinks(input.social, {
    className: 'cg-site-footer__social',
    itemClassName: 'cg-site-footer__social-item',
  })
  // The copyright year is the year the page is rendered, which is what a
  // legal line on a live site means.
  const year = new Date().getFullYear()
  const footerWidgets = renderFooterWidgets(input.widgets, {
    className: 'cg-site-footer__widgets',
    headingLevel: 'h2',
  })
  // The invitation: the site's own call to action, when it has one, and the
  // feed every site serves (`/feed.xml`), named by the format's own name.
  const join =
    `<div class="cg-site-footer__join">` +
    (input.headerAction === undefined
      ? ''
      : `<a class="cg-action" data-emphasis="primary" href="${escapeAttribute(input.headerAction.href)}">${escapeText(input.headerAction.label)}</a>`) +
    `<a class="cg-site-footer__feed" href="/feed.xml">RSS</a>` +
    `</div>`

  const footer =
    `<footer class="cg-site-footer"><div class="cg-site-footer__inner">` +
    `<div class="cg-site-footer__top">` +
    `<div class="cg-site-footer__brand">` +
    `${tagline}${note}` +
    `</div>` +
    `${join}` +
    `</div>` +
    `<div class="cg-site-footer__grid">` +
    `${
      footerNavList === ''
        ? ''
        : `<nav class="cg-site-footer__nav" aria-label="Footer">${footerNavList}</nav>`
    }` +
    `${social === null ? '' : `<div class="cg-site-footer__social-col">${serialize(social)}</div>`}` +
    `</div>` +
    `${footerWidgets === null ? '' : serialize(footerWidgets)}` +
    `<div class="cg-site-footer__bottom">` +
    `<p class="cg-site-footer__legal">© ${year} ${siteNameText}</p>` +
    `<div class="cg-site-footer__branding">${input.brandingHtml}</div>` +
    `</div>` +
    `<p class="cg-site-footer__name" aria-hidden="true">${siteNameText}</p>` +
    `</div></footer>`

  return { header, footer }
}
