import type { JSX } from 'react'

/**
 * Placeholder for task 15. The spec is explicit that agent-related widgets
 * stay empty and explicit until L4 ships, rather than showing fabricated
 * numbers — this page follows the same rule for every widget, since none of
 * them have a data source yet either.
 */
export function DashboardRoute(): JSX.Element {
  return (
    <section aria-labelledby="dashboard-heading">
      <h1 id="dashboard-heading">Tableau de bord</h1>
      <p>À venir : santé du site, activité récente, contenus programmés.</p>
    </section>
  )
}
