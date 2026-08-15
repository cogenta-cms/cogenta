import { type JSX, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

/** Mirrors `@cogenta/plugins`' `PluginCapabilityRisk` — a local, structural
 * type rather than a package dependency, following this app's own
 * established pattern (`api/content-client.ts`'s local `ContentBlock`) of
 * never taking a hard dependency on a backend package's types. */
export type PluginPermissionRisk = 'low' | 'medium' | 'high'

/** One already-translated capability — the plain-language sentence and risk
 * come from `@cogenta/plugins`' `describeCapability` upstream of this
 * component; this component never sees a raw capability string. */
export interface PluginPermissionItem {
  readonly capability: string
  readonly sentence: string
  readonly riskLevel: PluginPermissionRisk
}

export interface PluginPermissionReviewProps {
  readonly pluginName: string
  readonly items: readonly PluginPermissionItem[]
  /** Called with the exact capability strings the user chose to grant. */
  readonly onApprove: (capabilities: readonly string[]) => void
}

/**
 * "Écran de permissions en langage clair" (L7 task 7). Purely presentational
 * and prop-driven — no install flow is wired anywhere in this codebase yet
 * (no live plugin registry exists), so this renders whatever `items` it is
 * given rather than fetching anything itself. "L'installation sans lecture
 * est possible, mais on ne la facilite pas" (docs/lots/L7-extensibilite.md):
 * the per-item checklist is the default, prominent path; "approve all
 * without reading" exists but renders as a plain secondary link, never the
 * primary button.
 */
export function PluginPermissionReview({
  pluginName,
  items,
  onApprove,
}: PluginPermissionReviewProps): JSX.Element {
  const { t } = useTranslation()
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set())
  const [highRiskConfirmed, setHighRiskConfirmed] = useState<ReadonlySet<string>>(new Set())

  const highRiskItems = useMemo(() => items.filter((item) => item.riskLevel === 'high'), [items])

  function toggle(capability: string): void {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(capability)) next.delete(capability)
      else next.add(capability)
      return next
    })
  }

  function toggleHighRiskConfirm(capability: string): void {
    setHighRiskConfirmed((prev) => {
      const next = new Set(prev)
      if (next.has(capability)) next.delete(capability)
      else next.add(capability)
      return next
    })
  }

  const reviewedCapabilities = items
    .filter((item) => checked.has(item.capability))
    .filter((item) => item.riskLevel !== 'high' || highRiskConfirmed.has(item.capability))
    .map((item) => item.capability)

  const canApproveReviewed =
    reviewedCapabilities.length > 0 &&
    highRiskItems.every(
      (item) => !checked.has(item.capability) || highRiskConfirmed.has(item.capability),
    )

  const riskLabel: Record<PluginPermissionRisk, string> = {
    low: t('pluginPermissions.riskLow'),
    medium: t('pluginPermissions.riskMedium'),
    high: t('pluginPermissions.riskHigh'),
  }

  return (
    <section aria-labelledby="plugin-permissions-heading">
      <h2 id="plugin-permissions-heading">{t('pluginPermissions.heading')}</h2>
      <p>{t('pluginPermissions.intro', { name: pluginName })}</p>

      {items.length === 0 ? (
        <p>{t('pluginPermissions.noCapabilities')}</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.capability}>
              <label>
                <input
                  type="checkbox"
                  checked={checked.has(item.capability)}
                  onChange={() => toggle(item.capability)}
                />
                {item.sentence}
              </label>
              <span data-risk={item.riskLevel}> — {riskLabel[item.riskLevel]}</span>
              {item.riskLevel === 'high' && checked.has(item.capability) && (
                <label>
                  <input
                    type="checkbox"
                    checked={highRiskConfirmed.has(item.capability)}
                    onChange={() => toggleHighRiskConfirm(item.capability)}
                  />
                  {t('pluginPermissions.confirmHighRisk')}
                </label>
              )}
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        disabled={!canApproveReviewed}
        onClick={() => onApprove(reviewedCapabilities)}
      >
        {t('pluginPermissions.approveReviewed')}
      </button>
      <button type="button" onClick={() => onApprove(items.map((item) => item.capability))}>
        {t('pluginPermissions.approveAll')}
      </button>
    </section>
  )
}
