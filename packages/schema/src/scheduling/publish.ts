import { CogentaError, type JobId, type Logger, type QueueDriver } from '@cogenta/core'

/**
 * Scheduled publication.
 *
 * An entry in `status: 'scheduled'` with a future `publishedAt` becomes a job in
 * the L0 queue. The acceptance criterion of L1 is that this works **with the
 * `database` queue too** — the degraded driver that has no worker of its own and
 * is drained by a cron calling `tick()`.
 *
 * Everything here is therefore written against `QueueDriver` and nothing else.
 * No timer, no `setTimeout`, no assumption that a process is still alive at the
 * publication time: the job carries its own due date, and whichever tick happens
 * next after it runs it. On a cron every five minutes, a page scheduled for
 * 09:00 is published between 09:00 and 09:05 — which is the honest promise of a
 * host with no persistent worker, and it is the one to document.
 */

/** The job name. Public because a caller may need to inspect or cancel by name. */
export const SCHEDULED_PUBLISH_JOB = 'cogenta.content.publish'

export interface ScheduledPublication {
  readonly collection: string
  readonly entryId: string
  readonly locale: string
  /** Epoch milliseconds: when the entry becomes public. */
  readonly publishAt: number
}

/** Does the actual state change. Owned by the persistence layer (task 5), not by this file. */
export type PublishHandler = (publication: ScheduledPublication) => Promise<void>

export interface SchedulePublicationInput {
  readonly collection: string
  readonly entryId: string
  readonly locale: string
  /** A `Date`, an ISO 8601 string, or epoch milliseconds. */
  readonly publishAt: Date | string | number
  readonly maxAttempts?: number
  readonly priority?: number
}

/**
 * Queues the publication of one entry and returns the job to keep alongside it.
 *
 * The identifier has to be stored on the entry: it is the only handle on the
 * job, and rescheduling without it leaves two jobs racing to publish the same
 * entry at two different times.
 */
export async function schedulePublication(
  queue: QueueDriver,
  input: SchedulePublicationInput,
): Promise<JobId> {
  const publishAt = toEpochMs(input.publishAt, input)

  const payload: ScheduledPublication = {
    collection: input.collection,
    entryId: input.entryId,
    locale: input.locale,
    publishAt,
  }

  return queue.enqueue({
    name: SCHEDULED_PUBLISH_JOB,
    payload,
    runAt: publishAt,
    maxAttempts: input.maxAttempts ?? 3,
    ...(input.priority === undefined ? {} : { priority: input.priority }),
  })
}

/** Cancels a pending publication. Safe to call on a job that already ran. */
export async function cancelPublication(queue: QueueDriver, jobId: JobId): Promise<void> {
  await queue.cancel(jobId)
}

/**
 * Moves a publication to a new date.
 *
 * Cancel then enqueue, rather than an in-place update: the queue interface has
 * no "reschedule", and adding one for this would push a content concern into
 * every driver, Redis included.
 */
export async function reschedulePublication(
  queue: QueueDriver,
  jobId: JobId,
  input: SchedulePublicationInput,
): Promise<JobId> {
  await queue.cancel(jobId)
  return schedulePublication(queue, input)
}

export interface ScheduledPublishingOptions {
  readonly logger?: Logger
}

/**
 * Registers the handler that publishes due entries.
 *
 * Called once at boot by whatever owns the queue — the worker process, or the
 * cron entry point on a host that has none.
 */
export function registerScheduledPublishing(
  queue: QueueDriver,
  publish: PublishHandler,
  options: ScheduledPublishingOptions = {},
): void {
  const logger = options.logger?.child({ component: 'scheduling' })

  queue.process(SCHEDULED_PUBLISH_JOB, async (job) => {
    const publication = parsePayload(job.payload)
    await publish(publication)

    logger?.info('scheduled entry published', {
      collection: publication.collection,
      entryId: publication.entryId,
      locale: publication.locale,
      // How late the tick was. On the database queue this is the cron interval,
      // and it is the number to look at when someone asks why a page went live
      // four minutes after the hour.
      latenessMs: Date.now() - publication.publishAt,
    })
  })
}

/**
 * A payload comes back from the queue as JSON, so it is `unknown` and is
 * validated rather than cast. A job row can be edited by hand, restored from a
 * backup, or left over from an older release.
 */
export function parsePayload(payload: unknown): ScheduledPublication {
  if (typeof payload !== 'object' || payload === null) {
    throw invalidPayload(payload)
  }

  const record = payload as Record<string, unknown>
  const { collection, entryId, locale, publishAt } = record

  if (
    typeof collection !== 'string' ||
    collection.length === 0 ||
    typeof entryId !== 'string' ||
    entryId.length === 0 ||
    typeof locale !== 'string' ||
    locale.length === 0 ||
    typeof publishAt !== 'number' ||
    !Number.isFinite(publishAt)
  ) {
    throw invalidPayload(payload)
  }

  return { collection, entryId, locale, publishAt }
}

function invalidPayload(payload: unknown): CogentaError {
  return new CogentaError({
    code: 'CONTENT_SCHEDULE_INVALID',
    message: `A "${SCHEDULED_PUBLISH_JOB}" job carries a payload it cannot be run from.`,
    hint: 'Cancel the job and schedule the entry again. Its payload names the collection, the entry, the locale and the date.',
    details: { received: typeof payload },
  })
}

function toEpochMs(value: Date | string | number, context: SchedulePublicationInput): number {
  const milliseconds =
    value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value)

  if (!Number.isFinite(milliseconds)) {
    throw new CogentaError({
      code: 'CONTENT_SCHEDULE_INVALID',
      message: `"${String(value)}" is not a date to publish "${context.entryId}" on.`,
      hint: 'Pass a Date, an ISO 8601 timestamp such as 2026-09-01T09:00:00Z, or epoch milliseconds.',
      details: { collection: context.collection, entryId: context.entryId },
    })
  }

  return milliseconds
}
