import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { createMcpServer } from '../src/server.js'
import { serveMcpOverStdio } from '../src/stdio-transport.js'

function nextLine(output: PassThrough): Promise<string> {
  return new Promise((resolve) => {
    output.once('data', (chunk: Buffer) => resolve(chunk.toString('utf8').trim()))
  })
}

describe('serveMcpOverStdio', () => {
  it('handles one JSON-RPC request per line and writes one response per line', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const server = createMcpServer({ name: 'cogenta', version: '1.0.0', tools: [] })
    const transport = serveMcpOverStdio({ server, input, output })

    const received = nextLine(output)
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' })}\n`)
    const line = await received

    expect(JSON.parse(line)).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: { serverInfo: { name: 'cogenta' } },
    })
    transport.close()
  })

  it('replies with a parse-error response for a line that is not valid JSON', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const server = createMcpServer({ name: 'cogenta', version: '1.0.0', tools: [] })
    const transport = serveMcpOverStdio({ server, input, output })

    const received = nextLine(output)
    input.write('not json at all\n')
    const line = await received

    expect(JSON.parse(line)).toMatchObject({ error: { code: -32700 } })
    transport.close()
  })

  it('ignores blank lines without writing a response', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const server = createMcpServer({ name: 'cogenta', version: '1.0.0', tools: [] })
    const transport = serveMcpOverStdio({ server, input, output })

    let wroteAnything = false
    output.on('data', () => {
      wroteAnything = true
    })
    input.write('\n')
    input.write('   \n')
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(wroteAnything).toBe(false)
    transport.close()
  })

  it('close() stops the transport from reading further lines', async () => {
    const input = new PassThrough()
    const output = new PassThrough()
    const server = createMcpServer({ name: 'cogenta', version: '1.0.0', tools: [] })
    const transport = serveMcpOverStdio({ server, input, output })
    transport.close()

    let wroteAnything = false
    output.on('data', () => {
      wroteAnything = true
    })
    input.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize' })}\n`)
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(wroteAnything).toBe(false)
  })
})
