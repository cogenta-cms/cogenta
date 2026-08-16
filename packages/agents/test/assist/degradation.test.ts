import { describe, expect, it } from 'vitest'
import { createAssistToolset } from '../../src/assist/toolset.js'
import type { ImageProviderClient } from '../../src/providers/image/types.js'
import { createHashingEmbeddingProvider } from '../../src/rag/embeddings/hashing-provider.js'
import { createSemanticSearch } from '../../src/rag/semantic/search.js'
import { createMemoryVectorStore } from '../../src/rag/vector/memory.js'
import { createFakeProvider, TEST_SITE } from './fake-provider.js'

/**
 * L18's two acceptance criteria, checked as one table rather than one assertion
 * per feature:
 *
 * 1. "Le CMS entier continue de fonctionner à 100 % (R2) sans aucun fournisseur
 *    LLM configuré — chaque fonctionnalité de ce lot disparaît proprement."
 * 2. "Aucune action de ce lot ne modifie ou supprime du contenu sans validation
 *    humaine explicite (R6)."
 *
 * The point of the table form is that a sixteenth tool added later has to
 * appear in it, and a tool that quietly gained a side effect fails here rather
 * than in production.
 */

const embeddings = createHashingEmbeddingProvider({ dimensions: 32 })

function imageClient(): ImageProviderClient {
  return { name: 'fake', model: 'm', generate: async () => [] }
}

function fullyConfigured() {
  const store = createMemoryVectorStore({ dimensions: embeddings.dimensions })
  return createAssistToolset({
    site: TEST_SITE,
    provider: createFakeProvider('anything'),
    imageProvider: imageClient(),
    search: createSemanticSearch({ store, embeddings }),
    vectors: { store, embeddings },
  })
}

describe('what exists, given what is configured', () => {
  const cases = [
    {
      name: 'nothing at all',
      build: () => createAssistToolset({ site: TEST_SITE }),
      expected: [] as readonly string[],
    },
    {
      name: 'a text provider alone',
      build: () =>
        createAssistToolset({ site: TEST_SITE, provider: createFakeProvider('anything') }),
      expected: [
        'assist.rewrite',
        'assist.proofread',
        'assist.summarise',
        'assist.translate',
        'assist.meta_description',
        'assist.titles',
        'assist.tags',
        'assist.alt_text',
        'assist.classify',
        'assist.moderate',
        'assist.faq_draft',
        'assist.schema_org_draft',
      ],
    },
    {
      name: 'an image provider alone',
      build: () => createAssistToolset({ site: TEST_SITE, imageProvider: imageClient() }),
      expected: ['assist.generate_image'],
    },
    {
      name: 'a vector store alone — no AI vendor anywhere',
      build: () => {
        const store = createMemoryVectorStore({ dimensions: embeddings.dimensions })
        return createAssistToolset({ site: TEST_SITE, vectors: { store, embeddings } })
      },
      expected: ['assist.find_duplicates'],
    },
    {
      name: 'a semantic search but no text provider',
      build: () => {
        const store = createMemoryVectorStore({ dimensions: embeddings.dimensions })
        return createAssistToolset({
          site: TEST_SITE,
          search: createSemanticSearch({ store, embeddings }),
        })
      },
      // Chat needs both halves: something to retrieve with, and something to
      // answer with. One without the other is not a degraded chat, it is none.
      expected: [],
    },
  ] as const

  for (const testCase of cases) {
    it(`offers exactly the right tools with ${testCase.name}`, () => {
      const set = testCase.build()

      expect(set.tools.map((tool) => tool.name).sort()).toEqual([...testCase.expected].sort())
      expect(set.available).toBe(testCase.expected.length > 0)
    })
  }

  it('says why, in plain language, when it offers nothing', () => {
    const set = createAssistToolset({ site: TEST_SITE })

    expect(set.reason).toBeDefined()
    expect(set.reason).not.toContain('undefined')
    expect(set.reason).not.toContain('null')
  })

  it('offers everything at once when everything is configured', () => {
    expect(fullyConfigured().tools).toHaveLength(15)
  })
})

describe('R6, over the whole toolset at once', () => {
  it('has no tool that declares a side effect', () => {
    for (const tool of fullyConfigured().tools) {
      expect({ tool: tool.name, sideEffects: tool.sideEffects }).toEqual({
        tool: tool.name,
        sideEffects: false,
      })
    }
  })

  it('has no tool that implements revert, because none has anything to undo', () => {
    for (const tool of fullyConfigured().tools) {
      expect({ tool: tool.name, revert: tool.revert }).toEqual({
        tool: tool.name,
        revert: undefined,
      })
    }
  })

  it('has no tool whose output can express that something was applied', () => {
    for (const tool of fullyConfigured().tools) {
      // Every output either carries `applied: false` as a literal, or is a
      // chat/classification shape that carries it too. A tool that dropped the
      // field would parse `{applied: true}` here and fail.
      const rejected = tool.output.safeParse({
        applied: true,
        suggestions: ['x'],
        labels: [],
        rejected: [],
        duplicates: [],
        threshold: 0.9,
        recommendedAction: 'review',
        flagged: false,
        severity: 'none',
        categories: [],
        reason: '',
        items: [{ question: 'q', answer: 'a' }],
        status: 'draft',
        jsonLd: {},
        answer: 'a',
        sources: [],
        answeredFromSources: false,
        provider: 'p',
        model: 'm',
        images: [{ dataUrl: 'd', contentType: 'image/png', byteLength: 1 }],
      })
      expect({ tool: tool.name, accepted: rejected.success }).toEqual({
        tool: tool.name,
        accepted: false,
      })
    }
  })

  it('names a permission on every tool, so the runtime always has a gate to check', () => {
    for (const tool of fullyConfigured().tools) {
      expect({ tool: tool.name, empty: tool.permissions.length === 0 }).toEqual({
        tool: tool.name,
        empty: false,
      })
    }
  })
})
