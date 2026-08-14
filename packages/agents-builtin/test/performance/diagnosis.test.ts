import { describe, expect, it } from 'vitest'
import { diagnosePerformanceRisks } from '../../src/performance/diagnosis.js'
import type { PerformancePageInput } from '../../src/performance/types.js'

function cleanPage(overrides: Partial<PerformancePageInput> = {}): PerformancePageInput {
  return {
    url: '/blog/example',
    images: [{ width: 800, height: 600, sizeBytes: 50_000, format: 'webp' }],
    thirdPartyScriptUrls: [],
    ...overrides,
  }
}

describe('diagnosePerformanceRisks', () => {
  it('finds nothing on a well-formed page', () => {
    expect(diagnosePerformanceRisks(cleanPage())).toEqual([])
  })

  it('flags an image missing width or height', () => {
    const findings = diagnosePerformanceRisks(
      cleanPage({ images: [{ sizeBytes: 10_000, format: 'webp' }] }),
    )
    expect(findings).toContainEqual(expect.objectContaining({ check: 'image_dimensions' }))
  })

  it('flags a large image with no modern format', () => {
    const findings = diagnosePerformanceRisks(
      cleanPage({
        images: [{ width: 1200, height: 800, sizeBytes: 500_000, format: 'jpeg' }],
      }),
    )
    expect(findings).toContainEqual(expect.objectContaining({ check: 'image_optimization' }))
  })

  it('does not flag a large image already in a modern format', () => {
    const findings = diagnosePerformanceRisks(
      cleanPage({
        images: [{ width: 1200, height: 800, sizeBytes: 500_000, format: 'avif' }],
      }),
    )
    expect(findings.some((f) => f.check === 'image_optimization')).toBe(false)
  })

  it('does not flag a large image whose format is unknown as unoptimized without evidence either way — still flags, since absence of proof of a modern format is the signal', () => {
    const findings = diagnosePerformanceRisks(
      cleanPage({ images: [{ width: 1200, height: 800, sizeBytes: 500_000 }] }),
    )
    expect(findings).toContainEqual(expect.objectContaining({ check: 'image_optimization' }))
  })

  it('flags too many third-party scripts', () => {
    const findings = diagnosePerformanceRisks(
      cleanPage({
        thirdPartyScriptUrls: [
          'https://a.example/script.js',
          'https://b.example/script.js',
          'https://c.example/script.js',
          'https://d.example/script.js',
          'https://e.example/script.js',
          'https://f.example/script.js',
        ],
      }),
    )
    expect(findings).toContainEqual(expect.objectContaining({ check: 'third_party_scripts' }))
  })

  it('does not flag a moderate number of third-party scripts', () => {
    const findings = diagnosePerformanceRisks(
      cleanPage({ thirdPartyScriptUrls: ['https://a.example/script.js'] }),
    )
    expect(findings.some((f) => f.check === 'third_party_scripts')).toBe(false)
  })
})
