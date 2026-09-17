import { describe, expect, it } from 'vitest'
import { auditMediaLibrary, type MediaAuditAsset } from '../../src/media/audit.js'

const now = new Date('2026-09-17T12:00:00.000Z')

function asset(overrides: Partial<MediaAuditAsset> & { id: string }): MediaAuditAsset {
  return {
    kind: 'image',
    filename: `${overrides.id}.jpg`,
    size: 80_000,
    width: 1200,
    height: 800,
    alt: 'A photograph of the harbour at dusk',
    decorative: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('auditing a media library', () => {
  it('reports an image with no alt text, and never a decorative one', () => {
    const findings = auditMediaLibrary(
      [
        asset({ id: 'no-alt', alt: '   ' }),
        asset({ id: 'decorative', alt: '', decorative: true }),
        asset({ id: 'described' }),
      ],
      { referenced: new Set(['no-alt', 'decorative', 'described']), now },
    )

    expect(findings.map((finding) => finding.id)).toEqual(['no-alt'])
    expect(findings[0]?.issue).toBe('missing-alt')
  })

  it('waits before calling a file unused, because a fresh upload is simply not placed yet', () => {
    const fresh = asset({ id: 'fresh', createdAt: '2026-09-16T00:00:00.000Z' })
    const old = asset({ id: 'old', createdAt: '2026-02-01T00:00:00.000Z' })

    const findings = auditMediaLibrary([fresh, old], { referenced: new Set(), now })

    expect(findings.filter((finding) => finding.issue === 'unused').map((f) => f.id)).toEqual(['old'])
  })

  it('measures weight against the pixels it really has, not against a flat file size', () => {
    const findings = auditMediaLibrary(
      [
        // 4 MB for a small image: heavy. 4 MB for a huge one: normal.
        asset({ id: 'heavy', size: 4_000_000, width: 800, height: 600 }),
        asset({ id: 'large-but-fine', size: 4_000_000, width: 4000, height: 3000 }),
      ],
      { referenced: new Set(['heavy', 'large-but-fine']), now },
    )

    expect(findings.filter((f) => f.issue === 'oversized').map((f) => f.id)).toEqual(['heavy'])
  })

  it('says nothing at all about a library that is in order', () => {
    const findings = auditMediaLibrary(
      [asset({ id: 'a' }), asset({ id: 'b', kind: 'file', filename: 'report.pdf', width: null, height: null })],
      { referenced: new Set(['a', 'b']), now },
    )

    expect(findings).toEqual([])
  })
})
