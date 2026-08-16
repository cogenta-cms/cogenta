import { describe, expect, it } from 'vitest'
import { createFaqTool, createSchemaOrgTool } from '../../src/assist/faq.js'
import { createAssistRuntime } from '../../src/assist/runtime.js'
import { createFakeProvider, TEST_SITE, toolContext } from './fake-provider.js'

function runtimeWith(reply: string) {
  const provider = createFakeProvider(reply)
  return { provider, runtime: createAssistRuntime({ provider, site: TEST_SITE }) }
}

describe('the FAQ draft tool', () => {
  it('returns a draft, and the type cannot say anything else', async () => {
    const { runtime } = runtimeWith(
      JSON.stringify({
        items: [{ question: 'When did it open?', answer: 'In 1904.' }],
      }),
    )
    const tool = createFaqTool(runtime)

    const result = await tool.execute(
      tool.input.parse({ text: 'The museum opened in 1904.' }),
      toolContext(),
    )

    expect(result).toEqual({
      items: [{ question: 'When did it open?', answer: 'In 1904.' }],
      status: 'draft',
      applied: false,
    })
  })

  it('never publishes anything, because it declares no side effect at all', () => {
    const { runtime } = runtimeWith('{}')

    expect(createFaqTool(runtime).sideEffects).toBe(false)
    expect(createSchemaOrgTool(runtime).sideEffects).toBe(false)
  })

  it('refuses an answer with no question-and-answer pair rather than inventing one', async () => {
    const { runtime } = runtimeWith(JSON.stringify({ items: [] }))
    const tool = createFaqTool(runtime)

    await expect(
      tool.execute(tool.input.parse({ text: 'anything' }), toolContext()),
    ).rejects.toMatchObject({ code: 'ASSIST_RESPONSE_INVALID' })
  })
})

describe('the Schema.org draft tool', () => {
  it('stamps the type itself instead of trusting the answer with it', async () => {
    const { runtime } = runtimeWith(
      JSON.stringify({
        '@context': 'https://evil.example/schema',
        '@type': 'Product',
        aggregateRating: { ratingValue: 5, reviewCount: 9001 },
        name: 'The museum',
      }),
    )
    const tool = createSchemaOrgTool(runtime)

    const result = await tool.execute(
      tool.input.parse({ text: 'The museum opened in 1904.', type: 'Article' }),
      toolContext(),
    )

    // A search engine acts on `@type`. Neither it nor `@context` is ever taken
    // from the model's answer.
    expect(result.jsonLd['@type']).toBe('Article')
    expect(result.jsonLd['@context']).toBe('https://schema.org')
    expect(result.status).toBe('draft')
    expect(result.applied).toBe(false)
  })

  it('refuses a type outside the list it knows how to vouch for', () => {
    const { runtime } = runtimeWith('{}')
    const tool = createSchemaOrgTool(runtime)

    expect(() => tool.input.parse({ text: 'x', type: 'Product' })).toThrow()
  })

  it('passes title, url and body as three separate tagged data items', async () => {
    const { provider, runtime } = runtimeWith(JSON.stringify({ name: 'The museum' }))
    const tool = createSchemaOrgTool(runtime)

    await tool.execute(
      tool.input.parse({
        text: 'body',
        type: 'Article',
        title: 'The museum',
        url: 'https://example.test/museum',
      }),
      toolContext(),
    )

    const contents = (provider.calls[0]?.messages ?? []).map((message) => message.content ?? '')
    expect(contents.some((content) => content.includes('source="entry title"'))).toBe(true)
    expect(contents.some((content) => content.includes('source="entry url"'))).toBe(true)
    expect(contents.some((content) => content.includes('source="entry body"'))).toBe(true)
  })
})
