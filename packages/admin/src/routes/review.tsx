import type { TFunction } from 'i18next'
import { type JSX, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ApiError } from '../api/client.js'
import { approveReview, requestReviewChanges } from '../api/content-client.js'
import type { ReviewQueueItem, ReviewQueueScope } from '../api/review-client.js'
import { listReviewQueue } from '../api/review-client.js'
import { useAuth } from '../auth/auth-context.js'
import { useSchema } from '../schema/schema-context.js'
import {
  Button,
  buttonVariants,
  Notice,
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
 * The review queue (`schema@2.1`, ADR-0027, fiche 37 task 3).
 *
 * Three tabs, aggregated server-side by `/api/review` across every
 * collection that turned the workflow on — never a per-collection screen
 * like the trash's, because the question this screen answers ("what is
 * waiting for me") is a site-wide one by nature.
 *
 * Deliberately plain, same discipline as `trash.tsx`: L11 owns how the
 * admin looks, what matters here is that every row and every action is
 * real — the queue the API actually holds, approved and sent back through
 * the API, never a client-side simulation of what the server would do.
 */

const SCOPES: readonly ReviewQueueScope[] = ['assigned', 'pending', 'mine']

export function ReviewRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const schemaState = useSchema()

  const token = auth.state.status === 'authenticated' ? auth.state.token : null

  const [scope, setScope] = useState<ReviewQueueScope>('assigned')
  const [items, setItems] = useState<readonly ReviewQueueItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (token === null) return
    setLoading(true)
    setError(null)
    try {
      setItems(await listReviewQueue(token, scope))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('review.loadError'))
    } finally {
      setLoading(false)
    }
  }, [token, scope, t])

  useEffect(() => {
    void load()
  }, [load])

  async function approve(collection: string, id: string): Promise<void> {
    if (token === null) return
    setBusy(id)
    setError(null)
    try {
      await approveReview(token, collection, id)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('review.approveError'))
    } finally {
      setBusy(null)
    }
  }

  async function requestChanges(collection: string, id: string): Promise<void> {
    if (token === null) return
    setBusy(id)
    setError(null)
    try {
      await requestReviewChanges(token, collection, id)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('review.requestChangesError'))
    } finally {
      setBusy(null)
    }
  }

  if (schemaState.status === 'loading') {
    return <p>{t('common.loading')}</p>
  }
  if (schemaState.status === 'error') {
    return <p role="alert">{t('common.schemaError', { message: schemaState.message })}</p>
  }

  return (
    <section aria-labelledby="review-heading" className="flex flex-col gap-6">
      <h1 id="review-heading" className="m-0 text-xl leading-7 font-semibold">
        {t('review.heading')}
      </h1>

      <div role="tablist" aria-label={t('review.heading')} className="flex gap-2">
        {SCOPES.map((candidate) => (
          <Button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={scope === candidate}
            variant={scope === candidate ? 'primary' : 'secondary'}
            onClick={() => setScope(candidate)}
          >
            {t(`review.tab${labelSuffix(candidate)}`)}
          </Button>
        ))}
      </div>

      {error !== null && (
        <Notice tone="danger" live="assertive">
          <p>{error}</p>
        </Notice>
      )}
      {loading && <p>{t('common.loading')}</p>}

      {!loading && (
        <TableRoot label={t(`review.tab${labelSuffix(scope)}`)}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('review.entry')}</TableHeader>
                <TableHeader>{t('review.collection')}</TableHeader>
                <TableHeader>{t('review.author')}</TableHeader>
                <TableHeader>{t('review.age')}</TableHeader>
                <TableHeader>{t('review.state')}</TableHeader>
                <TableHeader>{t('review.actions')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => (
                <TableRow key={`${item.collection}:${item.entry.id}`}>
                  <TableCell>{titleOf(item)}</TableCell>
                  <TableCell>{item.collection}</TableCell>
                  <TableCell>{item.entry.createdBy ?? '—'}</TableCell>
                  <TableCell>{ageOf(item.entry.updatedAt, t)}</TableCell>
                  <TableCell>{t(`entryEdit.workflow.state.${item.entry.reviewState}`)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        to={`/collections/${encodeURIComponent(item.collection)}/${encodeURIComponent(item.entry.id)}`}
                        className={buttonVariants({ variant: 'secondary', size: 'sm' })}
                      >
                        {t('review.open')}
                      </Link>
                      {item.entry.reviewState === 'pending' && (
                        <>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={busy === item.entry.id}
                            onClick={() => void approve(item.collection, item.entry.id)}
                          >
                            {t('review.approve')}
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={busy === item.entry.id}
                            onClick={() => void requestChanges(item.collection, item.entry.id)}
                          >
                            {t('review.requestChanges')}
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && <TableEmpty colSpan={6}>{t('review.empty')}</TableEmpty>}
            </TableBody>
          </Table>
        </TableRoot>
      )}
    </section>
  )
}

function labelSuffix(scope: ReviewQueueScope): string {
  return scope === 'assigned' ? 'Assigned' : scope === 'pending' ? 'Pending' : 'Mine'
}

/** Something recognisable to a human, without knowing the collection: the first text-ish value. */
function titleOf(item: ReviewQueueItem): string {
  for (const key of ['title', 'name', 'slug']) {
    const value = item.entry.values[key]
    if (typeof value === 'string' && value !== '') return value
  }
  return item.entry.id
}

function ageOf(updatedAt: string, t: TFunction): string {
  const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / (24 * 60 * 60 * 1000))
  return days <= 0 ? t('review.ageToday') : t('review.ageDays', { count: days })
}

/** The count a navigation badge can show: everything pending, across every workflow-enabled collection this actor may review. */
export async function countPendingReview(token: string): Promise<number> {
  try {
    return (await listReviewQueue(token, 'pending')).length
  } catch {
    // A badge that fails to load shows nothing rather than a stale or wrong
    // number — the same "silence over a guess" rule the rest of the admin follows.
    return 0
  }
}
