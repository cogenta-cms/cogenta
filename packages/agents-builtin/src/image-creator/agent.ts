import { type AgentDeclaration, defineAgent } from '@cogenta/agents'

/**
 * "Je pense qu'on doit ajouter un agent de génération d'image, ça permet
 * qu'on le configure en choisissant le bon modèle" — the product owner,
 * asking for images to have an owner rather than being a function call
 * buried in another feature.
 *
 * The model choice that request is about is now real: a provider entry can
 * declare an `imageModel` alongside its text one (`StoredProviderConfig`,
 * `@cogenta/agents`), so an admin picks the image model from the same
 * Providers screen as everything else. A multimodal vendor is one entry
 * sharing one key — which is why this agent's own `model` field still names
 * a *text* provider: it is the model that reasons about what to draw, and
 * the image model is resolved separately from the provider registry. Putting
 * an image model in `model.preferred` would conflate two different kinds of
 * client behind one name, and a fallback chain "anthropic → openai" means
 * nothing for pixels.
 *
 * **What it may do, and what it structurally cannot.** Two tools:
 * `assist.generate_image` (`sideEffects: false` — it returns data URLs and
 * stores nothing, by its own contract) and
 * `media.store_generated_image` (`sideEffects: true`, `reversible: false`).
 * That second pair of flags is not decoration: `withAutonomy` forces an
 * approval for a side-effecting tool that is not reversible *whatever* the
 * configured level, so `autonomous` cannot make this agent fill a library on
 * its own. A human confirms every file that lands. `autonomy: propose` is
 * pinned on top of that, so even the proposal is deliberate.
 *
 * Disabled by default, like every other seed here: nothing exports an
 * "image-creator" entry from `builtinAgentSeeds()`, so this catalog entry is
 * inert until an operator wires it into their own site.
 *
 * Its budget is deliberately small. Image generation is the most expensive
 * call in this codebase by an order of magnitude — `assist.generate_image`
 * carries its own `rateLimit` of 30/hour for that reason — and an agent that
 * can quietly bill a site for a hundred pictures is a bug even when every
 * picture is good.
 */
export const imageCreatorAgent: AgentDeclaration = defineAgent({
  name: 'image-creator',
  identity: './identity.md',
  model: { preferred: 'claude-sonnet', fallback: 'local' },
  tools: ['assist.generate_image', 'media.store_generated_image'],
  autonomy: { default: 'propose' },
  budget: { tokensPerDay: 40_000, eurPerMonth: 8, callsPerHour: 12 },
  memory: { episodic: false, semantic: false, scope: 'site' },
})
