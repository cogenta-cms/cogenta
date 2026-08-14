import { describe, expect, it } from 'vitest'
import {
  buildSignedApprovalLink,
  signApprovalLink,
  verifyApprovalLinkSignature,
} from '../../src/approvals/signed-link.js'

describe('signed approval link', () => {
  const key = 'test-signing-key'

  it('a signature verifies for the exact token/decision/expiry it was made for', () => {
    const signature = signApprovalLink(key, 'TOKEN1', 'approved', 1_000_000)
    expect(
      verifyApprovalLinkSignature(key, 'TOKEN1', 'approved', 1_000_000, signature, 900_000),
    ).toBe(true)
  })

  it('rejects a signature for the wrong decision', () => {
    const signature = signApprovalLink(key, 'TOKEN1', 'approved', 1_000_000)
    expect(
      verifyApprovalLinkSignature(key, 'TOKEN1', 'rejected', 1_000_000, signature, 900_000),
    ).toBe(false)
  })

  it('rejects a signature for a tampered token', () => {
    const signature = signApprovalLink(key, 'TOKEN1', 'approved', 1_000_000)
    expect(
      verifyApprovalLinkSignature(key, 'TOKEN2', 'approved', 1_000_000, signature, 900_000),
    ).toBe(false)
  })

  it('rejects once expired', () => {
    const signature = signApprovalLink(key, 'TOKEN1', 'approved', 1_000_000)
    expect(
      verifyApprovalLinkSignature(key, 'TOKEN1', 'approved', 1_000_000, signature, 1_000_001),
    ).toBe(false)
  })

  it('buildSignedApprovalLink produces a URL that verifies against its own embedded fields', () => {
    const nowSeconds = 1_700_000_000
    const url = buildSignedApprovalLink(
      'https://example.test/approvals/verify',
      key,
      'TOKEN1',
      'approved',
      900,
      nowSeconds,
    )

    const parsed = new URL(url)
    expect(parsed.searchParams.get('token')).toBe('TOKEN1')
    expect(parsed.searchParams.get('decision')).toBe('approved')
    const expires = Number(parsed.searchParams.get('expires'))
    const signature = parsed.searchParams.get('signature') ?? ''

    expect(
      verifyApprovalLinkSignature(key, 'TOKEN1', 'approved', expires, signature, nowSeconds + 1),
    ).toBe(true)
  })
})
