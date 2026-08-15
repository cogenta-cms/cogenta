import { describe, expect, it } from 'vitest'
import { createSkinGallery } from '../../src/registries/skins.js'
import { testDb } from '../helpers/db.js'

/**
 * "Un skin déposé dans la galerie est validé ou refusé automatiquement, sans
 * revue humaine" — reuses `@cogenta/render`'s real `validateSkin` wholesale
 * (L9 task 7), not reimplemented. Corpus mirrors
 * `packages/create-cogenta/test/skin-validation-corpus.test.ts`'s real
 * candidates: this is the gallery/registry layer's own proof that the same
 * discriminating gate applies end-to-end through real submission/storage.
 */

const VALID_TOKENS = {
  color: {
    bg: '#ffffff',
    fg: '#16181d',
    accent: '#1d4ed8',
    accentFg: '#ffffff',
    muted: '#f2f4f7',
    mutedFg: '#3f4655',
    border: '#d7dbe2',
  },
  font: {
    sans: 'ui-sans-serif, system-ui, sans-serif',
    serif: 'ui-serif, Georgia, serif',
    mono: 'ui-monospace, monospace',
    scale: 1.25,
    baseSize: '1rem',
  },
  space: { unit: '0.25rem', density: 'comfortable' },
  radius: { sm: '0.25rem', md: '0.5rem', lg: '1rem' },
  motion: { duration: '180ms', easing: 'cubic-bezier(0.2, 0, 0, 1)', reduced: true },
  shadow: { sm: '0 1px 2px rgba(22, 24, 29, 0.08)', md: '0 6px 24px rgba(22, 24, 29, 0.12)' },
}

interface Candidate {
  readonly label: string
  readonly tokens: unknown
  readonly shouldAccept: boolean
  readonly expectedCode?: string
}

const CORPUS: readonly Candidate[] = [
  { label: 'production default', tokens: VALID_TOKENS, shouldAccept: true },
  {
    label: 'dark palette, still valid',
    tokens: {
      ...VALID_TOKENS,
      color: {
        bg: '#0b0d12',
        fg: '#f4f6fb',
        accent: '#7aa2ff',
        accentFg: '#03050c',
        muted: '#161a22',
        mutedFg: '#c3c9d6',
        border: '#2a3040',
      },
    },
    shouldAccept: true,
  },
  {
    label: 'missing motion group entirely',
    tokens: (() => {
      const { motion: _drop, ...rest } = VALID_TOKENS
      return rest
    })(),
    shouldAccept: false,
    expectedCode: 'SKIN_TOKEN_MISSING',
  },
  {
    label: 'unknown top-level key',
    tokens: { ...VALID_TOKENS, glow: true },
    shouldAccept: false,
    expectedCode: 'SKIN_TOKEN_UNKNOWN',
  },
  {
    label: 'length token with no unit',
    tokens: { ...VALID_TOKENS, radius: { ...VALID_TOKENS.radius, sm: '4' } },
    shouldAccept: false,
    expectedCode: 'SKIN_TOKEN_INVALID',
  },
  {
    label: 'near-invisible foreground on background',
    tokens: { ...VALID_TOKENS, color: { ...VALID_TOKENS.color, fg: '#fefefe' } },
    shouldAccept: false,
    expectedCode: 'SKIN_CONTRAST_INSUFFICIENT',
  },
  {
    label: 'type scale ratio of 1 (flat, non-monotonic)',
    tokens: { ...VALID_TOKENS, font: { ...VALID_TOKENS.font, scale: 1 } },
    shouldAccept: false,
    expectedCode: 'SKIN_SCALE_NOT_MONOTONIC',
  },
  {
    label: 'motion.reduced set to false',
    tokens: { ...VALID_TOKENS, motion: { ...VALID_TOKENS.motion, reduced: false } },
    shouldAccept: false,
    expectedCode: 'SKIN_MOTION_NOT_REDUCED',
  },
]

describe('createSkinGallery', () => {
  it('validates every submission automatically, with no pending/reviewed state, and measures the rejection rate', async () => {
    const db = await testDb()
    const gallery = createSkinGallery(db)

    let accepted = 0
    let rejected = 0

    for (const candidate of CORPUS) {
      const entry = await gallery.submit({
        submitterId: 'user-1',
        displayName: candidate.label,
        tokens: candidate.tokens,
      })

      if (candidate.shouldAccept) {
        expect(entry.status, candidate.label).toBe('accepted')
        expect(entry.rejectionCode, candidate.label).toBeNull()
        accepted += 1
      } else {
        expect(entry.status, candidate.label).toBe('rejected')
        expect(entry.rejectionCode, candidate.label).toBe(candidate.expectedCode)
        expect(entry.rejectionReason, candidate.label).not.toBeNull()
        rejected += 1
      }
    }

    const rejectionRate = rejected / CORPUS.length
    expect(accepted).toBe(2)
    expect(rejected).toBe(CORPUS.length - 2)
    expect(rejectionRate).toBeGreaterThan(0.5)
    expect(rejectionRate).toBeLessThan(1)
  })

  it('lists only accepted submissions, in submission order', async () => {
    const db = await testDb()
    const gallery = createSkinGallery(db)

    await gallery.submit({ submitterId: 'u1', displayName: 'accepted one', tokens: VALID_TOKENS })
    await gallery.submit({
      submitterId: 'u1',
      displayName: 'rejected one',
      tokens: { ...VALID_TOKENS, motion: { ...VALID_TOKENS.motion, reduced: false } },
    })
    await gallery.submit({
      submitterId: 'u2',
      displayName: 'accepted two',
      tokens: VALID_TOKENS,
    })

    const listed = await gallery.listAccepted()
    expect(listed.map((entry) => entry.displayName)).toEqual(['accepted one', 'accepted two'])
    expect(listed.every((entry) => entry.status === 'accepted')).toBe(true)
  })

  it('retrieves a single submission by id, accepted or rejected', async () => {
    const db = await testDb()
    const gallery = createSkinGallery(db)

    const rejected = await gallery.submit({
      submitterId: 'u1',
      displayName: 'bad one',
      tokens: { not: 'a skin' },
    })

    const fetched = await gallery.get(rejected.id)
    expect(fetched?.status).toBe('rejected')
    expect(fetched?.rejectionCode).toBe('SKIN_TOKEN_MISSING')

    expect(await gallery.get('nonexistent-id')).toBeNull()
  })
})
