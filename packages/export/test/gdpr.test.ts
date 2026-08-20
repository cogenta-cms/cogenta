import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSqliteHandle, type DatabaseHandle } from '@cogenta/core'
import {
  type CollectionDefinition,
  type ContentStore,
  createContentStore,
  createSchemaTables,
  defineCollection,
  f,
} from '@cogenta/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { exportPersonalData, type PersonalDataAccount } from '../src/gdpr.js'

const article: CollectionDefinition = defineCollection({
  name: 'gdpr_article',
  labels: { singular: 'Article', plural: 'Articles' },
  fields: { title: f.text({ max: 200 }) },
  permissions: { read: ['public'], create: ['editor'], update: ['editor'], delete: ['admin'] },
})

describe('exportPersonalData', () => {
  let directory: string
  let db: DatabaseHandle
  let store: ContentStore

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cogenta-gdpr-'))
    db = await createSqliteHandle({ url: join(directory, 'site.db') })
    await createSchemaTables(db, [article])
    store = createContentStore({ db, collection: article })
  })

  afterEach(async () => {
    await db.close()
    await rm(directory, { recursive: true, force: true })
  })

  it('gathers the account and everything they authored, by email', async () => {
    const account: PersonalDataAccount = {
      id: 'user-1',
      email: 'ada@example.test',
      roles: ['editor'],
      status: 'active',
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    await store.create({
      status: 'published',
      createdBy: account.id,
      values: { title: 'A signed post' },
    })
    await store.create({
      status: 'published',
      createdBy: 'someone-else',
      values: { title: 'Not theirs' },
    })

    const result = await exportPersonalData({
      email: account.email,
      accounts: { findByEmail: async (email) => (email === account.email ? account : null) },
      collections: [article],
      storeFor: () => store,
    })

    expect(result.account).toEqual(account)
    expect(result.authoredContent).toHaveLength(1)
    expect(result.authoredContent[0]?.title).toBe('A signed post')
  })

  it('names comments and forms as gaps rather than silently reporting zero', async () => {
    const result = await exportPersonalData({
      email: 'nobody@example.test',
      accounts: { findByEmail: async () => null },
      collections: [article],
      storeFor: () => store,
    })

    expect(result.account).toBeNull()
    expect(result.authoredContent).toEqual([])
    expect(result.gaps.map((gap) => gap.source).sort()).toEqual([
      'comments',
      'commerce',
      'form-submissions',
    ])
  })

  it('includes orders when an order lookup is supplied', async () => {
    const order = {
      id: 'order-1',
      status: 'paid',
      createdAt: '2026-01-02T00:00:00.000Z',
      totalMinorUnits: 1999,
      currency: 'EUR',
    }
    const result = await exportPersonalData({
      email: 'buyer@example.test',
      accounts: { findByEmail: async () => null },
      collections: [],
      storeFor: () => store,
      orders: {
        findCustomerIdByEmail: async () => 'customer-1',
        findByCustomerId: async (id) => (id === 'customer-1' ? [order] : []),
      },
    })

    expect(result.orders).toEqual([order])
    expect(result.gaps.some((gap) => gap.source === 'commerce')).toBe(false)
  })
})
