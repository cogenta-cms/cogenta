import type { CollectionDefinition, ContentStore } from '@cogenta/schema'

/**
 * Task 6 — the export a data-protection request (GDPR/RGPD) is answered
 * with: everything the site holds about one person, gathered by email,
 * addressed to the concerns L15 (commerce) and the still-unbuilt fiches 15
 * (comments) and 16 (forms) name — the account, the content they authored,
 * and, where a caller supplies one, their orders.
 *
 * **What this cannot promise**: comments and form submissions (fiches 15/16)
 * have no store anywhere in this codebase yet — not merged, not being built
 * by a sibling agent this wave — so a request that reaches this function
 * gets an honest `notCollected` reason for each, never a silently empty
 * array indistinguishable from "this person really has none". A future
 * store slots into `PersonalDataSource` and stops being absent from the
 * report — nothing here has to change.
 */

export interface PersonalDataAccount {
  readonly id: string
  readonly email: string
  readonly roles: readonly string[]
  readonly status: string
  readonly createdAt: string
}

export interface PersonalDataEntryRef {
  readonly collection: string
  readonly id: string
  readonly status: string
  readonly createdAt: string
  readonly title: string | null
}

/**
 * A domain this codebase does not yet have a store for. Named rather than
 * omitted, so the report says *why* a section is empty.
 */
export interface PersonalDataGap {
  readonly source: string
  readonly reason: string
}

export interface PersonalDataOrderRef {
  readonly id: string
  readonly status: string
  readonly createdAt: string
  readonly totalMinorUnits: number
  readonly currency: string
}

export interface PersonalDataExport {
  readonly generatedAt: string
  readonly subjectEmail: string
  readonly account: PersonalDataAccount | null
  readonly authoredContent: readonly PersonalDataEntryRef[]
  readonly orders: readonly PersonalDataOrderRef[]
  readonly gaps: readonly PersonalDataGap[]
}

export interface PersonalDataAccountLookup {
  findByEmail(email: string): Promise<PersonalDataAccount | null>
}

export interface PersonalDataOrderLookup {
  /** Orders placed under this customer id (resolved from the email by the caller — commerce customers are matched by email at their own layer, not re-matched here). */
  findByCustomerId(customerId: string): Promise<readonly PersonalDataOrderRef[]>
  findCustomerIdByEmail(email: string): Promise<string | null>
}

export interface ExportPersonalDataOptions {
  readonly email: string
  readonly accounts: PersonalDataAccountLookup
  readonly collections: readonly CollectionDefinition[]
  readonly storeFor: (collection: CollectionDefinition) => ContentStore
  /** Absent when the site sells nothing — `@cogenta/commerce` is never a hard dependency of this package. */
  readonly orders?: PersonalDataOrderLookup
  readonly now?: () => Date
}

const TITLE_FIELD_CANDIDATES = ['title', 'name', 'label']

function titleOf(collection: CollectionDefinition, values: Record<string, unknown>): string | null {
  for (const field of TITLE_FIELD_CANDIDATES) {
    if (field in collection.fields) {
      const value = values[field]
      if (typeof value === 'string' && value.length > 0) return value
    }
  }
  return null
}

/**
 * Gathers everything the site holds about one email address.
 *
 * Authored content is found by `createdBy === account.id` — the account has
 * to exist for this to find anything, which is correct: content is never
 * attributed to an email directly, only to an account id (contract A).
 */
export async function exportPersonalData(
  options: ExportPersonalDataOptions,
): Promise<PersonalDataExport> {
  const now = options.now ?? (() => new Date())
  const account = await options.accounts.findByEmail(options.email)
  const authoredContent: PersonalDataEntryRef[] = []
  const gaps: PersonalDataGap[] = []

  if (account !== null) {
    for (const collection of options.collections) {
      const store = options.storeFor(collection)
      let cursor: string | undefined
      for (;;) {
        // `createdBy` is a system field, not a declared one, so it cannot go
        // through `list()`'s `where` (which only accepts columns a
        // collection's own fields declare) — filtered here instead. A GDPR
        // export is not a hot path, and every entry is paged through in
        // bounded batches regardless.
        const page = await store.list({
          state: 'working',
          trashed: 'include',
          limit: 200,
          ...(cursor === undefined ? {} : { cursor }),
        })
        for (const entry of page.items) {
          if (entry.createdBy !== account.id) continue
          authoredContent.push({
            collection: collection.name,
            id: entry.id,
            status: entry.status,
            createdAt: entry.createdAt,
            title: titleOf(collection, entry.values as Record<string, unknown>),
          })
        }
        if (!page.hasMore || page.nextCursor === null) break
        cursor = page.nextCursor
      }
    }
  }

  let orders: readonly PersonalDataOrderRef[] = []
  if (options.orders !== undefined) {
    const customerId = await options.orders.findCustomerIdByEmail(options.email)
    orders = customerId === null ? [] : await options.orders.findByCustomerId(customerId)
  } else {
    gaps.push({
      source: 'commerce',
      reason: 'This site has no commerce lookup configured, or sells nothing.',
    })
  }

  gaps.push(
    {
      source: 'comments',
      reason: 'Comments (fiche 15) have no store in this codebase yet.',
    },
    {
      source: 'form-submissions',
      reason: 'Form submissions (fiche 16) have no store in this codebase yet.',
    },
  )

  return {
    generatedAt: now().toISOString(),
    subjectEmail: options.email,
    account,
    authoredContent,
    orders,
    gaps,
  }
}
