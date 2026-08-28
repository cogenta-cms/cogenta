import type { SkinTokens } from '@cogenta/render'
import type { CollectionDefinition } from '@cogenta/schema'
import type { DocumentFormat } from '../documents/extract-text.js'
import type { DetectedConstraint } from './constraints.js'
import type { StructuralGapSuggestion } from './structural-gaps.js'

/**
 * The shapes L19's four agents pass between each other.
 *
 * Nothing here is ever applied. Every one of these is a **draft**: the plan
 * exists so a human can read it, accept parts of it and refuse others
 * (`./approval.js`), and only what they accepted is ever handed to a
 * scaffolder or a schema writer. R6 is not a review step bolted on at the
 * end — it is why these types are separate from `CollectionDefinition` in
 * the first place.
 */

export interface BriefSource {
  readonly filename: string
  readonly format: DocumentFormat
  readonly characters: number
  readonly truncated: boolean
}

export interface BriefPage {
  readonly title: string
  readonly purpose: string
}

export interface BriefContentType {
  readonly name: string
  readonly description: string
}

/** What the analysis agent understood, plus what was read out of the document without it. */
export interface SiteBrief {
  /** The kind of activity the site is for, in the document's own terms. */
  readonly activity: string
  readonly audience: string
  readonly tone: string
  /** BCP-47-ish locale codes. Constrained by a `language` constraint when the document states one. */
  readonly languages: readonly string[]
  readonly pages: readonly BriefPage[]
  readonly contentTypes: readonly BriefContentType[]
  /** Deterministically scanned from the document first, then whatever the model added. */
  readonly constraints: readonly DetectedConstraint[]
  readonly summary: string
  readonly sources: readonly BriefSource[]
  readonly warnings: readonly string[]
}

export interface ProposedCollection {
  /** A real contract A collection, built by `defineCollection` — never a parallel format. */
  readonly definition: CollectionDefinition
  /** Why the agent proposed it, in one sentence, for the human reading the plan. */
  readonly rationale: string
}

export interface ContentModelProposal {
  readonly collections: readonly ProposedCollection[]
}

export interface ProposedPage {
  readonly title: string
  readonly slug: string
  readonly purpose: string
}

export interface SkinCandidate {
  readonly id: string
  /** A short name a human can pick by: "Warm editorial", "Clinical mono". */
  readonly label: string
  readonly rationale: string
  readonly tokens: SkinTokens
  /** How many generate/validate rounds this candidate needed. */
  readonly attempts: number
}

export interface DemoEntry {
  readonly collection: string
  readonly values: Readonly<Record<string, unknown>>
}

/** Everything the planner produced, before any human has looked at it. */
export interface SitePlanDraft {
  readonly id: string
  readonly createdAt: string
  readonly brief: SiteBrief
  readonly contentModel: ContentModelProposal
  readonly pages: readonly ProposedPage[]
  readonly skins: readonly SkinCandidate[]
  readonly demoContent: readonly DemoEntry[]
  /** What was removed or flagged because it contradicted an explicit constraint. */
  readonly violations: readonly ConstraintViolation[]
  /**
   * Usual pages this plan, and the site it would join, still lack —
   * contact, a legal notice, a privacy policy (fiche 60 task 5). Its own
   * reviewable section, never applied on its own (R6).
   */
  readonly structuralGaps: readonly StructuralGapSuggestion[]
  readonly warnings: readonly string[]
}

export interface ConstraintViolation {
  readonly constraint: DetectedConstraint
  /** What the model proposed that contradicted it. */
  readonly proposed: string
  /** `'removed'`: dropped from the plan before the human ever saw it. `'flagged'`: kept, but marked. */
  readonly action: 'removed' | 'flagged'
  readonly explanation: string
}
