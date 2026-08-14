/**
 * "Tout contenu produit porte `provenance: generated` ou `assisted`. Le
 * champ n'est pas optionnel." Only these two values exist for agent-authored
 * content — `'human'` is never a value this agent can produce, by
 * construction (see `provenance.ts`).
 */
export type ContentProvenance = 'generated' | 'assisted'

export type ContentSeverity = 'error' | 'warning' | 'info'

/** Kept decoupled from `SeoFinding`/`PerformanceFinding` — same severity-tagged-finding shape, different domain, no cross-domain coupling for its own sake. */
export interface ContentFinding {
  readonly check: string
  readonly severity: ContentSeverity
  readonly message: string
}
