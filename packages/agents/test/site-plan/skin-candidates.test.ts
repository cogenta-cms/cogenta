import { describe, expect, it } from 'vitest'
import {
  generateSkinCandidates,
  MAX_SKIN_CANDIDATES,
  MIN_SKIN_CANDIDATES,
  SKIN_DIRECTIONS,
} from '../../src/site-plan/skin-candidates.js'
import { scriptedClient } from './fake-client.js'

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

/** A distinct but still valid skin, so candidates differ the way real ones would. */
function variant(accent: string): string {
  return JSON.stringify({ ...VALID_TOKENS, color: { ...VALID_TOKENS.color, accent } })
}

/** Structurally fine, but `fg` on `bg` fails the AA contrast check contract D enforces. */
const LOW_CONTRAST = JSON.stringify({
  ...VALID_TOKENS,
  color: { ...VALID_TOKENS.color, fg: '#fefefe' },
})

const BASE = {
  model: 'm',
  description: 'A calm portfolio for a wedding photographer.',
  blueprintLabel: 'Portfolio',
}

/**
 * Five distinct, contract-D-valid accents — one per design direction. The
 * fake answers by reading which direction the prompt asked for rather than
 * by counting calls, because the candidates are generated in parallel and a
 * counter would make the test depend on scheduling order.
 */
const ACCENT_BY_DIRECTION: Readonly<Record<string, string>> = {
  'Warm and editorial': '#b45309',
  'Clean and clinical': '#1d4ed8',
  'Bold and graphic': '#7c2d12',
  'Quiet and minimal': '#4c1d95',
  'Classic and formal': '#047857',
}

function directionOf(prompt: string): string {
  return (
    Object.keys(ACCENT_BY_DIRECTION).find((label) => prompt.includes(label)) ?? 'Warm and editorial'
  )
}

/** Answers every direction with its own valid skin. */
function perDirectionClient() {
  return scriptedClient([
    (request) =>
      variant(ACCENT_BY_DIRECTION[directionOf(request.messages[0]?.content ?? '')] ?? '#1d4ed8'),
  ])
}

describe('offering a real choice of designs', () => {
  it('generates one candidate per design direction, each with its own label', async () => {
    const { client } = perDirectionClient()

    const result = await generateSkinCandidates({ ...BASE, client, count: 3 })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.candidates).toHaveLength(3)
    expect(result.candidates.map((c) => c.id)).toEqual(SKIN_DIRECTIONS.slice(0, 3).map((d) => d.id))
    expect(new Set(result.candidates.map((c) => c.label)).size).toBe(3)
  })

  it('steers each candidate with a different design direction in its own prompt', async () => {
    const { client, requests } = perDirectionClient()

    await generateSkinCandidates({ ...BASE, client, count: 2 })

    const prompts = requests.map((request) => request.messages[0]?.content ?? '')
    expect(prompts).toHaveLength(2)
    expect(prompts.some((prompt) => prompt.includes('Warm and editorial'))).toBe(true)
    expect(prompts.some((prompt) => prompt.includes('Clean and clinical'))).toBe(true)
    // Every prompt still carries the site's own description.
    for (const prompt of prompts) expect(prompt).toContain('wedding photographer')
  })

  it('clamps the count to between two and five, so there is always a choice and never a wall', async () => {
    const tooFew = await generateSkinCandidates({
      ...BASE,
      client: perDirectionClient().client,
      count: 1,
    })
    const tooMany = await generateSkinCandidates({
      ...BASE,
      client: perDirectionClient().client,
      count: 9,
    })

    expect(tooFew.candidates).toHaveLength(MIN_SKIN_CANDIDATES)
    expect(tooMany.candidates).toHaveLength(MAX_SKIN_CANDIDATES)
  })

  it('applies the existing validation loop to every candidate, not only the first', async () => {
    // Each direction's first attempt fails contract D's contrast check; its
    // second passes. Tracked per direction, not globally, so every candidate
    // is proved to have run the loop rather than one of them running it twice.
    const attemptsByDirection = new Map<string, number>()
    const { client } = scriptedClient([
      (request) => {
        const label = directionOf(request.messages[0]?.content ?? '')
        const seen = (attemptsByDirection.get(label) ?? 0) + 1
        attemptsByDirection.set(label, seen)
        return seen === 1 ? LOW_CONTRAST : variant(ACCENT_BY_DIRECTION[label] ?? '#1d4ed8')
      },
    ])

    const result = await generateSkinCandidates({ ...BASE, client, count: 2 })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.candidates.map((candidate) => candidate.attempts)).toEqual([2, 2])
  })
})

describe('refusing to present a choice that is not one', () => {
  it('reports failure rather than offering a single design when the rest never validated', async () => {
    const { client } = scriptedClient([LOW_CONTRAST])

    const result = await generateSkinCandidates({
      ...BASE,
      client,
      count: 3,
      maxAttemptsPerCandidate: 1,
    })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toContain('no candidate passed')
    expect(result.failures).toHaveLength(3)
    expect(result.failures[0]?.reason.toLowerCase()).toContain('contrast')
  })

  it('drops a duplicate rather than showing the same design twice under two names', async () => {
    const { client } = scriptedClient([variant('#1d4ed8')])

    const result = await generateSkinCandidates({ ...BASE, client, count: 3 })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.candidates).toHaveLength(1)
    expect(result.reason).toContain('not a choice')
    expect(result.failures.map((f) => f.reason).join(' ')).toContain('identical')
  })
})
