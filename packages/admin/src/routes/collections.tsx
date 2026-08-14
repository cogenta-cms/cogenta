import type { JSX } from 'react'
import { useAuth } from '../auth/auth-context.js'
import { readableCollections } from '../schema/permissions.js'
import { useSchema } from '../schema/schema-context.js'

/**
 * Every collection the signed-in actor may at least read, and nothing else —
 * the acceptance criterion for L2 task 4 is that a user without permission
 * does not see the corresponding action, and a collection they cannot read
 * has no action here worth showing at all.
 *
 * List and edit views for one collection land in tasks 6-9; this is the
 * "which collections exist, for me" step ahead of them.
 */
export function CollectionsRoute(): JSX.Element {
  const auth = useAuth()
  const schema = useSchema()
  const roles = auth.state.status === 'authenticated' ? auth.state.user.roles : []

  return (
    <section aria-labelledby="collections-heading">
      <h1 id="collections-heading">Contenus</h1>

      {schema.status === 'loading' && <p>Chargement…</p>}
      {schema.status === 'error' && (
        <p role="alert">Impossible de charger le schéma : {schema.message}</p>
      )}
      {schema.status === 'ready' && (
        <ul>
          {readableCollections(schema.schema.collections, roles).map((collection) => (
            <li key={collection.name}>{collection.labels.plural}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
