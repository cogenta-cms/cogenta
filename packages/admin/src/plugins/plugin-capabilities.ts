import type { TFunction } from 'i18next'

/**
 * A permission, said in the words of the person who has to decide.
 *
 * L7 task 7's rule for this screen — « écran de permissions en langage clair
 * sans identifiant technique brut » — with one deliberate exception: the raw
 * name is still shown, smaller, underneath. Someone deciding whether a plugin
 * may "publier du contenu" is served by the sentence; someone auditing what
 * `content.publish` means in a manifest is served by the identifier, and
 * hiding it would make the screen unverifiable.
 *
 * A capability carries its scope after a colon (`content.read:article`,
 * `storage.write:plugins/x`): the scope is what limits it, so it is never
 * dropped.
 */
export interface CapabilityDescription {
  /** The plain sentence. Falls back to the raw name for a capability no locale names yet. */
  readonly label: string
  /** What the capability is limited to, if it is limited at all. */
  readonly scope: string | null
  readonly raw: string
}

export function describeCapability(t: TFunction, capability: string): CapabilityDescription {
  const separator = capability.indexOf(':')
  const base = separator === -1 ? capability : capability.slice(0, separator)
  const scope = separator === -1 ? null : capability.slice(separator + 1)
  return {
    label: t([`plugins.capability.${base}`, 'plugins.capabilityUnknown'], {
      capability: base,
      defaultValue: base,
    }),
    scope,
    raw: capability,
  }
}

/**
 * What a plugin does to a site, in one sentence per thing it does — read off
 * its manifest rather than off its code, because the manifest is what the
 * host actually honours.
 */
export function describeProvides(
  t: TFunction,
  provides: {
    readonly eventSubscriptions?: readonly string[]
    readonly routes?: readonly string[]
    readonly schedules?: readonly { readonly name: string; readonly everyMinutes: number }[]
  },
): readonly string[] {
  const lines: string[] = []
  const events = provides.eventSubscriptions ?? []
  const routes = provides.routes ?? []
  const schedules = provides.schedules ?? []
  if (events.length > 0) lines.push(t('plugins.does.events', { events: events.join(', ') }))
  if (routes.length > 0) lines.push(t('plugins.does.routes', { routes: routes.join(', ') }))
  for (const schedule of schedules) {
    lines.push(
      t('plugins.does.schedule', {
        name: schedule.name,
        hours: Math.round((schedule.everyMinutes / 60) * 10) / 10,
      }),
    )
  }
  if (lines.length === 0) lines.push(t('plugins.does.nothing'))
  return lines
}
