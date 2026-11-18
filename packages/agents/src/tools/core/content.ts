import { CogentaError, isCogentaError } from '@cogenta/core'
import { z } from 'zod'
import { defineTool } from '../define.js'
import type { ToolContext, ToolDefinition } from '../types.js'

/**
 * The narrow slice of `@cogenta/api`'s `ContentService` these tools actually
 * call — declared locally rather than imported so `@cogenta/agents` does not
 * pull in `@cogenta/api`'s full dependency graph (GraphQL, WebAuthn) just to
 * describe four method signatures. A real `ContentService` instance already
 * satisfies this structurally; wiring one in is the runtime assembly's job
 * (where `defineAgent` configs become live tool instances), not this
 * module's.
 */
export interface ContentAccessContext {
  readonly actor: { readonly id: string | null; readonly roles: readonly string[] }
}

export interface ContentReadOptions {
  readonly state: 'published' | 'working'
  readonly depth: number
}

export interface ContentServiceLike {
  read(
    context: ContentAccessContext,
    collection: string,
    id: string,
    options: ContentReadOptions,
  ): Promise<Record<string, unknown>>
  create(
    context: ContentAccessContext,
    collection: string,
    input: {
      readonly values: Readonly<Record<string, unknown>>
      readonly locale?: string
      /** The entry this one translates — set only by `content.write_translation`. */
      readonly translationOf?: string
    },
    options: ContentReadOptions,
  ): Promise<Record<string, unknown>>
  update(
    context: ContentAccessContext,
    collection: string,
    id: string,
    input: { readonly values: Readonly<Record<string, unknown>> },
    options: ContentReadOptions,
  ): Promise<Record<string, unknown>>
  publish(
    context: ContentAccessContext,
    collection: string,
    id: string,
    input: { readonly publishedBy?: string | null },
    options: ContentReadOptions,
  ): Promise<Record<string, unknown>>
  remove(context: ContentAccessContext, collection: string, id: string): Promise<void>
  /**
   * Makes `version` the working version again, as a new version (history
   * stays append-only). Optional: a host that does not supply it keeps
   * `content.write_draft` and `content.publish` non-reversible, so they wait
   * for a human whatever the autonomy level (R6).
   */
  restore?(
    context: ContentAccessContext,
    collection: string,
    id: string,
    version: number,
    options: ContentReadOptions,
  ): Promise<Record<string, unknown>>
  /**
   * Takes an entry back off the published face. Optional for the same
   * reason as `restore`: without it `content.publish` is not reversible.
   */
  unpublish?(
    context: ContentAccessContext,
    collection: string,
    id: string,
    input: {
      readonly status?: 'draft' | 'archived' | 'scheduled'
      readonly publishedAt?: string
    },
    options: ContentReadOptions,
  ): Promise<Record<string, unknown>>
}

const DEFAULT_READ_OPTIONS: ContentReadOptions = { state: 'working', depth: 0 }

function accessContextOf(actor: {
  readonly id: string | null
  readonly roles: readonly string[]
}): ContentAccessContext {
  return { actor }
}

const EntrySchema = z.record(z.string(), z.unknown())

/**
 * What a tool puts in its own output so that `revert` has everything it needs
 * from the receipt alone: nothing is looked up afterwards and nothing is
 * guessed (R6). The serialised entry the service returns keeps all its own
 * keys; `undo` is added beside them.
 */
const UndoSchema = z.discriminatedUnion('kind', [
  /** The call created `id`: undoing it means moving it to the trash (restorable). */
  z.object({
    kind: z.literal('trash-created'),
    collection: z.string(),
    id: z.string(),
    /** The working version the create left; the revert refuses if the entry has moved on. */
    version: z.number().int(),
  }),
  /** The call updated `id`: undoing it means making the previous working version current again. */
  z.object({
    kind: z.literal('restore-version'),
    collection: z.string(),
    id: z.string(),
    /** The working version this update produced. */
    version: z.number().int(),
    /** The working version it replaced. */
    restoreVersion: z.number().int(),
  }),
  /** The call published `id`: undoing it means going back to what the entry was before. */
  z.object({
    kind: z.literal('unpublish'),
    collection: z.string(),
    id: z.string(),
    /** The version the publication made live; the revert refuses if the entry has moved on. */
    version: z.number().int(),
    previous: z.object({
      /** What visitors saw before: `published`, or a non-public status. */
      status: z.string(),
      /** The live version before, when it was published. */
      liveVersion: z.number().int().nullable(),
      /** The publication date before, needed to put a scheduled entry back. */
      publishedAt: z.string().nullable(),
    }),
  }),
])
export type ContentUndo = z.infer<typeof UndoSchema>

function refused(message: string, hint: string, details?: Readonly<Record<string, unknown>>) {
  return new CogentaError({
    code: 'TOOL_REVERT_REFUSED',
    message,
    hint,
    ...(details === undefined ? {} : { details }),
  })
}

function undoOf(receipt: Record<string, unknown>): ContentUndo {
  const parsed = UndoSchema.safeParse(receipt['undo'])
  if (!parsed.success) {
    throw refused(
      'This receipt carries nothing to undo with.',
      'Only the output of a call made by this version of the tool can be reverted.',
    )
  }
  return parsed.data
}

function versionOf(entry: Record<string, unknown>): number | null {
  const version = entry['version']
  return typeof version === 'number' && Number.isInteger(version) ? version : null
}

function stringOf(entry: Record<string, unknown>, key: string): string | null {
  const value = entry[key]
  return typeof value === 'string' ? value : null
}

/** The `undo` of a create — shared by `content.write_draft` and `content.write_translation`. */
function createdUndo(
  collection: string,
  created: Record<string, unknown>,
): ContentUndo | undefined {
  const id = stringOf(created, 'id')
  const version = versionOf(created)
  if (id === null || version === null) return undefined
  return { kind: 'trash-created', collection, id, version }
}

/** `null` instead of a throw when the entry is not there (trashed, purged, never published). */
async function orNull(
  read: () => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown> | null> {
  try {
    return await read()
  } catch (error) {
    if (isCogentaError(error) && error.code === 'CONTENT_NOT_FOUND') return null
    throw error
  }
}

function workingEntryOrNull(
  service: ContentServiceLike,
  context: ContentAccessContext,
  collection: string,
  id: string,
): Promise<Record<string, unknown> | null> {
  return orNull(() => service.read(context, collection, id, DEFAULT_READ_OPTIONS))
}

/** The entry as visitors see it, or `null` when it has no published face. */
function publishedEntryOrNull(
  service: ContentServiceLike,
  context: ContentAccessContext,
  collection: string,
  id: string,
): Promise<Record<string, unknown> | null> {
  return orNull(() => service.read(context, collection, id, { state: 'published', depth: 0 }))
}

/**
 * Undoing a creation: the entry goes to the trash, from which an
 * administrator can restore it until the retention window ends — nothing is
 * destroyed. Refused when somebody has edited the entry since, because the
 * trash would then hide work this call never made.
 */
async function trashCreated(
  service: ContentServiceLike,
  context: ContentAccessContext,
  undo: Extract<ContentUndo, { kind: 'trash-created' }>,
): Promise<void> {
  const current = await workingEntryOrNull(service, context, undo.collection, undo.id)
  // Already gone (trashed by someone): the state this revert aims for.
  if (current === null) return
  if (versionOf(current) !== undo.version) {
    throw refused(
      `"${undo.id}" was edited after this call created it; it was not moved to the trash.`,
      'Review the entry in the administration and trash it there if it is still unwanted.',
      { collection: undo.collection, id: undo.id },
    )
  }
  await service.remove(context, undo.collection, undo.id)
}

const ReadInputSchema = z.object({
  collection: z.string(),
  id: z.string(),
  state: z.enum(['published', 'working']).optional(),
})
type ReadInput = z.infer<typeof ReadInputSchema>

/**
 * `content.read` — the service is the actual permission gate (it calls
 * `PermissionLayer.assert` internally against the collection's own
 * `read`/`publish` roles); this tool only shapes the call and never
 * second-guesses what the service decides.
 */
export function createContentReadTool(
  service: ContentServiceLike,
): ToolDefinition<ReadInput, Record<string, unknown>> {
  return defineTool({
    name: 'content.read',
    version: '1.0.0',
    description:
      'Read one content entry by collection and id (state "working" for the latest draft, "published" for what visitors see). Find ids with content.search or content.list.',
    input: ReadInputSchema,
    output: EntrySchema,
    permissions: ['content.read'],
    sideEffects: false,
    reversible: false,
    cost: 'low',
    async execute(input, ctx) {
      return service.read(accessContextOf(ctx.actor), input.collection, input.id, {
        ...DEFAULT_READ_OPTIONS,
        ...(input.state === undefined ? {} : { state: input.state }),
      })
    },
  })
}

const WriteDraftInputSchema = z.object({
  collection: z.string(),
  id: z.string().optional(),
  values: z.record(z.string(), z.unknown()),
  locale: z.string().optional(),
})
type WriteDraftInput = z.infer<typeof WriteDraftInputSchema>

/**
 * `content.write_draft` — creates a new working entry when `id` is absent,
 * updates the existing one otherwise. Never touches the published state;
 * that is `content.publish`'s job alone, matching `ContentService` keeping
 * `create`/`update` and `publish` as distinct operations.
 */
export function createContentWriteDraftTool(
  service: ContentServiceLike,
): ToolDefinition<WriteDraftInput, Record<string, unknown>> {
  // Undoing a create is the trash, which every host has. Undoing an update
  // needs the host to restore a version; without it the tool cannot honestly
  // claim to be reversible, and `reversible: false` keeps a human in the loop.
  const restore = service.restore?.bind(service)
  return defineTool({
    name: 'content.write_draft',
    version: '1.0.0',
    description:
      'Create (no id) or update (with id) the draft of a content entry; never publishes. `values` holds field values keyed by field name — call content.schema first for the field keys, kinds and block types. An update only changes the fields it sends. A rich-text field takes Portable Text blocks; a blocks field (page builder) takes an array of { type, data } items and replaces that whole zone.',
    input: WriteDraftInputSchema,
    output: EntrySchema,
    permissions: ['content.write_draft'],
    sideEffects: true,
    // Reversible when the host can restore a version. The two cases a receipt
    // must tell apart are told apart by `undo` in the output, written while
    // the call runs: a create is undone by the trash, an update by making the
    // version it replaced current again (as a new version, so the history
    // stays append-only). `revert` refuses rather than guesses when the entry
    // was edited since. Not restored by an update's revert: the `provenance`
    // label (it is not part of a version).
    reversible: restore !== undefined,
    cost: 'low',
    async execute(input, ctx) {
      const context = accessContextOf(ctx.actor)
      if (input.id !== undefined) {
        const before = await service.read(context, input.collection, input.id, DEFAULT_READ_OPTIONS)
        const updated = await service.update(
          context,
          input.collection,
          input.id,
          { values: input.values },
          DEFAULT_READ_OPTIONS,
        )
        const previousVersion = versionOf(before)
        const version = versionOf(updated)
        if (previousVersion === null || version === null) return updated
        const undo: ContentUndo = {
          kind: 'restore-version',
          collection: input.collection,
          id: input.id,
          version,
          restoreVersion: previousVersion,
        }
        return { ...updated, undo }
      }
      const created = await service.create(
        context,
        input.collection,
        { values: input.values, ...(input.locale === undefined ? {} : { locale: input.locale }) },
        DEFAULT_READ_OPTIONS,
      )
      const undo = createdUndo(input.collection, created)
      return undo === undefined ? created : { ...created, undo }
    },
    ...(restore === undefined
      ? {}
      : {
          async revert(receipt: Record<string, unknown>, ctx: ToolContext) {
            const context = accessContextOf(ctx.actor)
            const undo = undoOf(receipt)
            if (undo.kind === 'trash-created') {
              await trashCreated(service, context, undo)
              return
            }
            if (undo.kind !== 'restore-version') {
              throw refused(
                'This receipt does not describe a draft write.',
                'Revert it with the tool that produced it.',
              )
            }
            const current = await workingEntryOrNull(service, context, undo.collection, undo.id)
            if (current === null) {
              throw refused(
                `"${undo.id}" no longer exists, so its previous version cannot be restored.`,
                'Restore it from the trash in the administration first.',
              )
            }
            const now = versionOf(current)
            if (now !== undo.version) {
              throw refused(
                `"${undo.id}" was edited after this update (version ${String(now)}, not ${undo.version}); nothing was restored.`,
                'Open its history in the administration and restore the version you want.',
                { collection: undo.collection, id: undo.id },
              )
            }
            await restore(
              context,
              undo.collection,
              undo.id,
              undo.restoreVersion,
              DEFAULT_READ_OPTIONS,
            )
          },
        }),
  })
}

const WriteTranslationInputSchema = z.object({
  collection: z.string(),
  /** The entry being translated, in the site's language it was written in. */
  sourceId: z.string().min(1),
  locale: z.string().min(1),
  values: z.record(z.string(), z.unknown()),
})
type WriteTranslationInput = z.infer<typeof WriteTranslationInputSchema>

/**
 * `content.write_translation` — creates the draft of an entry in another
 * language, linked to the entry it translates (contract A's
 * `translationOf`), so the site serves both as one family: one hreflang set,
 * one language switcher.
 *
 * A separate tool rather than a `translationOf` field on
 * `content.write_draft`, because contract C freezes the signature of a tool
 * already shipped (`docs/04-contrats.md`): a new tool is a minor, additive
 * change; a new field on an old one is not.
 *
 * Reversible: the translation this call created is the one thing `revert`
 * touches, and it only moves it to the trash (restorable), the same undo as a
 * created draft — and only while nobody has edited it since.
 */
export function createContentWriteTranslationTool(
  service: ContentServiceLike,
): ToolDefinition<WriteTranslationInput, Record<string, unknown>> {
  return defineTool({
    name: 'content.write_translation',
    version: '1.0.0',
    description:
      'Create the draft of an existing entry in another language, linked to it as its translation; never publishes. `sourceId` is the entry being translated, `locale` one of the site languages it does not exist in yet, `values` the translated field values (same keys as content.write_draft — call content.schema first). Publish it afterwards with content.publish.',
    input: WriteTranslationInputSchema,
    output: EntrySchema,
    permissions: ['content.write_draft'],
    sideEffects: true,
    reversible: true,
    cost: 'low',
    async execute(input, ctx) {
      const created = await service.create(
        accessContextOf(ctx.actor),
        input.collection,
        { values: input.values, locale: input.locale, translationOf: input.sourceId },
        DEFAULT_READ_OPTIONS,
      )
      const undo = createdUndo(input.collection, created)
      return undo === undefined ? created : { ...created, undo }
    },
    async revert(receipt, ctx) {
      const undo = undoOf(receipt)
      if (undo.kind !== 'trash-created') {
        throw refused(
          'This receipt does not describe a translation draft.',
          'Revert it with the tool that produced it.',
        )
      }
      await trashCreated(service, accessContextOf(ctx.actor), undo)
    },
  })
}

const PublishInputSchema = z.object({ collection: z.string(), id: z.string() })
type PublishInput = z.infer<typeof PublishInputSchema>

/** What visitors saw of an entry just before a publication, kept in the receipt. */
async function liveStateOf(
  service: ContentServiceLike,
  context: ContentAccessContext,
  collection: string,
  id: string,
): Promise<{
  readonly status: string
  readonly liveVersion: number | null
  readonly publishedAt: string | null
}> {
  const working = await service.read(context, collection, id, DEFAULT_READ_OPTIONS)
  const live = await publishedEntryOrNull(service, context, collection, id)
  if (live !== null) {
    return {
      status: 'published',
      liveVersion: versionOf(live),
      publishedAt: stringOf(live, 'publishedAt'),
    }
  }
  // Not published: the working entry carries the live status (an entry that
  // is not public takes edits straight into its live row, so no overlay can
  // make the two disagree).
  const status = stringOf(working, 'status') ?? 'unknown'
  return {
    status,
    liveVersion: status === 'published' ? versionOf(working) : null,
    publishedAt: stringOf(working, 'publishedAt'),
  }
}

/**
 * `content.publish`. Reversible when the host can restore a version and
 * unpublish: the receipt records what visitors saw before (never published →
 * `unpublish` puts the same status back; published before → the previously
 * live version is made current again and republished). `revert` refuses when
 * the entry has been edited or republished since, and when the earlier live
 * version is no longer kept by the collection's history. Not undone by a
 * revert: the publication date a first publication sets, and the working
 * draft a republication had pending (it stays in the history).
 */
export function createContentPublishTool(
  service: ContentServiceLike,
): ToolDefinition<PublishInput, Record<string, unknown>> {
  const restore = service.restore?.bind(service)
  const unpublish = service.unpublish?.bind(service)
  const canUndo = restore !== undefined && unpublish !== undefined
  return defineTool({
    name: 'content.publish',
    version: '1.0.0',
    description:
      'Publish the current draft of an existing content entry, making it visible on the site.',
    input: PublishInputSchema,
    output: EntrySchema,
    permissions: ['content.publish'],
    sideEffects: true,
    reversible: canUndo,
    cost: 'low',
    rateLimit: { perHour: 20 },
    async execute(input, ctx) {
      const context = accessContextOf(ctx.actor)
      const previous = canUndo
        ? await liveStateOf(service, context, input.collection, input.id)
        : null
      const published = await service.publish(
        context,
        input.collection,
        input.id,
        {},
        DEFAULT_READ_OPTIONS,
      )
      const version = versionOf(published)
      if (previous === null || version === null) return published
      const undo: ContentUndo = {
        kind: 'unpublish',
        collection: input.collection,
        id: input.id,
        version,
        previous,
      }
      return { ...published, undo }
    },
    ...(restore === undefined || unpublish === undefined
      ? {}
      : {
          async revert(receipt: Record<string, unknown>, ctx: ToolContext) {
            const context = accessContextOf(ctx.actor)
            const undo = undoOf(receipt)
            if (undo.kind !== 'unpublish') {
              throw refused(
                'This receipt does not describe a publication.',
                'Revert it with the tool that produced it.',
              )
            }
            const where = { collection: undo.collection, id: undo.id }
            const working = await workingEntryOrNull(service, context, undo.collection, undo.id)
            if (working === null) {
              throw refused(
                `"${undo.id}" no longer exists, so its publication cannot be undone.`,
                'Restore it from the trash in the administration first.',
                where,
              )
            }
            if (versionOf(working) !== undo.version) {
              throw refused(
                `"${undo.id}" was edited after it was published; the publication was left as it is.`,
                'Review the entry and its history in the administration.',
                where,
              )
            }
            const live = await publishedEntryOrNull(service, context, undo.collection, undo.id)
            const { previous } = undo
            if (live === null) {
              if (previous.status === 'published') {
                throw refused(
                  `"${undo.id}" is no longer published, so its previous public version cannot be put back by this undo.`,
                  'Restore the version you want from its history in the administration.',
                  where,
                )
              }
              // Not public now, not public before: already where this undo goes.
              return
            }
            if (versionOf(live) !== undo.version) {
              throw refused(
                `"${undo.id}" was published again after this call; the publication was left as it is.`,
                'Review the entry and its history in the administration.',
                where,
              )
            }

            if (previous.status === 'published') {
              if (previous.liveVersion === null) {
                throw refused(
                  `The version that was public before is unknown for "${undo.id}".`,
                  'Restore the version you want from its history in the administration.',
                  where,
                )
              }
              // The publication changed nothing visitors could see.
              if (previous.liveVersion === undo.version) return
              await restore(
                context,
                undo.collection,
                undo.id,
                previous.liveVersion,
                DEFAULT_READ_OPTIONS,
              )
              await service.publish(context, undo.collection, undo.id, {}, DEFAULT_READ_OPTIONS)
              return
            }
            if (previous.status === 'draft' || previous.status === 'archived') {
              await unpublish(
                context,
                undo.collection,
                undo.id,
                { status: previous.status },
                DEFAULT_READ_OPTIONS,
              )
              return
            }
            if (previous.status === 'scheduled' && previous.publishedAt !== null) {
              await unpublish(
                context,
                undo.collection,
                undo.id,
                { status: 'scheduled', publishedAt: previous.publishedAt },
                DEFAULT_READ_OPTIONS,
              )
              return
            }
            throw refused(
              `The status "${previous.status}" that "${undo.id}" had before cannot be put back by this undo.`,
              'Set the status you want from the administration.',
              where,
            )
          },
        }),
  })
}

const DeleteInputSchema = z.object({ collection: z.string(), id: z.string() })
type DeleteInput = z.infer<typeof DeleteInputSchema>
const DeleteOutputSchema = z.object({ ok: z.boolean() })

export function createContentDeleteTool(
  service: ContentServiceLike,
): ToolDefinition<DeleteInput, { ok: boolean }> {
  return defineTool({
    name: 'content.delete',
    version: '1.0.0',
    description:
      'Move a content entry to the trash. It stops being visible and can be restored from the trash in the administration until the retention window ends.',
    input: DeleteInputSchema,
    output: DeleteOutputSchema,
    permissions: ['content.delete'],
    sideEffects: true,
    // Deleting the row is not itself undoable from this tool's vantage
    // point (the service, not this wrapper, owns whatever retention or
    // trash mechanism it may have) — reversible: false forces approval.
    reversible: false,
    cost: 'low',
    async execute(input, ctx) {
      await service.remove(accessContextOf(ctx.actor), input.collection, input.id)
      return { ok: true }
    },
  })
}
