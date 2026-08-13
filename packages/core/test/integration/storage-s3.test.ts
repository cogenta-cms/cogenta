import { describe, expect, it } from 'vitest'
import { createLogger } from '../../src/logger/index.js'
import {
  createS3Storage,
  createStorageRegistry,
  loadS3Modules,
  s3StorageDriver,
} from '../../src/storage/index.js'
import { collect, runStorageContract } from '../storage/storage.contract.js'

const endpoint = process.env['COGENTA_TEST_S3_ENDPOINT']
const accessKeyId = process.env['COGENTA_TEST_S3_ACCESS_KEY']
const secretAccessKey = process.env['COGENTA_TEST_S3_SECRET_KEY']
const configured = endpoint !== undefined && endpoint !== '' && accessKeyId !== undefined

const BUCKET = 'cogenta-test'
const silent = createLogger({ level: 'silent' })

if (!configured) {
  describe.skip('S3 storage', () => {
    it('skipped: COGENTA_TEST_S3_ENDPOINT is not set — run `pnpm services:up`', () => undefined)
  })
} else {
  const modules = await loadS3Modules()
  if (modules === null) throw new Error('the AWS SDK is not installed; run pnpm install')

  const config = {
    bucket: BUCKET,
    endpoint,
    region: 'us-east-1',
    accessKeyId,
    secretAccessKey,
  }

  const client = new modules.s3.S3Client({
    region: 'us-east-1',
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId: accessKeyId as string, secretAccessKey: secretAccessKey as string },
  })

  // MinIO starts empty; the bucket has to exist before anything can be stored.
  const { CreateBucketCommand } = (await import('@aws-sdk/client-s3')) as unknown as {
    CreateBucketCommand: new (input: Record<string, unknown>) => object
  }
  await client.send(new CreateBucketCommand({ Bucket: BUCKET })).catch(() => undefined)

  // Each contract run gets its own prefix, so a leftover object from a previous
  // run can never make one test depend on another.
  let run = 0
  runStorageContract('s3 (MinIO)', () => {
    run += 1
    return {
      storage: createS3Storage({
        modules,
        client,
        bucket: BUCKET,
        prefix: `run-${run}/`,
        baseUrl: `${endpoint}/${BUCKET}`,
      }),
    }
  })

  describe('s3 storage driver', () => {
    it('is available when the bucket answers, at the optimal tier', async () => {
      const driver = s3StorageDriver()

      expect(await driver.available(config)).toBe(true)
      expect(driver.tier).toBe('optimal')
    })

    it('is unavailable when the endpoint is not listening, so the registry falls through', async () => {
      expect(await s3StorageDriver().available({ ...config, endpoint: 'http://127.0.0.1:1' })).toBe(
        false,
      )
    })

    it('is unavailable when no bucket is configured at all', async () => {
      expect(await s3StorageDriver().available({ endpoint })).toBe(false)
    })

    it('is chosen over the local driver when the bucket is reachable', async () => {
      const selection = await createStorageRegistry({ logger: silent }).select(config)

      expect(selection.driver).toBe('s3')
      expect(selection.tier).toBe('optimal')
      await selection.dispose()
    })

    it('reports health without leaking the endpoint or the credentials', async () => {
      const selection = await createStorageRegistry({ logger: silent }).select(config)
      const report = await selection.health()

      expect(report).toMatchObject({ status: 'ok', driver: 's3' })
      const serialised = JSON.stringify(report)
      expect(serialised).not.toContain(secretAccessKey as string)
      expect(serialised).not.toContain('127.0.0.1')
      await selection.dispose()
    })

    it('uploads a stream in parts rather than buffering it whole', async () => {
      // A video is too large to hold in memory. The stream path must go through
      // multipart upload, not through a buffer.
      const { Readable } = await import('node:stream')
      const storage = createS3Storage({ modules, client, bucket: BUCKET, prefix: 'stream/' })

      const chunks = Array.from({ length: 64 }, () => Buffer.alloc(64 * 1024, 3))
      await storage.put('media/big.bin', Readable.from(chunks))

      expect((await storage.head('media/big.bin'))?.size).toBe(64 * 64 * 1024)
      await storage.delete('media/big.bin')
    })

    it('keeps two prefixes from seeing each other', async () => {
      const a = createS3Storage({ modules, client, bucket: BUCKET, prefix: 'site-a/' })
      const b = createS3Storage({ modules, client, bucket: BUCKET, prefix: 'site-b/' })

      await a.put('media/x.txt', Buffer.from('from a'))
      await b.put('media/x.txt', Buffer.from('from b'))

      expect((await collect(await a.get('media/x.txt'))).toString()).toBe('from a')
      await a.delete('media/x.txt')
      await b.delete('media/x.txt')
    })

    it('refuses a public URL when no base URL is configured', () => {
      const storage = createS3Storage({ modules, client, bucket: BUCKET })

      expect(() => storage.publicUrl('media/x.txt')).toThrowError(/public URL/)
    })
  })
}
