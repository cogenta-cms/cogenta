import { type JSX, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ApiError } from '../api/client.js'
import {
  bulkSetCommentStatus,
  COMMENT_STATUSES,
  type Comment,
  type CommentCounts,
  type CommentStatus,
  getCommentCounts,
  listComments,
  purgeComment,
  replyToComment,
  setCommentStatus,
} from '../api/comments-client.js'
import { ModerationCheck } from '../assist/moderation-check.js'
import { useAuth } from '../auth/auth-context.js'
import { entryRefKey, useEntryTitles } from '../lib/use-entry-titles.js'
import { useSchema } from '../schema/schema-context.js'
import { useDateTimeFormatter } from '../settings/site-settings-context.js'
import { useRefreshChromeStatus } from '../shell/shell-status-context.js'
import { cn } from '../ui/cn.js'
import {
  Button,
  Card,
  CardBody,
  Field,
  Input,
  Notice,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
} from '../ui/index.js'

/**
 * Fiche 15 task 3 — the moderation queue. Tabs with counters, bulk actions,
 * per-row actions, search and filters, and reply-from-the-admin (published
 * as the signed-in account). Task 4's assisted moderation is `ModerationCheck`
 * (`../assist/moderation-check.tsx`), the exact same component the entry
 * editor already uses for a comment body — reused verbatim rather than a
 * second decision path, per the fiche's own instruction.
 *
 * Every write here calls `@cogenta/comments`'s own router
 * (`comments-client.ts`), which checks contract F's permission vocabulary
 * (`comments.moderate`, `comments.reply`, `comments.purge`) itself — this
 * screen only decides what to *offer*, never what to *allow* (R4).
 */

const TABS = COMMENT_STATUSES
const PAGE_SIZE = 20

function excerpt(body: string, max = 140): string {
  const trimmed = body.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

export function CommentsRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const refreshChromeStatus = useRefreshChromeStatus()
  const formatDateTime = useDateTimeFormatter()
  const schema = useSchema()

  const [tab, setTab] = useState<CommentStatus>('pending')
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<readonly Comment[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState<CommentCounts | null>(null)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [replyTarget, setReplyTarget] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [paging, setPaging] = useState({ key: '', page: 0 })
  const requestGeneration = useRef(0)
  const entryTitles = useEntryTitles(token, items)
  const filterKey = JSON.stringify([tab, search])
  const pageIndex = paging.key === filterKey ? paging.page : 0
  useEffect(() => {
    setPaging((current) => (current.key === filterKey ? current : { key: filterKey, page: 0 }))
  }, [filterKey])
  const pager = (
    <Pagination
      variant="pages"
      page={pageIndex}
      pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
      onPageChange={(page) => setPaging({ key: filterKey, page })}
      loading={loading || busy}
      previousLabel={t('lists.previous')}
      nextLabel={t('lists.next')}
      pageInfo={t('lists.pageInfo', {
        from: total === 0 ? 0 : pageIndex * PAGE_SIZE + 1,
        to: pageIndex * PAGE_SIZE + items.length,
        total,
      })}
    />
  )

  const load = useCallback(async () => {
    if (token === null) return
    const generation = ++requestGeneration.current
    setLoading(true)
    try {
      const [page, freshCounts] = await Promise.all([
        listComments(token, {
          status: tab,
          limit: PAGE_SIZE,
          offset: pageIndex * PAGE_SIZE,
          ...(search.trim() === '' ? {} : { q: search.trim() }),
        }),
        getCommentCounts(token),
      ])
      if (generation !== requestGeneration.current) return
      setTotal(page.total)
      const lastPage = Math.max(0, Math.ceil(page.total / PAGE_SIZE) - 1)
      if (pageIndex > lastPage) {
        setPaging({ key: filterKey, page: lastPage })
        return
      }
      setItems(page.items)
      setCounts(freshCounts)
      setSelected(new Set())
      setReplyTarget(null)
      setReplyBody('')
      setError(null)
    } catch (caught) {
      if (generation === requestGeneration.current)
        setError(caught instanceof ApiError ? caught.message : t('comments.loadError'))
    } finally {
      if (generation === requestGeneration.current) setLoading(false)
    }
  }, [token, tab, search, filterKey, pageIndex, t])

  // A mutation may finish after the user changed page or filters. Refresh
  // the current view rather than the closure in which that action started.
  const latestLoad = useRef(load)
  useEffect(() => {
    latestLoad.current = load
  }, [load])

  useEffect(() => {
    void load()
    return () => {
      requestGeneration.current += 1
    }
  }, [load])

  async function withBusy(fn: () => Promise<void>, doneMessage?: string): Promise<void> {
    setBusy(true)
    setDone(null)
    try {
      await fn()
      await latestLoad.current()
      // L20 audit point 15: the sidebar's "Comments" badge is fetched once
      // per session — without this, approving/spamming/trashing here left
      // it showing a stale count until the next full reload.
      refreshChromeStatus()
      if (doneMessage !== undefined) setDone(doneMessage)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('comments.actionError'))
    } finally {
      setBusy(false)
    }
  }

  function toggleSelected(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = items.length > 0 && items.every((item) => selected.has(item.id))

  if (token === null) return <p>{t('comments.signedOut')}</p>

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 id="comments-heading" className="m-0 text-2xl leading-tight font-bold tracking-tight">
          {t('comments.heading')}
        </h1>
        <p className="text-muted-foreground text-sm">{t('comments.description')}</p>
      </div>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}
      {done !== null && (
        <Notice
          tone="success"
          live="polite"
          onDismiss={() => setDone(null)}
          dismissLabel={t('common.close')}
        >
          <p>{done}</p>
        </Notice>
      )}

      <div role="tablist" aria-label={t('comments.heading')} className="flex flex-wrap gap-1">
        {TABS.map((status) => (
          <button
            key={status}
            type="button"
            role="tab"
            id={`comments-tab-${status}`}
            aria-selected={tab === status}
            aria-controls="comments-panel"
            className={cn(
              'cursor-pointer appearance-none rounded-md border px-3 py-1.5 font-sans text-sm',
              tab === status
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border bg-card text-card-foreground hover:bg-accent',
            )}
            onClick={() => setTab(status)}
          >
            {t(`comments.status.${status}`)} ({counts?.[status] ?? 0})
          </button>
        ))}
      </div>

      <div
        id="comments-panel"
        role="tabpanel"
        aria-labelledby={`comments-tab-${tab}`}
        className="flex flex-col gap-4"
      >
        <Field label={t('comments.searchLabel')}>
          {(control) => (
            <Input
              {...control}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('comments.searchPlaceholder')}
            />
          )}
        </Field>

        {selected.size > 0 && (
          <Card>
            <CardBody className="flex flex-wrap items-center gap-2">
              <span className="text-sm">
                {t('comments.selectedCount', { count: selected.size })}
              </span>
              {(['approved', 'spam', 'trash'] as const).map((status) => (
                <Button
                  key={status}
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void withBusy(
                      async () => {
                        await bulkSetCommentStatus(token, [...selected], status)
                      },
                      t('comments.done.bulk', { count: selected.size }),
                    )
                  }
                >
                  {t(`comments.bulkAction.${status}`)}
                </Button>
              ))}
            </CardBody>
          </Card>
        )}

        {pager}
        {loading && <p>{t('common.loading')}</p>}
        {!loading && (
          <Card>
            <CardBody>
              <TableRoot label={t('comments.heading')} stacked>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeader className="w-10">
                        <input
                          type="checkbox"
                          aria-label={t('comments.selectAll')}
                          checked={allSelected}
                          onChange={() =>
                            setSelected(
                              allSelected ? new Set() : new Set(items.map((item) => item.id)),
                            )
                          }
                        />
                      </TableHeader>
                      <TableHeader>{t('comments.column.excerpt')}</TableHeader>
                      <TableHeader>{t('comments.column.author')}</TableHeader>
                      <TableHeader>{t('comments.column.target')}</TableHeader>
                      <TableHeader>{t('comments.column.date')}</TableHeader>
                      <TableHeader>{t('comments.column.actions')}</TableHeader>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {items.length === 0 && (
                      <TableEmpty colSpan={6}>{t('comments.empty')}</TableEmpty>
                    )}
                    {items.map((item, index) => (
                      <TableRow key={item.id}>
                        <TableCell stack="select">
                          <input
                            type="checkbox"
                            aria-label={t('comments.selectOne', { author: item.authorName })}
                            checked={selected.has(item.id)}
                            onChange={() => toggleSelected(item.id)}
                          />
                        </TableCell>
                        <TableCell stack="heading">
                          <p className="m-0 max-w-md whitespace-pre-wrap">{excerpt(item.body)}</p>
                          {item.moderation.flagged === true && (
                            <p className="m-0 text-xs text-destructive" role="status">
                              {t('comments.flagged', {
                                severity: t(`assist.severity.${item.moderation.severity ?? 'low'}`),
                              })}
                            </p>
                          )}
                          <ModerationCheck
                            token={token}
                            text={item.body}
                            contextLabel={t('comments.moderationRegion', {
                              number: pageIndex * PAGE_SIZE + index + 1,
                              author: item.authorName,
                            })}
                          />
                        </TableCell>
                        <TableCell label={t('comments.column.author')}>
                          <span>{item.authorName}</span>
                          <br />
                          <span className="text-xs text-muted-foreground">{item.authorEmail}</span>
                        </TableCell>
                        <TableCell label={t('comments.column.target')}>
                          <Link
                            className="text-sm font-medium text-primary [overflow-wrap:anywhere]"
                            to={`/collections/${encodeURIComponent(item.collection)}/${encodeURIComponent(item.entryId)}`}
                          >
                            {entryTitles.get(
                              entryRefKey({ collection: item.collection, id: item.entryId }),
                            ) ??
                              t('comments.targetFallback', {
                                collection:
                                  schema.status === 'ready'
                                    ? (schema.schema.collections.find(
                                        (candidate) => candidate.name === item.collection,
                                      )?.labels.singular ?? item.collection)
                                    : item.collection,
                              })}
                          </Link>
                        </TableCell>
                        <TableCell className="whitespace-nowrap" label={t('comments.column.date')}>
                          <time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time>
                        </TableCell>
                        <TableCell stack="actions">
                          <div className="flex flex-wrap gap-1">
                            {item.status !== 'approved' && (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={busy}
                                onClick={() =>
                                  void withBusy(async () => {
                                    await setCommentStatus(token, item.id, 'approved')
                                  }, t('comments.done.approved'))
                                }
                              >
                                {t('comments.action.approve')}
                              </Button>
                            )}
                            {item.status !== 'spam' && (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={busy}
                                onClick={() =>
                                  void withBusy(async () => {
                                    await setCommentStatus(token, item.id, 'spam')
                                  }, t('comments.done.spam'))
                                }
                              >
                                {t('comments.action.spam')}
                              </Button>
                            )}
                            {item.status !== 'trash' && (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={busy}
                                onClick={() =>
                                  void withBusy(async () => {
                                    await setCommentStatus(token, item.id, 'trash')
                                  }, t('comments.done.trash'))
                                }
                              >
                                {t('comments.action.trash')}
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={busy}
                              onClick={() =>
                                setReplyTarget(replyTarget === item.id ? null : item.id)
                              }
                            >
                              {t('comments.action.reply')}
                            </Button>
                            {item.status === 'trash' && (
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                disabled={busy}
                                onClick={() =>
                                  void withBusy(async () => {
                                    if (!window.confirm(t('comments.purgeConfirm'))) return
                                    await purgeComment(token, item.id)
                                  })
                                }
                              >
                                {t('comments.action.purge')}
                              </Button>
                            )}
                          </div>
                          {replyTarget === item.id && (
                            <form
                              className="mt-2 flex flex-col gap-2"
                              onSubmit={(event) => {
                                event.preventDefault()
                                const user =
                                  auth.state.status === 'authenticated' ? auth.state.user : null
                                void withBusy(async () => {
                                  await replyToComment(token, item.id, {
                                    authorName: user?.email ?? 'Site',
                                    authorEmail: user?.email ?? '',
                                    body: replyBody,
                                  })
                                  setReplyBody('')
                                  setReplyTarget(null)
                                }, t('comments.done.reply'))
                              }}
                            >
                              <Field label={t('comments.replyLabel')}>
                                {(control) => (
                                  <textarea
                                    {...control}
                                    className="w-full rounded-md border border-input bg-background p-2 text-sm"
                                    value={replyBody}
                                    onChange={(event) => setReplyBody(event.target.value)}
                                    required
                                    rows={3}
                                  />
                                )}
                              </Field>
                              <Button
                                type="submit"
                                size="sm"
                                disabled={busy || replyBody.trim() === ''}
                              >
                                {t('comments.replySubmit')}
                              </Button>
                            </form>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableRoot>
              <p className="mt-2 text-xs text-muted-foreground">
                {t('comments.total', { count: total })}
              </p>
            </CardBody>
          </Card>
        )}
        {pager}
      </div>
    </section>
  )
}
