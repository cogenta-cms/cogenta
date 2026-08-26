/**
 * Fiche 45 — Prompt Settings, the shared template library every utility
 * prompt in `@cogenta/agents` reads from. Same "real but local" tier as
 * `agents/store.ts`/`skills/library.ts` (R1): a file on disk, no external
 * service, no new dependency.
 *
 * A `PromptTemplate` is deliberately **not** a `SkillMetadata`/`AgentSkill`:
 * a skill is a whole piece of context an agent loads ("how this site wants
 * content written"); a prompt template is the single instruction line one
 * specific tool call sends the model, with `{{placeholder}}` slots the tool
 * fills in at call time (see `render.ts`). Different shape, different
 * lifecycle, so a different store rather than overloading one interface for
 * both.
 */

/** Suggested vocabulary for the admin's category picker. The field itself stays a plain string — an open list, not a closed taxonomy (fiche 45 §3 task 1: "texte/traduction/agent/image/…"). */
export const PROMPT_TEMPLATE_CATEGORIES = [
  'text',
  'translation',
  'seo',
  'moderation',
  'agent',
  'image',
] as const
export type PromptTemplateCategory = (typeof PROMPT_TEMPLATE_CATEGORIES)[number]

export interface PromptTemplate {
  readonly id: string
  readonly name: string
  readonly description: string
  /** Free text — see `PROMPT_TEMPLATE_CATEGORIES` for the suggested vocabulary, not an enforced one. */
  readonly category: string
  /** The instruction text a tool sends the model, with `{{field}}` placeholders the caller resolves — see `render.ts`'s `renderPromptTemplate`. */
  readonly template: string
  readonly builtin: boolean
  readonly createdAt: string
  readonly updatedAt: string
}

export interface PromptTemplateInput {
  readonly name: string
  readonly description: string
  readonly category: string
  readonly template: string
}

export type PromptTemplatePatch = Partial<PromptTemplateInput>

/**
 * Same contract shape as `AgentSkillStore` (`skills/library.ts`) — list/get/
 * create/update/remove — deliberately, so the two stores share one test
 * suite pattern (fiche 45 §5's own criterion) even though what they store
 * differs.
 */
export interface PromptTemplateStore {
  list(): Promise<readonly PromptTemplate[]>
  get(id: string): Promise<PromptTemplate | undefined>
  create(input: PromptTemplateInput, builtin?: boolean): Promise<PromptTemplate>
  update(id: string, patch: PromptTemplatePatch): Promise<PromptTemplate>
  /** Refuses to remove a builtin (`PROMPT_TEMPLATE_BUILTIN_UNDELETABLE`). */
  remove(id: string): Promise<void>
}
