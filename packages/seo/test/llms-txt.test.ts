import { describe, expect, it } from 'vitest'
import { llmsTxtSectionsFor, renderLlmsTxt } from '../src/llms-txt.js'
import { makeArticle, makeAuthor, makePage, site } from './fixtures.js'

describe('llms.txt', () => {
  it('opens with a single H1 and a blockquote summary, as the format specifies', () => {
    const output = renderLlmsTxt({ site, sections: [] })

    expect(output.split('\n').slice(0, 3)).toEqual([
      '# Example',
      '',
      '> A site that exists to be crawled.',
    ])
  })

  it('renders one H2 section per collection with a link per entry', () => {
    const sections = llmsTxtSectionsFor(site, [makeArticle(), makePage()])
    const output = renderLlmsTxt({ site, sections })

    expect(output).toContain('## Articles')
    expect(output).toContain(
      '- [Hello world](https://example.com/en/blog/hello-world): A short summary.',
    )
    expect(output).toContain('## Pages')
    expect(output).toContain('- [About](https://example.com/about): Who we are.')
  })

  it('never lists a draft, which a model would quote back immediately', () => {
    const sections = llmsTxtSectionsFor(site, [
      makeArticle({ values: { title: 'Public', slug: 'public' } }),
      makeArticle({ status: 'draft', values: { title: 'Secret', slug: 'secret' } }),
      makeArticle({ state: 'working', values: { title: 'Unreviewed', slug: 'wip' } }),
    ])

    expect(renderLlmsTxt({ site, sections })).not.toContain('Secret')
    expect(sections[0]?.links.map((link) => link.title)).toEqual(['Public'])
  })

  it('skips a collection with no route, which has no link to offer', () => {
    expect(llmsTxtSectionsFor(site, [makeAuthor()])).toEqual([])
  })

  it('escapes a bracket in a title, which would otherwise close the link early', () => {
    const sections = llmsTxtSectionsFor(site, [
      makeArticle({ values: { title: 'A [draft] note', slug: 'note', excerpt: undefined } }),
    ])

    expect(renderLlmsTxt({ site, sections })).toContain('- [A \\[draft\\] note](')
  })

  it('wraps a URL containing a parenthesis in angle brackets', () => {
    const output = renderLlmsTxt({
      site,
      sections: [{ title: 'X', links: [{ title: 'T', url: 'https://example.com/a(b)' }] }],
    })

    expect(output).toContain('(<https://example.com/a(b)>)')
  })

  it('drops an empty section rather than emitting a bare heading', () => {
    expect(renderLlmsTxt({ site, sections: [{ title: 'Nothing', links: [] }] })).not.toContain(
      '## Nothing',
    )
  })

  it('honours the per-section limit', () => {
    const many = Array.from({ length: 10 }, (_, index) =>
      makeArticle({ values: { title: `T${index}`, slug: `s${index}` } }),
    )
    const sections = llmsTxtSectionsFor(site, many, { limitPerSection: 3 })

    expect(sections[0]?.links).toHaveLength(3)
  })
})
