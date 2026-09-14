import type { CollectionListBlock } from '@cogenta/blocks'
import {
  buildCollectionListQuery,
  type ContentEntry,
  type HeadingTag,
  type HtmlElement,
  h,
  nestedHeadingTag,
  type RenderContext,
} from '@cogenta/theme-kit'
import { section, sectionHead } from '../layout.js'
import { renderStory, type Story, storyFromEntry } from '../story.js'

export { buildCollectionListQuery as query }

/**
 * A listing, set in one of four newspaper forms chosen from what the editor
 * already decided in contract B (the layout, and whether the list has a
 * title), never from a setting this theme invents:
 *
 * - `grid` without a title is **the front**: the first story across eight
 *   columns with its photograph, a column of three briefs beside it behind a
 *   vertical rule, and every further story in a row of four below, divided
 *   by hairlines. This is the opening of a front page.
 * - `grid` with a title is **a rail**: the section label on a heavy rule,
 *   its newest story large with a photograph, and the rest as a column of
 *   headlines beside it.
 * - `carousel` is **a strip**: stories side by side between column rules,
 *   scrolling on a narrow screen. It is how the opinion columns are set,
 *   with the columnist's name in the kicker.
 * - `list` is **a ranked list**: numbered, the numerals in the display face,
 *   side by side on a wide screen.
 *
 * An empty list keeps its head and says so in one line.
 */

const FRONT_BRIEFS = 3

function frontStories(stories: readonly Story[], tag: HeadingTag): HtmlElement {
  const [lead, ...others] = stories
  const briefs = others.slice(0, FRONT_BRIEFS)
  const more = others.slice(FRONT_BRIEFS)
  return h(
    'div',
    { class: 'cg-front', 'data-briefs': String(briefs.length), 'data-more': String(more.length) },
    lead === undefined
      ? null
      : h(
          'div',
          { class: 'cg-front__lead' },
          renderStory(lead, {
            tag,
            variant: 'lead',
            image: true,
            standfirst: true,
            sizes: '(min-width: 64rem) 52rem, 100vw',
            loading: 'eager',
          }),
        ),
    briefs.length === 0
      ? null
      : h(
          'ul',
          { class: 'cg-front__briefs' },
          briefs.map((story) =>
            h(
              'li',
              { class: 'cg-front__brief' },
              renderStory(story, { tag, variant: 'brief', standfirst: true }),
            ),
          ),
        ),
    more.length === 0
      ? null
      : h(
          'ul',
          { class: 'cg-front__more' },
          more.map((story) =>
            h(
              'li',
              { class: 'cg-front__item' },
              renderStory(story, {
                tag,
                variant: 'secondary',
                image: true,
                sizes: '(min-width: 64rem) 18rem, (min-width: 40rem) 45vw, 100vw',
              }),
            ),
          ),
        ),
  )
}

function railStories(stories: readonly Story[], tag: HeadingTag): HtmlElement {
  const [lead, ...others] = stories
  return h(
    'div',
    { class: 'cg-rail', 'data-count': String(stories.length) },
    lead === undefined
      ? null
      : h(
          'div',
          { class: 'cg-rail__lead' },
          renderStory(lead, {
            tag,
            variant: 'rail',
            image: true,
            standfirst: true,
            date: true,
            sizes: '(min-width: 64rem) 34rem, 100vw',
          }),
        ),
    others.length === 0
      ? null
      : h(
          'ul',
          { class: 'cg-rail__list' },
          others.map((story) =>
            h(
              'li',
              { class: 'cg-rail__item' },
              renderStory(story, {
                tag,
                variant: 'column',
                image: true,
                standfirst: true,
                date: true,
                sizes: '(min-width: 64rem) 9rem, 30vw',
              }),
            ),
          ),
        ),
  )
}

function stripStories(
  stories: readonly Story[],
  tag: HeadingTag,
  label: string,
  count: number,
): HtmlElement {
  return h(
    'div',
    {
      class: 'cg-strip',
      role: 'region',
      'aria-label': label,
      tabindex: '0',
      'data-count': String(Math.min(count, 4)),
    },
    h(
      'ul',
      { class: 'cg-strip__items' },
      stories.map((story) =>
        h(
          'li',
          { class: 'cg-strip__item' },
          renderStory(story, { tag, variant: 'strip', standfirst: true }),
        ),
      ),
    ),
  )
}

function rankedStories(stories: readonly Story[], tag: HeadingTag): HtmlElement {
  return h(
    'ol',
    { class: 'cg-ranked', 'data-count': String(Math.min(stories.length, 5)) },
    stories.map((story, index) =>
      h(
        'li',
        { class: 'cg-ranked__item' },
        renderStory(story, { tag, variant: 'ranked', numeral: String(index + 1) }),
      ),
    ),
  )
}

export function renderCollectionList(
  block: CollectionListBlock,
  ctx: RenderContext,
  entries: readonly ContentEntry[],
): HtmlElement {
  const titled = block.title !== undefined
  const tag = nestedHeadingTag('collectionList', titled)
  const form =
    block.layout === 'grid'
      ? titled
        ? 'rail'
        : 'front'
      : block.layout === 'carousel'
        ? 'strip'
        : 'ranked'
  const imageWidth = form === 'front' ? 1200 : form === 'rail' ? 800 : 480
  const stories = entries.map((entry) => storyFromEntry(entry, ctx, imageWidth))

  const body =
    stories.length === 0
      ? h('p', { class: 'cg-empty' }, ctx.t('collection.empty'))
      : form === 'front'
        ? frontStories(stories, tag)
        : form === 'rail'
          ? railStories(stories, tag)
          : form === 'strip'
            ? stripStories(
                stories,
                tag,
                block.title ?? ctx.t('collection.carousel'),
                stories.length,
              )
            : rankedStories(stories, tag)

  return section(
    'section',
    'collectionList',
    'cg-listing',
    { 'data-layout': block.layout, 'data-form': form },
    'div',
    sectionHead('collectionList', block.title),
    body,
  )
}
