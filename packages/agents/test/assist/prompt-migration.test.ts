import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createAssistRuntime,
  createClassifyTool,
  createContentChatTool,
  createFaqTool,
  createFilePromptTemplateStore,
  createHashingEmbeddingProvider,
  createMemoryVectorStore,
  createModerateTool,
  createSchemaOrgTool,
  createSemanticSearch,
  createWritingTools,
  ensureBuiltinPromptTemplates,
  type PromptTemplateStore,
} from '../../src/index.js'
import type { ChatRequest } from '../../src/providers/types.js'
import { createFakeProvider, TEST_SITE, toolContext } from './fake-provider.js'

/**
 * Fiche 45 §5's non-regression requirement, verbatim: "chaque outil assist.*
 * migré produit un résultat identique avant/après migration (le seed
 * reproduit le texte d'origine mot pour mot)".
 *
 * Every case below runs the same tool call twice against the same fake
 * provider — once with no store at all (the exact code path this package
 * shipped before fiche 45), once with a store freshly seeded by
 * `ensureBuiltinPromptTemplates` — and asserts the `<task>` section of the
 * system prompt the model actually received is byte-for-byte identical. A
 * store seeded with the builtin templates is therefore provably a no-op on
 * a site's current behaviour; only an actual *edit* to a template changes
 * anything (covered separately in `render.test.ts`).
 */

function taskOf(request: ChatRequest | undefined): string {
  const system = request?.system ?? ''
  const match = /<task>([\s\S]*?)<\/task>/u.exec(system)
  if (match === null) throw new Error('no <task> section in system prompt')
  return match[1] ?? ''
}

let dir: string
let seededStore: PromptTemplateStore

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cogenta-prompt-migration-'))
  seededStore = createFilePromptTemplateStore({ dir })
  await ensureBuiltinPromptTemplates(seededStore)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('the eight writing tools, seeded vs. unmigrated', () => {
  // One reply per tool, shaped for whichever of `complete`/`completeJson`
  // that tool actually calls — a single generic string would make the four
  // JSON tools (proofread/meta_description/titles/tags) throw
  // `ASSIST_RESPONSE_INVALID` before the instruction is ever compared.
  const cases: Record<string, { readonly input: unknown; readonly reply: string }> = {
    'assist.rewrite': {
      input: { text: 'a sentence', goal: 'shorter', locale: 'fr' },
      reply: 'a rewritten sentence',
    },
    'assist.proofread': {
      input: { text: 'a sentence', locale: 'fr' },
      reply: JSON.stringify({ corrected: 'a sentence.', changes: [] }),
    },
    'assist.summarise': {
      input: { text: 'a sentence', maxWords: 40, locale: 'fr' },
      reply: 'a summary',
    },
    'assist.translate': {
      input: { text: 'a sentence', targetLocale: 'fr', sourceLocale: 'en' },
      reply: 'une phrase',
    },
    'assist.meta_description': {
      input: { text: 'a sentence', title: 'A title' },
      reply: JSON.stringify({ descriptions: ['One.'] }),
    },
    'assist.titles': {
      input: { text: 'a sentence', count: 3 },
      reply: JSON.stringify({ titles: ['A title'] }),
    },
    'assist.tags': {
      input: { text: 'a sentence', existing: ['history'] },
      reply: JSON.stringify({ tags: ['history'] }),
    },
    'assist.alt_text': {
      input: { context: 'a nave', filename: 'nave.jpg' },
      reply: 'a stone nave',
    },
  }

  it('send the identical task instruction either way, for every tool', async () => {
    for (const [name, { input, reply }] of Object.entries(cases)) {
      const before = createFakeProvider(reply)
      const after = createFakeProvider(reply)
      const runtimeBefore = createAssistRuntime({ provider: before, site: TEST_SITE })
      const runtimeAfter = createAssistRuntime({ provider: after, site: TEST_SITE })

      const toolBefore = createWritingTools(runtimeBefore).find((t) => t.name === name)
      const toolAfter = createWritingTools(runtimeAfter, seededStore).find((t) => t.name === name)
      if (toolBefore === undefined || toolAfter === undefined) {
        throw new Error(`missing tool ${name}`)
      }

      await toolBefore.execute(toolBefore.input.parse(input), toolContext())
      await toolAfter.execute(toolAfter.input.parse(input), toolContext())

      expect(taskOf(after.calls[0])).toBe(taskOf(before.calls[0]))
    }
  })
})

describe('classify and moderate, seeded vs. unmigrated', () => {
  it('classify sends the identical task instruction either way', async () => {
    const before = createFakeProvider(JSON.stringify({ labels: [] }))
    const after = createFakeProvider(JSON.stringify({ labels: [] }))
    const runtimeBefore = createAssistRuntime({ provider: before, site: TEST_SITE })
    const runtimeAfter = createAssistRuntime({ provider: after, site: TEST_SITE })

    const toolBefore = createClassifyTool(runtimeBefore)
    const toolAfter = createClassifyTool(runtimeAfter, seededStore)
    const input = { text: 'about cathedrals', taxonomy: ['architecture', 'history'], maxLabels: 2 }

    await toolBefore.execute(toolBefore.input.parse(input), toolContext())
    await toolAfter.execute(toolAfter.input.parse(input), toolContext())

    expect(taskOf(after.calls[0])).toBe(taskOf(before.calls[0]))
  })

  it('moderate sends the identical task instruction either way', async () => {
    const reply = JSON.stringify({ flagged: false, severity: 'none', categories: [], reason: '' })
    const before = createFakeProvider(reply)
    const after = createFakeProvider(reply)
    const runtimeBefore = createAssistRuntime({ provider: before, site: TEST_SITE })
    const runtimeAfter = createAssistRuntime({ provider: after, site: TEST_SITE })

    const toolBefore = createModerateTool(runtimeBefore)
    const toolAfter = createModerateTool(runtimeAfter, seededStore)
    const input = { text: 'a comment', origin: 'comment on article 12' }

    await toolBefore.execute(toolBefore.input.parse(input), toolContext())
    await toolAfter.execute(toolAfter.input.parse(input), toolContext())

    expect(taskOf(after.calls[0])).toBe(taskOf(before.calls[0]))
  })
})

describe('FAQ and Schema.org drafts, seeded vs. unmigrated', () => {
  it('faq_draft sends the identical task instruction either way', async () => {
    const reply = JSON.stringify({ items: [{ question: 'Q', answer: 'A' }] })
    const before = createFakeProvider(reply)
    const after = createFakeProvider(reply)
    const runtimeBefore = createAssistRuntime({ provider: before, site: TEST_SITE })
    const runtimeAfter = createAssistRuntime({ provider: after, site: TEST_SITE })

    const toolBefore = createFaqTool(runtimeBefore)
    const toolAfter = createFaqTool(runtimeAfter, seededStore)
    const input = { text: 'The museum opened in 1904.', count: 3, locale: 'fr' }

    await toolBefore.execute(toolBefore.input.parse(input), toolContext())
    await toolAfter.execute(toolAfter.input.parse(input), toolContext())

    expect(taskOf(after.calls[0])).toBe(taskOf(before.calls[0]))
  })

  it('schema_org_draft sends the identical task instruction either way', async () => {
    const before = createFakeProvider('{}')
    const after = createFakeProvider('{}')
    const runtimeBefore = createAssistRuntime({ provider: before, site: TEST_SITE })
    const runtimeAfter = createAssistRuntime({ provider: after, site: TEST_SITE })

    const toolBefore = createSchemaOrgTool(runtimeBefore)
    const toolAfter = createSchemaOrgTool(runtimeAfter, seededStore)
    const input = { text: 'The museum opened in 1904.', type: 'Article' as const }

    await toolBefore.execute(toolBefore.input.parse(input), toolContext())
    await toolAfter.execute(toolAfter.input.parse(input), toolContext())

    expect(taskOf(after.calls[0])).toBe(taskOf(before.calls[0]))
  })
})

describe('content chat, seeded vs. unmigrated', () => {
  it('sends the identical task instruction either way', async () => {
    const embeddings = createHashingEmbeddingProvider({ dimensions: 32 })
    const store = createMemoryVectorStore({ dimensions: embeddings.dimensions })
    const [vector] = await embeddings.embed(['the museum opens at nine'])
    await store.upsert([
      {
        siteId: 'site-a',
        collection: 'articles',
        entryId: 'e1',
        locale: 'en',
        status: 'published',
        chunk: {
          id: 'e1:0',
          documentId: 'e1',
          blockIds: [],
          text: 'the museum opens at nine',
          hash: 'h',
        },
        vector: vector ?? [],
      },
    ])
    const search = createSemanticSearch({ store, embeddings })

    const before = createFakeProvider(
      JSON.stringify({ answer: 'It opens at nine.', usedSources: [1] }),
    )
    const after = createFakeProvider(
      JSON.stringify({ answer: 'It opens at nine.', usedSources: [1] }),
    )
    const toolBefore = createContentChatTool({
      runtime: createAssistRuntime({ provider: before, site: TEST_SITE }),
      search,
    })
    const toolAfter = createContentChatTool({
      runtime: createAssistRuntime({ provider: after, site: TEST_SITE }),
      search,
      promptTemplates: seededStore,
    })
    const input = {
      question: 'when does the museum open',
      locale: 'en',
      collections: ['articles'],
      siteId: 'site-a',
    }

    await toolBefore.execute(toolBefore.input.parse(input), toolContext())
    await toolAfter.execute(toolAfter.input.parse(input), toolContext())

    expect(taskOf(after.calls[0])).toBe(taskOf(before.calls[0]))
  })
})
