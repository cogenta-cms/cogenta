import {
  renderFooterWidgets,
  renderWidgetArea,
  serialize,
  type WidgetAreas,
} from '@cogenta/theme-kit'
import { FOOTER_WIDGET_AREAS } from '@cogenta/widgets'

/**
 * Where widget areas go when the active theme does not place them itself
 * (L30 D2): a theme that exports no `widgetAreas` still shows every widget,
 * in positions that can never break its layout — `content-before` as the
 * first thing inside `<main>`, `content-after` then `sidebar` as the last, the
 * footer columns just above the theme's own footer. Any other area such a
 * theme would not know about follows the sidebar.
 */

export function splitWidgetAreas(areas: WidgetAreas): {
  readonly page: WidgetAreas
  readonly footer: WidgetAreas
} {
  const page: Record<string, WidgetAreas[string]> = {}
  const footer: Record<string, WidgetAreas[string]> = {}
  for (const [id, area] of Object.entries(areas)) {
    if (FOOTER_WIDGET_AREAS.includes(id)) footer[id] = area
    else page[id] = area
  }
  return { page, footer }
}

export function hasAnyWidget(areas: WidgetAreas): boolean {
  return Object.values(areas).some((area) => area.widgets.length > 0)
}

/** Inserts the page's areas into a serialised `<main>` the host did not draw them into. */
export function placeWidgetsInMain(html: string, page: WidgetAreas): string {
  if (!hasAnyWidget(page)) return html
  const node = (id: string): string => {
    const rendered = renderWidgetArea(page[id], { className: `cg-widget-area--placed` })
    return rendered === null ? '' : serialize(rendered)
  }
  const before = node('content-before')
  const after = [
    node('content-after'),
    node('sidebar'),
    ...Object.keys(page)
      .filter((id) => !['content-before', 'content-after', 'sidebar'].includes(id))
      .map(node),
  ].join('')
  const open = html.search(/<main\b[^>]*>/u)
  const close = html.lastIndexOf('</main>')
  if (open === -1 || close === -1) return `${before}${html}${after}`
  const openEnd = html.indexOf('>', open) + 1
  return `${html.slice(0, openEnd)}${before}${html.slice(openEnd, close)}${after}${html.slice(close)}`
}

export function footerWidgetsHtml(footer: WidgetAreas): string {
  const rendered = renderFooterWidgets(footer, { className: 'cg-footer-widgets--placed' })
  return rendered === null ? '' : serialize(rendered)
}

/**
 * The floor under every widget, whatever the theme: a width, a rhythm and the
 * screens a widget is hidden on. Every rule is wrapped in `:where()`, so it
 * weighs nothing and any theme rule wins; it is emitted after the theme's
 * stylesheet so it still outranks a theme's own zero-weight resets. Skin
 * tokens only, so it follows a personalisation.
 */
export const WIDGET_FLOOR_CSS = [
  ':where(.cg-widget-area--placed,.cg-footer-widgets--placed){box-sizing:border-box;inline-size:min(100% - 2.5rem, 72rem);margin-inline:auto;padding-block:2rem}',
  ':where(.cg-footer-widgets--placed){display:grid;gap:2rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr));border-block-start:1px solid var(--cogenta-color-border)}',
  ':where(.cg-footer-widgets--placed) > :where(.cg-widget-area){inline-size:auto;margin:0;padding:0}',
  ':where(.cg-widget-area){display:grid;gap:2rem;align-content:start}',
  ':where(.cg-widget-area--placed[data-area="sidebar"]){grid-template-columns:repeat(auto-fit,minmax(min(100%,18rem),1fr));border-block-start:1px solid var(--cogenta-color-border)}',
  ':where(.cg-widget){min-inline-size:0}',
  ':where(.cg-widget__title){margin:0 0 .75rem;font-family:var(--cogenta-font-sans);font-size:.8125rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--cogenta-color-fg)}',
  ':where(.cg-widget__body){font-size:.9375rem;line-height:1.5}',
  ':where(.cg-widget__body) :where(ul,ol){margin:0;padding:0;list-style:none}',
  ':where(.cg-widget__links-item,.cg-widget__terms-item,.cg-widget__archives-item,.cg-widget__entry,.cg-widget__comment,.cg-widget__toc-item){padding-block:.4rem;border-block-end:1px solid var(--cogenta-color-border)}',
  ':where(.cg-widget__terms-item,.cg-widget__archives-item){display:flex;justify-content:space-between;gap:1rem}',
  ':where(.cg-widget__terms-item[data-depth="1"]){padding-inline-start:1rem}',
  ':where(.cg-widget__terms-item[data-depth="2"]){padding-inline-start:2rem}',
  ':where(.cg-widget__toc-item[data-depth="1"]){padding-inline-start:1rem}',
  ':where(.cg-widget__toc-item[data-depth="2"]){padding-inline-start:2rem}',
  ':where(.cg-widget__terms-count,.cg-widget__archives-count,.cg-widget__entry-date,.cg-widget__comment-date,.cg-widget__cloud-count){color:var(--cogenta-color-muted-fg);font-variant-numeric:tabular-nums;font-size:.8125rem}',
  ':where(.cg-widget__entry){display:grid;grid-template-columns:auto 1fr;gap:.75rem;align-items:start}',
  ':where(.cg-widget__entry[data-image="none"]){grid-template-columns:1fr}',
  ':where(.cg-widget__entry-image){inline-size:4.5rem;aspect-ratio:1;object-fit:cover}',
  ':where(.cg-widget__entry-text){display:grid;gap:.15rem}',
  ':where(.cg-widget__entry-excerpt,.cg-widget__comment-excerpt){margin:0;color:var(--cogenta-color-muted-fg);font-size:.875rem}',
  ':where(.cg-widget__cloud){display:flex;flex-wrap:wrap;gap:.35rem .75rem}',
  ':where(.cg-widget__cloud-item[data-weight="1"]){font-size:.8125rem}',
  ':where(.cg-widget__cloud-item[data-weight="2"]){font-size:.9375rem}',
  ':where(.cg-widget__cloud-item[data-weight="3"]){font-size:1.0625rem}',
  ':where(.cg-widget__cloud-item[data-weight="4"]){font-size:1.25rem}',
  ':where(.cg-widget__cloud-item[data-weight="5"]){font-size:1.5rem}',
  ':where(.cg-widget__search,.cg-widget__jump){display:flex;gap:.5rem}',
  ':where(.cg-widget__search-input,.cg-widget__jump select){flex:1;min-inline-size:0;font:inherit;padding:.5rem .6rem;border:1px solid var(--cogenta-color-border);background:var(--cogenta-color-bg);color:var(--cogenta-color-fg)}',
  ':where(.cg-widget__search-button,.cg-widget__jump-button,.cg-widget__form-submit,.cg-widget__cta-action){font:inherit;padding:.5rem .9rem;border:0;background:var(--cogenta-color-accent);color:var(--cogenta-color-accent-fg);text-decoration:none;cursor:pointer;display:inline-block}',
  ':where(.cg-widget__image,.cg-widget__about-image,.cg-widget__gallery-image){display:block;inline-size:100%;block-size:auto}',
  ':where(.cg-widget__figure,.cg-widget__embed,.cg-widget__quote){margin:0}',
  ':where(.cg-widget__caption,.cg-widget__quote-role){color:var(--cogenta-color-muted-fg);font-size:.8125rem}',
  ':where(.cg-widget__frame){inline-size:100%;aspect-ratio:16/9;border:0}',
  ':where(.cg-widget__gallery){display:grid;gap:.5rem;grid-template-columns:repeat(3,1fr)}',
  ':where(.cg-widget__gallery[data-columns="2"]){grid-template-columns:repeat(2,1fr)}',
  ':where(.cg-widget__gallery[data-columns="4"]){grid-template-columns:repeat(4,1fr)}',
  ':where(.cg-widget__quote-text){margin:0;font-family:var(--cogenta-font-serif);font-size:1.125rem}',
  ':where(.cg-widget__quote-text) p{margin:0}',
  ':where(.cg-widget__quote-source){display:flex;flex-wrap:wrap;gap:.5rem;margin-block-start:.5rem}',
  ':where(.cg-widget__cta,.cg-widget__about){display:grid;gap:.5rem;justify-items:start}',
  ':where(.cg-widget__cta-heading,.cg-widget__about-heading){margin:0;font-family:var(--cogenta-font-serif);font-size:1.25rem;font-weight:600}',
  ':where(.cg-widget__cta-body,.cg-widget__about-body,.cg-widget__contact-line){margin:0}',
  ':where(.cg-widget__contact){display:grid;gap:.4rem}',
  ':where(.cg-widget__contact-line){display:flex;gap:.5rem;align-items:start}',
  ':where(.cg-widget__icon){flex:none;margin-block-start:.2rem}',
  ':where(.cg-widget__hours){display:grid;grid-template-columns:auto 1fr;gap:.25rem 1rem;margin:.5rem 0 0}',
  ':where(.cg-widget__hours) :where(dd){margin:0}',
  ':where(.cg-widget__social){display:flex;flex-wrap:wrap;gap:.75rem}',
  ':where(.cg-widget__form){display:grid;gap:.75rem}',
  ':where(.cg-widget__form) :where(input:not([type="checkbox"]),select,textarea){box-sizing:border-box;inline-size:100%;font:inherit;padding:.5rem .6rem;border:1px solid var(--cogenta-color-border);background:var(--cogenta-color-bg);color:var(--cogenta-color-fg)}',
  ':where(.cg-widget__form) :where(label){display:block;margin-block-end:.25rem;font-size:.875rem}',
  ':where(.cg-widget__form .cg-form__honeypot){position:absolute;inline-size:1px;block-size:1px;overflow:hidden;inset-inline-start:-9999px}',
  ':where(.cg-widget__calendar-table){inline-size:100%;border-collapse:collapse;text-align:center;font-variant-numeric:tabular-nums}',
  ':where(.cg-widget__calendar-table) :where(caption){text-align:start;font-weight:600;padding-block-end:.5rem}',
  ':where(.cg-widget__calendar-table) :where(th,td){padding:.3rem 0}',
  ':where(.cg-widget__calendar-table td[data-posts]) a{font-weight:700}',
  ':where(.cg-widget__calendar-nav){display:flex;justify-content:space-between;margin:.5rem 0 0}',
  // The one rule that must win over a theme: a widget hidden on a screen is hidden.
  '@media (min-width:64rem){.cg-widget[data-hide-desktop="true"]{display:none!important}}',
  '@media (min-width:40rem) and (max-width:63.99rem){.cg-widget[data-hide-tablet="true"]{display:none!important}}',
  '@media (max-width:39.99rem){.cg-widget[data-hide-mobile="true"]{display:none!important}}',
].join('\n')
