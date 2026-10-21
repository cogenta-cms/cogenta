import { randomUUID } from 'node:crypto'
import {
  type ApprovalQueue,
  buildManifest,
  type ContentBrowseServiceLike,
  type ContentSchemaServiceLike,
  type ContentSearchServiceLike,
  type ContentServiceLike,
  createContentCollectionsTool,
  createContentDeleteTool,
  createContentListTool,
  createContentPublishTool,
  createContentReadTool,
  createContentSchemaTool,
  createContentSearchTool,
  createContentWriteDraftTool,
  createMediaListTool,
  createMediaReadTool,
  createMediaWriteTool,
  createSiteConfigReadTool,
  createToolRegistry,
  type ExecutableTool,
  type ToolDefinition,
  withAudit,
  withAutonomy,
} from '@cogenta/agents'
import {
  type AccessContext,
  type ContentService,
  canAccessMedia,
  type PermissionLayer,
  type SearchRouter,
} from '@cogenta/api'
import type { ApiKey, ApiKeyStore, AuditLog } from '@cogenta/auth'
import { type BlockRegistry, safeParseBlock } from '@cogenta/blocks'
import { CogentaError, isCogentaError, type Logger, type MediaStore } from '@cogenta/core'
import type { McpCallContext, McpTool, McpToolAnnotations } from '@cogenta/mcp'
import {
  type BlockZones,
  buildPath,
  type CollectionDefinition,
  type ContentBlock,
  type FieldDefinition,
  fieldSchema,
  pruneEmptyBlockData,
} from '@cogenta/schema'

/**
 * The tools an MCP client gets, for one caller, built the same way for both
 * transports — `cogenta mcp` (stdio) and the `/api/mcp` route of `cogenta
 * serve` (Streamable HTTP). There is one assembly on purpose: the two
 * transports differ in how a caller proves who it is, never in what a tool
 * does, which checks it passes or how a write is approved.
 *
 * Every call re-resolves the caller (`resolveIdentity`): a key revoked, an
 * account disabled or a role changed in the administration takes effect on
 * the very next message of an open session, not when the client reconnects.
 *
 * Order of the gates on a call, outermost first: the caller still
 * authenticates → the input is valid for this site (collection, fields,
 * blocks, permission, target exists) → a human decides, for a non-reversible
 * write (R6, contract C) → the caller is re-resolved once more, since the
 * wait may have been long → the tool runs, audited. Validation comes *before*
 * the human: an administrator must never be asked to approve a request that
 * cannot succeed.
 */

type Actor = AccessContext['actor']

export interface McpIdentity {
  readonly actor: Actor
  /** False for the anonymous default — media and site tools need a real identity. */
  readonly authenticated: boolean
  /** Who is calling, for the person who approves: `key "Claude Desktop"`, `account editor@site.test`. */
  readonly label: string
}

/** Read by `cogenta mcp` when no --api-key/--email/--role is given, so a client config can keep the key out of `args` (and out of `ps`). */
export const MCP_API_KEY_ENV = 'COGENTA_MCP_API_KEY'

function apiKeyIsUsable(key: ApiKey | null, now: number): key is ApiKey {
  if (key === null || key.revokedAt !== undefined) return false
  return key.expiresAt === undefined || new Date(key.expiresAt).getTime() > now
}

/**
 * Who an API key acts as, re-read on every call — the same resolution for
 * both transports. Same id shape and "roles = scope" mapping as
 * `resolveApiKeyActor` in `@cogenta/api`, so a key behaves identically over
 * REST, over MCP HTTP and over stdio. A key revoked or expired since the
 * previous message refuses the next one.
 */
export function apiKeyIdentityResolver(
  apiKeys: Pick<ApiKeyStore, 'getById'>,
  keyId: string,
  now: () => number = Date.now,
): () => Promise<McpIdentity> {
  return async () => {
    const key = await apiKeys.getById(keyId)
    if (!apiKeyIsUsable(key, now())) {
      throw new CogentaError({
        code: 'MCP_ACTOR_API_KEY_INVALID',
        message: 'This API key was revoked or has expired: this session no longer authenticates.',
        hint: 'Create a new key in the administration ("MCP" screen) and update the client configuration.',
      })
    }
    return {
      actor: { id: `apikey:${key.id}`, roles: key.scope },
      authenticated: true,
      label: `key "${key.name}"`,
    }
  }
}

export interface McpToolSite {
  readonly name: string
  readonly url?: string
  readonly locales: readonly string[]
  readonly defaultLocale: string
}

export interface McpSiteToolsOptions {
  readonly collections: readonly CollectionDefinition[]
  readonly contentService: ContentService
  readonly permissions: PermissionLayer
  /** Re-reads database role overrides (ADR-0028) before a write runs — an approval can wait while a grant is revoked. */
  readonly refreshPermissions?: () => Promise<void>
  readonly mediaStore: MediaStore
  /** The site's own search route. Absent, `content.search` is not offered. */
  readonly search?: SearchRouter
  /** The blocks a page may hold — the vocabulary plus any plugin block. */
  readonly blocks: BlockRegistry
  readonly site: McpToolSite
  readonly logger: Logger
  readonly auditLog: AuditLog
  readonly approvalQueue: ApprovalQueue
  readonly transport: 'stdio' | 'http'
  /** Where an administrator decides, named in what a waiting client is told. */
  readonly approvalsUrl?: string
  readonly now?: () => number
}

const APPROVALS_PLACE = 'the Cogenta administration, Agents screen, "Actions à approuver"'

/**
 * How many writes one caller may have waiting for a person at once. A
 * person reviews them one by one; a leaked key queuing thousands would bury
 * a real request among them and fill the disk the queue lives on.
 */
export const MCP_MAX_PENDING_APPROVALS = 5

/** Presentation for a client: a title, MCP's advisory hints, and what the call costs a human. */
const PRESENTATION: Readonly<
  Record<string, { readonly title: string; readonly annotations: McpToolAnnotations }>
> = {
  'content.read': {
    title: 'Read an entry',
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  'content.search': {
    title: 'Search content',
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  'content.collections': {
    title: 'List collections',
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  'content.list': {
    title: 'List entries',
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  'content.schema': {
    title: 'Describe the content model',
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  'content.write_draft': {
    title: 'Write a draft',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  'content.publish': {
    title: 'Publish an entry',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  'content.delete': {
    title: 'Move an entry to the trash',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  'media.read': {
    title: 'Read a media asset',
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  'media.list': {
    title: 'List media',
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  'media.write': {
    title: 'Edit media metadata',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  'site.config_read': {
    title: 'Read site settings',
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
}

/** What MCP says about a tool beyond its registry description — said where a client shows it. */
const MCP_DESCRIPTION: Readonly<Record<string, string>> = {
  'content.list':
    'List entries of one collection, most recently updated first (drafts included when your role may see them): id, title, public path, status. Call content.collections first for the collection names; use content.search to find one entry among many.',
}

function approvalNote(): string {
  return ` Requires a human approval: the call waits until an administrator approves or rejects it in ${APPROVALS_PLACE}; nothing is written before that, and a rejection is returned as an error. Validation errors are returned at once, before any approval is asked.`
}

/** The instructions an MCP client hands its model, for this site. */
export function mcpServerInstructions(site: McpToolSite): string {
  return [
    `Cogenta site "${site.name}"${site.url === undefined ? '' : ` (${site.url})`}, languages: ${site.locales.join(', ')} (default ${site.defaultLocale}).`,
    'Find before you write: content.collections and content.schema give the collections, their fields and the block types; content.search and content.list give entry ids; content.read gives the current values.',
    'content.write_draft creates (no id) or updates (with id) a draft and never publishes; content.publish makes it public; content.delete moves it to the trash (restorable).',
    'Page-builder zones (fields of kind "blocks") are written inside values, as an array of { "type": "<block type>", "data": { …block fields } } that replaces the whole zone. Rich-text fields take Portable Text.',
    `Every write waits for a human approval in ${APPROVALS_PLACE}: tell the user to approve it there, and do not resend a request that is still waiting — that would ask twice.`,
  ].join('\n')
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalid(message: string, hint: string, details?: Readonly<Record<string, unknown>>) {
  return new CogentaError({
    code: 'CONTENT_INVALID',
    message,
    hint,
    ...(details === undefined ? {} : { details }),
  })
}

/** The first string field worth naming an entry by. */
function titleOf(values: Readonly<Record<string, unknown>>): string | null {
  const candidate = values['title'] ?? values['name'] ?? values['heading']
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null
}

/**
 * One block as a client may send it — `{ type, key?, data }` (the stored
 * shape, what `content.read` returns) or `{ _type, _key?, …fields }` (the
 * contract B shape) — normalised to the stored one. A key left out is minted
 * by the store.
 */
function blockFrom(item: unknown, zone: string, index: number): ContentBlock {
  if (!isRecord(item)) {
    throw invalid(
      `Block ${index + 1} of "${zone}" is not an object.`,
      'Send each block as { "type": "<block type>", "data": { …fields } }.',
    )
  }
  const type = item['type'] ?? item['_type']
  if (typeof type !== 'string' || type.length === 0) {
    throw invalid(
      `Block ${index + 1} of "${zone}" has no type.`,
      'Every block names its type, for example { "type": "hero", "data": { "title": "…" } }. content.schema lists the types.',
    )
  }
  const rawKey = item['key'] ?? item['_key']
  const key = typeof rawKey === 'string' ? rawKey : ''
  let data: Readonly<Record<string, unknown>>
  if (isRecord(item['data'])) {
    data = item['data']
  } else {
    const { type: _t, _type: _tt, key: _k, _key: _kk, _version: _v, data: _d, ...rest } = item
    data = rest
  }
  return { key, type, data }
}

function blocksOf(value: unknown, zone: string): readonly ContentBlock[] {
  if (value === null || value === undefined) return []
  if (!Array.isArray(value)) {
    throw invalid(
      `"${zone}" is a page-builder zone: its value must be an array of blocks.`,
      'Send [{ "type": "<block type>", "data": { …fields } }, …]; the array replaces the whole zone.',
    )
  }
  return value.map((item, index) => blockFrom(item, zone, index))
}

/**
 * `values` as a client sends them, split the way the store keeps an entry:
 * declared fields in `values`, page-builder zones in `blocks`. Before this,
 * a zone sent inside `values` was accepted and silently dropped — the store
 * skips a blocks field among values — so no page could be built over MCP.
 */
export function splitBlockZones(
  collection: CollectionDefinition,
  input: Readonly<Record<string, unknown>>,
): { readonly values: Readonly<Record<string, unknown>>; readonly blocks?: BlockZones } {
  const values: Record<string, unknown> = {}
  const blocks: Record<string, readonly ContentBlock[]> = {}
  for (const [key, value] of Object.entries(input)) {
    if (collection.fields[key]?.kind === 'blocks') blocks[key] = blocksOf(value, key)
    else values[key] = value
  }
  return Object.keys(blocks).length === 0 ? { values } : { values, blocks }
}

function assertBlocksValid(
  collection: CollectionDefinition,
  zones: BlockZones,
  registry: BlockRegistry,
): void {
  for (const [zone, blocks] of Object.entries(zones)) {
    const field = collection.fields[zone] as FieldDefinition
    const allow = field.options['allow']
    const allowed = Array.isArray(allow) ? new Set(allow.map(String)) : null
    for (const [index, block] of blocks.entries()) {
      const definition = registry.get(block.type)
      if (definition === undefined) {
        throw invalid(
          `Block ${index + 1} of "${zone}" has the unknown type "${block.type}".`,
          `Use one of: ${registry.names().sort().join(', ')}. content.schema describes each one.`,
          { zone, index, type: block.type },
        )
      }
      if (allowed !== null && !allowed.has(block.type)) {
        throw invalid(
          `"${zone}" does not accept "${block.type}" blocks.`,
          `This zone accepts: ${[...allowed].join(', ')}.`,
          { zone, index, type: block.type },
        )
      }
      const outcome = safeParseBlock(
        {
          ...pruneEmptyBlockData(block.data),
          _key: block.key === '' ? 'new' : block.key,
          _type: block.type,
          _version: definition.version,
        },
        registry,
      )
      if (!outcome.ok) {
        throw invalid(
          `Block ${index + 1} of "${zone}" (${block.type}) is invalid: ${outcome.error.message}`,
          outcome.error.hint ?? 'Check the block fields with content.schema.',
          { zone, index, type: block.type },
        )
      }
    }
  }
}

/** Each provided declared field against its own validator — what the store would refuse, refused before a human is asked. */
function assertValuesValid(
  collection: CollectionDefinition,
  values: Readonly<Record<string, unknown>>,
): void {
  const fieldNames = Object.keys(collection.fields)
  for (const [key, value] of Object.entries(values)) {
    const field = collection.fields[key]
    if (field === undefined) {
      throw invalid(
        `"${key}" is not a field of the "${collection.name}" collection.`,
        `Its fields are: ${fieldNames.join(', ')}. Call content.schema for their kinds.`,
        { collection: collection.name, field: key },
      )
    }
    if ((field.kind === 'date' || field.kind === 'datetime') && value === '') continue
    const parsed = fieldSchema(field).safeParse(value)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const path =
        issue === undefined || issue.path.length === 0 ? '' : ` (at ${issue.path.join('.')})`
      throw invalid(
        `"${key}" is not a valid ${field.kind} value${path}: ${issue?.message ?? 'invalid'}.`,
        field.kind === 'richText'
          ? 'A rich-text field takes Portable Text: [{ "_type": "block", "children": [{ "_type": "span", "text": "…" }] }].'
          : 'Check the field kind and options with content.schema.',
        { collection: collection.name, field: key },
      )
    }
  }
}

/**
 * The real `ContentService`, adapted for writes that come from an MCP client:
 * the acting account is recorded (`createdBy`/`updatedBy`/`publishedBy`, never
 * read from the input), page-builder zones are written as zones, and the
 * entry says it was written by an AI assistant — contract A's `provenance`,
 * which the European AI framework is why it exists. A new entry is
 * `generated`; an update to an entry a person wrote becomes `assisted`.
 */
function contentServiceLikeOf(
  service: ContentService,
  options: { readonly defaultLocale: string; readonly agent: string; readonly now: () => number },
): ContentServiceLike {
  const provenanceDetail = () => ({
    agent: options.agent,
    at: new Date(options.now()).toISOString(),
  })
  return {
    read: (context, collection, id, readOptions) =>
      service.read(context, collection, id, readOptions) as unknown as Promise<
        Record<string, unknown>
      >,
    create: async (context, collection, input, readOptions) => {
      const split = splitBlockZones(service.collection(collection), input.values)
      const created = await service.create(
        context,
        collection,
        {
          values: split.values,
          ...(split.blocks === undefined ? {} : { blocks: split.blocks }),
          locale: input.locale ?? options.defaultLocale,
          createdBy: context.actor.id,
          provenance: 'generated',
          provenanceDetail: provenanceDetail(),
        },
        readOptions,
      )
      // A new entry has no published face yet: what was written is the draft.
      return { ...created, state: 'working' } as unknown as Record<string, unknown>
    },
    update: async (context, collection, id, input, readOptions) => {
      const split = splitBlockZones(service.collection(collection), input.values)
      const current = await service.read(context, collection, id, { state: 'working', depth: 0 })
      const updated = await service.update(
        context,
        collection,
        id,
        {
          values: split.values,
          ...(split.blocks === undefined ? {} : { blocks: split.blocks }),
          updatedBy: context.actor.id,
          provenance: current.provenance === 'generated' ? 'generated' : 'assisted',
          provenanceDetail: provenanceDetail(),
        },
        readOptions,
      )
      return { ...updated, state: 'working' } as unknown as Record<string, unknown>
    },
    publish: (context, collection, id, input, readOptions) =>
      service.publish(
        context,
        collection,
        id,
        { ...input, publishedBy: context.actor.id },
        readOptions,
      ) as unknown as Promise<Record<string, unknown>>,
    remove: (context, collection, id) => service.remove(context, collection, id),
  }
}

function browseServiceOf(
  service: ContentService,
  permissions: PermissionLayer,
  collections: readonly CollectionDefinition[],
): ContentBrowseServiceLike {
  const byName = new Map(collections.map((collection) => [collection.name, collection]))
  const pathOf = (
    collection: CollectionDefinition,
    values: Readonly<Record<string, unknown>>,
    locale: string,
  ): string | null => {
    if (collection.routing === undefined) return null
    const params: Record<string, string> = {}
    for (const [key, value] of Object.entries(values)) {
      if (typeof value === 'string') params[key] = value
    }
    try {
      return buildPath(collection, params, locale)
    } catch {
      return null
    }
  }
  return {
    collections: async (context) =>
      (await service.summary(context)).map((summary) => ({
        collection: summary.collection,
        total: summary.total,
        published: summary.published,
        routed: byName.get(summary.collection)?.routing !== undefined,
      })),
    list: async (context, name, listOptions) => {
      const collection = byName.get(name)
      if (collection === undefined || !permissions.can('read', collection, context).allowed) {
        // An error, not an empty list: "no entries" and "wrong name" must
        // not look the same to a model choosing what to do next.
        throw new CogentaError({
          code: 'CONTENT_NOT_FOUND',
          message: `There is no collection named "${name}" that you may read.`,
          hint: 'content.collections lists the collections available to you.',
        })
      }
      const working = permissions.canReadUnpublished(collection, context).allowed
      const page = await service.list(context, name, {
        filter: undefined,
        sort: { field: 'updatedAt', direction: 'desc' },
        limit: listOptions.limit,
        cursor: undefined,
        locale: undefined,
        requestedState: working ? 'working' : 'published',
        requestedStatus: undefined,
        trashed: undefined,
        depth: 0,
      })
      return {
        items: page.items.map((item) => ({
          id: item.id,
          title: titleOf(item.values),
          path: pathOf(collection, item.values, item.locale),
          status: item.status,
        })),
      }
    },
  }
}

function schemaServiceOf(
  service: ContentService,
  collections: readonly CollectionDefinition[],
): ContentSchemaServiceLike {
  const summaryOf = (collection: CollectionDefinition) => ({
    collection: collection.name,
    labelSingular: collection.labels.singular,
    labelPlural: collection.labels.plural,
    routed: collection.routing !== undefined,
    fields: Object.entries(collection.fields).map(([key, field]) => ({
      key,
      kind: field.kind,
      label: field.admin?.label ?? null,
      required: field.required ?? false,
      options: field.options,
    })),
  })
  return {
    describe: async (context, name) => {
      const readable = new Set((await service.summary(context)).map((entry) => entry.collection))
      return collections
        .filter((collection) => readable.has(collection.name))
        .filter((collection) => name === undefined || collection.name === name)
        .map(summaryOf)
    },
  }
}

/**
 * `content.search` over the site's own search route — its permission checks,
 * its scope rules, its excerpts — never a second search implementation.
 * Drafts are searched only where this actor may read them.
 */
function searchServiceOf(
  router: SearchRouter,
  permissions: PermissionLayer,
  collections: readonly CollectionDefinition[],
): ContentSearchServiceLike {
  return {
    search: async (context, query) => {
      const scope = collections.filter(
        (collection) =>
          (query.collection === undefined || collection.name === query.collection) &&
          permissions.can('read', collection, context).allowed,
      )
      if (scope.length === 0) return []
      const drafts = scope.every(
        (collection) => permissions.canReadUnpublished(collection, context).allowed,
      )
      const response = await router.handle(
        {
          method: 'GET',
          path: '/api/search',
          query: {
            q: query.text,
            collections: scope.map((collection) => collection.name).join(','),
            limit: String(query.limit),
            ...(drafts ? { status: 'any' } : {}),
          },
        },
        context,
      )
      const body = response.body
      if (response.status !== 200 || !isRecord(body) || !Array.isArray(body['data'])) {
        const error = isRecord(body) && isRecord(body['error']) ? body['error'] : undefined
        throw new CogentaError({
          code: 'QUERY_INVALID',
          message: typeof error?.['message'] === 'string' ? error['message'] : 'The search failed.',
          hint: typeof error?.['hint'] === 'string' ? error['hint'] : 'Try a different query.',
        })
      }
      return body['data'].filter(isRecord).map((hit) => ({
        collection: String(hit['collection']),
        id: String(hit['id']),
        title: String(hit['title'] ?? ''),
        status: String(hit['status'] ?? ''),
        locale: String(hit['locale'] ?? ''),
        excerpt: String(hit['excerpt'] ?? ''),
      }))
    },
  }
}

/** Which collection actions a tool needs at least once on this site to be offered at all. */
function actionsFor(
  name: string,
): readonly ('read' | 'create' | 'update' | 'publish' | 'delete')[] {
  if (name === 'content.write_draft') return ['create', 'update']
  if (name === 'content.publish') return ['publish']
  if (name === 'content.delete') return ['delete']
  return name.startsWith('content.') ? ['read'] : []
}

function sameRoles(left: readonly string[], right: readonly string[]): boolean {
  const a = [...left].sort()
  const b = [...right].sort()
  return a.length === b.length && a.every((role, index) => role === b[index])
}

function cancelledCode(error: unknown): boolean {
  return isCogentaError(error) && error.code === 'APPROVAL_REQUEST_CANCELLED'
}

export function createMcpToolSource(
  options: McpSiteToolsOptions,
  resolveIdentity: () => Promise<McpIdentity>,
): () => Promise<readonly McpTool[]> {
  const now = options.now ?? Date.now
  const byName = new Map(options.collections.map((collection) => [collection.name, collection]))
  const browse = browseServiceOf(options.contentService, options.permissions, options.collections)
  const schema = schemaServiceOf(options.contentService, options.collections)
  const search =
    options.search === undefined
      ? undefined
      : searchServiceOf(options.search, options.permissions, options.collections)

  function collectionOf(name: unknown): CollectionDefinition {
    const collection = typeof name === 'string' ? byName.get(name) : undefined
    if (collection === undefined) {
      throw new CogentaError({
        code: 'CONTENT_NOT_FOUND',
        message: `There is no collection named "${String(name)}".`,
        hint: `Collections on this site: ${[...byName.keys()].join(', ')}. content.collections lists those you may read.`,
      })
    }
    return collection
  }

  function assertAllowed(
    action: 'create' | 'update' | 'publish' | 'delete',
    collection: CollectionDefinition,
    actor: Actor,
    ownerId?: string | null,
  ): void {
    const decision = options.permissions.can(action, collection, { actor }, ownerId)
    if (decision.allowed) return
    throw new CogentaError({
      code: 'FORBIDDEN',
      message: `Your role may not ${action} entries of "${collection.name}".`,
      hint: 'Ask an administrator for a key with a role that may, or leave this change to a person.',
    })
  }

  /**
   * Everything that can be known to fail, refused before an administrator is
   * asked: an audit run had a person approve a request with an unknown field
   * name, only for the write to be refused afterwards.
   */
  async function preflight(
    tool: string,
    input: Readonly<Record<string, unknown>>,
    actor: Actor,
  ): Promise<void> {
    const context = { actor }
    if (tool === 'content.write_draft') {
      const collection = collectionOf(input['collection'])
      const raw = isRecord(input['values']) ? input['values'] : {}
      const split = splitBlockZones(collection, raw)
      assertValuesValid(collection, split.values)
      if (split.blocks !== undefined) assertBlocksValid(collection, split.blocks, options.blocks)
      if (typeof input['id'] === 'string') {
        const entry = await options.contentService.read(context, collection.name, input['id'], {
          state: 'working',
          depth: 0,
        })
        assertAllowed('update', collection, actor, entry.createdBy)
      } else {
        assertAllowed('create', collection, actor)
      }
      return
    }
    if (tool === 'content.publish' || tool === 'content.delete') {
      const collection = collectionOf(input['collection'])
      if (typeof input['id'] !== 'string') return
      const entry = await options.contentService.read(context, collection.name, input['id'], {
        state: 'working',
        depth: 0,
      })
      assertAllowed(
        tool === 'content.publish' ? 'publish' : 'delete',
        collection,
        actor,
        entry.createdBy,
      )
      if (tool === 'content.publish') {
        const missing = Object.entries(collection.fields)
          .filter(([key, field]) => {
            if (field.required !== true || field.kind === 'blocks') return false
            const value = entry.values[key]
            return (
              value === undefined ||
              value === null ||
              value === '' ||
              (Array.isArray(value) && value.length === 0)
            )
          })
          .map(([key]) => key)
        if (missing.length > 0) {
          throw invalid(
            `This entry cannot be published yet: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} required.`,
            'Fill them with content.write_draft, then publish.',
            { collection: collection.name, missing },
          )
        }
      }
      return
    }
    if (tool === 'media.write' && typeof input['id'] === 'string') {
      const asset = await options.mediaStore.get(input['id'])
      if (asset === null) {
        throw new CogentaError({
          code: 'CONTENT_NOT_FOUND',
          message: `No media asset with id "${input['id']}".`,
          hint: 'media.list gives the ids of the library.',
        })
      }
    }
  }

  /** The queue as one call sees it: it says it is waiting, and withdraws its request if the client gives up. */
  function queueForCall(
    agentName: string,
    callerPrefix: string,
    context: McpCallContext,
  ): ApprovalQueue {
    const where =
      options.approvalsUrl === undefined
        ? APPROVALS_PLACE
        : `${APPROVALS_PLACE} (${options.approvalsUrl})`
    return {
      list: (status) => options.approvalQueue.list(status),
      decide: (id, decision, decidedBy, reason) =>
        options.approvalQueue.decide(id, decision, decidedBy, reason),
      async request(input, signal) {
        const waiting = (await options.approvalQueue.list('pending')).filter((item) =>
          item.agentName.startsWith(callerPrefix),
        ).length
        if (waiting >= MCP_MAX_PENDING_APPROVALS) {
          throw new CogentaError({
            code: 'MCP_APPROVALS_PENDING_LIMIT',
            message: `${waiting} writes from this connection are already waiting for a human approval; this one was not queued.`,
            hint: `Ask the user to approve or reject the waiting ones in ${where}, then send it again.`,
          })
        }
        context.progress?.(`Waiting for a human approval in ${where}.`)
        const started = now()
        const keepAlive = setInterval(() => {
          const minutes = Math.round((now() - started) / 60_000)
          context.progress?.(`Still waiting for a human approval (${minutes} min) in ${where}.`)
        }, 15_000)
        keepAlive.unref?.()
        try {
          return await options.approvalQueue.request(input, signal)
        } catch (error) {
          if (cancelledCode(error)) await withdraw(agentName)
          throw error
        } finally {
          clearInterval(keepAlive)
        }
      },
    }
  }

  /**
   * A request whose client gave up (timed out, cancelled, disconnected) is
   * closed as rejected, so nobody approves an action whose caller already
   * reported a failure — and may retry, which would write twice. The
   * per-call reference in `agentName` makes the match exact.
   */
  async function withdraw(agentName: string): Promise<void> {
    try {
      const pending = await options.approvalQueue.list('pending')
      for (const request of pending.filter((item) => item.agentName === agentName)) {
        await options.approvalQueue.decide(
          request.id,
          'rejected',
          'mcp-client',
          'Withdrawn: the MCP client cancelled or disconnected before a decision. It was not run.',
        )
      }
    } catch (error) {
      options.logger.warn('MCP could not withdraw an abandoned approval request', {
        error: isCogentaError(error) ? error.code : String(error),
      })
    }
  }

  function govern(tool: ExecutableTool, identity: McpIdentity): McpTool {
    const name = tool.spec.name
    const presentation = PRESENTATION[name]
    const needsHuman = tool.sideEffects !== false && tool.reversible !== true
    const description = `${MCP_DESCRIPTION[name] ?? tool.spec.description}${needsHuman ? approvalNote() : ''}`

    return {
      spec: { ...tool.spec, description },
      ...(presentation === undefined
        ? {}
        : {
            title: presentation.title,
            annotations: { title: presentation.title, ...presentation.annotations },
          }),
      async execute(input, context) {
        if (context.signal.aborted) {
          throw new CogentaError({
            code: 'APPROVAL_REQUEST_CANCELLED',
            message: 'The MCP call was cancelled before it ran.',
            hint: 'Send it again if it is still needed.',
          })
        }
        await preflight(name, input, identity.actor)

        const reference = randomUUID().slice(0, 8)
        const callerPrefix = `mcp · ${identity.label} · `
        const agentName = `${callerPrefix}${identity.actor.roles.join(', ')} · #${reference}`
        const guarded: ExecutableTool = {
          ...tool,
          async execute(toolInput, toolContext) {
            // The approval may have waited minutes: the key may be revoked,
            // the account disabled, its roles changed. Decide on who the
            // caller is now, not on who it was when it asked.
            const current = await resolveIdentity()
            if (
              current.actor.id !== identity.actor.id ||
              !sameRoles(current.actor.roles, identity.actor.roles)
            ) {
              throw new CogentaError({
                code: 'FORBIDDEN',
                message:
                  'The roles of this connection changed while the action waited; it was not run.',
                hint: 'Send it again: it will be checked against the current roles.',
              })
            }
            if (name.startsWith('content.')) await options.refreshPermissions?.()
            return tool.execute(toolInput, toolContext)
          },
        }
        const audited = withAudit(
          withAutonomy(guarded, {
            agentName,
            autonomy: { default: 'autonomous' },
            approvalQueue: queueForCall(agentName, callerPrefix, context),
            logger: options.logger,
          }),
          {
            agentName: 'mcp',
            actor: identity.actor,
            autonomyLevel: needsHuman ? 'execute_with_approval' : 'autonomous',
            auditLog: {
              record: (record) => {
                const output = record.diff?.['output']
                const entryId =
                  isRecord(output) && typeof output['id'] === 'string' ? output['id'] : undefined
                return options.auditLog.record({
                  ...record,
                  ...(entryId === undefined ? {} : { entryId }),
                  diff: {
                    ...record.diff,
                    origin: 'mcp',
                    transport: options.transport,
                    client: identity.label,
                  },
                })
              },
            },
            targetOf: (toolInput) => ({
              ...(typeof toolInput['collection'] === 'string'
                ? { collection: toolInput['collection'] }
                : {}),
              ...(typeof toolInput['id'] === 'string' ? { entryId: toolInput['id'] } : {}),
            }),
            onAuditFailure: (error) =>
              options.logger.error('MCP audit write failed', { error: String(error) }),
          },
        )
        return audited.execute(input, context)
      },
    }
  }

  return async () => {
    const identity = await resolveIdentity()
    const { actor, authenticated } = identity
    const content = contentServiceLikeOf(options.contentService, {
      defaultLocale: options.site.defaultLocale,
      agent: `mcp:${identity.label}`,
      now,
    })
    const definitions: ToolDefinition[] = [
      createContentReadTool(content),
      ...(search === undefined ? [] : [createContentSearchTool(search)]),
      createContentCollectionsTool(browse),
      createContentListTool(browse),
      createContentSchemaTool(schema),
      createContentWriteDraftTool(content),
      createContentPublishTool(content),
      createContentDeleteTool(content),
    ]
    if (authenticated && canAccessMedia(actor, 'media.read')) {
      definitions.push(
        createMediaReadTool(options.mediaStore),
        createMediaListTool(options.mediaStore),
      )
    }
    if (authenticated && canAccessMedia(actor, 'media.write')) {
      definitions.push(createMediaWriteTool(options.mediaStore))
    }
    if (authenticated) definitions.push(createSiteConfigReadTool())

    const allowed = definitions.filter((tool) => {
      const actions = actionsFor(tool.name)
      if (actions.length === 0) return true
      return options.collections.some((collection) =>
        actions.some(
          (action) => options.permissions.can(action, collection, { actor }, actor.id).allowed,
        ),
      )
    })
    const manifest = buildManifest(
      createToolRegistry(allowed),
      allowed.map((tool) => tool.name),
      {
        site: options.site,
        actor,
        logger: {
          info: (message, fields) => options.logger.info(message, fields),
          warn: (message, fields) => options.logger.warn(message, fields),
          error: (message, fields) => options.logger.error(message, fields),
        },
      },
    )
    return manifest.map((tool) => govern(tool, identity))
  }
}
