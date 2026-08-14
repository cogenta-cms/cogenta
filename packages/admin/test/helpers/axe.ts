import { run } from 'axe-core'

/**
 * L2 task 16: the automated half of the WCAG 2.2 AA pass. "Zero serious
 * violations" (L2-admin.md's own wording) rather than zero violations of any
 * severity — `minor`/`moderate` findings surface in review, not as a build
 * break, since axe-core's jsdom run also reports a handful of environment
 * artefacts (e.g. layout-dependent checks jsdom can't fully evaluate) that
 * are not real defects.
 */
export async function expectNoSeriousA11yViolations(container: Element): Promise<void> {
  const results = await run(container, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  })
  const serious = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  )
  if (serious.length > 0) {
    const details = serious
      .map(
        (violation) =>
          `${violation.id} (${violation.impact}): ${violation.help}\n` +
          violation.nodes.map((node) => `  - ${node.target.join(' ')}`).join('\n'),
      )
      .join('\n\n')
    throw new Error(`axe-core found ${serious.length} serious violation(s):\n\n${details}`)
  }
}
