// ESM proof against the installed dependency, with an ephemeral real HTTP server.
import assert from 'node:assert/strict'
import { readdir, readFile, realpath } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const astroDirectory = await realpath(join(root, 'examples/theme-starter/node_modules/astro'))
const policyDirectory = await realpath(join(dirname(astroDirectory), 'http-cache-semantics'))
const astroPackage = JSON.parse(await readFile(join(astroDirectory, 'package.json'), 'utf8'))
const policyPackage = JSON.parse(await readFile(join(policyDirectory, 'package.json'), 'utf8'))
const { default: CachePolicy } = await import(pathToFileURL(join(policyDirectory, 'index.js')).href)
const remotePath = join(astroDirectory, 'dist/assets/build/remote.js')
const { loadRemoteImage, revalidateRemoteImage } = await import(pathToFileURL(remotePath).href)

// Detect an additional consumer: the reachability conclusion is scoped to this one.
async function policyConsumers(directory) {
  const consumers = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) consumers.push(...(await policyConsumers(path)))
    else if (
      entry.name.endsWith('.js') &&
      (await readFile(path, 'utf8')).includes('http-cache-semantics')
    )
      consumers.push(path)
  }
  return consumers
}
assert.deepEqual(await policyConsumers(join(astroDirectory, 'dist')), [remotePath])

// Positive control: reproduce the advisory with synthetic, non-secret cookies.
const syntheticUrl = 'https://cache-proof.invalid/image.png'
const policy = new CachePolicy(
  { url: syntheticUrl, method: 'GET', headers: {} },
  { status: 200, headers: { 'cache-control': 'max-age=3600', 'set-cookie': 'proof=fixture' } },
)
assert.equal(policy.maxAge(), 0)
assert.equal(
  policy.satisfiesWithoutRevalidation({
    url: syntheticUrl,
    method: 'GET',
    headers: { 'cache-control': 'max-stale=999999' },
  }),
  true,
  'Update this proof when upstream fixes max-stale handling',
)

// Fail if the Astro consumer enters either vulnerable request-reuse method.
const originalEvaluate = CachePolicy.prototype.evaluateRequest
const originalSatisfies = CachePolicy.prototype.satisfiesWithoutRevalidation
CachePolicy.prototype.evaluateRequest = () => assert.fail('Astro consulted evaluateRequest')
CachePolicy.prototype.satisfiesWithoutRevalidation = () =>
  assert.fail('Astro consulted satisfiesWithoutRevalidation')

const requests = []
const server = createServer((request, response) => {
  requests.push(request.headers)
  response.setHeader('cache-control', 'max-age=3600')
  response.setHeader('set-cookie', 'proof=fixture')
  response.setHeader('etag', '"fixture"')
  if (request.url === '/not-modified') {
    response.writeHead(304)
    response.end()
  } else {
    response.writeHead(200, { 'content-type': 'image/png' })
    response.end(Buffer.from([137, 80, 78, 71]))
  }
})
await new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', resolve)
})
try {
  const address = server.address()
  assert(address && typeof address === 'object')
  const base = `http://127.0.0.1:${address.port}`
  const config = { domains: ['127.0.0.1'], remotePatterns: [] }
  const loaded = await loadRemoteImage(`${base}/image`, globalThis.fetch, config)
  const refreshed = await revalidateRemoteImage(
    `${base}/image`,
    { etag: '"fixture"' },
    globalThis.fetch,
    config,
  )
  const unchanged = await revalidateRemoteImage(
    `${base}/not-modified`,
    { etag: '"fixture"' },
    globalThis.fetch,
    config,
  )
  for (const result of [loaded, refreshed, unchanged]) {
    assert.deepEqual(Object.keys(result).sort(), ['data', 'etag', 'expires', 'lastModified'])
    assert(result.expires <= Date.now(), 'Set-Cookie response must have no positive fresh lifetime')
  }
  assert(Buffer.isBuffer(loaded.data))
  assert(Buffer.isBuffer(refreshed.data))
  assert.equal(unchanged.data, null)
  assert.equal(requests.length, 3)
  for (const headers of requests) {
    assert.equal(headers.cookie, undefined)
    assert.equal(headers.authorization, undefined)
    // Node fetch may add no-cache for a conditional request; no client max-stale is forwarded.
    assert([undefined, 'no-cache'].includes(headers['cache-control']))
  }
  assert.equal(requests[1]['if-none-match'], '"fixture"')
  assert.equal(requests[2]['if-none-match'], '"fixture"')
  process.stdout.write(
    `${JSON.stringify({ astro: astroPackage.version, httpCacheSemantics: policyPackage.version, advisoryReproduced: true, astroReuseBranchReached: false, remoteHttpRequests: requests.length, cookieHeadersReturned: false })}\n`,
  )
} finally {
  CachePolicy.prototype.evaluateRequest = originalEvaluate
  CachePolicy.prototype.satisfiesWithoutRevalidation = originalSatisfies
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
}
