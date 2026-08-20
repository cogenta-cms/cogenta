import { CogentaError } from '@cogenta/core'
import type { z } from 'zod'
import { assembleContext, type DataItem, type SiteContext } from '../identity/context.js'
import type { ProviderClient, TokenUsage } from '../providers/types.js'

/**
 * The single-shot completion every L18 assistant tool is built on.
 *
 * Deliberately *not* the agent loop (`runAgentLoop`): every tool in this lot is
 * one call in, one suggestion out, with no tools of its own to call. Routing
 * them through the loop would give a rewriting suggestion the ability to reach
 * `content.write_draft`, which is exactly the thing L18's acceptance criteria
 * forbid — "aucune action de ce lot ne modifie ou supprime du contenu sans
 * validation humaine explicite".
 *
 * Every piece of site content handed to the model goes through
 * `assembleContext`'s DATA channel (R8): escaped, tagged with its source, and
 * carried in its own message rather than concatenated into the system prompt,
 * under a constitution that says in its first clause that a DATA block is
 * information and never an instruction.
 *
 * No API key ever reaches this layer (R7): it holds a `ProviderClient` the
 * runtime already configured, and has no way to read or forward a credential.
 */

export interface AssistAgent {
  readonly name: string
  readonly role: string
  readonly objectives: readonly string[]
  readonly style?: string
}

export interface AssistRequest {
  readonly agent: AssistAgent
  /** What to do. Runtime-generated (a tool's own prompt), never user content. */
  readonly instruction: string
  /** The untrusted half: entry text, a comment, an import. Always tagged as data. */
  readonly data: readonly DataItem[]
  readonly maxTokens?: number
  readonly temperature?: number
  readonly signal?: AbortSignal
  /** Contract C tool name this call is made on behalf of — fiche 30 task 3's per-tool usage attribution. Absent means the call is not attributed to any one tool. */
  readonly tool?: string
}

export interface AssistRuntime {
  readonly provider: string
  readonly model: string
  complete(request: AssistRequest): Promise<string>
  completeJson<T>(request: AssistRequest, schema: z.ZodType<T>): Promise<T>
}

export interface AssistRuntimeOptions {
  readonly provider: ProviderClient
  readonly site: SiteContext
  readonly defaultMaxTokens?: number
  /** Fiche 30 task 3: reports every completion's real token usage, attributed to `request.tool` when the caller named one. Never blocks or throws on its own — a usage tracker records, it does not decide. */
  readonly onUsage?: (info: {
    readonly tool: string | undefined
    readonly usage: TokenUsage
  }) => void
}

const DEFAULT_MAX_TOKENS = 1200

function responseInvalid(reason: string, hint: string): CogentaError {
  return new CogentaError({
    code: 'ASSIST_RESPONSE_INVALID',
    message: `The model's answer could not be used: ${reason}.`,
    hint,
  })
}

/**
 * Pulls the JSON object or array out of a reply that may be wrapped in prose or
 * a markdown fence. Same approach `generateSkin` already takes, and for the same
 * reason: models add a fence roughly as often as they do not, and failing the
 * whole suggestion over a decoration would be a worse product than tolerating it.
 */
export function extractJson(content: string): unknown {
  const trimmed = content.trim()
  const candidates: [number, number][] = []
  const objectStart = trimmed.indexOf('{')
  const objectEnd = trimmed.lastIndexOf('}')
  const arrayStart = trimmed.indexOf('[')
  const arrayEnd = trimmed.lastIndexOf(']')
  if (objectStart !== -1 && objectEnd > objectStart) candidates.push([objectStart, objectEnd])
  if (arrayStart !== -1 && arrayEnd > arrayStart) candidates.push([arrayStart, arrayEnd])
  // Whichever opens first is the outer value; an array of objects starts with
  // `[`, an object containing an array starts with `{`.
  candidates.sort((a, b) => a[0] - b[0])

  for (const [start, end] of candidates) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1))
    } catch {
      // Try the other shape before giving up.
    }
  }
  throw responseInvalid(
    'no JSON value was found in it',
    'This is a model-side malformed answer — run the suggestion again.',
  )
}

export function createAssistRuntime(options: AssistRuntimeOptions): AssistRuntime {
  const { provider, site } = options

  async function chat(request: AssistRequest): Promise<string> {
    const { system, dataMessages } = assembleContext({
      site,
      agent: request.agent,
      task: { instruction: request.instruction },
      data: request.data,
    })

    const response = await provider.chat(
      {
        model: provider.model,
        system,
        // DATA first, then a plain restatement of the task. The restatement is
        // what keeps the instruction the *last* thing the model reads, after
        // any content that might be trying to look like one.
        messages: [
          ...dataMessages,
          { role: 'user', content: `Carry out the TASK described in your system context.` },
        ],
        maxTokens: request.maxTokens ?? options.defaultMaxTokens ?? DEFAULT_MAX_TOKENS,
        ...(request.temperature === undefined ? {} : { temperature: request.temperature }),
      },
      request.signal === undefined ? undefined : { signal: request.signal },
    )

    options.onUsage?.({ tool: request.tool, usage: response.usage })

    if (response.content === null || response.content.trim().length === 0) {
      throw responseInvalid(
        'it was empty',
        'The model returned no text. Run the suggestion again, or try a shorter input.',
      )
    }
    return response.content
  }

  return {
    provider: provider.name,
    model: provider.model,
    complete: chat,

    async completeJson<T>(request: AssistRequest, schema: z.ZodType<T>): Promise<T> {
      const raw = await chat(request)
      const parsed = schema.safeParse(extractJson(raw))
      if (!parsed.success) {
        throw responseInvalid(
          `it did not match the shape this suggestion needs (${parsed.error.issues
            .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
            .join('; ')})`,
          'This is a model-side malformed answer — run the suggestion again.',
        )
      }
      return parsed.data
    },
  }
}
