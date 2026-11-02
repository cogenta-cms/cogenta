import { ANONYMOUS, type ContentGateway } from '@cogenta/api'
import type { CollectionDefinition, TermSlugs } from '@cogenta/schema'
import { resolveEntry } from './theme-render.js'

/**
 * Whether a published page answers at a path — the question an agent's
 * `redirects.create` must ask before it takes a path away. Asked as a visitor
 * would be served (anonymous, through the permission-checked gateway, by the
 * same routing the page render uses), so a draft, a private page or a path no
 * route matches are not "live".
 */
export function createLivePathCheck(options: {
  readonly collections: readonly CollectionDefinition[]
  readonly gateway: ContentGateway
  readonly site: {
    readonly name: string
    readonly url: string
    readonly locales: readonly string[]
    readonly defaultLocale: string
  }
  readonly terms?: TermSlugs
}): (path: string) => Promise<boolean> {
  return async (path) => {
    const found = await resolveEntry(
      path,
      {
        collections: options.collections,
        gateway: options.gateway,
        site: options.site,
        styles: null,
        ...(options.terms === undefined ? {} : { terms: options.terms }),
      },
      { actor: ANONYMOUS },
    )
    return found !== null
  }
}
