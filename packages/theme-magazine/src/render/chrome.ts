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
 * The masthead. A magazine's front matter is a nameplate — the title set in
 * the display serif, centred, with a hairline rule above and below — and a
 * quiet rubric bar underneath it, the way a print contents strip reads. That
 * is a structurally different header from a left-aligned wordmark plus a
 * right-aligned menu (`theme-canonical`'s own layout): the nameplate gets
 * its own row so it can be set large without competing with the nav for
 * width, and the nav becomes a second, quieter row.
 *
 * L25 pro pass (`theme@1.4`): the top strip now names today's date rather
 * than a static tagline (`Intl.DateTimeFormat(ctx.locale, { dateStyle:
 * 'full' })` on `new Date()` — legitimate here because every page renders
 * per request, `cogenta serve` never caches a rendered page across a day
 * boundary for an anonymous visitor beyond `security.pageMaxAge`, and this
 * theme's own masthead has never claimed to be static-generated — `theme.
 * config.ts` still declares `runtime: 'static'`, which describes what this
 * theme *needs* to render a page, not a promise that today's date is frozen
 * at build time); the rubric row now also carries `headerAction` as a filled
 * "Subscribe"-style button; and a CSS-only `<details>` disclosure collapses
 * the whole rubric row into a hamburger below the nameplate's own
 * breakpoint, exactly the technique `theme-blog`'s masthead already proved
 * against a real browser (a closed `<details>`'s non-summary content cannot
 * be forced open by CSS alone, so the collapsed and expanded nav are two
 * separate `<nav>`s, never one pushed into a state it was never opened
 * into — see that theme's own `chrome.ts` for the verified detail).
 */

function renderNavItems(links: readonly ChromeNavLink[], className: string): string {
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

/** The rubric row's own call-to-action link (`theme@1.4`) — a filled button, the masthead's one place of solid colour. */
function renderHeaderAction(action: ChromeInput['headerAction']): string {
  if (action === undefined) return ''
  return (
    `<a class="cg-action cg-masthead__action" data-emphasis="primary" ` +
    `href="${escapeAttribute(action.href)}">${escapeText(action.label)}</a>`
  )
}

/** A hamburger mark drawn from three stacked bars — no icon font, no glyph a font might not ship. */
function menuGlyph(): string {
  return '<span class="cg-masthead__bars" aria-hidden="true"></span>'
}

function todaysDate(locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

export function renderChrome(input: ChromeInput): ChromeResult {
  const siteNameText = escapeText(input.site.name)
  const navItems = renderNavItems(input.headerNav, 'cg-masthead__menu')
  const headerAction = renderHeaderAction(input.headerAction)
  const footerNav = renderNavItems(input.footerNav, 'cg-colophon__menu')
  const homeHref = escapeAttribute(input.homeHref)
  // A nameplate is the one place a masthead earns a logo: it replaces the
  // wordmark on its own row. The colophon keeps the name in text, so the
  // site is still named in a page whose images never load.
  const nameplate = renderBrandMark(input.brand, { className: 'cg-masthead__logo' }) ?? siteNameText

  const hasRubric = navItems !== '' || headerAction !== ''
  // Two renderings of the same rubric row, never both visible at once (CSS,
  // `min-width: 56rem`) — see the file-level comment for why this cannot be
  // a single `<details open>` forced open at width.
  const mobileRubric = !hasRubric
    ? ''
    : `<details class="cg-masthead__disclosure">` +
      `<summary class="cg-masthead__toggle" aria-label="Menu">${menuGlyph()}</summary>` +
      `<nav class="cg-masthead__panel" aria-label="Primary">${navItems}${headerAction}</nav>` +
      `</details>`
  const desktopRubric = !hasRubric
    ? ''
    : `<nav class="cg-masthead__nav" aria-label="Primary"><div class="cg-masthead__nav-inner">${navItems}${headerAction}</div></nav>`

  const header =
    `<header class="cg-masthead">` +
    `<div class="cg-masthead__top">` +
    `<span class="cg-masthead__date">${escapeText(todaysDate(input.locale))}</span>` +
    `</div>` +
    `<div class="cg-masthead__nameplate">` +
    `<a class="cg-masthead__wordmark" href="${homeHref}">${nameplate}</a>` +
    `${mobileRubric}` +
    `</div>` +
    `${desktopRubric}` +
    `</header>`

  const tagline =
    input.tagline === undefined
      ? ''
      : `<p class="cg-colophon__tagline" data-field="tagline">${escapeText(input.tagline)}</p>`
  const social =
    input.social === undefined
      ? ''
      : serialize(
          renderSocialLinks(input.social, {
            className: 'cg-colophon__social',
            itemClassName: 'cg-colophon__social-item',
          }) ?? { kind: 'text', value: '' },
        )
  const footerNote =
    input.footerNote === undefined
      ? ''
      : `<p class="cg-colophon__note">${escapeText(input.footerNote)}</p>`

  const footer =
    `<footer class="cg-colophon"><div class="cg-colophon__grid">` +
    `<div class="cg-colophon__about">` +
    `<a class="cg-colophon__wordmark" href="${homeHref}">${siteNameText}</a>` +
    `${tagline}</div>` +
    `<div class="cg-colophon__sections">` +
    `<p class="cg-colophon__heading">Sections</p>` +
    `${footerNav === '' ? '' : `<nav aria-label="Footer">${footerNav}</nav>`}` +
    `</div>` +
    `<div class="cg-colophon__follow">` +
    `<p class="cg-colophon__heading">Follow</p>` +
    `${social}` +
    `</div>` +
    `<div class="cg-colophon__meta">` +
    `${footerNote}` +
    `<div class="cg-colophon__branding">${input.brandingHtml}</div>` +
    `</div>` +
    `</div></footer>`

  return { header, footer }
}
