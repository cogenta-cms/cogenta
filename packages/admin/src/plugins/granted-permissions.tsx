import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'
import { type PluginPermissionItem, PluginPermissionReview } from './permission-review.js'

/** One currently-active grant, already translated — mirrors `permission-review.tsx`'s
 * local-type convention (`@cogenta/plugins`' `GrantedCapabilityReview` shape,
 * never imported as a hard dependency). */
export interface GrantedPermissionItem extends PluginPermissionItem {
  readonly grantedAt: string
}

export interface PluginGrantedPermissionsProps {
  readonly pluginName: string
  /** Currently-active grants for this plugin, already translated. */
  readonly items: readonly GrantedPermissionItem[]
  /** Capabilities a new manifest version declares beyond what's granted — absent when there's nothing pending. */
  readonly pendingApproval?: readonly PluginPermissionItem[]
  readonly onRevoke: (capability: string) => void
  readonly onApprovePending?: (capabilities: readonly string[]) => void
}

/**
 * "Les permissions sont révisables après installation, et révocables"
 * (docs/lots/L7-extensibilite.md, L7 task 8). The already-installed
 * counterpart to `PluginPermissionReview` (task 7, install-time only) — this
 * is where an already-granted capability gets a real revoke action, and
 * where a plugin update's newly-requested capabilities (task 5's
 * `detectCapabilitiesNeedingApproval`) get their own, clearly separated
 * re-approval section reusing `PluginPermissionReview` itself rather than a
 * second review UI.
 *
 * No live plugin-list/detail screen exists anywhere in this codebase yet
 * (tasks 12/13 build the plugin registry this would be reached from) — this
 * is the real, testable, prop-driven component that screen will render,
 * not a fully-wired navigation flow to nowhere.
 */
export function PluginGrantedPermissions({
  pluginName,
  items,
  pendingApproval,
  onRevoke,
  onApprovePending,
}: PluginGrantedPermissionsProps): JSX.Element {
  const { t } = useTranslation()

  const riskLabel: Record<GrantedPermissionItem['riskLevel'], string> = {
    low: t('pluginPermissions.riskLow'),
    medium: t('pluginPermissions.riskMedium'),
    high: t('pluginPermissions.riskHigh'),
  }

  return (
    <section aria-labelledby="plugin-granted-permissions-heading">
      <h2 id="plugin-granted-permissions-heading">{t('pluginPermissions.grantedHeading')}</h2>

      {items.length === 0 ? (
        <p>{t('pluginPermissions.noGrants')}</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.capability}>
              {item.sentence}
              <span data-risk={item.riskLevel}> — {riskLabel[item.riskLevel]}</span>
              <button type="button" onClick={() => onRevoke(item.capability)}>
                {t('pluginPermissions.revoke')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {pendingApproval !== undefined && pendingApproval.length > 0 && (
        <section aria-labelledby="plugin-pending-permissions-heading">
          <h3 id="plugin-pending-permissions-heading">{t('pluginPermissions.pendingHeading')}</h3>
          <p>{t('pluginPermissions.pendingIntro')}</p>
          <PluginPermissionReview
            pluginName={pluginName}
            items={pendingApproval}
            onApprove={onApprovePending ?? (() => {})}
          />
        </section>
      )}
    </section>
  )
}
