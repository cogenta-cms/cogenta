import { type AgentDeclaration, defineAgent } from '@cogenta/agents'

/**
 * "Il écrit toujours dans un brouillon, jamais en publication." No
 * `content.publish` in `tools` — structural, same reasoning `seoAgent`
 * (L5 task 5) documents: the runtime cannot grant what was never listed.
 *
 * "Mémoire procédurale : les corrections humaines sur ses brouillons
 * alimentent son apprentissage. C'est l'agent où le signal de feedback
 * compte le plus." Nothing new to build for this: `approvalToMemoryRecord`
 * (`@cogenta/agents`, L4 task 13) already converts a decided
 * `ApprovalRequest` into a `procedural` `MemoryRecord` — once this agent's
 * drafts flow through the approval queue (L4 task 9, which `autonomy:
 * 'propose'` below routes every write through), every human decision on a
 * draft already produces exactly that signal. A parallel mechanism here
 * would just duplicate it.
 */
export const contentAgent: AgentDeclaration = defineAgent({
  name: 'content',
  identity: './identity.md',
  model: { preferred: 'claude-sonnet', fallback: 'local' },
  tools: ['content.read', 'content.write_draft', 'media.read', 'agent.delegate'],
  skills: ['editorial-charter', 'tone-guide', 'article-templates'],
  autonomy: { default: 'propose' },
  budget: { tokensPerDay: 250_000, eurPerMonth: 15, callsPerHour: 30 },
  memory: { episodic: true, procedural: true, scope: 'site' },
  triggers: [{ on: 'content.gap_detected' }, { on: 'schedule', cron: '0 8 * * 1' }],
})
