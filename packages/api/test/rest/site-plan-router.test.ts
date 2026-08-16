import { CogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import {
  type AppliedPlanReport,
  createSitePlanRouter,
  type PlanDecisionsLike,
  type PlanSectionLike,
  type SitePlanApplierLike,
  type SitePlanDraftLike,
  type SitePlannerLike,
  type SitePlanStoreLike,
  type StoredSitePlanLike,
} from '../../src/rest/site-plan-router.js'
import type { Actor } from '../../src/types.js'

const ADMIN: Actor = { id: 'user-admin', roles: ['admin'] }
const EDITOR: Actor = { id: 'user-editor', roles: ['editor'] }
const ANONYMOUS: Actor = { id: null, roles: ['public'] }

function draft(id = 'draft-1'): SitePlanDraftLike {
  return {
    id,
    createdAt: '2026-08-16T09:00:00.000Z',
    brief: {
      activity: 'A neighbourhood restaurant.',
      summary: 'A small showcase site.',
      languages: ['fr'],
      warnings: [],
      sources: [{ filename: 'brief.md' }],
    },
    violations: [],
    warnings: [],
  }
}

const SECTIONS: readonly PlanSectionLike[] = [
  {
    id: 'contentModel',
    title: 'Content model',
    description: 'The collections.',
    mode: 'each',
    items: [
      { id: 'contentModel:dish', section: 'contentModel', title: 'Dishes', detail: 'The menu.' },
    ],
  },
]

function memoryStore(): SitePlanStoreLike & { readonly saved: Map<string, StoredSitePlanLike> } {
  const saved = new Map<string, StoredSitePlanLike>()
  const mustGet = (id: string): StoredSitePlanLike => {
    const stored = saved.get(id)
    if (stored === undefined) {
      throw new CogentaError({
        code: 'SITE_PLAN_DRAFT_NOT_FOUND',
        message: `No site plan draft with id "${id}".`,
        hint: 'List the drafts to see which ones are waiting for review.',
      })
    }
    return stored
  }
  return {
    saved,
    async save(next) {
      const stored: StoredSitePlanLike = { draft: next, decisions: {} }
      saved.set(next.id, stored)
      return stored
    },
    async get(id) {
      return mustGet(id)
    },
    async list() {
      return [...saved.values()]
    },
    async recordDecisions(id, decisions) {
      const stored = mustGet(id)
      const next = { ...stored, decisions: { ...stored.decisions, ...decisions } }
      saved.set(id, next)
      return next
    },
    async markApplied(id, at) {
      const stored = mustGet(id)
      const next = { ...stored, appliedAt: at }
      saved.set(id, next)
      return next
    },
    async delete(id) {
      saved.delete(id)
    },
  }
}

function planner(overrides: Partial<SitePlannerLike> = {}): SitePlannerLike {
  return {
    async propose() {
      return { ok: true, draft: draft() }
    },
    sections: () => SECTIONS,
    ...overrides,
  }
}

function applier(
  report: Partial<AppliedPlanReport> = {},
): SitePlanApplierLike & { readonly calls: { decisions: PlanDecisionsLike }[] } {
  const calls: { decisions: PlanDecisionsLike }[] = []
  return {
    calls,
    async apply(input) {
      calls.push({ decisions: input.decisions })
      return {
        added: ['dish'],
        skipped: [],
        entriesSeeded: 0,
        skinApplied: false,
        followUp: ['Restart `cogenta serve` to pick up the new collections.'],
        ...report,
      }
    },
  }
}

const DOCUMENTS = [
  { filename: 'brief.md', contentBase64: Buffer.from('# Brief').toString('base64') },
]

describe('who may touch a site plan', () => {
  it('refuses an editor, an anonymous caller and everything in between', async () => {
    const router = createSitePlanRouter({ store: memoryStore(), planner: planner() })

    for (const actor of [EDITOR, ANONYMOUS]) {
      const response = await router.handle(
        { method: 'GET', path: '/api/site-plans', query: {} },
        actor,
      )

      expect(response.status).toBe(403)
      expect((response.body as { error: { code: string } }).error.code).toBe('FORBIDDEN')
    }
  })

  it('refuses an editor even on the route that only reads', async () => {
    const store = memoryStore()
    await store.save(draft())
    const router = createSitePlanRouter({ store, planner: planner() })

    const response = await router.handle(
      { method: 'GET', path: '/api/site-plans/draft-1', query: {} },
      EDITOR,
    )

    expect(response.status).toBe(403)
  })
})

describe('proposing a plan from uploaded documents', () => {
  it('stores the draft and returns it with the sections to review', async () => {
    const store = memoryStore()
    const router = createSitePlanRouter({ store, planner: planner() })

    const response = await router.handle(
      { method: 'POST', path: '/api/site-plans', query: {}, body: { documents: DOCUMENTS } },
      ADMIN,
    )

    expect(response.status).toBe(201)
    const data = (response.body as { data: Record<string, unknown> }).data
    expect(data.id).toBe('draft-1')
    expect(data.sections).toEqual(SECTIONS)
    // Nothing is decided yet, and nothing is pre-decided.
    expect(data.decisions).toEqual({})
    expect(store.saved.size).toBe(1)
  })

  it('says plainly that no provider is configured, rather than failing', async () => {
    const router = createSitePlanRouter({ store: memoryStore() })

    const response = await router.handle(
      { method: 'POST', path: '/api/site-plans', query: {}, body: { documents: DOCUMENTS } },
      ADMIN,
    )

    expect(response.status).toBe(501)
    const error = (response.body as { error: { code: string; hint?: string } }).error
    expect(error.code).toBe('SITE_PLAN_NO_PROVIDER')
    expect(error.hint).toContain('works without one')
  })

  it('tells the list route whether planning is available at all', async () => {
    const without = createSitePlanRouter({ store: memoryStore() })
    const with_ = createSitePlanRouter({ store: memoryStore(), planner: planner() })

    const a = await without.handle({ method: 'GET', path: '/api/site-plans', query: {} }, ADMIN)
    const b = await with_.handle({ method: 'GET', path: '/api/site-plans', query: {} }, ADMIN)

    expect((a.body as { plannerAvailable: boolean }).plannerAvailable).toBe(false)
    expect((b.body as { plannerAvailable: boolean }).plannerAvailable).toBe(true)
  })

  it('refuses a request with no document, and one with too many', async () => {
    const router = createSitePlanRouter({
      store: memoryStore(),
      planner: planner(),
      maxDocuments: 2,
    })

    const empty = await router.handle(
      { method: 'POST', path: '/api/site-plans', query: {}, body: {} },
      ADMIN,
    )
    const tooMany = await router.handle(
      {
        method: 'POST',
        path: '/api/site-plans',
        query: {},
        body: { documents: [...DOCUMENTS, ...DOCUMENTS, ...DOCUMENTS] },
      },
      ADMIN,
    )

    expect(empty.status).toBe(400)
    expect(tooMany.status).toBe(400)
  })

  it('reports a planning failure as a bad gateway, naming the stage', async () => {
    const router = createSitePlanRouter({
      store: memoryStore(),
      planner: planner({
        async propose() {
          return { ok: false, stage: 'brief', reason: 'the model did not return JSON' }
        },
      }),
    })

    const response = await router.handle(
      { method: 'POST', path: '/api/site-plans', query: {}, body: { documents: DOCUMENTS } },
      ADMIN,
    )

    expect(response.status).toBe(502)
    expect((response.body as { error: { message: string } }).error.message).toContain('brief')
  })
})

describe('recording decisions', () => {
  it('merges across requests, so a review can be done in several sittings', async () => {
    const store = memoryStore()
    await store.save(draft())
    const router = createSitePlanRouter({ store, planner: planner() })

    await router.handle(
      {
        method: 'POST',
        path: '/api/site-plans/draft-1/decisions',
        query: {},
        body: { decisions: { 'contentModel:dish': 'accepted' } },
      },
      ADMIN,
    )
    const second = await router.handle(
      {
        method: 'POST',
        path: '/api/site-plans/draft-1/decisions',
        query: {},
        body: { decisions: { 'pages:contact': 'rejected' } },
      },
      ADMIN,
    )

    expect((second.body as { data: { decisions: unknown } }).data.decisions).toEqual({
      'contentModel:dish': 'accepted',
      'pages:contact': 'rejected',
    })
  })

  it('refuses any decision value that is not accepted or rejected', async () => {
    const store = memoryStore()
    await store.save(draft())
    const router = createSitePlanRouter({ store, planner: planner() })

    for (const value of ['all', true, 'maybe', null]) {
      const response = await router.handle(
        {
          method: 'POST',
          path: '/api/site-plans/draft-1/decisions',
          query: {},
          body: { decisions: { 'contentModel:dish': value } },
        },
        ADMIN,
      )

      expect(response.status).toBe(400)
      expect((response.body as { error: { hint?: string } }).error.hint).toContain('no blanket one')
    }
  })
})

describe('applying an approved plan', () => {
  it('hands the applier exactly the decisions that were recorded, and nothing else', async () => {
    const store = memoryStore()
    await store.save(draft())
    await store.recordDecisions('draft-1', { 'contentModel:dish': 'accepted' })
    const runner = applier()
    const router = createSitePlanRouter({ store, planner: planner(), applier: runner })

    const response = await router.handle(
      { method: 'POST', path: '/api/site-plans/draft-1/apply', query: {} },
      ADMIN,
    )

    expect(response.status).toBe(200)
    expect(runner.calls).toEqual([{ decisions: { 'contentModel:dish': 'accepted' } }])
    const data = (response.body as { data: { report: AppliedPlanReport; appliedAt?: string } }).data
    expect(data.report.added).toEqual(['dish'])
    expect(data.report.followUp[0]).toContain('Restart')
    expect(data.appliedAt).toBeDefined()
  })

  it('refuses to apply the same plan twice', async () => {
    const store = memoryStore()
    await store.save(draft())
    const router = createSitePlanRouter({ store, planner: planner(), applier: applier() })

    await router.handle({ method: 'POST', path: '/api/site-plans/draft-1/apply', query: {} }, ADMIN)
    const second = await router.handle(
      { method: 'POST', path: '/api/site-plans/draft-1/apply', query: {} },
      ADMIN,
    )

    expect(second.status).toBe(409)
  })

  it('refuses to apply at all on a read-only instance, and says why', async () => {
    const store = memoryStore()
    await store.save(draft())
    const router = createSitePlanRouter({ store, planner: planner() })

    const response = await router.handle(
      { method: 'POST', path: '/api/site-plans/draft-1/apply', query: {} },
      ADMIN,
    )

    expect(response.status).toBe(403)
    expect((response.body as { error: { hint?: string } }).error.hint).toContain('read-only')
  })

  it('passes an applier refusal straight through, rather than swallowing it', async () => {
    const store = memoryStore()
    await store.save(draft())
    const router = createSitePlanRouter({
      store,
      planner: planner(),
      applier: {
        async apply() {
          throw new CogentaError({
            code: 'SITE_PLAN_DECISION_MISSING',
            message: '3 item(s) of this plan have no decision.',
            hint: 'Every proposed item must be accepted or rejected explicitly.',
          })
        },
      },
    })

    const response = await router.handle(
      { method: 'POST', path: '/api/site-plans/draft-1/apply', query: {} },
      ADMIN,
    )

    expect(response.status).toBe(400)
    expect((response.body as { error: { code: string } }).error.code).toBe(
      'SITE_PLAN_DECISION_MISSING',
    )
    // And the plan is not marked applied when the apply failed.
    expect((await store.get('draft-1')).appliedAt).toBeUndefined()
  })

  it('offers no parameter that could skip the review', async () => {
    const store = memoryStore()
    await store.save(draft())
    const runner = applier()
    const router = createSitePlanRouter({ store, planner: planner(), applier: runner })

    await router.handle(
      {
        method: 'POST',
        path: '/api/site-plans/draft-1/apply',
        query: { acceptAll: 'true', force: 'true' },
        body: { acceptAll: true, decisions: { '*': 'accepted' } },
      },
      ADMIN,
    )

    // Whatever the caller sent, the applier saw only what was recorded —
    // which here is nothing at all.
    expect(runner.calls).toEqual([{ decisions: {} }])
  })
})

describe('routing', () => {
  it('answers 404 for an unknown draft and an unknown sub-route', async () => {
    const router = createSitePlanRouter({ store: memoryStore(), planner: planner() })

    const missing = await router.handle(
      { method: 'GET', path: '/api/site-plans/nope', query: {} },
      ADMIN,
    )
    const unknown = await router.handle(
      { method: 'GET', path: '/api/site-plans/draft-1/nope/deeper', query: {} },
      ADMIN,
    )

    expect(missing.status).toBe(404)
    expect(unknown.status).toBe(404)
  })

  it('answers 405 with an Allow header on the wrong method', async () => {
    const router = createSitePlanRouter({ store: memoryStore(), planner: planner() })

    const response = await router.handle(
      { method: 'PUT', path: '/api/site-plans', query: {} },
      ADMIN,
    )

    expect(response.status).toBe(405)
    expect(response.headers.allow).toBe('GET, POST')
  })
})
