import { describe, expect, it } from 'vitest'
import { createSkillRegistry } from '../../src/registries/skills.js'
import { testDb } from '../helpers/db.js'

const VALID_SKILL = `---
name: example-skill
version: 1.0.0
description: A real, valid skill file.
---
Do the thing, step by step.`

const MALFORMED_SKILL = `This has no frontmatter block at all.`

describe('createSkillRegistry', () => {
  it('accepts a submission that parses correctly into the pending state, never auto-accepted', async () => {
    const db = await testDb()
    const registry = createSkillRegistry(db, () => 1_700_000_000_000)

    const entry = await registry.submit({
      submitterId: 'user-1',
      displayName: 'Example Skill',
      rawContent: VALID_SKILL,
    })

    expect(entry.status).toBe('pending')
    expect(entry.skillName).toBe('example-skill')
    expect(entry.skillVersion).toBe('1.0.0')
    expect(entry.rejectionCode).toBeNull()
    expect(entry.reviewedBy).toBeNull()
  })

  it('rejects a submission that fails to parse immediately, with the real parse error, never reaching pending', async () => {
    const db = await testDb()
    const registry = createSkillRegistry(db, () => 1_700_000_000_000)

    const entry = await registry.submit({
      submitterId: 'user-1',
      displayName: 'Broken Skill',
      rawContent: MALFORMED_SKILL,
    })

    expect(entry.status).toBe('rejected')
    expect(entry.rejectionCode).toBe('SKILL_DEFINITION_INVALID')
    expect(entry.rejectionReason).toContain('frontmatter')
    expect(entry.skillName).toBeNull()
    expect(entry.reviewedBy).toBeNull()

    const accepted = await registry.listAccepted()
    expect(accepted).toHaveLength(0)
  })

  it('moves a pending submission to accepted on a human accept decision, and it appears in listAccepted', async () => {
    const db = await testDb()
    const registry = createSkillRegistry(db, () => 1_700_000_000_000)

    const submitted = await registry.submit({
      submitterId: 'user-1',
      displayName: 'Example Skill',
      rawContent: VALID_SKILL,
    })

    const result = await registry.review(submitted.id, 'accept', 'reviewer-1')
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok result')
    expect(result.entry.status).toBe('accepted')
    expect(result.entry.reviewedBy).toBe('reviewer-1')

    const accepted = await registry.listAccepted()
    expect(accepted.map((s) => s.id)).toEqual([submitted.id])
  })

  it('moves a pending submission to rejected on a human reject decision, and it never appears in listAccepted', async () => {
    const db = await testDb()
    const registry = createSkillRegistry(db, () => 1_700_000_000_000)

    const submitted = await registry.submit({
      submitterId: 'user-1',
      displayName: 'Example Skill',
      rawContent: VALID_SKILL,
    })

    const result = await registry.review(
      submitted.id,
      'reject',
      'reviewer-1',
      'Not aligned with house style.',
    )
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('expected ok result')
    expect(result.entry.status).toBe('rejected')
    expect(result.entry.rejectionReason).toBe('Not aligned with house style.')

    const accepted = await registry.listAccepted()
    expect(accepted).toHaveLength(0)
  })

  it('refuses to re-review an already-decided submission, returning the prior decision rather than a raw error', async () => {
    const db = await testDb()
    const registry = createSkillRegistry(db, () => 1_700_000_000_000)

    const submitted = await registry.submit({
      submitterId: 'user-1',
      displayName: 'Example Skill',
      rawContent: VALID_SKILL,
    })
    await registry.review(submitted.id, 'accept', 'reviewer-1')

    const second = await registry.review(submitted.id, 'reject', 'reviewer-2')
    expect(second.ok).toBe(false)
    if (second.ok) throw new Error('expected not-ok result')
    expect(second.reason).toBe('already_decided')
    if (second.reason === 'already_decided') {
      expect(second.entry.status).toBe('accepted')
    }
  })

  it('reports not_found for a review of an unknown submission id', async () => {
    const db = await testDb()
    const registry = createSkillRegistry(db, () => 1_700_000_000_000)

    const result = await registry.review('does-not-exist', 'accept', 'reviewer-1')
    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })

  it('an auto-rejected (unparseable) submission cannot be reviewed since it never reaches pending', async () => {
    const db = await testDb()
    const registry = createSkillRegistry(db, () => 1_700_000_000_000)

    const submitted = await registry.submit({
      submitterId: 'user-1',
      displayName: 'Broken Skill',
      rawContent: MALFORMED_SKILL,
    })

    const result = await registry.review(submitted.id, 'accept', 'reviewer-1')
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('expected not-ok result')
    expect(result.reason).toBe('already_decided')
  })

  it('get() returns the real stored entry by id, or null for an unknown id', async () => {
    const db = await testDb()
    const registry = createSkillRegistry(db, () => 1_700_000_000_000)

    const submitted = await registry.submit({
      submitterId: 'user-1',
      displayName: 'Example Skill',
      description: 'A demo skill.',
      rawContent: VALID_SKILL,
    })

    const fetched = await registry.get(submitted.id)
    expect(fetched?.id).toBe(submitted.id)
    expect(fetched?.description).toBe('A demo skill.')

    expect(await registry.get('missing')).toBeNull()
  })
})
