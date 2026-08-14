import type { SeoFinding } from './types.js'

const LINK_PATTERN = /\[[^\]]+\]\([^)]+\)/

/**
 * "Vérification de llms.txt" (the AEO/GEO differentiator) — checks the
 * shape https://llmstxt.org defines: an H1 title first, then H2 sections
 * that group markdown links for an AI answer engine to crawl. Not a full
 * grammar-level parser — the two things worth flagging are "no title at
 * all" (the file is useless without one) and "no organised link sections"
 * (the file has no links a crawler could actually follow).
 */
export function validateLlmsTxt(content: string): readonly SeoFinding[] {
  const lines = content.split('\n')
  const firstNonEmpty = lines.find((line) => line.trim() !== '')

  if (firstNonEmpty === undefined || !firstNonEmpty.trim().startsWith('# ')) {
    return [
      {
        check: 'llms_txt',
        severity: 'error',
        message: 'llms.txt must start with an H1 title ("# Title").',
      },
    ]
  }

  const findings: SeoFinding[] = []
  const hasH2Section = lines.some((line) => line.trim().startsWith('## '))
  if (!hasH2Section) {
    findings.push({
      check: 'llms_txt',
      severity: 'warning',
      message: 'No H2 sections found — llms.txt should organise links under headed sections.',
    })
  }

  if (!LINK_PATTERN.test(content)) {
    findings.push({
      check: 'llms_txt',
      severity: 'warning',
      message: 'No markdown links found — llms.txt should list links to the site’s key resources.',
    })
  }

  return findings
}
