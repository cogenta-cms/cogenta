import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useAuth } from '../auth/auth-context.js'
import { readableCollections } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'
import {
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
 * Every collection the signed-in actor may at least read, and nothing else —
 * the acceptance criterion for L2 task 4 is that a user without permission
 * does not see the corresponding action, and a collection they cannot read
 * has no action here worth showing at all.
 *
 * Links to task 6's list view; the schema-driven edit form itself is task 7.
 */
export function CollectionsRoute(): JSX.Element {
  const { t } = useTranslation()
  const auth = useAuth()
  const schema = useSchema()
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []

  return (
    <section aria-labelledby="collections-heading" className="flex flex-col gap-6">
      <h1 id="collections-heading" className="m-0 text-xl leading-7 font-semibold">
        {t('collections.heading')}
      </h1>

      {schema.status === 'loading' && <p>{t('common.loading')}</p>}
      {schema.status === 'error' && (
        <Notice tone="danger" live="assertive">
          <p>{t('common.schemaError', { message: schema.message })}</p>
        </Notice>
      )}
      {schema.status === 'ready' && (
        <TableRoot label={t('collections.tableLabel')}>
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>{t('collections.nameColumn')}</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {readableCollections(schema.schema.collections, roles).map((collection) => (
                <TableRow key={collection.name}>
                  <TableCell>
                    <Link
                      className="font-medium text-primary hover:underline"
                      to={`/collections/${collection.name}`}
                    >
                      {collection.labels.plural}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {readableCollections(schema.schema.collections, roles).length === 0 && (
                <TableEmpty colSpan={1}>{t('collections.empty')}</TableEmpty>
              )}
            </TableBody>
          </Table>
        </TableRoot>
      )}
    </section>
  )
}
