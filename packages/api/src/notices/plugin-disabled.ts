import type { AdminNotice, NoticeSource } from './types.js'

/** One notice id per plugin name, so disabling `a` and `b` are two independent, independently dismissible notices. */
export function pluginDisabledNoticeId(pluginName: string): string {
  return `plugin.disabled:${pluginName}`
}

export interface DisabledPluginRecord {
  readonly pluginName: string
  readonly reason: 'timeout' | 'memory' | 'crash'
}

export interface PluginDisabledOptions {
  /** `@cogenta/plugins`' `PluginDisableStore.listDisabled`, or an equivalent. */
  readonly listDisabled: () => Promise<readonly DisabledPluginRecord[]>
  /** Where the admin's own plugins screen lives. */
  readonly pluginsHref?: string
}

/**
 * "Extension désactivée automatiquement" — fiche 38 task 1. A plugin killed
 * for exceeding its time or memory limit, or for crashing its worker
 * (`@cogenta/plugins`' `PluginDisableStore`, L7 task 6), stays disabled until
 * a human re-enables it — but nothing told that human it happened. The
 * underlying record was always real and tested; this is the first thing that
 * reads it back on an admin screen.
 *
 * Never dismissible: a disabled plugin is still disabled after the notice is
 * hidden, and re-enabling it (which makes the notice disappear on its own,
 * same as every other source) is one click away on the plugins screen this
 * notice's own action points at.
 */
export function createPluginDisabledSource(options: PluginDisabledOptions): NoticeSource {
  const pluginsHref = options.pluginsHref ?? '/plugins'

  return {
    name: 'plugin-disabled',
    list: async ({ actor }) => {
      if (actor.id === null) return []
      if (!actor.roles.includes('admin')) return []

      const disabled = await options.listDisabled()
      return disabled.map(
        (record): AdminNotice => ({
          id: pluginDisabledNoticeId(record.pluginName),
          code: `plugin.disabled.${record.reason}`,
          severity: 'danger',
          params: { plugin: record.pluginName },
          dismissible: false,
          action: { code: 'plugin.disabled.action', href: pluginsHref },
        }),
      )
    },
  }
}
