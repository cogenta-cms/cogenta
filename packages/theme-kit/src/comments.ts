import { type Attributes, type HtmlElement, h, text } from './html.js'
import { createThemeTranslator } from './strings.js'

/**
 * The comment thread and its submission form (fiche 15 task 6, ADR-0025).
 *
 * Contract B is frozen and a `comments` block would be a contract addition —
 * this renders through the page template instead, called from the CLI's own
 * render path (`packages/cli/src/commands/theme-render.ts`), appended after
 * the page's own `<main>` rather than folded into it — never on the L16
 * page-builder preview, deliberately: the form's own `_ts` anti-spam field is
 * a render timestamp, legitimately different on every render, so it cannot
 * be part of a fidelity claim that compares two separate renders byte for
 * byte.
 *
 * Every piece of visitor-authored text — `authorName`, `body` — goes through
 * this file's `h()`/`text()` tree, never a template string: there is no
 * `raw()` escape hatch in `html.ts` (see its own module comment), which is
 * what makes "no HTML submitted by a visitor ever reaches the rendered page"
 * a structural property of this function rather than a habit to remember —
 * and, since this module is shared, a property every theme package gets for
 * free rather than one it has to reimplement correctly on its own.
 *
 * Every word a visitor reads comes from `THEME_STRINGS` in the page's own
 * language, and the date is written the way that language writes it: the
 * section was English on every French site until the L36 audit.
 */

export interface PublicComment {
  readonly id: string
  readonly parentId: string | null
  readonly authorName: string
  readonly authorUrl: string | null
  /** Plain text (R3) — rendered as-is inside a `<p>`, never interpreted as markup. */
  readonly body: string
  readonly createdAt: string
}

export interface CommentsSectionOptions {
  readonly comments: readonly PublicComment[]
  /** Whether this entry currently accepts new comments (settings inheritance already resolved by the caller). */
  readonly open: boolean
  /** `POST` target — `/api/comments` in every real deployment, parameterised so a test can point elsewhere. */
  readonly action: string
  readonly collection: string
  readonly entryId: string
  readonly locale: string | null
  /** The page's own path, echoed back as `redirectTo` so a no-JS submission returns here (`CommentsRouter`'s 303 branch) instead of showing raw JSON. */
  readonly pagePath: string
  /** The hidden field a bot fills and a human never sees. Must match the router's own `honeypotField` (defaults to `website` on both sides). */
  readonly honeypotField?: string
  /** Server time this page was rendered, ms since epoch — the minimum-fill-delay hidden field. */
  readonly renderedAt: number
  /**
   * What happened to the comment this visitor just sent, read from the
   * `?comment=` the comments router redirects back with. Absent: nothing was
   * just sent. A comment held as spam reads `pending`, never a distinct
   * notice — telling a bot what tripped it is what the router avoids too.
   */
  readonly notice?: CommentNotice
  /** The page's translator, with the theme's own overrides; built from `locale` when absent. */
  readonly t?: (key: string, values?: Readonly<Record<string, string | number>>) => string
}

export type CommentNotice = 'approved' | 'pending' | 'invalid' | 'rateLimited' | 'closed' | 'error'

/**
 * The notice for a redirect's `?comment=` and `&reason=`, or `undefined` when
 * the query names nothing this section knows. The reason is an error code of
 * `@cogenta/comments`; a code that would teach a bot something (a tripped
 * honeypot, a form sent too fast) reads as the generic error.
 */
export function commentNoticeFor(
  outcome: string | null,
  reason: string | null,
): CommentNotice | undefined {
  switch (outcome) {
    case 'approved':
      return 'approved'
    case 'pending':
    case 'spam':
      return 'pending'
    case 'error':
      break
    default:
      return undefined
  }
  switch (reason) {
    case 'COMMENT_BODY_INVALID':
      return 'invalid'
    case 'COMMENT_RATE_LIMITED':
      return 'rateLimited'
    case 'COMMENT_TARGET_CLOSED':
      return 'closed'
    default:
      return 'error'
  }
}

interface CommentNode extends PublicComment {
  readonly replies: readonly CommentNode[]
}

function buildTree(comments: readonly PublicComment[]): readonly CommentNode[] {
  const byParent = new Map<string | null, PublicComment[]>()
  for (const comment of comments) {
    const bucket = byParent.get(comment.parentId) ?? []
    bucket.push(comment)
    byParent.set(comment.parentId, bucket)
  }
  function attach(parentId: string | null): CommentNode[] {
    return (byParent.get(parentId) ?? []).map((comment) => ({
      ...comment,
      replies: attach(comment.id),
    }))
  }
  return attach(null)
}

function renderComment(node: CommentNode, locale: string): HtmlElement {
  return h(
    'li',
    { class: 'cg-comment', id: `comment-${node.id}` },
    h(
      'article',
      {},
      h(
        'header',
        { class: 'cg-comment__meta' },
        h('span', { class: 'cg-comment__author' }, text(node.authorName)),
        h(
          'time',
          { class: 'cg-comment__date', datetime: node.createdAt },
          text(formatDate(node.createdAt, locale)),
        ),
      ),
      h('p', { class: 'cg-comment__body' }, text(node.body)),
    ),
    node.replies.length === 0
      ? null
      : h(
          'ol',
          { class: 'cg-comment__replies' },
          node.replies.map((reply) => renderComment(reply, locale)),
        ),
  )
}

/** `12 March 2026` / `12 mars 2026` — a date is read in the page's language, not the server's. */
function formatDate(iso: string, locale: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  try {
    return date.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' })
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

function hidden(name: string, value: string): HtmlElement {
  return h('input', { type: 'hidden', name, value })
}

/** The submission form — a plain HTML `<form method="post">`, no JavaScript required (fiche 15 task 6). */
function renderForm(
  options: CommentsSectionOptions,
  t: NonNullable<CommentsSectionOptions['t']>,
  parentId?: string,
): HtmlElement {
  const honeypot = options.honeypotField ?? 'website'
  const formId = parentId === undefined ? 'cg-comment-form' : `cg-comment-form-${parentId}`
  return h(
    'form',
    {
      id: formId,
      class: 'cg-comment__form',
      method: 'post',
      action: options.action,
    },
    hidden('collection', options.collection),
    hidden('entryId', options.entryId),
    ...(options.locale === null ? [] : [hidden('locale', options.locale)]),
    ...(parentId === undefined ? [] : [hidden('parentId', parentId)]),
    hidden('redirectTo', options.pagePath),
    hidden('_ts', String(options.renderedAt)),
    // The honeypot: a real visitor never sees or fills this in. Hidden by an
    // attribute a theme's own stylesheet never has to know about — the
    // element is not `type="hidden"` on purpose, so a bot's naive "fill
    // every input" script still finds and fills it.
    h(
      'div',
      { class: 'cg-comment__honeypot', 'aria-hidden': 'true' as unknown as boolean },
      h('label', { for: `${formId}-hp` }, text(t('form.honeypot'))),
      h('input', {
        id: `${formId}-hp`,
        type: 'text',
        name: honeypot,
        tabindex: -1,
        autocomplete: 'off',
      }),
    ),
    h(
      'p',
      {},
      h('label', { for: `${formId}-name` }, text(t('comments.name'))),
      h('input', {
        id: `${formId}-name`,
        type: 'text',
        name: 'name',
        required: true,
        maxlength: 200,
      }),
    ),
    h(
      'p',
      {},
      h('label', { for: `${formId}-email` }, text(t('comments.email'))),
      h('input', { id: `${formId}-email`, type: 'email', name: 'email', required: true }),
    ),
    h(
      'p',
      {},
      h('label', { for: `${formId}-url` }, text(t('comments.website'))),
      h('input', { id: `${formId}-url`, type: 'url', name: 'authorUrl' }),
    ),
    h(
      'p',
      {},
      h(
        'label',
        { for: `${formId}-body` },
        text(t(parentId === undefined ? 'comments.body' : 'comments.replyBody')),
      ),
      h('textarea', { id: `${formId}-body`, name: 'body', required: true, rows: 5 }),
    ),
    h(
      'p',
      {},
      h(
        'button',
        { type: 'submit' },
        text(t(parentId === undefined ? 'comments.submit' : 'comments.submitReply')),
      ),
    ),
  )
}

/**
 * The whole section: heading, thread, and — only when `open` — the form.
 * Returned as an `HtmlElement`, appended by the caller after the page's own
 * `<main>`, never inside it — a comment thread is not page content, it is a
 * property of the route the same way `/search`'s results are.
 */
export function renderCommentsSection(options: CommentsSectionOptions): HtmlElement {
  const locale = options.locale ?? 'en'
  const t = options.t ?? createThemeTranslator(locale)
  const tree = buildTree(options.comments)
  const headingAttrs: Attributes = { id: 'cg-comments-heading' }
  const notice = options.notice
  return h(
    'section',
    // `id` is where the comments router sends a visitor back after sending,
    // so the notice below is on screen rather than a page's length away.
    { id: 'cg-comments', class: 'cg-comments', 'aria-labelledby': 'cg-comments-heading' },
    h('h2', headingAttrs, text(t('comments.heading', { count: options.comments.length }))),
    notice === undefined
      ? null
      : h(
          'p',
          {
            class: `cg-comments__notice cg-comments__notice--${notice}`,
            role: notice === 'approved' || notice === 'pending' ? 'status' : 'alert',
          },
          text(t(`comments.notice.${notice}`)),
        ),
    tree.length === 0
      ? h('p', { class: 'cg-comments__empty' }, text(t('comments.empty')))
      : h(
          'ol',
          { class: 'cg-comments__list' },
          tree.map((node) => renderComment(node, locale)),
        ),
    options.open
      ? renderForm(options, t)
      : h('p', { class: 'cg-comments__closed' }, text(t('comments.closed'))),
  )
}
