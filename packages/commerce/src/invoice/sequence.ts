import {
  CogentaError,
  type DatabaseDialect,
  identifier,
  type SqlExecutor,
  sql,
} from '@cogenta/core'
import { toInt } from '../rows.js'
import { TABLES } from '../tables.js'

/** `2026-000042` / `CN-2026-000003`. Zero-padded so the numbers sort as strings too. */
export function formatSequenceNumber(series: string, seq: number): string {
  return `${series}-${String(seq).padStart(6, '0')}`
}

/**
 * How many attempts at claiming the next number before giving up.
 *
 * The claim is a compare-and-set, so a loser retries with the value it just
 * read. Under real contention two or three attempts is already unusual; ten is
 * a number nobody reaches without something else being wrong, and failing
 * loudly then is better than spinning.
 */
const CLAIM_ATTEMPTS = 10

/**
 * Takes the next number in a series, atomically — shared by invoices
 * (`invoice/store.ts`) and credit notes (`invoice/credit-note.ts`, fiche 52
 * task 6), both series living in the same `cogenta_commerce_invoice_sequences`
 * table, told apart only by their series string (an invoice's is the year,
 * `2026`; a credit note's is `CN-2026` — see `credit-note.ts`).
 *
 * `update … set next_seq = next_seq + 1 where series = ? and next_seq = ?` —
 * a compare-and-set whose `rowsAffected` decides the race, the same idiom
 * that makes stock safe and a password reset token single use. Two documents
 * issued in the same millisecond get consecutive numbers, never the same one.
 *
 * Emphatically not `count(*) + 1`: that hands out a duplicate under any
 * concurrency at all, and re-issues a number that a deleted row used to
 * hold. A number, once handed out, is spent.
 */
export async function claimSequenceNumber(
  tx: SqlExecutor,
  dialect: DatabaseDialect,
  series: string,
): Promise<number> {
  const sequences = identifier(TABLES.invoiceSequences, dialect)

  for (let attempt = 0; attempt < CLAIM_ATTEMPTS; attempt += 1) {
    const current = await tx.query<{ next_seq: unknown }>(
      sql`select next_seq from ${sequences} where series = ${series}`,
    )
    const row = current.rows[0]

    if (row === undefined) {
      // First document of the series. A duplicate primary key here means
      // somebody else created it in between, so the loop reads it and
      // competes for the increment like everyone else.
      try {
        await tx.query(sql`insert into ${sequences} (series, next_seq) values (${series}, ${2})`)
        return 1
      } catch {
        continue
      }
    }

    const next = toInt(row.next_seq, 'invoice_sequence.next_seq')
    const claimed = await tx.query(sql`
      update ${sequences} set next_seq = ${next + 1}
      where series = ${series} and next_seq = ${next}`)
    if (claimed.rowsAffected > 0) return next
  }

  throw new CogentaError({
    code: 'COMMERCE_INVOICE_SEQUENCE_CONFLICT',
    message: `Could not take the next number in series "${series}".`,
    hint: 'The sequence is under unusually heavy contention. Retry the issue.',
    details: { series, attempts: CLAIM_ATTEMPTS },
  })
}
