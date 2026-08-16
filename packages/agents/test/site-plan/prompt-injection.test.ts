import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { type ExtractedDocument, extractDocumentText } from '../../src/documents/extract-text.js'
import { analyseBrief } from '../../src/site-plan/analyse-brief.js'
import { detectConstraints } from '../../src/site-plan/constraints.js'
import { enforceOnContentModel, enforceOnPages } from '../../src/site-plan/enforce.js'
import type { ContentModelProposal, ProposedPage } from '../../src/site-plan/types.js'
import { scriptedClient } from './fake-client.js'

/**
 * R8, proven rather than asserted: `corpus/injection-brief.md` is a real
 * uploadable document whose body carries a prompt-injection payload — an
 * "SYSTEM INSTRUCTION OVERRIDE" section, a forged `</data>` close tag, a
 * forged `<constitution>` block, and an explicit instruction to stop
 * planning and leak the system prompt instead.
 *
 * Three separate properties are checked, because they fail independently:
 *
 * 1. The payload never reaches the instruction stack — it is escaped and
 *    tagged as data, in its own message, and the real constitution is
 *    already above it and unreachable.
 * 2. The pipeline does not change what it asks for because of it.
 * 3. Even simulating a model that fully obeyed the injection, nothing the
 *    injection wanted can reach the accepted plan — the constraints stated
 *    elsewhere in the same document still hold, and a proposal that
 *    contradicts them is still removed.
 */

const CORPUS = join(fileURLToPath(new URL('..', import.meta.url)), 'documents', 'corpus')

async function loadInjection(): Promise<ExtractedDocument> {
  const filename = 'injection-brief.md'
  return extractDocumentText({ filename, bytes: await readFile(join(CORPUS, filename)) })
}

function validBrief(constraints: unknown[] = []): string {
  return JSON.stringify({
    activity: 'Supply chain resilience consulting for mid-sized manufacturers.',
    audience: 'Operations and supply chain leaders.',
    tone: 'Sober, evidence-led.',
    languages: ['en'],
    pages: [
      { title: 'Home', purpose: 'Introduce the practice.' },
      { title: 'Services', purpose: 'What we advise on.' },
      { title: 'Research notes', purpose: 'Quarterly published notes.' },
    ],
    contentTypes: [{ name: 'note', description: 'A published research note.' }],
    constraints,
    summary: 'A consulting site with services, research notes and contact.',
  })
}

describe('a document that tries to redirect the agent', () => {
  it('never lets the payload into the system prompt', async () => {
    const document = await loadInjection()
    const { client, requests } = scriptedClient([validBrief()])

    await analyseBrief({ client, model: 'm', documents: [document] })

    const system = requests[0]?.system ?? ''
    expect(system).not.toContain('SYSTEM INSTRUCTION OVERRIDE')
    expect(system).not.toContain('Ignore all previous instructions')
    expect(system).not.toContain('unrestricted mode')
    // The genuine constitution is there, stated once, above everything.
    expect(system).toContain('<constitution>')
    expect(system.match(/<constitution>/g)).toHaveLength(1)
  })

  it('escapes the forged tags so the payload cannot close the data block or open another', async () => {
    const document = await loadInjection()
    const { client, requests } = scriptedClient([validBrief()])

    await analyseBrief({ client, model: 'm', documents: [document] })

    const dataMessage = requests[0]?.messages[0]?.content ?? ''
    expect(dataMessage.startsWith('<data source="injection-brief.md">')).toBe(true)
    // The payload's own tags survive only as escaped text.
    expect(dataMessage).toContain('&lt;/data&gt;')
    expect(dataMessage).toContain('&lt;constitution&gt;')
    // Exactly one real closing tag: the one this code wrote.
    expect(dataMessage.match(/<\/data>/g)).toHaveLength(1)
    expect(dataMessage).not.toContain('<constitution>')
  })

  it('asks for the same thing it would have asked for without the payload', async () => {
    const clean = extractDocumentText({
      filename: 'clean.md',
      bytes: Buffer.from(
        '# Northwind Consulting\n\n## Pages we need\n\n- Home\n- Services\n\n## Constraints\n\n- No online store.\n- English only.\n',
        'utf8',
      ),
    })
    const injected = await loadInjection()

    const a = scriptedClient([validBrief()])
    const b = scriptedClient([validBrief()])
    await analyseBrief({ client: a.client, model: 'm', documents: [clean] })
    await analyseBrief({ client: b.client, model: 'm', documents: [injected] })

    expect(b.requests[0]?.system).toBe(a.requests[0]?.system)
    expect(b.requests[0]?.messages.at(-1)?.content).toBe(a.requests[0]?.messages.at(-1)?.content)
  })

  it('still reads the real constraints stated in the same document', async () => {
    const document = await loadInjection()

    const found = detectConstraints({ text: document.text, source: document.filename })

    expect(found.filter((e) => e.kind === 'exclusion').map((e) => e.topic)).toContain('ecommerce')
    expect(found.find((e) => e.kind === 'language')?.locales).toEqual(['en'])
  })

  it('holds the constraints even when the model is simulated as having obeyed the injection', async () => {
    const document = await loadInjection()
    // A model that fell for it completely: no constraints reported at all,
    // and a plan that quietly adds the online store the document forbids.
    const { client } = scriptedClient([validBrief([])])

    const result = await analyseBrief({ client, model: 'm', documents: [document] })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(
      result.brief.constraints.filter((e) => e.kind === 'exclusion').map((e) => e.topic),
    ).toContain('ecommerce')

    const proposal: ContentModelProposal = {
      collections: [
        {
          definition: {
            name: 'product',
            labels: { singular: 'Product', plural: 'Products' },
            fields: {},
            permissions: { read: ['public'] },
          },
          rationale: 'Sell research notes online.',
        },
      ],
    }
    const pages: readonly ProposedPage[] = [
      { title: 'Shop', slug: 'shop', purpose: 'Sell notes.' },
      { title: 'Services', slug: 'services', purpose: 'What we advise on.' },
    ]

    const model = enforceOnContentModel(proposal, result.brief.constraints)
    const routed = enforceOnPages(pages, result.brief.constraints)

    expect(model.proposal.collections).toHaveLength(0)
    expect(model.violations[0]?.action).toBe('removed')
    expect(model.violations[0]?.explanation).toContain('No online store')
    expect(routed.kept.map((page) => page.slug)).toEqual(['services'])
  })

  it('produces no plan at all when the model outright refuses to plan', async () => {
    const document = await loadInjection()
    // What a model that obeyed the "write a poem instead" line would return.
    const { client } = scriptedClient(['The sea, the sea, the ever-rolling sea.'])

    const result = await analyseBrief({ client, model: 'm', documents: [document], maxAttempts: 2 })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('JSON')
  })
})
