import type { TFunction } from 'i18next'

/**
 * Every audit action `cogenta serve` writes on its own, as the identifier the
 * log stores. The "Action" filter offers these (plus whatever the entries on
 * screen add — an agent tool's action carries the tool's name, so it cannot be
 * listed up front), each under the label `audit.actionLabel.<id>` gives it.
 */
export const KNOWN_AUDIT_ACTIONS: readonly string[] = [
  'auth.login',
  'auth.login_failed',
  'auth.logout',
  'auth.recovery_code_used',
  'content.create',
  'content.update',
  'content.delete',
  'content.untrash',
  'content.purge',
  'content.publish',
  'content.unpublish',
  'content.duplicate',
  'content.restore',
  'content.replace',
  'content.visibility',
  'user.create',
  'user.update',
  'user.password_change',
  'user.invite_resend',
  'user.invite_cancel',
  'user.anonymize',
  'user.session_revoke',
  'user.personal_data_export',
  'role_permission.set',
  'role_permission.remove',
  'apikey.create',
  'apikey.rotate',
  'apikey.revoke',
  'apikey.recover',
  'apikey.purge',
  'site_setting.update',
  'admin_theme.update',
  'theme.write',
  'menu.write',
  'widget.write',
  'redirect.write',
  'media.upload',
  'media.update',
  'media.move',
  'media.delete',
  'plugin.install',
  'plugin.enable',
  'plugin.disable',
  'plugin.grant',
  'plugin.revoke',
  'plugin.uninstall',
  'provider.write',
  'agent.write',
  'agent.run',
  'agent.approval.approved',
  'agent.approval.rejected',
  'skill.write',
  'mcp.write',
  'scheduled_task.run',
  'import.wordpress',
  'audit.export',
  'audit.prune',
]

const AGENT_TOOL_PREFIX = 'agent.tool.'

/** An audit action in words a site owner reads: a translated label when one exists, a readable fallback otherwise — never the raw identifier alone. */
export function auditActionLabel(t: TFunction, action: string): string {
  if (action.startsWith(AGENT_TOOL_PREFIX)) {
    return t('audit.agentTool', { tool: action.slice(AGENT_TOOL_PREFIX.length) })
  }
  return t(`audit.actionLabel.${action}`, { defaultValue: action })
}

/** Who did it: an account's e-mail, an agent or an API key by name, "System" when nobody was signed in. */
export function auditActorLabel(
  t: TFunction,
  actorId: string | null,
  names: ReadonlyMap<string, string>,
): string {
  if (actorId === null) return t('audit.systemActor')
  const known = names.get(actorId)
  if (known !== undefined) return known
  if (actorId.startsWith('agent:')) return t('audit.agentActor', { name: actorId.slice(6) })
  if (actorId.startsWith('apikey:')) {
    const keyName = names.get(actorId)
    return t('audit.apiKeyActor', { name: keyName ?? actorId.slice(7, 15) })
  }
  return actorId
}
