import { isCogentaError } from '@cogenta/core'
import { describe, expect, it } from 'vitest'
import {
  parseRolePermissionExport,
  ROLE_PERMISSION_EXPORT_VERSION,
  serialiseRolePermissionExport,
} from '../../src/store/role-permission-export.js'
import type { RolePermissionOverrideRecord } from '../../src/store/role-permission-store.js'

const records: readonly RolePermissionOverrideRecord[] = [
  {
    targetType: 'taxonomy',
    targetName: 'category',
    action: 'read',
    roles: ['public'],
    own: false,
    updatedAt: '2026-08-26T09:00:00.000Z',
    updatedBy: 'user-2',
  },
  {
    targetType: 'collection',
    targetName: 'article',
    action: 'update',
    roles: ['editor', 'admin'],
    own: true,
    updatedAt: '2026-08-26T08:00:00.000Z',
    updatedBy: 'user-1',
  },
]

describe('role permission export round trip (fiche 63, ADR-0028)', () => {
  it('serialises, and JSON.parse-ing that result back parses to the same rows', () => {
    const serialised = serialiseRolePermissionExport(
      records,
      () => new Date('2026-08-26T10:00:00.000Z'),
    )
    const roundTripped = JSON.parse(JSON.stringify(serialised)) as unknown
    const parsed = parseRolePermissionExport(roundTripped)

    expect(parsed.version).toBe(ROLE_PERMISSION_EXPORT_VERSION)
    expect(parsed.exportedAt).toBe('2026-08-26T10:00:00.000Z')
    // Every field of every row survives — not just count or names.
    expect(parsed.overrides).toEqual(
      [...records].sort((a, b) =>
        `${a.targetType} ${a.targetName} ${a.action}` <
        `${b.targetType} ${b.targetName} ${b.action}`
          ? -1
          : 1,
      ),
    )
  })

  it('sorts by (targetType, targetName, action) rather than insertion order, for a stable git diff', () => {
    const serialised = serialiseRolePermissionExport(records)
    expect(serialised.overrides[0]?.targetType).toBe('collection')
    expect(serialised.overrides[1]?.targetType).toBe('taxonomy')
  })

  it('refuses a document from a future version', () => {
    const error = (() => {
      try {
        parseRolePermissionExport({ version: 2, exportedAt: 'x', overrides: [] })
        return null
      } catch (caught) {
        return caught
      }
    })()
    expect(isCogentaError(error) && error.code).toBe('ROLE_PERMISSION_EXPORT_INVALID')
  })

  it('refuses a row missing a required field', () => {
    const error = (() => {
      try {
        parseRolePermissionExport({
          version: ROLE_PERMISSION_EXPORT_VERSION,
          exportedAt: 'x',
          overrides: [{ targetType: 'collection', targetName: 'article' }],
        })
        return null
      } catch (caught) {
        return caught
      }
    })()
    expect(isCogentaError(error) && error.code).toBe('ROLE_PERMISSION_EXPORT_INVALID')
  })
})
