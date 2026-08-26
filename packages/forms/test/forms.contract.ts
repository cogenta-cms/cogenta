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
      for (const table of [
        TABLES.submissionNotes,
        TABLES.submissions,
        TABLES.definitions,
        TABLES.autoresponderSends,
      ]) {
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

    // ------------------------------------------------------------- fiche 47

    it('never validates or requires a field masked by an unmet showIf condition', async () => {
      await store.definitions.create({
        name: 'contact',
        label: 'Contact',
        fields: [
          {
            name: 'contactMethod',
            label: 'Contact method',
            kind: 'choiceSingle',
            required: true,
            choices: ['email', 'phone'],
          },
          {
            name: 'phone',
            label: 'Phone',
            kind: 'phone',
            required: true,
            showIf: { field: 'contactMethod', operator: 'equals', value: 'phone' },
          },
        ],
      })

      // "phone" would normally be required and rejected as malformed — but
      // its condition is unmet, so it is neither.
      const submission = await store.submissions.submit('contact', {
        contactMethod: 'email',
        phone: 'not-a-phone-number-at-all',
      })
      expect(submission.values).toEqual({ contactMethod: 'email' })
    })

    it('refuses a showIf condition naming an unknown field, at create time', async () => {
      await expect(
        store.definitions.create({
          name: 'contact',
          label: 'Contact',
          fields: [
            {
              name: 'phone',
              label: 'Phone',
              kind: 'phone',
              required: true,
              showIf: { field: 'doesNotExist', operator: 'equals', value: 'x' },
            },
          ],
        }),
      ).rejects.toMatchObject({ code: 'FORM_DEFINITION_INVALID' })
    })

    it('accepts a submission whose file field carries an already-resolved value', async () => {
      await store.definitions.create({
        name: 'contact',
        label: 'Contact',
        fields: [{ name: 'attachment', label: 'Attachment', kind: 'file', required: true }],
      })

      const fileValue = {
        filename: 'resume.pdf',
        mimeType: 'application/pdf',
        size: 1234,
        storageKey: 'forms/x/y/resume.pdf',
      }
      const submission = await store.submissions.submit('contact', { attachment: fileValue })
      expect(submission.values['attachment']).toEqual(fileValue)
    })

    it('refuses a file field submitted as a bare string, not a resolved value', async () => {
      await store.definitions.create({
        name: 'contact',
        label: 'Contact',
        fields: [{ name: 'attachment', label: 'Attachment', kind: 'file', required: true }],
      })
      await expect(
        store.submissions.submit('contact', { attachment: 'not-a-file-value' }),
      ).rejects.toMatchObject({ code: 'FORM_SUBMISSION_INVALID' })
    })

    it('validates that every field belongs to exactly one step once a form declares steps', async () => {
      await expect(
        store.definitions.create({
          name: 'contact',
          label: 'Contact',
          fields: [
            { name: 'email', label: 'E-mail', kind: 'email', required: true },
            { name: 'message', label: 'Message', kind: 'longText', required: true },
          ],
          steps: [{ name: 'step1', label: 'Step 1', fieldNames: ['email'] }],
        }),
      ).rejects.toMatchObject({ code: 'FORM_STEP_INVALID' })
    })

    it('accepts a well-formed multi-step definition', async () => {
      const form = await store.definitions.create({
        name: 'contact',
        label: 'Contact',
        fields: [
          { name: 'email', label: 'E-mail', kind: 'email', required: true },
          { name: 'message', label: 'Message', kind: 'longText', required: true },
        ],
        steps: [
          { name: 'step1', label: 'Step 1', fieldNames: ['email'] },
          { name: 'step2', label: 'Step 2', fieldNames: ['message'] },
        ],
      })
      expect(form.steps).toHaveLength(2)
    })

    it('refuses a notifyChannels entry missing a channel or a target', async () => {
      await expect(
        store.definitions.create({
          name: 'contact',
          label: 'Contact',
          fields: [{ name: 'email', label: 'E-mail', kind: 'email', required: true }],
          notifyChannels: [{ channel: '', target: 'C123' }],
        }),
      ).rejects.toMatchObject({ code: 'FORM_DEFINITION_INVALID' })
    })

    it('refuses enabling the CAPTCHA without both keys configured', async () => {
      await expect(
        store.definitions.create({
          name: 'contact',
          label: 'Contact',
          fields: [{ name: 'email', label: 'E-mail', kind: 'email', required: true }],
          captcha: { enabled: true },
        }),
      ).rejects.toMatchObject({ code: 'FORM_DEFINITION_INVALID' })
    })

    it('duplicates a form as an independent, inactive copy with an available name', async () => {
      const original = await store.definitions.create({
        name: 'contact',
        label: 'Contact',
        fields: [{ name: 'email', label: 'E-mail', kind: 'email', required: true }],
        active: true,
        notifyEmails: ['owner@example.com'],
      })

      const copy = await store.definitions.duplicate(original.id)
      expect(copy.id).not.toBe(original.id)
      expect(copy.name).toBe('contact-copy')
      expect(copy.active).toBe(false)
      expect(copy.notifyEmails).toEqual(['owner@example.com'])

      // Editing the original afterwards never touches the copy.
      await store.definitions.update(original.id, { label: 'Contact (renamed)' })
      const reread = await store.definitions.read(copy.id)
      expect(reread?.label).toBe('Contact (copy)')
    })

    it('picks a fresh available name when duplicating the same form twice', async () => {
      const original = await store.definitions.create({
        name: 'contact',
        label: 'Contact',
        fields: [{ name: 'email', label: 'E-mail', kind: 'email', required: true }],
      })
      const first = await store.definitions.duplicate(original.id)
      const second = await store.definitions.duplicate(original.id)
      expect(first.name).toBe('contact-copy')
      expect(second.name).toBe('contact-copy-2')
    })

    it('filters submissions by a date range', async () => {
      await store.definitions.create({
        name: 'contact',
        label: 'Contact',
        fields: [{ name: 'email', label: 'E-mail', kind: 'email', required: true }],
      })
      const early = await store.submissions.submit('contact', { email: 'early@example.com' })
      clock += 10 * 24 * 60 * 60 * 1000
      const late = await store.submissions.submit('contact', { email: 'late@example.com' })

      const cutoff = new Date(now() - 5 * 24 * 60 * 60 * 1000).toISOString()
      const result = await store.submissions.list({ from: cutoff })
      expect(result.items.map((item) => item.id)).toEqual([late.id])
      void early
    })

    it('finds a submission by free-text search across its values', async () => {
      await store.definitions.create({
        name: 'contact',
        label: 'Contact',
        fields: [
          { name: 'email', label: 'E-mail', kind: 'email', required: true },
          { name: 'message', label: 'Message', kind: 'longText', required: true },
        ],
      })
      await store.submissions.submit('contact', {
        email: 'a@example.com',
        message: 'I need help with billing',
      })
      await store.submissions.submit('contact', {
        email: 'b@example.com',
        message: 'General question',
      })

      const result = await store.submissions.list({ query: 'BILLING' })
      expect(result.items).toHaveLength(1)
      expect(result.items[0]?.values['email']).toBe('a@example.com')
    })

    it('adds and lists internal notes on a submission, oldest first', async () => {
      await store.definitions.create({
        name: 'contact',
        label: 'Contact',
        fields: [{ name: 'email', label: 'E-mail', kind: 'email', required: true }],
      })
      const submission = await store.submissions.submit('contact', { email: 'a@example.com' })

      await store.submissions.addNote(submission.id, 'First note', { id: 'user-1', label: 'Alice' })
      clock += 1000
      await store.submissions.addNote(submission.id, 'Second note', { id: 'user-2', label: 'Bob' })

      const notes = await store.submissions.listNotes(submission.id)
      expect(notes.map((note) => note.body)).toEqual(['First note', 'Second note'])
      expect(notes[0]?.authorLabel).toBe('Alice')
    })

    it('refuses an empty note', async () => {
      await store.definitions.create({
        name: 'contact',
        label: 'Contact',
        fields: [{ name: 'email', label: 'E-mail', kind: 'email', required: true }],
      })
      const submission = await store.submissions.submit('contact', { email: 'a@example.com' })
      await expect(
        store.submissions.addNote(submission.id, '   ', { id: null, label: 'admin' }),
      ).rejects.toMatchObject({ code: 'FORM_SUBMISSION_INVALID' })
    })

    it("removes a submission's notes along with the submission itself", async () => {
      await store.definitions.create({
        name: 'contact',
        label: 'Contact',
        fields: [{ name: 'email', label: 'E-mail', kind: 'email', required: true }],
      })
      const submission = await store.submissions.submit('contact', { email: 'a@example.com' })
      await store.submissions.addNote(submission.id, 'A note', { id: null, label: 'admin' })

      await store.submissions.remove(submission.id)
      // Re-adding after the submission is gone must fail loudly, not
      // silently create an orphaned note.
      await expect(
        store.submissions.addNote(submission.id, 'Too late', { id: null, label: 'admin' }),
      ).rejects.toMatchObject({ code: 'FORM_SUBMISSION_NOT_FOUND' })
    })
  })
}

function quote(name: string, dialect: string): string {
  return dialect === 'mysql' ? `\`${name}\`` : `"${name}"`
}
