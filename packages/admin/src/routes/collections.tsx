import { type JSX, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { listEntries } from '../api/content-client.js'
import { useAuth } from '../auth/auth-context.js'
import { canPerform, readableCollections } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import type { CollectionSummary } from '../schema/types.js'
import {
  buttonVariants,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
  Notice,
} from '../ui/index.js'

/**
 * Every collection the signed-in actor may at least read, and nothing else —
 * the acceptance criterion for L2 task 4 is that a user without permission
 * does not see the corresponding action, and a collection they cannot read
 * has no action here worth showing at all.
 *
 * Fiche 01 ("Liste de contenu"), task 7: a grid of cards rather than a
 * one-column table of names, each carrying a real entry count and a real
 * last-modified date — both reusing task 4's `?counts=1` (the same server
 * call the list screen makes, not a second implementation of "how many").
 * No description: contract A's `CollectionDefinition` declares no such
 * field (verified against `packages/schema/src/types.ts`), so there is
 * nothing to show — not a placeholder invented for one.
 */
export function CollectionsRoute(): JSX.Element {
  const { t, i18n } = useTranslation()
  const auth = useAuth()
  const schema = useSchema()
  const token = auth.state.status === 'authenticated' ? auth.state.token : null
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []

  const collections =
    schema.status === 'ready' ? readableCollections(schema.schema.collections, roles) : []

  const [summaries, setSummaries] = useState<
    Readonly<
      Record<string, { readonly count: number | null; readonly lastModified: string | null }>
    >
  >({})
  const [summaryError, setSummaryError] = useState<string | null>(null)

  useEffect(() => {
    if (token === null || collections.length === 0) return
    let cancelled = false

    Promise.all(
      collections.map(async (collection) => {
        try {
          const page = await listEntries(token, collection.name, {
            counts: true,
            limit: 1,
            sort: { field: 'updatedAt', direction: 'desc' },
          })
          const count =
            page.counts === undefined
              ? null
              : Object.values(page.counts).reduce<number>((sum, n) => sum + (n ?? 0), 0)
          return [
            collection.name,
            { count, lastModified: page.items[0]?.updatedAt ?? null },
          ] as const
        } catch {
          return [collection.name, { count: null, lastModified: null }] as const
        }
      }),
    )
      .then((entries) => {
        if (!cancelled) setSummaries(Object.fromEntries(entries))
      })
      .catch(() => {
        if (!cancelled) setSummaryError(t('collections.summaryError'))
      })

    return () => {
      cancelled = true
    }
  }, [token, schema, roles, t])

  function formatDate(iso: string): string {
    const parsed = new Date(iso)
    if (Number.isNaN(parsed.getTime())) return iso
    return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(parsed)
  }

  return (
    <section aria-labelledby="collections-heading" className="flex flex-col gap-6">
      <h1 id="collections-heading" className="m-0 text-2xl leading-tight font-bold tracking-tight">
        {t('collections.heading')}
      </h1>

      {schema.status === 'loading' && <p>{t('common.loading')}</p>}
      {schema.status === 'error' && (
        <Notice tone="danger" live="assertive">
          <p>{t('common.schemaError', { message: schema.message })}</p>
        </Notice>
      )}
      {summaryError !== null && (
        <Notice tone="danger" live="polite">
          <p>{summaryError}</p>
        </Notice>
      )}

      {schema.status === 'ready' && collections.length === 0 && <p>{t('collections.empty')}</p>}

      {schema.status === 'ready' && collections.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {collections.map((collection) => (
            <CollectionCard
              key={collection.name}
              collection={collection}
              roles={roles}
              summary={summaries[collection.name]}
              formatDate={formatDate}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function CollectionCard({
  collection,
  roles,
  summary,
  formatDate,
}: {
  readonly collection: CollectionSummary
  readonly roles: readonly string[]
  readonly summary:
    | { readonly count: number | null; readonly lastModified: string | null }
    | undefined
  formatDate(iso: string): string
}): JSX.Element {
  const { t } = useTranslation()
  const canCreate = canPerform('create', collection, roles)

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>
            <Link
              className="text-inherit no-underline hover:underline"
              to={`/collections/${encodeURIComponent(collection.name)}`}
            >
              {collection.labels.plural}
            </Link>
          </h2>
        </CardTitle>
      </CardHeader>
      <CardBody>
        <dl className="m-0 grid grid-cols-2 gap-2 text-sm">
          <dt className="text-muted-foreground">{t('collections.entryCount')}</dt>
          <dd className="m-0 font-medium">
            {summary === undefined ? t('common.loading') : (summary.count ?? '—')}
          </dd>
          <dt className="text-muted-foreground">{t('collections.lastModified')}</dt>
          <dd className="m-0 font-medium" title={summary?.lastModified ?? undefined}>
            {summary === undefined
              ? t('common.loading')
              : summary.lastModified === null
                ? t('collections.never')
                : formatDate(summary.lastModified)}
          </dd>
        </dl>
      </CardBody>
      <CardFooter>
        <Link
          className={buttonVariants({ variant: 'secondary', size: 'sm' })}
          to={`/collections/${encodeURIComponent(collection.name)}`}
        >
          {t('collections.viewAll')}
        </Link>
        {canCreate && (
          <Link
            className={buttonVariants({ variant: 'primary', size: 'sm' })}
            to={`/collections/${encodeURIComponent(collection.name)}/new`}
          >
            {t('collections.newEntry')}
          </Link>
        )}
      </CardFooter>
    </Card>
  )
}
