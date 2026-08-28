import { authHeader, request } from './http.js'
import { toUploadedDocument } from './site-plan-client.js'

/**
 * `/api/assistant` — L18 task 3.
 *
 * Shapes hand-mirrored from `@cogenta/api`'s `assistant-router.ts`, the same
 * reason every other `*-client.ts` here copies its server-side shape by hand:
 * this is a browser bundle and that package is Node code.
 */

export interface AssistCapability {
  readonly tool: string
  readonly label: string
  readonly description: string
  readonly cost: string
  /** Input fields the panel must collect beyond the entry text. */
  readonly needs: readonly string[]
}

/** Fiche 30 task 3 — one row of `usage.byTool`. */
export interface AssistToolUsage {
  readonly tool: string
  readonly calls: number
  readonly tokens: number
}

/** Fiche 30 task 3 — the whole toolset's spending this calendar month. */
export interface AssistUsageSnapshot {
  readonly tokensThisMonth: number
  readonly limit?: number
  readonly percentUsed?: number
  readonly nearLimit: boolean
  readonly overLimit: boolean
  readonly byTool: readonly AssistToolUsage[]
}

/** L22 task 4 — one content collection's place in the vector index. */
export interface AssistIndexedCollection {
  readonly name: string
  readonly enabled: boolean
  readonly count: number
}

/** Fiche 30 task 6 — the vector index's visible state, widened by L22 task 4 to explain *what* is indexed, not just how big it is. */
export interface AssistVectorInfo {
  readonly driver: string
  readonly dimensions: number
  readonly count: number
  readonly lastIndexedAt: string | null
  readonly collections: readonly AssistIndexedCollection[]
  /** The reserved pseudo-collection name uploaded reference documents live under — pass it in `runChat`'s `collections` to let the chat tool retrieve them too. */
  readonly referenceCollection: string
}

export const REFERENCE_DOCUMENT_STATUSES = ['pending', 'indexed', 'error'] as const
export type ReferenceDocumentStatus = (typeof REFERENCE_DOCUMENT_STATUSES)[number]

/** L22 task 4 — one uploaded reference document, hand-mirrored from `@cogenta/api`'s `AssistDocumentRecordLike`. */
export interface AssistReferenceDocument {
  readonly id: string
  readonly filename: string
  readonly format: string
  readonly characters: number
  readonly chunkCount: number
  readonly status: ReferenceDocumentStatus
  readonly errorMessage: string | null
  readonly warnings: readonly string[]
  readonly uploadedAt: string
  readonly uploadedBy: string | null
  readonly indexedAt: string | null
}

export interface AssistCapabilities {
  /**
   * False on a site with no AI provider. The route answers 200 in that case —
   * "switched off" is an answer, not an error — and the panel renders nothing.
   */
  readonly available: boolean
  readonly reason?: string
  readonly tools: readonly AssistCapability[]
  /** The text model configured, when there is a provider — fiche 30 tasks 2/3. */
  readonly model?: string
  /** Absent when no usage tracker is configured server-side. */
  readonly usage?: AssistUsageSnapshot
  /** Absent when the site has no vector store at all. */
  readonly vector?: AssistVectorInfo
}

/** Every writing tool answers with this shape. `applied` is always false. */
export interface AssistSuggestion {
  readonly suggestions: readonly string[]
  readonly note?: string
  readonly applied: false
}

/** `assist.chat`'s citation — a real retrieved passage, never invented (`packages/agents/src/assist/chat.ts`). */
export interface ChatSource {
  readonly collection: string
  readonly entryId: string
  readonly title: string
  readonly excerpt: string
}

export interface ChatAnswer {
  readonly answer: string
  readonly sources: readonly ChatSource[]
  readonly answeredFromSources: boolean
  readonly applied: false
}

export interface ClassificationResult {
  readonly labels: readonly { readonly label: string; readonly confidence: number }[]
  /** Labels the model proposed outside the site's vocabulary. Reported, never applied. */
  readonly rejected: readonly string[]
  readonly applied: false
}

export interface DuplicateMatch {
  readonly collection: string
  readonly entryId: string
  readonly excerpt: string
  readonly similarity: number
}

export const MODERATION_SEVERITIES = ['none', 'low', 'medium', 'high'] as const
export type ModerationSeverity = (typeof MODERATION_SEVERITIES)[number]

/** Closed union: nothing this route can return describes a destructive act. */
export type RecommendedAction = 'none' | 'review'

export interface DuplicateReport {
  readonly duplicates: readonly DuplicateMatch[]
  readonly threshold: number
  readonly recommendedAction: RecommendedAction
  readonly applied: false
}

export interface ModerationVerdict {
  readonly flagged: boolean
  readonly severity: ModerationSeverity
  readonly categories: readonly string[]
  readonly reason: string
  readonly recommendedAction: RecommendedAction
  readonly applied: false
}

export interface FaqDraft {
  readonly items: readonly { readonly question: string; readonly answer: string }[]
  readonly status: 'draft'
  readonly applied: false
}

export interface SchemaDraft {
  readonly jsonLd: Readonly<Record<string, unknown>>
  readonly status: 'draft'
  readonly applied: false
}

/** Fiche 55 task 3 — `assist.generate_agent_identity`'s output: a draft the agent-creation screen shows for review, never applied on its own. */
export interface GeneratedAgentIdentity {
  readonly role: string
  readonly objectives: readonly string[]
  readonly style: string | null
  readonly systemPrompt: string | null
  readonly applied: false
}

export function getAssistCapabilities(token: string): Promise<AssistCapabilities> {
  return request('/api/assistant', { headers: authHeader(token) })
}

/**
 * Generic over the output shape: every assistant tool answers `POST
 * /api/assistant/run` the same way on the wire (`{tool, input}` in,
 * `{data: <the tool's own output>}` out), and `@cogenta/api`'s router does not
 * special-case any one tool. `T` defaults to `AssistSuggestion` so every
 * existing caller — the writing-tools panel — keeps compiling unchanged.
 */
export function runAssistTool<T = AssistSuggestion>(
  token: string,
  tool: string,
  input: Readonly<Record<string, unknown>>,
): Promise<T> {
  return request('/api/assistant/run', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ tool, input }),
  })
}

export function runChat(
  token: string,
  input: {
    readonly question: string
    readonly locale: string
    readonly collections: readonly string[]
    readonly siteId: string
    readonly limit?: number
  },
): Promise<ChatAnswer> {
  return runAssistTool<ChatAnswer>(token, 'assist.chat', input)
}

export function runClassify(
  token: string,
  input: {
    readonly text: string
    readonly taxonomy: readonly string[]
    readonly maxLabels?: number
    readonly locale?: string
  },
): Promise<ClassificationResult> {
  return runAssistTool<ClassificationResult>(token, 'assist.classify', input)
}

export function runFindDuplicates(
  token: string,
  input: {
    readonly text: string
    readonly siteId: string
    readonly locale: string
    readonly collections: readonly string[]
    readonly excludeEntryId?: string
    readonly threshold?: number
    readonly limit?: number
  },
): Promise<DuplicateReport> {
  return runAssistTool<DuplicateReport>(token, 'assist.find_duplicates', input)
}

export function runModerate(
  token: string,
  input: { readonly text: string; readonly origin?: string; readonly locale?: string },
): Promise<ModerationVerdict> {
  return runAssistTool<ModerationVerdict>(token, 'assist.moderate', input)
}

export function runFaqDraft(
  token: string,
  input: { readonly text: string; readonly count?: number; readonly locale?: string },
): Promise<FaqDraft> {
  return runAssistTool<FaqDraft>(token, 'assist.faq_draft', input)
}

export function runSchemaOrgDraft(
  token: string,
  input: {
    readonly text: string
    readonly type: string
    readonly title?: string
    readonly url?: string
  },
): Promise<SchemaDraft> {
  return runAssistTool<SchemaDraft>(token, 'assist.schema_org_draft', input)
}

/** Fiche 55 task 3 — drafts a new agent's identity from a short brief. Never applied: the caller reviews the result and decides what, if anything, to save. */
export function runGenerateAgentIdentity(
  token: string,
  input: {
    readonly agentName: string
    readonly purpose: string
    readonly toolNames?: readonly string[]
    readonly constraints?: readonly string[]
  },
): Promise<GeneratedAgentIdentity> {
  return runAssistTool<GeneratedAgentIdentity>(token, 'assist.generate_agent_identity', input)
}

/** L22 task 4 — `GET /api/assistant/documents`. */
export function listAssistantDocuments(token: string): Promise<readonly AssistReferenceDocument[]> {
  return request('/api/assistant/documents', { headers: authHeader(token) })
}

/**
 * `POST /api/assistant/documents`. Takes a `File` directly rather than an
 * already-base64 string, reusing `site-plan-client.ts`'s `toUploadedDocument`
 * for the encoding — the second real user of it (the site-plan uploader was
 * the first), rather than a second hand-rolled chunked-base64 loop.
 */
export async function uploadAssistantDocument(
  token: string,
  file: File,
): Promise<AssistReferenceDocument> {
  const { filename, contentBase64 } = await toUploadedDocument(file)
  return request('/api/assistant/documents', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ filename, contentBase64 }),
  })
}

/** `DELETE /api/assistant/documents/:id`. */
export function deleteAssistantDocument(
  token: string,
  id: string,
): Promise<{ id: string; deleted: boolean }> {
  return request(`/api/assistant/documents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: authHeader(token),
  })
}
