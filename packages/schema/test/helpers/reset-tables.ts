import { type DatabaseHandle, identifier, sql } from '@cogenta/core'

/**
 * Empties the tables a contract owns, before each of its tests.
 *
 * Every contract in this package is written twice over: once against SQLite,
 * where the harness hands back a brand-new database for each test, and once
 * against the real Postgres, MySQL and MariaDB servers, where all of them
 * share **one** database for the whole run. On SQLite "create table if not
 * exists" is enough and nothing ever carries over. On a real server the rows
 * pile up, and any assertion that reads the whole table — `store.list()`,
 * `toHaveLength(1)` — sees every row every earlier test left behind.
 *
 * That is why a random collection name per test was not enough: it isolates
 * the *row*, not the *listing*.
 *
 * Dropping is deliberate rather than `delete from`: it also clears a table
 * whose shape an older run created differently, which is exactly the state a
 * half-finished migration test leaves behind. Every caller re-creates the
 * table immediately afterwards through its own `ensure…Tables`.
 */
export async function resetTables(db: DatabaseHandle, tables: readonly string[]): Promise<void> {
  for (const table of tables) {
    await db.query(sql`drop table if exists ${identifier(table, db.dialect)}`)
  }
}
