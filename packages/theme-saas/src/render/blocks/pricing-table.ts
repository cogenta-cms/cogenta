import type { PricingTableBlock, PricingTier } from '@cogenta/blocks'
import {
  actionLink,
  type HeadingTag,
  type HtmlElement,
  h,
  heading,
  nestedHeadingTag,
  type RenderContext,
} from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'
import { word } from '../strings.js'

/**
 * Plans, compared in a ruled table rather than floated as cards.
 *
 * Contract B gives each plan a free list of feature lines. This theme reads
 * two kinds of line out of it, without asking an editor for anything new:
 *
 * - `Label: value` ("Approvers: Up to 25", "Audit history: 7 years") is a
 *   row of the comparison, with that plan's value in its column;
 * - any other line ("Signed audit exports") is a row too, checked in the
 *   columns of the plans that list it and marked absent in the others.
 *
 * When at least two rows are shared by at least two plans (the plans really
 * are the same product at different limits), the block renders as a
 * **comparison**: the plans across the top (name, price, what the price
 * covers, the action) and one semantic `<table>` under them, a row header per
 * line, hairlines between rows, figures in tabular numerals, check marks
 * drawn by the stylesheet with the words "Included" and "Not included" kept
 * for assistive technology. The plans above and the table below are laid on
 * one column definition (`--cs-label-column`, then equal plan columns): the
 * plans' grid tracks and the table's `<col>` widths are both read from it, so
 * each plan's rules run on into its column of values without a jog.
 *
 * Otherwise (plans with nothing in common, more than four plans) each plan
 * becomes a ruled column with its own list, which is the honest reading of
 * lists that cannot be compared.
 *
 * `highlighted` is an editorial emphasis, marked typographically: a small
 * "Recommended" label in Geist Mono above the plan's name and a rule in ink
 * over its column instead of a hairline. No ribbon, no raised card, no tinted
 * background.
 */

interface Row {
  readonly label: string
  /** One cell per tier: a value, `true` for a plain line the tier lists, `false` for one it does not. */
  readonly cells: readonly (string | boolean)[]
}

const PAIR = /^([^:]{1,48}):\s+(.+)$/

function parseLine(line: string): { readonly key: string; readonly value: string | true } {
  const match = PAIR.exec(line.trim())
  if (match === null) return { key: line.trim(), value: true }
  return { key: (match[1] as string).trim(), value: (match[2] as string).trim() }
}

/** The comparison rows, in the order lines first appear, or `null` when the plans cannot be compared. */
export function comparisonRows(tiers: readonly PricingTier[]): readonly Row[] | null {
  if (tiers.length < 2 || tiers.length > 4) return null
  const order: string[] = []
  const values = tiers.map((tier) => {
    const byKey = new Map<string, string | true>()
    for (const line of tier.features) {
      const { key, value } = parseLine(line)
      if (!order.includes(key)) order.push(key)
      byKey.set(key, value)
    }
    return byKey
  })
  const rows = order.map(
    (key): Row => ({ label: key, cells: values.map((byKey) => byKey.get(key) ?? false) }),
  )
  const shared = rows.filter((row) => row.cells.filter((cell) => cell !== false).length >= 2)
  return shared.length >= 2 ? rows : null
}

function plan(
  tier: PricingTier,
  ctx: RenderContext,
  tag: HeadingTag,
  withList: boolean,
): HtmlElement {
  const highlighted = tier.highlighted === true
  return h(
    'li',
    { class: 'cs-plan', 'data-highlighted': highlighted ? 'true' : 'false' },
    // Every plan keeps the label's line, empty when it is not recommended, so
    // the names and prices of all plans stay on one baseline.
    h(
      'span',
      { class: 'cs-plan__flag', 'aria-hidden': highlighted ? undefined : 'true' },
      highlighted ? word(ctx.locale, 'recommended') : '',
    ),
    heading(tag, { class: 'cs-plan__name' }, tier.name),
    h(
      'p',
      { class: 'cs-plan__price' },
      h('span', { class: 'cs-plan__amount' }, tier.price),
      tier.interval === undefined ? null : h('span', { class: 'cs-plan__interval' }, tier.interval),
    ),
    withList && tier.features.length > 0
      ? h(
          'ul',
          { class: 'cs-plan__features' },
          tier.features.map((feature) => h('li', { class: 'cs-plan__feature' }, feature)),
        )
      : null,
    tier.action === undefined
      ? null
      : h('div', { class: 'cs-plan__action' }, actionLink(ctx, tier.action)),
  )
}

function cell(value: string | boolean, ctx: RenderContext): HtmlElement {
  if (value === true) {
    return h(
      'td',
      { class: 'cs-compare__cell', 'data-value': 'included' },
      h('span', { class: 'cs-compare__check', 'aria-hidden': 'true' }),
      h('span', { class: 'cg-visually-hidden' }, word(ctx.locale, 'included')),
    )
  }
  if (value === false) {
    return h(
      'td',
      { class: 'cs-compare__cell', 'data-value': 'none' },
      h('span', { class: 'cs-compare__none', 'aria-hidden': 'true' }),
      h('span', { class: 'cg-visually-hidden' }, word(ctx.locale, 'notIncluded')),
    )
  }
  return h('td', { class: 'cs-compare__cell', 'data-value': 'text' }, value)
}

export function renderPricingTable(block: PricingTableBlock, ctx: RenderContext): HtmlElement {
  const titled = block.title !== undefined
  const tag = nestedHeadingTag('pricingTable', titled)
  const rows = comparisonRows(block.tiers)
  const compare = rows !== null
  const highlightedIndex = block.tiers.findIndex((tier) => tier.highlighted === true)

  const plans = h(
    'ul',
    { class: 'cs-pricing__plans', 'aria-label': word(ctx.locale, 'plans') },
    block.tiers.map((tier) => plan(tier, ctx, tag, !compare)),
  )

  const table =
    rows === null
      ? null
      : h(
          'div',
          {
            class: 'cs-compare',
            // Scrolls sideways on a narrow screen: a named, focusable region,
            // so a keyboard can scroll it too.
            role: 'region',
            'aria-label': block.title ?? word(ctx.locale, 'compare'),
            tabindex: 0,
          },
          h(
            'table',
            { class: 'cs-compare__table' },
            h(
              'caption',
              { class: 'cg-visually-hidden' },
              block.title ?? word(ctx.locale, 'compare'),
            ),
            // The table's columns are declared here, not guessed from its
            // first row: the label column takes the width the plans above
            // leave to the section title, and the plan columns share the rest
            // equally, exactly as the plans do.
            h(
              'colgroup',
              {},
              h('col', { class: 'cs-compare__col', 'data-column': 'label' }),
              block.tiers.map(() => h('col', { class: 'cs-compare__col', 'data-column': 'plan' })),
            ),
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                h('th', { scope: 'col', class: 'cs-compare__corner' }, word(ctx.locale, 'feature')),
                block.tiers.map((tier, index) =>
                  h(
                    'th',
                    {
                      scope: 'col',
                      class: 'cs-compare__tier',
                      'data-highlighted': index === highlightedIndex ? 'true' : 'false',
                    },
                    tier.name,
                  ),
                ),
              ),
            ),
            h(
              'tbody',
              {},
              rows.map((row) =>
                h(
                  'tr',
                  { class: 'cs-compare__row' },
                  h('th', { scope: 'row', class: 'cs-compare__label' }, row.label),
                  row.cells.map((value) => cell(value, ctx)),
                ),
              ),
            ),
          ),
        )

  return section(
    'section',
    'pricingTable',
    'cs-pricing',
    {
      'data-shape': compare ? 'compare' : 'columns',
      'data-count': String(Math.min(block.tiers.length, 4)),
      'data-titled': String(titled),
    },
    'div',
    h(
      'div',
      { class: 'cs-pricing__top' },
      titled
        ? h('div', { class: 'cs-pricing__lead' }, sectionHead('pricingTable', block.title))
        : null,
      plans,
    ),
    table,
  )
}
