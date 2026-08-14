import type { ProviderToolCall } from '../providers/types.js'

/**
 * Guards against the "infinite loop" failure mode L4's own pitfalls call out:
 * an agent that calls the same tool with the same input over and over,
 * getting nowhere. Keys on name + a stable stringify of the input (sorted
 * keys, so `{a:1,b:2}` and `{b:2,a:1}` count as the same call).
 */
export class RepetitionGuard {
  private readonly seen = new Map<string, number>()
  private readonly maxRepeats: number

  constructor(maxRepeats = 2) {
    this.maxRepeats = maxRepeats
  }

  /** True once `call` has already been made `maxRepeats` times before this one. */
  wouldRepeat(call: ProviderToolCall): boolean {
    return (this.seen.get(signatureOf(call)) ?? 0) >= this.maxRepeats
  }

  record(call: ProviderToolCall): void {
    const key = signatureOf(call)
    this.seen.set(key, (this.seen.get(key) ?? 0) + 1)
  }
}

function signatureOf(call: ProviderToolCall): string {
  return `${call.name}:${stableStringify(call.input)}`
}

function stableStringify(value: Readonly<Record<string, unknown>>): string {
  return JSON.stringify(sortKeysDeep(value))
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entryValue]) => [key, sortKeysDeep(entryValue)]),
    )
  }
  return value
}
