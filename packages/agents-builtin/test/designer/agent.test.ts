import { describe, expect, it } from 'vitest'
import { designerAgent } from '../../src/designer/agent.js'

describe('designerAgent', () => {
  it('is a frozen, valid AgentDeclaration', () => {
    expect(Object.isFrozen(designerAgent)).toBe(true)
    expect(designerAgent.name).toBe('designer')
  })

  it('declares exactly the tools the design doc names', () => {
    expect(designerAgent.tools).toEqual([
      'content.read',
      'media.read',
      'site.config_read',
      'http.fetch',
      'channel.send',
      'build.trigger',
    ])
  })

  /**
   * Its declared perimeter is "propose theme/template changes", never
   * "apply them". Contract C's own enforcement point is that the runtime
   * cannot grant a permission that was never listed in `tools` — so the
   * refusal this test proves is structural, not a hope that the agent
   * behaves: none of these strings appear anywhere in `designerAgent.tools`,
   * which means a caller cannot even construct a valid tool-call request
   * for them against this declaration.
   */
  it('never declares a tool that writes content, media, config or a deployment', () => {
    const outOfPerimeter = [
      // content/media the agent must never touch — that is contentAgent's
      // and seoAgent's domain, not this one's (see identity.md, "Ce que
      // tu ne fais jamais").
      'content.write_draft',
      'content.publish',
      'content.delete',
      'media.write',
      'site.config_write',
      // no tool anywhere in the contract C registry writes a theme file, a
      // skin token sheet or a block layout (see agent.ts's own comment) —
      // asserting its absence here still documents the intent even though
      // the string could never have existed to begin with.
      'theme.write',
      'skin.write',
      // publishing a change is explicitly withheld; only build.trigger
      // (verification) is granted.
      'deploy.trigger',
      // schema/database access never belongs to a theme/design agent —
      // R5, contract D's isolation rule, transposed to this agent's tools.
      'schema.read',
      'deps.patch',
    ]
    for (const tool of outOfPerimeter) {
      expect(designerAgent.tools).not.toContain(tool)
    }
  })

  it('never runs unattended: autonomy stays at the propose default', () => {
    expect(designerAgent.autonomy?.default).toBe('propose')
    expect(designerAgent.autonomy?.overrides).toBeUndefined()
  })

  it('points its identity at the long-form design reference document', () => {
    expect(designerAgent.identity).toBe('./identity.md')
  })
})
