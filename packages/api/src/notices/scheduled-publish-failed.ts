import type { AdminNotice, NoticeSource } from './types.js'

export interface ScheduledPublishFailureRecord {
  readonly collection: string
  readonly entryId: string
  readonly locale: string
}

export interface ScheduledPublishFailedOptions {
  /** `@cogenta/schema`'s `ScheduledPublishFailureStore.list`, or an equivalent. */
  readonly listFailed: () => Promise<readonly ScheduledPublishFailureRecord[]>
  /** Builds the admin edit-screen URL for one entry, so the action goes straight to the page that needs fixing. */
  readonly entryHref: (record: ScheduledPublishFailureRecord) => string
}

/**
 * "Contenu programmé dont la publication a échoué" — fiche 38 task 1's last
 * named source. `registerScheduledPublishing`'s handler (`cogenta serve`) can
 * throw — a validation the entry no longer passes, a foreign key that now
 * refuses it — and until this notice existed the only trace was a queue row
 * quietly sitting in `status: 'failed'`, with `publishedAt` still in the past
 * and the page never actually going live.
 *
 * Never dismissible: the entry is still not published after the notice is
 * hidden. It disappears on its own, same as every other source, the moment a
 * later attempt (a fresh save, a fixed validation) actually publishes it —
 * `cogenta serve`'s handler clears the underlying record on success.
 */
export function createScheduledPublishFailedSource(
  options: ScheduledPublishFailedOptions,
): NoticeSource {
  return {
    name: 'scheduled-publish-failed',
    list: async ({ actor }) => {
      if (actor.id === null) return []
      if (!actor.roles.includes('admin')) return []

      const failed = await options.listFailed()
      return failed.map(
        (record): AdminNotice => ({
          id: `content.schedule-failed:${record.collection}:${record.entryId}:${record.locale}`,
          code: 'content.schedule-failed',
          severity: 'danger',
          params: { collection: record.collection, locale: record.locale },
          dismissible: false,
          action: { code: 'content.schedule-failed.action', href: options.entryHref(record) },
        }),
      )
    },
  }
}
