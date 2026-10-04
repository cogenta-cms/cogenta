import { createMysqlHandle, createPostgresHandle } from '@cogenta/core'
import { describe, it } from 'vitest'
import { runSeoSeedingContract } from '../seo-seeding.contract.js'

const postgres = process.env['COGENTA_TEST_POSTGRES_URL']
const mysql = process.env['COGENTA_TEST_MYSQL_URL']
const mariadb = process.env['COGENTA_TEST_MARIADB_URL']

for (const [label, url, connect] of [
  ['postgres', postgres, (url: string) => createPostgresHandle({ url, poolSize: 1 })],
  ['mysql', mysql, (url: string) => createMysqlHandle({ url, poolSize: 1 })],
  ['mariadb', mariadb, (url: string) => createMysqlHandle({ url, poolSize: 1 })],
] as const) {
  if (url === undefined || url === '') {
    describe.skip(`home SEO seeding (${label})`, () => {
      it('requires its dedicated ephemeral database URL', () => undefined)
    })
  } else {
    runSeoSeedingContract(label, () => connect(url))
  }
}
