import { describe, expect, it } from 'vitest'
import {
  findMigrationResidue,
  type MigrationEntry,
  redirectsFor,
} from '../../src/migration/residue.js'

function entry(overrides: Partial<MigrationEntry> & { id: string }): MigrationEntry {
  return {
    collection: 'post',
    title: 'A post',
    path: '/blog/a-post',
    provenance: 'imported',
    text: 'Nothing special here.',
    values: { excerpt: 'A short summary.' },
    ...overrides,
  }
}

describe('finding what an import left behind', () => {
  it('separates a link to the old domain from an image still served by it', () => {
    const findings = findMigrationResidue(
      [
        entry({
          id: '1',
          text: 'See <a href="https://old.example.com/blog/a-post">the old page</a> and https://old.example.com/wp-content/photo.jpg',
        }),
      ],
      { previousDomains: ['old.example.com'] },
    )

    expect(findings.map((finding) => finding.issue)).toEqual([
      'absolute-internal-link',
      'orphan-media-url',
    ])
  })

  it('never touches an entry a human wrote, whatever it contains', () => {
    const findings = findMigrationResidue(
      [entry({ id: '2', provenance: 'human', text: 'https://old.example.com/anything' })],
      { previousDomains: ['old.example.com'] },
    )

    expect(findings).toEqual([])
  })

  it('leaves a link to a genuinely external site alone', () => {
    const findings = findMigrationResidue(
      [entry({ id: '3', text: 'As https://en.wikipedia.org/wiki/Bread explains…' })],
      { previousDomains: ['old.example.com'] },
    )

    expect(findings).toEqual([])
  })

  it('proposes one redirect per old address whose path really moved', () => {
    const entries = [
      entry({
        id: '4',
        path: '/articles/a-post',
        text: 'https://old.example.com/2019/05/a-post and https://old.example.com/2019/05/a-post again',
      }),
    ]
    const redirects = redirectsFor(findMigrationResidue(entries, { previousDomains: ['old.example.com'] }), entries)

    expect(redirects).toEqual([{ from: '/2019/05/a-post', to: '/articles/a-post' }])
  })

  it('names a missing excerpt only on a collection that has the field at all', () => {
    const withField = findMigrationResidue([entry({ id: '5', values: { excerpt: '  ' } })], {
      previousDomains: [],
    })
    const withoutField = findMigrationResidue([entry({ id: '6', values: { title: 'x' } })], {
      previousDomains: [],
    })

    expect(withField.map((finding) => finding.issue)).toEqual(['missing-excerpt'])
    expect(withoutField).toEqual([])
  })
})
