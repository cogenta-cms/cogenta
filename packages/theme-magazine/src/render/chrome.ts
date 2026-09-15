import {
  type ChromeInput,
  type ChromeNavLink,
  type ChromeResult,
  escapeAttribute,
  escapeText,
  renderBrandMark,
  renderFooterWidgets,
  renderSocialLinks,
  renderThemeToggle,
  serialize,
} from '@cogenta/theme-kit'

/**
 * The masthead and the colophon (`theme@1.4`), drawn the way a daily draws
 * them.
 *
 * Masthead, three rows:
 *
 * 1. A thin bar: today's date on the left, the `tagline` in the middle on a
 *    wide screen, the `headerAction` and the light/dark control on the right.
 *    The action lives here rather than in the navigation so it stays visible
 *    on a phone with the menu closed.
 * 2. The nameplate: the site's name in the display face, centred, or its
 *    uploaded logo at nameplate scale.
 * 3. The section navigation in spaced capitals between a double rule and a
 *    hairline. Below the breakpoint it becomes a panel opened by a CSS-only
 *    toggle, a visually hidden checkbox paired with a `<label>`, no
 *    `<script>`. The checkbox and label are siblings placed before the
 *    `<nav>` so the sibling combinator in `base.css` reaches it.
 *
 * The date is the date the page is rendered, which is what a masthead date
 * means on a site rendered per request.
 *
 * Colophon: the name again on a double rule, then four columns (the tagline
 * and `footerNote`, the footer navigation over two columns, the social
 * profiles with their names), then the legal line: the copyright year and the
 * site's name beside Cogenta's credit (`brandingHtml`, placed once, as
 * received). No column carries a heading: a heading is a word, and a theme
 * has no translation for it. Every `theme@1.4` field renders only when
 * present, so a host that predates them still gets the name and navigation.
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

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function formatToday(date: Date, locale: string, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat(locale, options).format(date)
  } catch {
    return new Intl.DateTimeFormat('en', options).format(date)
  }
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
  const siteNameText = escapeText(input.site.name)
  const homeHref = escapeAttribute(input.homeHref)
  const sections = navItems(input.headerNav)
  const today = new Date()
  const longToday = escapeText(
    formatToday(today, input.locale, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
  )
  const shortToday = escapeText(
    formatToday(today, input.locale, { weekday: 'short', month: 'short', day: 'numeric' }),
  )
  const plate =
    renderBrandMark(input.brand, { className: 'cg-masthead__logo' }) ??
    `<span class="cg-masthead__name">${siteNameText}</span>`
  const action =
    input.headerAction === undefined
      ? ''
      : `<a class="cg-action cg-masthead__action" data-emphasis="masthead" href="${escapeAttribute(
          input.headerAction.href,
        )}">${escapeText(input.headerAction.label)}</a>`
  const toggle = serialize(renderThemeToggle(input.locale, { className: 'cg-theme-toggle' }))
  const tagline =
    input.tagline === undefined
      ? ''
      : `<p class="cg-masthead__tagline">${escapeText(input.tagline)}</p>`

  const menu =
    sections === ''
      ? ''
      : `<input type="checkbox" id="cg-nav-toggle" class="cg-nav-toggle-input" aria-label="Menu">` +
        `<label for="cg-nav-toggle" class="cg-nav-toggle-label" aria-hidden="true">` +
        `<span class="cg-nav-toggle-bar"></span><span class="cg-nav-toggle-bar"></span>` +
        `</label>` +
        `<nav class="cg-masthead__nav" id="cg-nav" aria-label="Primary">` +
        `<ul class="cg-masthead__sections">${sections}</ul>` +
        `</nav>`

  const header =
    `<header class="cg-masthead" data-nav="${sections === '' ? 'none' : 'sections'}">` +
    `<div class="cg-masthead__bar"><div class="cg-masthead__bar-inner">` +
    `<p class="cg-masthead__date"><time datetime="${isoDay(today)}">` +
    `<span class="cg-masthead__date-long">${longToday}</span>` +
    `<span class="cg-masthead__date-short" aria-hidden="true">${shortToday}</span>` +
    `</time></p>` +
    `${tagline}` +
    `<div class="cg-masthead__tools">${action}${toggle}</div>` +
    `</div></div>` +
    `<div class="cg-masthead__plate">` +
    `<a class="cg-masthead__home" href="${homeHref}">${plate}</a>` +
    `</div>` +
    `${menu}` +
    `</header>`

  const footerTagline =
    input.tagline === undefined
      ? ''
      : `<p class="cg-colophon__tagline" data-field="tagline">${escapeText(input.tagline)}</p>`
  const note = input.footerNote === undefined ? '' : renderFooterNote(input.footerNote)
  const footerLinks = navItems(input.footerNav)
  const social = renderSocialLinks(input.social, {
    className: 'cg-colophon__social',
    itemClassName: 'cg-colophon__social-item',
  })
  const year = today.getFullYear()
  // The footer widget columns (`theme@1.6`) sit under the name, above the
  // colophon's own columns, set in the same register.
  const footerWidgets = renderFooterWidgets(input.widgets, {
    className: 'cg-colophon__widgets',
    headingLevel: 'h2',
  })

  const footer =
    `<footer class="cg-colophon"><div class="cg-colophon__inner">` +
    `<div class="cg-colophon__plate">` +
    `<a class="cg-colophon__name" href="${homeHref}">${siteNameText}</a>` +
    `</div>` +
    `${footerWidgets === null ? '' : serialize(footerWidgets)}` +
    `<div class="cg-colophon__grid">` +
    `${footerTagline === '' && note === '' ? '' : `<div class="cg-colophon__about">${footerTagline}${note}</div>`}` +
    `${
      footerLinks === ''
        ? ''
        : `<nav class="cg-colophon__nav" aria-label="Footer"><ul class="cg-colophon__links">${footerLinks}</ul></nav>`
    }` +
    `${social === null ? '' : `<div class="cg-colophon__follow">${serialize(social)}</div>`}` +
    `</div>` +
    `<div class="cg-colophon__legal">` +
    `<p class="cg-colophon__copyright">© ${year} ${siteNameText}</p>` +
    `<div class="cg-colophon__branding">${input.brandingHtml}</div>` +
    `</div>` +
    `</div></footer>`

  return { header, footer }
}
