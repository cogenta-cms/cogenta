import { authHeader, request } from './http.js'

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

export interface AssistCapabilities {
  /**
   * False on a site with no AI provider. The route answers 200 in that case —
   * "switched off" is an answer, not an error — and the panel renders nothing.
   */
  readonly available: boolean
  readonly reason?: string
  readonly tools: readonly AssistCapability[]
}

/** Every writing tool answers with this shape. `applied` is always false. */
export interface AssistSuggestion {
  readonly suggestions: readonly string[]
  readonly note?: string
  readonly applied: false
}

export function getAssistCapabilities(token: string): Promise<AssistCapabilities> {
  return request('/api/assistant', { headers: authHeader(token) })
}

export function runAssistTool(
  token: string,
  tool: string,
  input: Readonly<Record<string, unknown>>,
): Promise<AssistSuggestion> {
  return request('/api/assistant/run', {
    method: 'POST',
    headers: authHeader(token),
    body: JSON.stringify({ tool, input }),
  })
}
