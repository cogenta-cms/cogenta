export type PiiKind = 'email' | 'phone' | 'credit_card' | 'ip_address'

export interface PiiMatch {
  readonly kind: PiiKind
  readonly value: string
  /** Offset in the text as it stood right before this match's own pattern pass — not stable across the whole `redactText` call once earlier passes have already replaced text. */
  readonly index: number
}

export interface RedactionResult {
  readonly text: string
  readonly matches: readonly PiiMatch[]
}

/**
 * "Redaction des données personnelles avant envoi au modèle, avec mode
 * « rien ne sort »." `enabled: true` makes any provider not named in
 * `localProviderNames` an error, not a fallback — a run configured this way
 * must genuinely be unable to leak, not merely be discouraged from it.
 */
export interface NoDataLeavesPolicy {
  readonly enabled: boolean
  /** Provider names treated as never leaving this machine (e.g. a locally-hosted client's `.name`). */
  readonly localProviderNames: readonly string[]
}
