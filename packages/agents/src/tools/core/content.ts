import { z } from 'zod'
import { defineTool } from '../define.js'
import type { ToolDefinition } from '../types.js'

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
    input: { readonly values: Readonly<Record<string, unknown>>; readonly locale?: string },
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
}

const DEFAULT_READ_OPTIONS: ContentReadOptions = { state: 'working', depth: 0 }

function accessContextOf(actor: {
  readonly id: string | null
  readonly roles: readonly string[]
}): ContentAccessContext {
  return { actor }
}

const EntrySchema = z.record(z.string(), z.unknown())

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
    description: 'Read one content entry by collection and id.',
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
  return defineTool({
    name: 'content.write_draft',
    version: '1.0.0',
    description: 'Create or update a working-state (draft) content entry.',
    input: WriteDraftInputSchema,
    output: EntrySchema,
    permissions: ['content.write_draft'],
    sideEffects: true,
    // Not reversible through this tool: undoing a create means deleting the
    // new entry, undoing an update means restoring a specific prior version
    // (`ContentService.restore`, keyed by version number) — two different
    // operations this wrapper cannot distinguish from the receipt alone
    // without guessing. `reversible: false` forces human approval instead
    // of a revert that might restore the wrong thing (R6).
    reversible: false,
    cost: 'low',
    async execute(input, ctx) {
      const context = accessContextOf(ctx.actor)
      if (input.id !== undefined) {
        return service.update(
          context,
          input.collection,
          input.id,
          { values: input.values },
          DEFAULT_READ_OPTIONS,
        )
      }
      return service.create(
        context,
        input.collection,
        { values: input.values, ...(input.locale === undefined ? {} : { locale: input.locale }) },
        DEFAULT_READ_OPTIONS,
      )
    },
  })
}

const PublishInputSchema = z.object({ collection: z.string(), id: z.string() })
type PublishInput = z.infer<typeof PublishInputSchema>

export function createContentPublishTool(
  service: ContentServiceLike,
): ToolDefinition<PublishInput, Record<string, unknown>> {
  return defineTool({
    name: 'content.publish',
    version: '1.0.0',
    description: 'Publish an existing content entry.',
    input: PublishInputSchema,
    output: EntrySchema,
    permissions: ['content.publish'],
    sideEffects: true,
    // Not reversible through this tool: publishing again with the prior
    // version's values is a distinct, explicit action (`content.write_draft`
    // + `content.publish`), not an automatic undo — R6 requires either
    // `revert` or `reversible: false` with forced human approval, and a
    // silent "unpublish" here would be a surprising side effect of its own.
    reversible: false,
    cost: 'low',
    rateLimit: { perHour: 20 },
    async execute(input, ctx) {
      return service.publish(
        accessContextOf(ctx.actor),
        input.collection,
        input.id,
        {},
        DEFAULT_READ_OPTIONS,
      )
    },
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
    description: 'Delete a content entry.',
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
