import { describe, expect, it } from 'vitest'
import {
  createPluginDisabledSource,
  pluginDisabledNoticeId,
} from '../../src/notices/plugin-disabled.js'

const ADMIN = { id: 'admin-1', roles: ['admin'] }
const EDITOR = { id: 'editor-1', roles: ['editor'] }
const ANON = { id: null, roles: ['public'] }

describe('the plugin-disabled notice', () => {
  it('says nothing when no plugin is disabled', async () => {
    const source = createPluginDisabledSource({ listDisabled: async () => [] })
    expect(await source.list({ actor: ADMIN })).toEqual([])
  })

  it('warns an admin, once per disabled plugin', async () => {
    const source = createPluginDisabledSource({
      listDisabled: async () => [
        { pluginName: '@acme/seo', reason: 'timeout' },
        { pluginName: '@acme/broken', reason: 'crash' },
      ],
    })
    const notices = await source.list({ actor: ADMIN })
    expect(notices).toHaveLength(2)
    expect(notices.map((n) => n.id)).toEqual([
      pluginDisabledNoticeId('@acme/seo'),
      pluginDisabledNoticeId('@acme/broken'),
    ])
    expect(notices[0]).toMatchObject({
      code: 'plugin.disabled.timeout',
      severity: 'danger',
      dismissible: false,
      params: { plugin: '@acme/seo' },
    })
  })

  it('says nothing to a non-admin', async () => {
    const source = createPluginDisabledSource({
      listDisabled: async () => [{ pluginName: '@acme/seo', reason: 'timeout' }],
    })
    expect(await source.list({ actor: EDITOR })).toEqual([])
  })

  it('says nothing to an anonymous actor', async () => {
    const source = createPluginDisabledSource({
      listDisabled: async () => [{ pluginName: '@acme/seo', reason: 'timeout' }],
    })
    expect(await source.list({ actor: ANON })).toEqual([])
  })

  it('points its action at the plugins screen', async () => {
    const source = createPluginDisabledSource({
      listDisabled: async () => [{ pluginName: '@acme/seo', reason: 'memory' }],
      pluginsHref: '/settings/plugins',
    })
    const [notice] = await source.list({ actor: ADMIN })
    expect(notice?.action).toEqual({ code: 'plugin.disabled.action', href: '/settings/plugins' })
  })
})
