import type { ApprovalQueue, ApprovalRequest } from '@cogenta/agents'
import { describe, expect, it } from 'vitest'
import { createMonitoringRedirectSuggestionSource } from '../../src/notices/monitoring-redirect-suggestion.js'

const ADMIN = { id: 'admin-1', roles: ['admin'] }
const EDITOR = { id: 'editor-1', roles: ['editor'] }
const ANON = { id: null, roles: ['public'] }

function pendingRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: 'req-1',
    agentName: 'Site Monitor',
    toolName: 'redirects.create',
    input: { from: '/old-guide', to: '/guides/new-guide' },
    requestedAt: '2026-08-20T00:00:00.000Z',
    status: 'pending',
    ...overrides,
  }
}

function fakeQueue(requests: readonly ApprovalRequest[]): ApprovalQueue {
  return {
    request: () => {
      throw new Error('not used by this source')
    },
    list: async (status) =>
      status === undefined ? requests : requests.filter((request) => request.status === status),
    decide: () => {
      throw new Error('not used by this source')
    },
  }
}

describe('the monitoring-redirect-suggestion notice', () => {
  it('says nothing when nothing is pending', async () => {
    const source = createMonitoringRedirectSuggestionSource({
      approvalQueue: fakeQueue([]),
      redirects: { resolve: async () => null },
    })
    expect(await source.list({ actor: ADMIN })).toEqual([])
  })

  it('surfaces a pending redirects.create proposal, linking to the Redirections screen', async () => {
    const source = createMonitoringRedirectSuggestionSource({
      approvalQueue: fakeQueue([pendingRequest()]),
      redirects: { resolve: async () => null },
    })

    const [notice] = await source.list({ actor: ADMIN })

    expect(notice).toMatchObject({
      id: 'monitoring.redirect-suggestion:req-1',
      code: 'monitoring.redirect-suggestion',
      severity: 'info',
      dismissible: true,
      params: { from: '/old-guide', to: '/guides/new-guide', agent: 'Site Monitor' },
      action: { code: 'monitoring.redirect-suggestion.action', href: '/seo?tab=redirects' },
    })
  })

  it('honours a custom redirectsHref', async () => {
    const source = createMonitoringRedirectSuggestionSource({
      approvalQueue: fakeQueue([pendingRequest()]),
      redirects: { resolve: async () => null },
      redirectsHref: '/redirects',
    })
    const [notice] = await source.list({ actor: ADMIN })
    expect(notice?.action?.href).toBe('/redirects')
  })

  it('ignores a pending request for a different tool', async () => {
    const source = createMonitoringRedirectSuggestionSource({
      approvalQueue: fakeQueue([pendingRequest({ toolName: 'content.write_draft', id: 'req-2' })]),
      redirects: { resolve: async () => null },
    })
    expect(await source.list({ actor: ADMIN })).toEqual([])
  })

  it('ignores a non-pending request', async () => {
    const source = createMonitoringRedirectSuggestionSource({
      approvalQueue: fakeQueue([pendingRequest({ status: 'approved' })]),
      redirects: { resolve: async () => null },
    })
    expect(await source.list({ actor: ADMIN })).toEqual([])
  })

  it('stops suggesting once the redirect already exists — acted on by hand, or applied under autopilot', async () => {
    const source = createMonitoringRedirectSuggestionSource({
      approvalQueue: fakeQueue([pendingRequest()]),
      redirects: { resolve: async () => ({ to: '/guides/new-guide', status: 301 }) },
    })
    expect(await source.list({ actor: ADMIN })).toEqual([])
  })

  it('says nothing to a non-admin', async () => {
    const source = createMonitoringRedirectSuggestionSource({
      approvalQueue: fakeQueue([pendingRequest()]),
      redirects: { resolve: async () => null },
    })
    expect(await source.list({ actor: EDITOR })).toEqual([])
  })

  it('says nothing to an anonymous actor', async () => {
    const source = createMonitoringRedirectSuggestionSource({
      approvalQueue: fakeQueue([pendingRequest()]),
      redirects: { resolve: async () => null },
    })
    expect(await source.list({ actor: ANON })).toEqual([])
  })
})
