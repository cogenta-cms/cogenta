import { describe, expect, it } from 'vitest'
import { createAssistToolset } from '../../src/assist/toolset.js'
import {
  buildOpenAiImageRequest,
  createOpenAiImageClient,
  parseOpenAiImageResponse,
} from '../../src/providers/image/openai.js'
import { createImageProviderRegistry } from '../../src/providers/image/registry.js'
import {
  buildStabilityRequest,
  createStabilityImageClient,
  parseStabilityResponse,
} from '../../src/providers/image/stability.js'
import type { ImageProviderClient } from '../../src/providers/image/types.js'
import type { ToolDefinition } from '../../src/tools/types.js'
import { TEST_SITE, toolContext } from './fake-provider.js'

/** A one-pixel PNG, so the bytes in these tests are real bytes. */
const PIXEL_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function fakeFetch(
  status: number,
  body: unknown,
): { impl: typeof fetch; calls: { url: string; body: unknown; headers: unknown }[] } {
  const calls: { url: string; body: unknown; headers: unknown }[] = []
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? '{}')),
      headers: init?.headers,
    })
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }) as unknown as typeof fetch
  return { impl, calls }
}

describe('the OpenAI image adapter', () => {
  it('asks for base64 rather than a URL, so no image is ever fetched from a third party later', () => {
    expect(buildOpenAiImageRequest('gpt-image-1', { prompt: 'a cathedral' })).toEqual({
      model: 'gpt-image-1',
      prompt: 'a cathedral',
      n: 1,
      size: '1024x1024',
      response_format: 'b64_json',
    })
  })

  it('maps the three named shapes to pixel sizes', () => {
    expect(buildOpenAiImageRequest('m', { prompt: 'p', size: 'landscape' }).size).toBe('1536x640')
    expect(buildOpenAiImageRequest('m', { prompt: 'p', size: 'portrait' }).size).toBe('640x1536')
  })

  it('clamps a count no vendor would accept instead of passing it on', () => {
    expect(buildOpenAiImageRequest('m', { prompt: 'p', count: 99 }).n).toBe(4)
    expect(buildOpenAiImageRequest('m', { prompt: 'p', count: 0 }).n).toBe(1)
  })

  it('surfaces the prompt the vendor actually drew, when it rewrote it', () => {
    expect(
      parseOpenAiImageResponse({
        data: [{ b64_json: PIXEL_PNG, revised_prompt: 'a gothic cathedral at dusk' }],
      }),
    ).toEqual([
      {
        contentType: 'image/png',
        base64: PIXEL_PNG,
        revisedPrompt: 'a gothic cathedral at dusk',
      },
    ])
  })

  it('refuses an empty answer rather than returning zero images as a success', () => {
    expect(() => parseOpenAiImageResponse({ data: [] })).toThrowError(
      expect.objectContaining({ code: 'PROVIDER_RESPONSE_INVALID' }),
    )
  })

  it('reports a rate limit as its own code, because the fix is waiting, not rewording', async () => {
    const { impl } = fakeFetch(429, {})
    const client = createOpenAiImageClient({ apiKey: 'k', model: 'm', fetchImpl: impl })

    await expect(client.generate({ prompt: 'p' })).rejects.toMatchObject({
      code: 'PROVIDER_RATE_LIMITED',
    })
  })

  it('sends the key in a header and never in the body (R7)', async () => {
    const { impl, calls } = fakeFetch(200, { data: [{ b64_json: PIXEL_PNG }] })
    const client = createOpenAiImageClient({
      apiKey: 'secret-key-value',
      model: 'm',
      fetchImpl: impl,
    })

    await client.generate({ prompt: 'a cathedral' })

    expect(JSON.stringify(calls[0]?.body)).not.toContain('secret-key-value')
    expect(calls[0]?.headers).toMatchObject({ authorization: 'Bearer secret-key-value' })
  })
})

describe('the Stability image adapter', () => {
  it('speaks its own request shape, which is the whole reason the interface exists', () => {
    expect(buildStabilityRequest({ prompt: 'a cathedral', size: 'landscape', count: 2 })).toEqual({
      text_prompts: [{ text: 'a cathedral', weight: 1 }],
      width: 1536,
      height: 640,
      samples: 2,
    })
  })

  it('drops a filtered candidate instead of handing back a black square', () => {
    expect(
      parseStabilityResponse({
        artifacts: [
          { base64: 'AAAA', finishReason: 'CONTENT_FILTERED' },
          { base64: PIXEL_PNG, finishReason: 'SUCCESS' },
        ],
      }),
    ).toEqual([{ contentType: 'image/png', base64: PIXEL_PNG }])
  })

  it('says so when every candidate was filtered', () => {
    expect(() =>
      parseStabilityResponse({ artifacts: [{ base64: 'AAAA', finishReason: 'CONTENT_FILTERED' }] }),
    ).toThrowError(expect.objectContaining({ code: 'PROVIDER_RESPONSE_INVALID' }))
  })

  it('names the engine in the path, the way this vendor addresses models', async () => {
    const { impl, calls } = fakeFetch(200, { artifacts: [{ base64: PIXEL_PNG }] })
    const client = createStabilityImageClient({
      apiKey: 'k',
      model: 'stable-diffusion-xl-1024-v1-0',
      fetchImpl: impl,
    })

    await client.generate({ prompt: 'p' })

    expect(calls[0]?.url).toContain('/stable-diffusion-xl-1024-v1-0/text-to-image')
  })
})

describe('the image provider registry', () => {
  it('is empty, and answers null, for a site that configured no image vendor', () => {
    const registry = createImageProviderRegistry({})

    expect(registry.names).toEqual([])
    expect(registry.first()).toBeNull()
  })

  it('holds one client per configured vendor and never hardcodes a single one', () => {
    const registry = createImageProviderRegistry({
      openai: { apiKey: 'a', model: 'gpt-image-1' },
      stability: { apiKey: 'b', model: 'sdxl' },
    })

    expect(registry.names).toEqual(['openai', 'stability'])
    expect(registry.get('stability').name).toBe('stability')
  })

  it('refuses a vendor it was not given, with a hint instead of a crash', () => {
    expect(() => createImageProviderRegistry({}).get('openai')).toThrowError(
      expect.objectContaining({ code: 'PROVIDER_UNKNOWN' }),
    )
  })
})

function imageOnlyToolset(client: ImageProviderClient) {
  return createAssistToolset({ imageProvider: client, site: TEST_SITE })
}

function fakeImageClient(): ImageProviderClient {
  return {
    name: 'fake',
    model: 'fake-image-1',
    generate: async () => [{ contentType: 'image/png', base64: PIXEL_PNG }],
  }
}

describe('the image generation tool', () => {
  it('appears on its own when only an image vendor is configured', () => {
    const set = imageOnlyToolset(fakeImageClient())

    expect(set.available).toBe(true)
    expect(set.tools.map((tool) => tool.name)).toEqual(['assist.generate_image'])
    // No text runtime was built, because no text provider was configured.
    expect(set.runtime).toBeUndefined()
  })

  it('disappears entirely when no image vendor is configured', () => {
    const set = createAssistToolset({ site: TEST_SITE })

    expect(set.tools.some((tool) => tool.name === 'assist.generate_image')).toBe(false)
  })

  it('returns the image as data and declares that it stored nothing (R6)', async () => {
    const set = imageOnlyToolset(fakeImageClient())
    const tool = set.tools[0] as ToolDefinition

    const result = (await tool.execute(
      tool.input.parse({ prompt: 'a cathedral at dusk' }),
      toolContext(),
    )) as { images: { dataUrl: string; byteLength: number }[]; applied: boolean }

    expect(result.applied).toBe(false)
    expect(result.images[0]?.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    expect(result.images[0]?.byteLength).toBeGreaterThan(0)
  })

  it('declares no side effect, so nothing lands in the media library on its own', () => {
    const tool = imageOnlyToolset(fakeImageClient()).tools[0] as ToolDefinition

    expect(tool.sideEffects).toBe(false)
    expect(tool.permissions).toEqual(['media.suggest'])
    expect(tool.rateLimit).toEqual({ perHour: 30 })
  })
})
