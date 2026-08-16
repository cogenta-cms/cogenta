import { run } from 'axe-core'

/**
 * L2 task 16: the automated half of the WCAG 2.2 AA pass. "Zero serious
 * violations" (L2-admin.md's own wording) rather than zero violations of any
 * severity — `minor`/`moderate` findings surface in review, not as a build
 * break, since axe-core's jsdom run also reports a handful of environment
 * artefacts (e.g. layout-dependent checks jsdom can't fully evaluate) that
 * are not real defects.
 */
export async function expectNoSeriousA11yViolations(
  container: Element,
  options: {
    /**
     * Selectors to leave out of the run.
     *
     * The page builder's preview is an `<iframe>` (L16), and axe walks into
     * frames — which jsdom cannot present as a real frame window, so the run
     * throws before it audits anything. What is inside that frame is the
     * *site's* HTML, audited where it belongs: `@cogenta/theme-canonical`'s
     * own `accessibility.test.ts`. Excluding it here audits the admin's own
     * chrome rather than auditing nothing.
     */
    readonly exclude?: readonly string[]
  } = {},
): Promise<void> {
  const context =
    options.exclude === undefined || options.exclude.length === 0
      ? (container as unknown as Parameters<typeof run>[0])
      : ({
          include: [container],
          exclude: options.exclude.map((selector) => [selector]),
        } as unknown as Parameters<typeof run>[0])
  const results = await run(context, {
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
