import type { RichTextDocument } from '@cogenta/blocks'
import type { ChromeLink } from './chrome.js'
import { renderSocialLinks } from './chrome.js'
import type { ImageSource, LinkTargetInput, RenderContext } from './contract.js'
import { type Child, type HtmlElement, h } from './html.js'
import { renderIcon } from './icons.js'
import { renderImageSource } from './media.js'
import { renderRichText } from './rich-text.js'

/**
 * Widget areas (contract D `theme@1.6`, L30).
 *
 * The host resolves every widget of an area for the page being rendered —
 * visibility decided, entries and terms fetched, dates formatted, links
 * resolved, strings in the page's language — and hands the theme finished
 * view models. A theme never queries anything to draw a widget, the same rule
 * `FetchedEntries` holds for a `collectionList`.
 *
 * `renderWidgetArea` is the one shared rendering, so every theme draws the
 * same widget with the same semantic markup and only its stylesheet differs:
 * that is what lets a widget placed from the admin show up correctly whatever
 * theme is active. A theme is free to render an area itself instead.
 *
 * Class names: `cg-widget-area`, `cg-widget`, `cg-widget--<type>`,
 * `cg-widget__title`, `cg-widget__body`, and per type the elements listed on
 * each renderer below.
 */

export interface WidgetDevices {
  readonly desktop: boolean
  readonly tablet: boolean
  readonly mobile: boolean
}

export interface WidgetLink {
  readonly label: string
  readonly href: string
  readonly newTab: boolean
  /** The page being rendered is this link's target. */
  readonly current?: boolean
}

export interface WidgetEntryItem {
  readonly title: string
  readonly href: string | null
  /** Already formatted in the page's language. */
  readonly date: string | null
  /** ISO 8601, for `<time datetime>`. */
  readonly datetime: string | null
  readonly excerpt: string | null
  readonly image: ImageSource | null
}

export interface WidgetTermItem {
  readonly label: string
  readonly href: string | null
  readonly count: number | null
  /** 0 for a root term. */
  readonly depth: number
  readonly current: boolean
}

export interface WidgetFormField {
  readonly name: string
  readonly label: string
  readonly kind:
    | 'text'
    | 'email'
    | 'tel'
    | 'url'
    | 'number'
    | 'date'
    | 'textarea'
    | 'select'
    | 'checkbox'
  readonly required: boolean
  readonly choices: readonly string[]
  readonly help: string | null
}

interface WidgetBase {
  readonly id: string
  readonly title: string | null
  readonly devices: WidgetDevices
}

export type ResolvedWidget = WidgetBase &
  /**
   * A widget type one of the site's plugins provides (L32 step 4, contract
   * D `theme@1.7`). The host ran the plugin in a process of its own and
   * checked the markup it returned; a theme places it exactly like any
   * other widget and needs to know nothing more.
   */
  (
    | { readonly type: 'plugin'; readonly widgetType: string; readonly node: HtmlElement }
    | { readonly type: 'text'; readonly body: RichTextDocument }
    | {
        readonly type: 'image'
        readonly image: ImageSource
        readonly caption: string
        readonly href: string | null
      }
    | {
        readonly type: 'gallery'
        readonly images: readonly ImageSource[]
        readonly columns: number
      }
    | {
        readonly type: 'embed'
        /** An `https:` URL the host allowed to be framed (a known video or map provider); `null` shows the link only. */
        readonly frameSrc: string | null
        readonly url: string
        readonly caption: string
      }
    | {
        readonly type: 'quote'
        readonly text: string
        readonly attribution: string
        readonly role: string
      }
    | {
        readonly type: 'cta'
        readonly heading: string
        readonly body: string
        readonly action: WidgetLink
      }
    | { readonly type: 'links'; readonly items: readonly WidgetLink[] }
    | {
        readonly type: 'contact'
        readonly address: string
        readonly phone: string
        readonly email: string
        readonly hours: readonly { readonly label: string; readonly value: string }[]
      }
    | {
        readonly type: 'about'
        readonly image: ImageSource | null
        readonly heading: string
        readonly body: string
        readonly link: WidgetLink | null
      }
    | {
        readonly type: 'entries'
        readonly variant: 'recent' | 'related' | 'popular'
        readonly items: readonly WidgetEntryItem[]
        readonly empty: string
      }
    | {
        readonly type: 'terms'
        readonly display: 'list' | 'dropdown'
        readonly items: readonly WidgetTermItem[]
        /** The dropdown's own first option, e.g. "Select a category". */
        readonly prompt: string
      }
    | {
        readonly type: 'tagCloud'
        readonly items: readonly (WidgetTermItem & { readonly weight: 1 | 2 | 3 | 4 | 5 })[]
      }
    | {
        readonly type: 'archives'
        readonly display: 'list' | 'dropdown'
        readonly items: readonly WidgetTermItem[]
        readonly prompt: string
      }
    | {
        readonly type: 'comments'
        readonly items: readonly {
          readonly author: string
          readonly entryTitle: string
          readonly href: string | null
          readonly excerpt: string
          readonly date: string
          readonly datetime: string
        }[]
        readonly empty: string
      }
    | {
        readonly type: 'search'
        readonly action: string
        readonly label: string
        readonly placeholder: string
        readonly button: string
      }
    | { readonly type: 'social'; readonly items: readonly ChromeLink[] }
    | {
        readonly type: 'form'
        /** A form a widget cannot carry (several steps, a file, a captcha) is a link to its page. */
        readonly link: WidgetLink | null
        readonly action: string
        readonly fields: readonly WidgetFormField[]
        readonly hidden: Readonly<Record<string, string>>
        readonly honeypot: string
        readonly submit: string
      }
    | {
        readonly type: 'toc'
        readonly items: readonly {
          readonly label: string
          readonly href: string
          readonly depth: number
        }[]
      }
    | {
        readonly type: 'calendar'
        readonly caption: string
        readonly weekdays: readonly string[]
        /** Six weeks of seven days; `null` outside the month. */
        readonly weeks: readonly (readonly ({
          readonly day: number
          readonly href: string | null
          readonly label: string
        } | null)[])[]
        readonly previous: WidgetLink | null
        readonly next: WidgetLink | null
      }
  )

export interface ResolvedWidgetArea {
  readonly id: string
  readonly label: string
  readonly widgets: readonly ResolvedWidget[]
}

/** The areas of one page, by id. Absent from a host that predates `theme@1.6`. */
export type WidgetAreas = Readonly<Record<string, ResolvedWidgetArea>>

export interface RenderWidgetAreaOptions {
  /** Added to `cg-widget-area`. */
  readonly className?: string
  /** A sidebar's widget titles are `h2`; a footer column under a footer heading may want `h3`. */
  readonly headingLevel?: 'h2' | 'h3' | 'h4'
  /**
   * The page's context, when the caller has one (`renderPage` does,
   * `renderChrome` does not). Only a text widget's rich text uses it, for its
   * links; without it links are the hrefs the host already resolved.
   */
  readonly ctx?: RenderContext
}

function linkNode(link: WidgetLink, className: string, ...children: readonly Child[]): HtmlElement {
  return h(
    'a',
    {
      class: className,
      href: link.href,
      ...(link.newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {}),
      ...(link.current === true ? { 'aria-current': 'page' } : {}),
    },
    ...(children.length === 0 ? [link.label] : children),
  )
}

/** Only what rich text reads: link targets. Media nodes are not offered to a text widget. */
function linksOnlyContext(): RenderContext {
  const unsupported = (): never => {
    throw new Error('A text widget rendered without a page context cannot resolve this.')
  }
  return {
    link: (target: LinkTargetInput) => (typeof target === 'string' ? target : '#'),
    image: unsupported,
  } as unknown as RenderContext
}

function termList(items: readonly WidgetTermItem[], className: string): HtmlElement {
  return h(
    'ul',
    { class: className },
    items.map((item) =>
      h(
        'li',
        {
          class: `${className}-item`,
          'data-depth': item.depth,
          ...(item.current ? { 'aria-current': 'page' } : {}),
        },
        item.href === null
          ? h('span', { class: `${className}-label` }, item.label)
          : h('a', { class: `${className}-label`, href: item.href }, item.label),
        item.count === null ? null : h('span', { class: `${className}-count` }, String(item.count)),
      ),
    ),
  )
}

function dropdown(
  items: readonly WidgetTermItem[],
  prompt: string,
  label: string,
  id: string,
): HtmlElement {
  // A plain form that navigates with the select's value: works without any
  // script, the one exception to "a link is an <a>" a dropdown forces.
  return h(
    'form',
    { class: 'cg-widget__jump', method: 'get', action: '/_cogenta/go' },
    h('label', { class: 'cg-visually-hidden', for: `cg-widget-${id}-select` }, label),
    h(
      'select',
      { id: `cg-widget-${id}-select`, name: 'to', required: true },
      h('option', { value: '' }, prompt),
      items
        .filter((item) => item.href !== null)
        .map((item) =>
          h(
            'option',
            { value: item.href ?? '', ...(item.current ? { selected: true } : {}) },
            `${' '.repeat(item.depth)}${item.label}${item.count === null ? '' : ` (${item.count})`}`,
          ),
        ),
    ),
    h('button', { type: 'submit', class: 'cg-widget__jump-button' }, prompt === '' ? '→' : '→'),
  )
}

function body(widget: ResolvedWidget, ctx: RenderContext): Child {
  switch (widget.type) {
    case 'plugin':
      return widget.node
    case 'text':
      return h('div', { class: 'cg-widget__text' }, renderRichText(ctx, widget.body))
    case 'image': {
      const picture = renderImageSource(widget.image, {
        className: 'cg-widget__image',
        sizes: '(min-width: 64rem) 22rem, 100vw',
      })
      return h(
        'figure',
        { class: 'cg-widget__figure' },
        widget.href === null ? picture : h('a', { href: widget.href }, picture),
        widget.caption === ''
          ? null
          : h('figcaption', { class: 'cg-widget__caption' }, widget.caption),
      )
    }
    case 'gallery':
      return h(
        'ul',
        { class: 'cg-widget__gallery', 'data-columns': widget.columns },
        widget.images.map((image) =>
          h(
            'li',
            { class: 'cg-widget__gallery-item' },
            renderImageSource(image, { className: 'cg-widget__gallery-image', sizes: '12rem' }),
          ),
        ),
      )
    case 'embed':
      return h(
        'figure',
        { class: 'cg-widget__embed' },
        widget.frameSrc === null
          ? h(
              'a',
              { href: widget.url, rel: 'noopener noreferrer' },
              widget.caption === '' ? widget.url : widget.caption,
            )
          : h('iframe', {
              class: 'cg-widget__frame',
              src: widget.frameSrc,
              title: widget.caption === '' ? (widget.title ?? widget.url) : widget.caption,
              loading: 'lazy',
              allowfullscreen: true,
              referrerpolicy: 'strict-origin-when-cross-origin',
            }),
        widget.frameSrc === null || widget.caption === ''
          ? null
          : h('figcaption', { class: 'cg-widget__caption' }, widget.caption),
      )
    case 'quote':
      return h(
        'figure',
        { class: 'cg-widget__quote' },
        h('blockquote', { class: 'cg-widget__quote-text' }, h('p', {}, widget.text)),
        widget.attribution === ''
          ? null
          : h(
              'figcaption',
              { class: 'cg-widget__quote-source' },
              h('span', { class: 'cg-widget__quote-name' }, widget.attribution),
              widget.role === ''
                ? null
                : h('span', { class: 'cg-widget__quote-role' }, widget.role),
            ),
      )
    case 'cta':
      return h(
        'div',
        { class: 'cg-widget__cta' },
        h('p', { class: 'cg-widget__cta-heading' }, widget.heading),
        widget.body === '' ? null : h('p', { class: 'cg-widget__cta-body' }, widget.body),
        linkNode(widget.action, 'cg-widget__cta-action'),
      )
    case 'links':
      return h(
        'ul',
        { class: 'cg-widget__links' },
        widget.items.map((item) =>
          h('li', { class: 'cg-widget__links-item' }, linkNode(item, 'cg-widget__link')),
        ),
      )
    case 'contact':
      return h(
        'div',
        { class: 'cg-widget__contact' },
        widget.address === ''
          ? null
          : h(
              'p',
              { class: 'cg-widget__contact-line', 'data-kind': 'address' },
              renderIcon('map-pin', { className: 'cg-widget__icon', size: 16 }),
              h('span', {}, widget.address),
            ),
        widget.phone === ''
          ? null
          : h(
              'p',
              { class: 'cg-widget__contact-line', 'data-kind': 'phone' },
              renderIcon('phone', { className: 'cg-widget__icon', size: 16 }),
              h('a', { href: `tel:${widget.phone.replace(/[^+\d]/gu, '')}` }, widget.phone),
            ),
        widget.email === ''
          ? null
          : h(
              'p',
              { class: 'cg-widget__contact-line', 'data-kind': 'email' },
              renderIcon('mail', { className: 'cg-widget__icon', size: 16 }),
              h('a', { href: `mailto:${widget.email}` }, widget.email),
            ),
        widget.hours.length === 0
          ? null
          : h(
              'dl',
              { class: 'cg-widget__hours' },
              widget.hours.map((row) => [
                h('dt', { class: 'cg-widget__hours-label' }, row.label),
                h('dd', { class: 'cg-widget__hours-value' }, row.value),
              ]),
            ),
      )
    case 'about':
      return h(
        'div',
        { class: 'cg-widget__about' },
        widget.image === null
          ? null
          : renderImageSource(widget.image, {
              className: 'cg-widget__about-image',
              sizes: '22rem',
            }),
        widget.heading === ''
          ? null
          : h('p', { class: 'cg-widget__about-heading' }, widget.heading),
        h('p', { class: 'cg-widget__about-body' }, widget.body),
        widget.link === null ? null : linkNode(widget.link, 'cg-widget__about-link'),
      )
    case 'entries':
      if (widget.items.length === 0) return h('p', { class: 'cg-widget__empty' }, widget.empty)
      return h(
        'ol',
        { class: 'cg-widget__entries', 'data-variant': widget.variant },
        widget.items.map((item) =>
          h(
            'li',
            { class: 'cg-widget__entry', 'data-image': item.image === null ? 'none' : 'image' },
            item.image === null
              ? null
              : renderImageSource(item.image, {
                  className: 'cg-widget__entry-image',
                  sizes: '5rem',
                }),
            h(
              'div',
              { class: 'cg-widget__entry-text' },
              item.href === null
                ? h('span', { class: 'cg-widget__entry-title' }, item.title)
                : h('a', { class: 'cg-widget__entry-title', href: item.href }, item.title),
              item.date === null || item.datetime === null
                ? null
                : h('time', { class: 'cg-widget__entry-date', datetime: item.datetime }, item.date),
              item.excerpt === null
                ? null
                : h('p', { class: 'cg-widget__entry-excerpt' }, item.excerpt),
            ),
          ),
        ),
      )
    case 'terms':
      return widget.display === 'dropdown'
        ? dropdown(widget.items, widget.prompt, widget.title ?? widget.prompt, widget.id)
        : termList(widget.items, 'cg-widget__terms')
    case 'tagCloud':
      return h(
        'ul',
        { class: 'cg-widget__cloud' },
        widget.items.map((item) =>
          h(
            'li',
            { class: 'cg-widget__cloud-item', 'data-weight': item.weight },
            item.href === null
              ? h('span', {}, item.label)
              : h(
                  'a',
                  { href: item.href, ...(item.current ? { 'aria-current': 'page' } : {}) },
                  item.label,
                ),
            item.count === null
              ? null
              : h('span', { class: 'cg-widget__cloud-count' }, String(item.count)),
          ),
        ),
      )
    case 'archives':
      return widget.display === 'dropdown'
        ? dropdown(widget.items, widget.prompt, widget.title ?? widget.prompt, widget.id)
        : termList(widget.items, 'cg-widget__archives')
    case 'comments':
      if (widget.items.length === 0) return h('p', { class: 'cg-widget__empty' }, widget.empty)
      return h(
        'ol',
        { class: 'cg-widget__comments' },
        widget.items.map((item) =>
          h(
            'li',
            { class: 'cg-widget__comment' },
            h('span', { class: 'cg-widget__comment-author' }, item.author),
            ' ',
            item.href === null
              ? h('span', { class: 'cg-widget__comment-entry' }, item.entryTitle)
              : h('a', { class: 'cg-widget__comment-entry', href: item.href }, item.entryTitle),
            h('p', { class: 'cg-widget__comment-excerpt' }, item.excerpt),
            h('time', { class: 'cg-widget__comment-date', datetime: item.datetime }, item.date),
          ),
        ),
      )
    case 'search':
      return h(
        'form',
        { class: 'cg-widget__search', role: 'search', method: 'get', action: widget.action },
        h('label', { class: 'cg-visually-hidden', for: `cg-widget-${widget.id}-q` }, widget.label),
        h('input', {
          id: `cg-widget-${widget.id}-q`,
          class: 'cg-widget__search-input',
          type: 'search',
          name: 'q',
          placeholder: widget.placeholder,
          required: true,
        }),
        h('button', { class: 'cg-widget__search-button', type: 'submit' }, widget.button),
      )
    case 'social':
      return renderSocialLinks(widget.items, {
        className: 'cg-widget__social cg-social',
        itemClassName: 'cg-widget__social-item',
      })
    case 'form':
      if (widget.link !== null) return linkNode(widget.link, 'cg-widget__form-link')
      return h(
        'form',
        { class: 'cg-widget__form cg-form', method: 'post', action: widget.action },
        widget.fields.map((field) => formField(widget.id, field)),
        Object.entries(widget.hidden).map(([name, value]) =>
          h('input', { type: 'hidden', name, value }),
        ),
        h(
          'div',
          { class: 'cg-form__honeypot', 'aria-hidden': 'true' },
          h('label', { for: `cg-widget-${widget.id}-hp` }, 'Leave this field empty'),
          h('input', {
            type: 'text',
            id: `cg-widget-${widget.id}-hp`,
            name: widget.honeypot,
            tabindex: '-1',
            autocomplete: 'off',
            value: '',
          }),
        ),
        h('button', { class: 'cg-widget__form-submit', type: 'submit' }, widget.submit),
      )
    case 'toc':
      return h(
        'ol',
        { class: 'cg-widget__toc' },
        widget.items.map((item) =>
          h(
            'li',
            { class: 'cg-widget__toc-item', 'data-depth': item.depth },
            h('a', { href: item.href }, item.label),
          ),
        ),
      )
    case 'calendar':
      return h(
        'div',
        { class: 'cg-widget__calendar' },
        h(
          'table',
          { class: 'cg-widget__calendar-table' },
          h('caption', {}, widget.caption),
          h(
            'thead',
            {},
            h(
              'tr',
              {},
              widget.weekdays.map((day) => h('th', { scope: 'col', abbr: day }, day.slice(0, 2))),
            ),
          ),
          h(
            'tbody',
            {},
            widget.weeks.map((week) =>
              h(
                'tr',
                {},
                week.map((cell) =>
                  cell === null
                    ? h('td', { class: 'cg-widget__calendar-pad' })
                    : h(
                        'td',
                        { ...(cell.href === null ? {} : { 'data-posts': 'true' }) },
                        cell.href === null
                          ? String(cell.day)
                          : h('a', { href: cell.href, 'aria-label': cell.label }, String(cell.day)),
                      ),
                ),
              ),
            ),
          ),
        ),
        widget.previous === null && widget.next === null
          ? null
          : h(
              'p',
              { class: 'cg-widget__calendar-nav' },
              widget.previous === null
                ? null
                : linkNode(widget.previous, 'cg-widget__calendar-previous'),
              widget.next === null ? null : linkNode(widget.next, 'cg-widget__calendar-next'),
            ),
      )
  }
}

function formField(widgetId: string, field: WidgetFormField): HtmlElement {
  const id = `cg-widget-${widgetId}-${field.name}`
  const common = { id, name: field.name, ...(field.required ? { required: true } : {}) }
  let control: HtmlElement
  if (field.kind === 'textarea') {
    control = h('textarea', { ...common, rows: 4 })
  } else if (field.kind === 'select') {
    control = h(
      'select',
      common,
      h('option', { value: '' }, ''),
      field.choices.map((choice) => h('option', { value: choice }, choice)),
    )
  } else if (field.kind === 'checkbox') {
    return h(
      'div',
      { class: 'cg-form__field', 'data-kind': 'checkbox' },
      h(
        'label',
        { for: id },
        h('input', { ...common, type: 'checkbox', value: 'true' }),
        ' ',
        field.label,
      ),
    )
  } else {
    control = h('input', { ...common, type: field.kind })
  }
  return h(
    'div',
    { class: 'cg-form__field', 'data-kind': field.kind },
    h('label', { for: id }, field.label),
    control,
    field.help === null ? null : h('p', { class: 'cg-form__help' }, field.help),
  )
}

/** Whether an area has anything to show on this page. */
export function hasWidgets(area: ResolvedWidgetArea | undefined): area is ResolvedWidgetArea {
  return area !== undefined && area.widgets.length > 0
}

/**
 * One area as an `<aside>`, or `null` when it holds nothing on this page, so
 * a theme can decide its layout on the return value (no sidebar column when
 * there is no sidebar).
 */
export function renderWidgetArea(
  area: ResolvedWidgetArea | undefined,
  options: RenderWidgetAreaOptions = {},
): HtmlElement | null {
  if (!hasWidgets(area)) return null
  const level = options.headingLevel ?? 'h2'
  const ctx = options.ctx ?? linksOnlyContext()
  return h(
    'aside',
    {
      class:
        options.className === undefined ? 'cg-widget-area' : `cg-widget-area ${options.className}`,
      'data-area': area.id,
      'aria-label': area.label,
    },
    area.widgets.map((widget) =>
      h(
        'section',
        {
          // The plugin's own type name, not the literal `plugin`: a theme
          // styles `cg-widget--openingHours` the way it styles any other.
          class: `cg-widget cg-widget--${widget.type === 'plugin' ? widget.widgetType : widget.type}`,
          'data-widget-id': widget.id,
          ...(widget.devices.desktop ? {} : { 'data-hide-desktop': 'true' }),
          ...(widget.devices.tablet ? {} : { 'data-hide-tablet': 'true' }),
          ...(widget.devices.mobile ? {} : { 'data-hide-mobile': 'true' }),
        },
        widget.title === null ? null : h(level, { class: 'cg-widget__title' }, widget.title),
        h('div', { class: 'cg-widget__body' }, body(widget, ctx)),
      ),
    ),
  )
}

/** The footer's widget columns, in order, as one row; `null` when every column is empty. */
export function renderFooterWidgets(
  areas: WidgetAreas | undefined,
  options: { readonly className?: string; readonly headingLevel?: 'h2' | 'h3' | 'h4' } = {},
): HtmlElement | null {
  if (areas === undefined) return null
  const columns = ['footer-1', 'footer-2', 'footer-3', 'footer-4']
    .map((id) => areas[id])
    .filter(hasWidgets)
  if (columns.length === 0) return null
  return h(
    'div',
    {
      class:
        options.className === undefined
          ? 'cg-footer-widgets'
          : `cg-footer-widgets ${options.className}`,
      'data-columns': columns.length,
    },
    columns.map((area) =>
      renderWidgetArea(area, {
        headingLevel: options.headingLevel ?? 'h2',
        className: 'cg-footer-widgets__column',
      }),
    ),
  )
}
