import type { CollectionDefinition } from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AccessContext, Actor } from '../../src/types.js'
import { ANONYMOUS } from '../../src/types.js'
import { bodyOf, createHarness, dataOf, type Harness, request } from './harness.js'

/**
 * The editorial workflow over REST (`schema@2.1`, ADR-0027).
 *
 * `wf_article` is the fixture the whole suite turns on: `workflow: { enabled:
 * true }`, `update` scoped to `own: true` for `contributor` (a role outside
 * the four shipped ones, which is exactly the point — the taxonomy is open),
 * and `publish` held by `reviewer`. This is the collection contract A's own
 * example in ADR-0027 names almost verbatim.
 */

const WF_ARTICLE: CollectionDefinition = {
  name: 'wf_article',
  labels: { singular: 'Article', plural: 'Articles' },
  workflow: { enabled: true },
  fields: { title: { kind: 'text', required: true, options: { max: 200 } } },
  permissions: {
    read: ['public'],
    create: ['contributor', 'reviewer', 'admin'],
    update: { roles: ['contributor'], own: true },
    delete: ['admin'],
    publish: ['reviewer', 'admin'],
  },
}

/** Same shape, `workflow` left out — the control for "a site that never turns it on". */
const NO_WORKFLOW_ARTICLE: CollectionDefinition = {
  name: 'wf_no_workflow_article',
  labels: { singular: 'Article', plural: 'Articles' },
  fields: { title: { kind: 'text', required: true, options: { max: 200 } } },
  permissions: {
    read: ['public'],
    create: ['contributor'],
    update: ['contributor'],
    publish: ['reviewer'],
  },
}

const COLLECTIONS = [WF_ARTICLE, NO_WORKFLOW_ARTICLE]
const ROLES = ['public', 'viewer', 'contributor', 'reviewer', 'admin']

const CONTRIBUTOR_A: Actor = { id: 'user-contributor-a', roles: ['contributor'] }
const CONTRIBUTOR_B: Actor = { id: 'user-contributor-b', roles: ['contributor'] }
const REVIEWER: Actor = { id: 'user-reviewer', roles: ['reviewer'] }
const ADMIN: Actor = { id: 'user-admin', roles: ['admin'] }
const VIEWER: Actor = { id: 'user-viewer', roles: ['viewer'] }

const asContributorA: AccessContext = { actor: CONTRIBUTOR_A }
const asContributorB: AccessContext = { actor: CONTRIBUTOR_B }
const asReviewer: AccessContext = { actor: REVIEWER }
const asAdmin: AccessContext = { actor: ADMIN }
const asViewer: AccessContext = { actor: VIEWER }
const asPublic: AccessContext = { actor: ANONYMOUS }

describe('the editorial workflow over REST', () => {
  let harness: Harness

  const seed = async (title: string, actor: AccessContext = asContributorA): Promise<string> => {
    const created = await harness.router.handle(
      request('POST', '/wf_article', { body: { values: { title } } }),
      actor,
    )
    expect(created.status, JSON.stringify(bodyOf(created))).toBe(201)
    return String(dataOf(created)['id'])
  }

  beforeEach(async () => {
    harness = await createHarness({ collections: COLLECTIONS, roles: ROLES })
  })

  afterEach(async () => {
    await harness.dispose()
  })

  it('runs a full cycle: submit, approve — and approving is not publishing', async () => {
    const id = await seed('Cycle complet')

    const submitted = await harness.router.handle(
      request('POST', `/wf_article/${id}/submit`, { body: { reviewerId: REVIEWER.id } }),
      asContributorA,
    )
    expect(submitted.status).toBe(200)
    const afterSubmit = dataOf(submitted)
    expect(afterSubmit['reviewState']).toBe('pending')
    expect(afterSubmit['assignedReviewer']).toBe(REVIEWER.id)

    const approved = await harness.router.handle(
      request('POST', `/wf_article/${id}/approve`),
      asReviewer,
    )
    expect(approved.status).toBe(200)
    const afterApprove = dataOf(approved)
    expect(afterApprove['reviewState']).toBe('approved')
    // The property the fiche states as a hard requirement: approving never
    // publishes. `publish` remains its own, separate action.
    expect(afterApprove['status']).not.toBe('published')

    const publish = await harness.router.handle(
      request('POST', `/wf_article/${id}/publish`),
      asReviewer,
    )
    expect(publish.status).toBe(200)
    expect(dataOf(publish)['status']).toBe('published')
  })

  it('sends a pending entry back to changes-requested, and lets it be resubmitted', async () => {
    const id = await seed('À corriger')
    await harness.router.handle(request('POST', `/wf_article/${id}/submit`), asContributorA)

    const rejected = await harness.router.handle(
      request('POST', `/wf_article/${id}/request-changes`),
      asReviewer,
    )
    expect(rejected.status).toBe(200)
    expect(dataOf(rejected)['reviewState']).toBe('changes-requested')

    const resubmitted = await harness.router.handle(
      request('POST', `/wf_article/${id}/submit`),
      asContributorA,
    )
    expect(resubmitted.status).toBe(200)
    expect(dataOf(resubmitted)['reviewState']).toBe('pending')
  })

  describe('the transition table refuses an illegal jump', () => {
    it('refuses to approve an entry nobody submitted', async () => {
      const id = await seed('Jamais soumis')
      const response = await harness.router.handle(
        request('POST', `/wf_article/${id}/approve`),
        asReviewer,
      )
      expect(response.status).toBe(409)
    })

    it('refuses to submit an entry already pending', async () => {
      const id = await seed('Déjà en attente')
      await harness.router.handle(request('POST', `/wf_article/${id}/submit`), asContributorA)

      const response = await harness.router.handle(
        request('POST', `/wf_article/${id}/submit`),
        asContributorA,
      )
      expect(response.status).toBe(409)
    })

    it('refuses to request changes on an entry not pending', async () => {
      const id = await seed('Brouillon')
      const response = await harness.router.handle(
        request('POST', `/wf_article/${id}/request-changes`),
        asReviewer,
      )
      expect(response.status).toBe(409)
    })
  })

  describe('permissions, per role, checked server-side', () => {
    it('refuses submit to an actor without update', async () => {
      const id = await seed('Protégé')
      const response = await harness.router.handle(
        request('POST', `/wf_article/${id}/submit`),
        asViewer,
      )
      expect(response.status).toBe(403)
    })

    it('refuses approve and request-changes to an actor without publish', async () => {
      const id = await seed('Sans droit')
      await harness.router.handle(request('POST', `/wf_article/${id}/submit`), asContributorA)

      for (const action of ['approve', 'request-changes']) {
        const response = await harness.router.handle(
          request('POST', `/wf_article/${id}/${action}`),
          asContributorA,
        )
        expect(response.status, action).toBe(403)
      }
    })

    it("enforces own: true — a contributor may submit their own entry, never another contributor's", async () => {
      const mine = await seed('À moi', asContributorA)
      const theirs = await seed('Pas à moi', asContributorB)

      const ownSubmit = await harness.router.handle(
        request('POST', `/wf_article/${mine}/submit`),
        asContributorA,
      )
      expect(ownSubmit.status).toBe(200)

      const foreignSubmit = await harness.router.handle(
        request('POST', `/wf_article/${theirs}/submit`),
        asContributorA,
      )
      expect(foreignSubmit.status).toBe(403)

      // The same rule protects the plain PATCH, not only the workflow route.
      const foreignEdit = await harness.router.handle(
        request('PATCH', `/wf_article/${theirs}`, { body: { values: { title: 'Volé' } } }),
        asContributorA,
      )
      expect(foreignEdit.status).toBe(403)

      const ownEdit = await harness.router.handle(
        request('PATCH', `/wf_article/${mine}`, { body: { values: { title: 'À moi, modifié' } } }),
        asContributorA,
      )
      expect(ownEdit.status).toBe(200)
    })

    it('admin, holding no explicit own-scoped role here, is simply refused update — own is not a bypass', async () => {
      const theirs = await seed('Contributeur', asContributorA)
      const response = await harness.router.handle(
        request('PATCH', `/wf_article/${theirs}`, { body: { values: { title: 'Admin' } } }),
        asAdmin,
      )
      expect(response.status).toBe(403)
    })

    it('own: true also gates /restore, an update action content-service.ts had missed', async () => {
      const mine = await seed('À moi', asContributorA)
      await harness.router.handle(
        request('PATCH', `/wf_article/${mine}`, { body: { values: { title: 'À moi, v2' } } }),
        asContributorA,
      )

      const foreignRestore = await harness.router.handle(
        request('POST', `/wf_article/${mine}/restore`, { body: { version: 1 } }),
        asContributorB,
      )
      expect(foreignRestore.status).toBe(403)

      const ownRestore = await harness.router.handle(
        request('POST', `/wf_article/${mine}/restore`, { body: { version: 1 } }),
        asContributorA,
      )
      expect(ownRestore.status).toBe(200)
    })
  })

  it('refuses every transition on a collection that never turned the workflow on', async () => {
    const created = await harness.router.handle(
      request('POST', '/wf_no_workflow_article', { body: { values: { title: 'Sans workflow' } } }),
      asContributorA,
    )
    expect(created.status).toBe(201)
    const id = String(dataOf(created)['id'])

    const response = await harness.router.handle(
      request('POST', `/wf_no_workflow_article/${id}/submit`),
      asContributorA,
    )
    expect(response.status).toBe(409)
  })

  it('assigns and reassigns a reviewer independently of submitting', async () => {
    const id = await seed('Assignation')

    const assigned = await harness.router.handle(
      request('POST', `/wf_article/${id}/assign-reviewer`, { body: { reviewerId: REVIEWER.id } }),
      asContributorA,
    )
    expect(assigned.status).toBe(200)
    expect(dataOf(assigned)['assignedReviewer']).toBe(REVIEWER.id)

    const cleared = await harness.router.handle(
      request('POST', `/wf_article/${id}/assign-reviewer`, { body: { reviewerId: null } }),
      asContributorA,
    )
    expect(dataOf(cleared)['assignedReviewer']).toBeNull()
  })

  it('never uses a second verb on an existing path — each transition has its own POST route', async () => {
    const id = await seed('Chemins')
    // GET is not how a transition happens.
    const getSubmit = await harness.router.handle(
      request('GET', `/wf_article/${id}/submit`),
      asContributorA,
    )
    expect(getSubmit.status).toBe(405)
  })

  it('leaves reviewState at "none" for an entry a workflow-unaware client never touches', async () => {
    // The compatibility property the fiche asks to be proved: a client that
    // reads `status` and has never heard of `reviewState` gets exactly the
    // status values it always did, and the new field defaults to inert.
    const id = await seed('Jamais touché')
    const read = await harness.router.handle(
      request('GET', `/wf_article/${id}`, { query: { state: 'working' } }),
      asContributorA,
    )
    const entry = dataOf(read)
    expect(entry['status']).toBe('draft')
    expect(entry['reviewState']).toBe('none')
    expect(entry['assignedReviewer']).toBeNull()
  })

  it('never lets the public reach draft workflow state through a transition route', async () => {
    const id = await seed('Public')
    const response = await harness.router.handle(
      request('POST', `/wf_article/${id}/submit`),
      asPublic,
    )
    expect(response.status).toBe(403)
  })
})
