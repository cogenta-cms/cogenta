import { CogentaError } from '@cogenta/core'
import type { ChatRequest } from './types.js'

/**
 * Contract C names its tools with a dot (`content.read`, `redirects.create`,
 * `code.propose_patch`); every vendor wire format refuses that character in
 * a function name — OpenAI-compatible endpoints (OpenAI, DeepSeek, Qwen,
 * OpenRouter…) and Anthropic both enforce `^[a-zA-Z0-9_-]+$`, and Gemini
 * has its own narrower rules. Found live: DeepSeek answered every agent run
 * with `400 Invalid 'tools[0].function.name': string does not match
 * pattern` before the request ever reached a model, and nothing in the
 * catalog could have worked with a single tool declared.
 *
 * The fix lives here rather than in the tool names themselves: contract C
 * is frozen, and a dot is the right separator for humans, the audit log
 * and the permission taxonomy. Each adapter encodes on the way out and
 * decodes on the way back, so no other layer ever sees a wire name.
 *
 * Encoding is deterministic (`.` and anything else outside the safe set →
 * `__`), which is what lets an assistant message from earlier in the
 * conversation — one that echoes a previous tool call by name — be encoded
 * without any state. Decoding needs the reverse map, built from the request
 * itself; a wire name the map does not know (a model inventing a tool) is
 * returned unchanged, and the runtime's own registry refuses it downstream
 * exactly as it would have before.
 */

const UNSAFE = /[^a-zA-Z0-9_-]/gu

export function encodeToolName(name: string): string {
  return name.replace(UNSAFE, '__')
}

/**
 * The decoder for one request. Throws when two distinct tool names would
 * collide on the wire (`a.b` next to `a__b`) — a misconfiguration worth a
 * loud error, never a silently wrong tool.
 */
export function createToolNameDecoder(request: ChatRequest): (wire: string) => string {
  const byWire = new Map<string, string>()
  const register = (name: string): void => {
    const wire = encodeToolName(name)
    const existing = byWire.get(wire)
    if (existing !== undefined && existing !== name) {
      throw new CogentaError({
        code: 'PROVIDER_REQUEST_FAILED',
        message: `Tool names "${existing}" and "${name}" are indistinguishable once encoded for the provider ("${wire}").`,
        hint: 'Rename one of the two tools so they differ by more than characters the wire format refuses.',
      })
    }
    byWire.set(wire, name)
  }
  for (const tool of request.tools ?? []) register(tool.name)
  for (const message of request.messages) {
    for (const call of message.toolCalls ?? []) register(call.name)
  }
  return (wire) => byWire.get(wire) ?? wire
}
