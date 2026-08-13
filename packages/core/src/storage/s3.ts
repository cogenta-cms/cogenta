import type { Readable } from 'node:stream'
import type { Driver, HealthReport } from '../drivers/index.js'
import { CogentaError } from '../errors/index.js'
import { parseKey } from './key.js'
import type {
  StorageConfig,
  StorageDriver,
  StorageDriverOptions,
  StorageObjectInfo,
  StoragePutOptions,
} from './types.js'

/**
 * Only the slice of the AWS SDK this driver uses, described structurally so the
 * published types never reference an optional peer.
 */
interface S3ClientLike {
  send<TOutput>(command: object): Promise<TOutput>
  destroy(): void
}

interface S3ModuleLike {
  S3Client: new (config: Record<string, unknown>) => S3ClientLike
  PutObjectCommand: new (input: Record<string, unknown>) => object
  GetObjectCommand: new (input: Record<string, unknown>) => object
  HeadObjectCommand: new (input: Record<string, unknown>) => object
  DeleteObjectCommand: new (input: Record<string, unknown>) => object
}

interface PresignerModuleLike {
  getSignedUrl(
    client: S3ClientLike,
    command: object,
    options: { expiresIn: number },
  ): Promise<string>
}

interface UploadModuleLike {
  Upload: new (input: Record<string, unknown>) => { done(): Promise<unknown> }
}

export interface S3Modules {
  readonly s3: S3ModuleLike
  readonly presigner: PresignerModuleLike
  readonly upload: UploadModuleLike
}

/**
 * Loads the AWS SDK if the host application installed it.
 *
 * It is an optional peer, and a large one — which is exactly why it must not be
 * a hard dependency. A site on local storage installs none of it.
 */
export async function loadS3Modules(): Promise<S3Modules | null> {
  try {
    const [s3, presigner, upload] = await Promise.all([
      import('@aws-sdk/client-s3') as unknown as Promise<S3ModuleLike>,
      import('@aws-sdk/s3-request-presigner') as unknown as Promise<PresignerModuleLike>,
      import('@aws-sdk/lib-storage') as unknown as Promise<UploadModuleLike>,
    ])
    return { s3, presigner, upload }
  } catch {
    return null
  }
}

function isNotFound(error: unknown): boolean {
  const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
  const name = (error as { name?: string }).name ?? ''
  return status === 404 || name === 'NotFound' || name === 'NoSuchKey'
}

export interface S3StorageOptions extends StorageDriverOptions {
  readonly modules: S3Modules
  readonly client: S3ClientLike
  readonly bucket: string
  /** Prefix for `publicUrl`. Without it, objects have no stable public address. */
  readonly baseUrl?: string
  /** Key prefix inside the bucket, so one bucket can hold several sites. */
  readonly prefix?: string
}

export function createS3Storage(options: S3StorageOptions): StorageDriver {
  const { client, bucket, modules } = options
  const prefix = options.prefix ?? ''
  const baseUrl = (options.baseUrl ?? '').replace(/\/$/, '')

  const objectKey = (key: string): string => {
    parseKey(key)
    return `${prefix}${key}`
  }

  return {
    put: async (key, data, putOptions?: StoragePutOptions): Promise<void> => {
      const input: Record<string, unknown> = {
        Bucket: bucket,
        Key: objectKey(key),
        Body: data,
        ...(putOptions?.contentType === undefined ? {} : { ContentType: putOptions.contentType }),
        ...(putOptions?.cacheControl === undefined
          ? {}
          : { CacheControl: putOptions.cacheControl }),
      }

      try {
        if (Buffer.isBuffer(data)) {
          await client.send(new modules.s3.PutObjectCommand(input))
        } else {
          // A stream has no known length, and PutObject requires one. Upload
          // splits it into parts instead, so a large video never has to be
          // buffered in memory to be stored.
          await new modules.upload.Upload({ client, params: input }).done()
        }
      } catch (error) {
        throw new CogentaError({
          code: 'STORAGE_FAILED',
          message: `Could not store the media object "${key}".`,
          hint: 'Check the bucket name, the region and the credentials in the environment.',
          cause: error,
          details: { key, bucket },
        })
      }
    },

    get: async (key): Promise<Readable> => {
      try {
        const result = await client.send<{ Body?: Readable }>(
          new modules.s3.GetObjectCommand({ Bucket: bucket, Key: objectKey(key) }),
        )
        if (result.Body === undefined) throw new Error('the response had no body')
        return result.Body
      } catch (error) {
        throw new CogentaError({
          code: 'STORAGE_FAILED',
          message: `No media object stored under "${key}".`,
          hint: 'Check the key, or upload the object first.',
          cause: error,
          details: { key },
        })
      }
    },

    head: async (key): Promise<StorageObjectInfo | null> => {
      try {
        const result = await client.send<{
          ContentLength?: number
          ContentType?: string
          CacheControl?: string
        }>(new modules.s3.HeadObjectCommand({ Bucket: bucket, Key: objectKey(key) }))

        return {
          key,
          size: result.ContentLength ?? 0,
          contentType: result.ContentType,
          cacheControl: result.CacheControl,
        }
      } catch (error) {
        if (isNotFound(error)) return null
        throw error
      }
    },

    delete: async (key): Promise<void> => {
      await client.send(new modules.s3.DeleteObjectCommand({ Bucket: bucket, Key: objectKey(key) }))
    },

    exists: async (key): Promise<boolean> => {
      // Validated outside the try, so an unsafe key raises rather than being
      // reported as an ordinary miss.
      const resolved = objectKey(key)
      try {
        await client.send(new modules.s3.HeadObjectCommand({ Bucket: bucket, Key: resolved }))
        return true
      } catch (error) {
        if (isNotFound(error)) return false
        throw error
      }
    },

    signedUrl: async (key, expiresIn): Promise<string> => {
      const resolved = objectKey(key)
      if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
        throw new CogentaError({
          code: 'STORAGE_FAILED',
          message: `A signed URL must expire in a positive number of seconds, received ${String(expiresIn)}.`,
          hint: 'Pass the lifetime in seconds, for example 300 for five minutes.',
        })
      }

      return modules.presigner.getSignedUrl(
        client,
        new modules.s3.GetObjectCommand({ Bucket: bucket, Key: resolved }),
        { expiresIn: Math.floor(expiresIn) },
      )
    },

    publicUrl: (key): string => {
      const resolved = objectKey(key)
      if (baseUrl === '') {
        throw new CogentaError({
          code: 'STORAGE_FAILED',
          message: 'This bucket has no public URL configured.',
          hint: 'Set storage.baseUrl to the CDN or bucket origin that serves these objects, or use signedUrl() for private media.',
        })
      }
      return `${baseUrl}/${resolved}`
    },
  }
}

export function s3StorageDriver(
  options: StorageDriverOptions & { prefix?: string } = {},
): Driver<StorageDriver, StorageConfig> {
  let client: S3ClientLike | undefined
  let bucket: string | undefined

  const buildClient = (config: StorageConfig, modules: S3Modules): S3ClientLike =>
    new modules.s3.S3Client({
      region: config.region ?? 'us-east-1',
      ...(config.endpoint === undefined
        ? {}
        : {
            endpoint: config.endpoint,
            // MinIO, R2 and most self-hosted gateways serve buckets as a path
            // rather than a subdomain. Assuming virtual-host style breaks all
            // of them, and the failure looks like a DNS error.
            forcePathStyle: true,
          }),
      ...(config.accessKeyId === undefined || config.secretAccessKey === undefined
        ? {}
        : {
            credentials: {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            },
          }),
    })

  return {
    name: 's3',
    tier: 'optimal',

    available: async (config) => {
      if (config.bucket === undefined) return false
      const modules = await loadS3Modules()
      if (modules === null) return false

      let probe: S3ClientLike | undefined
      try {
        probe = buildClient(config, modules)
        // A HEAD on a key that does not exist still proves the endpoint answers
        // and the credentials are accepted; only a missing object comes back.
        await probe
          .send(
            new modules.s3.HeadObjectCommand({
              Bucket: config.bucket,
              Key: '.cogenta-availability-probe',
            }),
          )
          .catch((error: unknown) => {
            if (!isNotFound(error)) throw error
          })
        return true
      } catch {
        return false
      } finally {
        probe?.destroy()
      }
    },

    init: async (config) => {
      const modules = await loadS3Modules()
      if (modules === null) {
        throw new CogentaError({
          code: 'DRIVER_INIT_FAILED',
          message: 'The S3 storage driver needs the AWS SDK.',
          hint: 'Run `pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner @aws-sdk/lib-storage`, or leave storage.driver unset to store media on disk.',
        })
      }

      if (config.bucket === undefined) {
        throw new CogentaError({
          code: 'CONFIG_INVALID',
          message: 'The S3 storage driver needs a bucket.',
          hint: 'Set storage.bucket, or the COGENTA_STORAGE_BUCKET environment variable.',
        })
      }

      bucket = config.bucket
      client ??= buildClient(config, modules)

      return createS3Storage({
        ...options,
        modules,
        client,
        bucket,
        ...(config.baseUrl === undefined ? {} : { baseUrl: config.baseUrl }),
      })
    },

    dispose: async () => {
      client?.destroy()
      client = undefined
    },

    health: async (): Promise<HealthReport> => {
      if (client === undefined) {
        return { status: 'down', driver: 's3', tier: 'optimal', message: 'Not connected.' }
      }
      return {
        status: 'ok',
        driver: 's3',
        tier: 'optimal',
        // The bucket is safe to name; the credentials and endpoint are not.
        message: `Media in the "${bucket ?? 'unknown'}" bucket.`,
      }
    },
  }
}
