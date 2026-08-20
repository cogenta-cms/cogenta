import type { DatabaseHandle } from '@cogenta/core'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createFormStore, type FormStore } from '../src/store.js'
import { ensureFormsTables, TABLES } from '../src/tables.js'

export interface FormsFixture {
  readonly db: DatabaseHandle
}

/** One suite, run against every dialect — the same discipline `@cogenta/commerce`'s `runCatalogContract` established. */
export function runFormsContract(label: string, open: () => Promise<FormsFixture>): void {
  describe(`FormStore contract — ${label}`, () => {
    let db: DatabaseHandle
    let store: FormStore
    let clock = Date.parse('2026-01-01T00:00:00.000Z')
    const now = (): number => clock

    beforeEach(async () => {
      if (db === undefined) {
        const fixture = await open()
        db = fixture.db
        await ensureFormsTables(db)
      }
      for (const table of [TABLES.submissions, TABLES.definitions, TABLES.autoresponderSends]) {
        await db.query({ parts: [`delete from ${quote(table, db.dialect)}`], values: [] })
      }
      clock = Date.parse('2026-01-01T00:00:00.000Z')
      store = createFormStore(db, now)
    })

    afterAll(async () => {
      if (db !== undefined) await db.close()
    })

    it('refuses the reserved name "submissions" (would collide with the router\'s own path)', async () => {
      await expect(
        store.definitions.create({
          name: 'submissions',
          label: 'Submissions',
          fields: [{ name: 'email', label: 'E-mail', kind: 'email', required: true }],
        }),
      ).rejects.toMatchObject({ code: 'FORM_NAME_TAKEN' })
    })

    it('creates a form and reads it back by name', async () => {
      const created = await store.definitions.create({
        name: 'Contact Us',
        label: 'Contact us',
        fields: [{ name: 'email', label: 'E-mail', kind: 'email', required: true }],
      })
      expect(created.name).toBe('contact-us')
      expect(created.active).toBe(true)

      const found = await store.definitions.readByName('contact-us')
      expect(found?.id).toBe(created.id)
    })

    it('refuses a second form with the same name', async () => {
      await store.definitions.create({
        name: 'contact',
        label: 'Contact',
        fields: [{ name: 'email', label: 'E-mail', kind: 'email', required: true }],
      })
      await expect(
        store.definitions.create({
          name: 'contact',
          label: 'Contact again',
          fields: [{ name: 'email', label: 'E-mail', kind: 'email', required: true }],
        }),
      ).rejects.toMatchObject({ code: 'FORM_NAME_TAKEN' })
    })

    it('accepts a real submission, validated and stored', async () => {
      const form = await store.definitions.create({
        name: 'contact',
        label: 'Contact',
        fields: [
          { name: 'email', label: 'E-mail', kind: 'email', required: true },
          { name: 'message', label: 'Message', kind: 'longText', required: true },
        ],
      })

      const submission = await store.submissions.submit(
        'contact',
        { email: 'visitor@example.com', message: 'Hello there' },
        { ip: '203.0.113.9', referrer: 'https://example.com/', userAgent: 'test-agent' },
      )
      expect(submission.formId).toBe(form.id)
      expect(submission.values['email']).toBe('visitor@example.com')
      expect(submission.status).toBe('new')

      const listed = await store.submissions.list({ formId: form.id })
      expect(listed.items).toHaveLength(1)
    })

    it('rejects a submission to an unknown form', async () => {
      await expect(store.submissions.submit('nope', {})).rejects.toMatchObject({
        code: 'FORM_UNKNOWN',
      })
    })

    it('rejects a submission to a disabled form', async () => {
      await store.definitions.create({
        name: 'contact',
        label: 'Contact',
        fields: [{ name: 'email', label: 'E-mail', kind: 'email', required: true }],
        active: false,
      })
      await expect(store.submissions.submit('contact', { email: 'a@b.com' })).rejects.toMatchObject(
        { code: 'FORM_DISABLED' },
      )
    })

    it('records the consent text exactly as it stood at submission time', async () => {
      await store.definitions.create({
        name: 'contact',
        label: 'Contact',
        fields: [
          { name: 'email', label: 'E-mail', kind: 'email', required: true },
          {
            name: 'agree',
            label: 'Consent',
            kind: 'consent',
            required: true,
            consentText: 'I agree to be contacted.',
          },
        ],
      })

      const submission = await store.submissions.submit('contact', {
        email: 'a@b.com',
        agree: 'true',
      })
      expect(submission.consents).toEqual([
        {
          fieldName: 'agree',
          text: 'I agree to be contacted.',
          agreedAt: new Date(now()).toISOString(),
        },
      ])
    })

    it('marks a submission read, then archived, individually', async () => {
      await store.definitions.create({
        name: 'contact',
        label: 'Contact',
        fields: [{ name: 'email', label: 'E-mail', kind: 'email', required: true }],
      })
      const submission = await store.submissions.submit('contact', { email: 'a@b.com' })
      expect((await store.submissions.markStatus(submission.id, 'read')).status).toBe('read')
      expect((await store.submissions.markStatus(submission.id, 'archived')).status).toBe(
        'archived',
      )
    })

    it('bulk-marks several submissions at once', async () => {
      await store.definitions.create({
        name: 'contact',
        label: 'Contact',
        fields: [{ name: 'email', label: 'E-mail', kind: 'email', required: true }],
      })
      const one = await store.submissions.submit('contact', { email: 'a@b.com' })
      const two = await store.submissions.submit('contact', { email: 'c@d.com' })

      const count = await store.submissions.bulkMarkStatus([one.id, two.id], 'spam')
      expect(count).toBe(2)
      expect((await store.submissions.read(one.id))?.status).toBe('spam')
      expect((await store.submissions.read(two.id))?.status).toBe('spam')
    })

    it('counts unread (new) submissions', async () => {
      await store.definitions.create({
        name: 'contact',
        label: 'Contact',
        fields: [{ name: 'email', label: 'E-mail', kind: 'email', required: true }],
      })
      const one = await store.submissions.submit('contact', { email: 'a@b.com' })
      await store.submissions.submit('contact', { email: 'c@d.com' })
      await store.submissions.markStatus(one.id, 'read')

      expect(await store.submissions.unreadCount()).toBe(1)
    })

    it('finds every submission naming an e-mail address, across forms', async () => {
      await store.definitions.create({
        name: 'contact',
        label: 'Contact',
        fields: [{ name: 'email', label: 'E-mail', kind: 'email', required: true }],
      })
      await store.definitions.create({
        name: 'newsletter',
        label: 'Newsletter',
        fields: [{ name: 'email', label: 'E-mail', kind: 'email', required: true }],
      })
      await store.submissions.submit('contact', { email: 'target@example.com' })
      await store.submissions.submit('newsletter', { email: 'Target@Example.com' })
      await store.submissions.submit('contact', { email: 'someone-else@example.com' })

      const found = await store.submissions.searchByEmail('target@example.com')
      expect(found).toHaveLength(2)
    })

    it('erases every submission naming an e-mail address on request (GDPR)', async () => {
      await store.definitions.create({
        name: 'contact',
        label: 'Contact',
        fields: [{ name: 'email', label: 'E-mail', kind: 'email', required: true }],
      })
      await store.submissions.submit('contact', { email: 'erase-me@example.com' })
      await store.submissions.submit('contact', { email: 'keep-me@example.com' })

      const erased = await store.submissions.deleteByEmail('erase-me@example.com')
      expect(erased).toBe(1)
      expect(await store.submissions.searchByEmail('erase-me@example.com')).toHaveLength(0)
      expect(await store.submissions.searchByEmail('keep-me@example.com')).toHaveLength(1)
    })

    it('purges submissions past their form-configured retention, and only those', async () => {
      const form = await store.definitions.create({
        name: 'contact',
        label: 'Contact',
        fields: [{ name: 'email', label: 'E-mail', kind: 'email', required: true }],
        retainDays: 30,
      })
      const old = await store.submissions.submit('contact', { email: 'old@example.com' })
      clock += 45 * 24 * 60 * 60 * 1000
      const fresh = await store.submissions.submit('contact', { email: 'fresh@example.com' })

      const report = await store.submissions.purgeExpired()
      expect(report.purged).toBe(1)
      expect(await store.submissions.read(old.id)).toBeNull()
      expect(await store.submissions.read(fresh.id)).not.toBeNull()
      void form
    })
  })
}

function quote(name: string, dialect: string): string {
  return dialect === 'mysql' ? `\`${name}\`` : `"${name}"`
}
