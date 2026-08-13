import type { ContentEntry } from '@cogenta/schema'
import type { AccessContext } from '../types.js'
import { createLoader, type Loader } from './dataloader.js'
import type { ContentGateway } from './gateway.js'

/**
 * What every resolver receives.
 *
 * Built once per operation. The loaders in particular must not outlive the
 * request: they cache entries that were read under this actor's permissions and
 * this request's preview grant, and a shared cache would hand one reader
 * another reader's drafts.
 */
export interface GraphQLContext {
  readonly access: AccessContext
  readonly gateway: ContentGateway
  loaderFor(collection: string): Loader<string, ContentEntry>
}

export function createRequestContext(
  gateway: ContentGateway,
  access: AccessContext,
): GraphQLContext {
  const loaders = new Map<string, Loader<string, ContentEntry>>()

  return {
    access,
    gateway,
    loaderFor: (collection) => {
      const existing = loaders.get(collection)
      if (existing !== undefined) return existing

      // The batch goes through the gateway, so the per-entry permission and
      // preview checks apply to a batched read exactly as they do to a single
      // one. A loader that reached the store directly would be a hole.
      const loader = createLoader<string, ContentEntry>((ids) =>
        gateway.readMany(collection, ids, access),
      )
      loaders.set(collection, loader)
      return loader
    },
  }
}
