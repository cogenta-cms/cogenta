import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentConversationStore, ConversationTurn } from '../../src/conversations/store.js'
import {
  createFileAgentConversationStore,
  createMemoryAgentConversationStore,
  MAX_STORED_TURNS,
} from '../../src/conversations/store.js'

const USER_TURN: ConversationTurn = {
  role: 'user',
  content: 'Hello',
  createdAt: '2026-01-01T00:00:00Z',
}
const ASSISTANT_TURN: ConversationTurn = {
  role: 'assistant',
  content: 'Hi there',
  createdAt: '2026-01-01T00:00:01Z',
  toolCalls: [{ name: 'content.list', input: { collection: 'post' } }],
}

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cogenta-agents-conversations-'))
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

// The same contract runs against both implementations — the degraded
// (memory) driver is not merely present, it is proven equivalent (R1).
describe.each<{ readonly label: string; readonly create: () => AgentConversationStore }>([
  { label: 'memory', create: () => createMemoryAgentConversationStore() },
  { label: 'file', create: () => createFileAgentConversationStore({ dir }) },
])('$label', ({ create }) => {
  it('starts empty for a thread never written to', async () => {
    const store = create()
    expect(await store.get('Cogenta Agent', 'user-1')).toEqual([])
  })

  it('appends turns atomically and returns the updated thread', async () => {
    const store = create()
    const updated = await store.append('Cogenta Agent', 'user-1', [USER_TURN, ASSISTANT_TURN])
    expect(updated).toEqual([USER_TURN, ASSISTANT_TURN])
    expect(await store.get('Cogenta Agent', 'user-1')).toEqual([USER_TURN, ASSISTANT_TURN])
  })

  it('keeps a tool call summary on the assistant turn that made one', async () => {
    const store = create()
    await store.append('Cogenta Agent', 'user-1', [USER_TURN, ASSISTANT_TURN])
    const [, assistant] = await store.get('Cogenta Agent', 'user-1')
    expect(assistant?.toolCalls).toEqual([{ name: 'content.list', input: { collection: 'post' } }])
  })

  it('keeps two actors talking to the same agent apart', async () => {
    const store = create()
    await store.append('Cogenta Agent', 'user-1', [USER_TURN])
    await store.append('Cogenta Agent', 'user-2', [ASSISTANT_TURN])
    expect(await store.get('Cogenta Agent', 'user-1')).toEqual([USER_TURN])
    expect(await store.get('Cogenta Agent', 'user-2')).toEqual([ASSISTANT_TURN])
  })

  it('keeps one actor talking to two agents apart', async () => {
    const store = create()
    await store.append('Cogenta Agent', 'user-1', [USER_TURN])
    await store.append('Security Scanner', 'user-1', [ASSISTANT_TURN])
    expect(await store.get('Cogenta Agent', 'user-1')).toEqual([USER_TURN])
    expect(await store.get('Security Scanner', 'user-1')).toEqual([ASSISTANT_TURN])
  })

  it('clears a thread — "Nouvelle conversation" — without touching another actor or agent', async () => {
    const store = create()
    await store.append('Cogenta Agent', 'user-1', [USER_TURN])
    await store.append('Cogenta Agent', 'user-2', [USER_TURN])
    await store.clear('Cogenta Agent', 'user-1')
    expect(await store.get('Cogenta Agent', 'user-1')).toEqual([])
    expect(await store.get('Cogenta Agent', 'user-2')).toEqual([USER_TURN])
  })

  it('clearing a thread that was never written to is not an error', async () => {
    const store = create()
    await expect(store.clear('Cogenta Agent', 'nobody')).resolves.toBeUndefined()
  })

  it('drops the oldest turns once the thread exceeds the cap', async () => {
    const store = create()
    const turns: ConversationTurn[] = Array.from({ length: MAX_STORED_TURNS + 10 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `turn ${index}`,
      createdAt: `2026-01-01T00:${String(index).padStart(2, '0')}:00Z`,
    }))
    await store.append('Cogenta Agent', 'user-1', turns)
    const stored = await store.get('Cogenta Agent', 'user-1')
    expect(stored).toHaveLength(MAX_STORED_TURNS)
    expect(stored[0]?.content).toBe(`turn ${10}`)
    expect(stored.at(-1)?.content).toBe(`turn ${MAX_STORED_TURNS + 9}`)
  })
})

describe('createFileAgentConversationStore', () => {
  it('survives being recreated against the same directory — the degraded driver actually persists', async () => {
    const first = createFileAgentConversationStore({ dir })
    await first.append('Cogenta Agent', 'user-1', [USER_TURN, ASSISTANT_TURN])

    const second = createFileAgentConversationStore({ dir })
    expect(await second.get('Cogenta Agent', 'user-1')).toEqual([USER_TURN, ASSISTANT_TURN])
  })

  it('collapses an agent name or actor id with unsafe characters into a safe file name', async () => {
    const store = createFileAgentConversationStore({ dir })
    await expect(
      store.append('Cogenta Agent/../../etc', '../../passwd', [USER_TURN]),
    ).resolves.toEqual([USER_TURN])
  })
})
