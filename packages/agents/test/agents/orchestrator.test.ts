import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createAgentRunner } from '../../src/agents/orchestrator.js'
import type { AgentDeclarationStore } from '../../src/agents/store.js'
import { createFileAgentDeclarationStore } from '../../src/agents/store.js'
import type { AuditLogLike, AuditRecordInput } from '../../src/audit/types.js'
import { createMemoryApprovalQueue } from '../../src/autonomy/approval-queue.js'
import type { MutableKillSwitch } from '../../src/budget/kill-switch.js'
import { createKillSwitch } from '../../src/budget/kill-switch.js'
import type { ChatRequest, ChatResponse, ProviderClient } from '../../src/providers/types.js'
import type { AgentSkillStore } from '../../src/skills/library.js'
import { createFileAgentSkillStore } from '../../src/skills/library.js'
import { defineTool } from '../../src/tools/define.js'
import type { ToolRegistry } from '../../src/tools/registry.js'
import { createToolRegistry } from '../../src/tools/registry.js'

const USAGE = { inputTokens: 10, outputTokens: 5 }

/** Scripted, call-order-based fake — each `.chat()` call consumes the next response. */
function scriptedClient(name: string, responses: readonly ChatResponse[]): ProviderClient {
  let index = 0
  const calls: ChatRequest[] = []
  const client = {
    name,
    model: `${name}-model`,
    async chat(request: ChatRequest) {
      calls.push(request)
      const response = responses[index]
      index += 1
      if (response === undefined) {
        throw new Error(`${name}: ran out of scripted responses at call ${index}`)
      }
      return response
    },
  }
  return Object.assign(client, { calls })
}

function memoryAuditLog(): AuditLogLike & { records: AuditRecordInput[] } {
  const records: AuditRecordInput[] = []
  return {
    records,
    async record(input) {
      records.push(input)
      return { id: `audit-${records.length}`, hash: 'hash' }
    },
  }
}

let dir: string
let agents: AgentDeclarationStore
let skills: AgentSkillStore
let killSwitches: Map<string, MutableKillSwitch>
let toolCalls: { readContent: number; writeContent: number }
let tools: ToolRegistry

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'cogenta-orchestrator-'))
  agents = createFileAgentDeclarationStore({ dir: join(dir, 'agents') })
  skills = createFileAgentSkillStore({ dir: join(dir, 'skills') })
  killSwitches = new Map()
  toolCalls = { readContent: 0, writeContent: 0 }

  const readTool = defineTool({
    name: 'content.read',
    version: '1.0.0',
    description: 'Read content.',
    input: z.object({}),
    output: z.object({ ok: z.boolean() }),
    permissions: ['content.read'],
    sideEffects: false,
    reversible: false,
    cost: 'low',
    async execute() {
      toolCalls.readContent += 1
      return { ok: true }
    },
  })
  const writeTool = defineTool({
    name: 'content.write_draft',
    version: '1.0.0',
    description: 'Write a draft.',
    input: z.object({}),
    output: z.object({ ok: z.boolean() }),
    permissions: ['content.write_draft'],
    sideEffects: true,
    // `reversible: true` + a real `revert()` — deliberately, so this fake
    // tool is gated purely by the configured autonomy *level*
    // (`withAutonomy`'s level-based branch), not by contract C's separate
    // "sideEffects && !reversible always forces human approval" rule, which
    // a real `content.write_draft` (reversible: false) actually falls under
    // and which the memory approval queue in these tests never resolves.
    reversible: true,
    cost: 'low',
    async execute() {
      toolCalls.writeContent += 1
      return { ok: true }
    },
    async revert() {
      toolCalls.writeContent -= 1
    },
  })
  tools = createToolRegistry([readTool, writeTool])
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function killSwitchFor(name: string): MutableKillSwitch {
  const existing = killSwitches.get(name)
  if (existing !== undefined) return existing
  const created = createKillSwitch(false)
  killSwitches.set(name, created)
  return created
}

const SITE = { name: 'acme', locales: ['en'], defaultLocale: 'en' }

describe('createAgentRunner', () => {
  it('R2: refuses to run — and never calls the provider — when no provider is configured', async () => {
    await agents.create({
      name: 'Cogenta Agent',
      identity: { role: 'r', objectives: [] },
      model: { preferred: 'anthropic' },
      tools: ['content.read'],
    })
    const client = scriptedClient('anthropic', [
      { content: 'should never be reached', toolCalls: [], stopReason: 'end_turn', usage: USAGE },
    ])
    const auditLog = memoryAuditLog()
    const runner = createAgentRunner({
      agents,
      skills,
      tools,
      providers: { has: () => false, get: () => client }, // configured to have nothing
      auditLog,
      approvalQueue: createMemoryApprovalQueue(),
      site: SITE,
      killSwitchFor,
    })

    await expect(
      runner.run('Cogenta Agent', { instruction: 'do something' }),
    ).rejects.toMatchObject({ code: 'AGENT_NO_PROVIDER' })

    expect((client as unknown as { calls: unknown[] }).calls).toHaveLength(0)
  })

  it('runs a real tool-calling loop and executes a permitted tool (autopilot)', async () => {
    await agents.create({
      name: 'Cogenta Agent',
      identity: { role: 'r', objectives: [] },
      model: { preferred: 'anthropic' },
      tools: ['content.read'],
      autonomy: { default: 'autonomous' },
    })
    const client = scriptedClient('anthropic', [
      {
        content: null,
        toolCalls: [{ id: 'call-1', name: 'content.read', input: {} }],
        stopReason: 'tool_use',
        usage: USAGE,
      },
      { content: 'Done reading.', toolCalls: [], stopReason: 'end_turn', usage: USAGE },
    ])
    const auditLog = memoryAuditLog()
    const runner = createAgentRunner({
      agents,
      skills,
      tools,
      providers: { has: (name) => name === 'anthropic', get: () => client },
      auditLog,
      approvalQueue: createMemoryApprovalQueue(),
      site: SITE,
      killSwitchFor,
    })

    const result = await runner.run('Cogenta Agent', { instruction: 'read something' })

    expect(result.stopReason).toBe('end_turn')
    expect(result.finalText).toBe('Done reading.')
    expect(toolCalls.readContent).toBe(1)

    // Run-level history, plus one per-tool-call audit entry (R6).
    expect(auditLog.records.some((r) => r.action === 'agent.run')).toBe(true)
    expect(auditLog.records.some((r) => r.action === 'agent.tool.content.read')).toBe(true)
  })

  it('R4: a tool outside the agent’s declared tools is never executed, even if the model asks for it', async () => {
    await agents.create({
      name: 'Cogenta Agent',
      identity: { role: 'r', objectives: [] },
      model: { preferred: 'anthropic' },
      tools: ['content.read'], // content.write_draft deliberately NOT granted
      autonomy: { default: 'autonomous' },
    })
    const client = scriptedClient('anthropic', [
      {
        content: null,
        toolCalls: [{ id: 'call-1', name: 'content.write_draft', input: {} }],
        stopReason: 'tool_use',
        usage: USAGE,
      },
      { content: 'gave up', toolCalls: [], stopReason: 'end_turn', usage: USAGE },
    ])
    const runner = createAgentRunner({
      agents,
      skills,
      tools,
      providers: { has: (name) => name === 'anthropic', get: () => client },
      auditLog: memoryAuditLog(),
      approvalQueue: createMemoryApprovalQueue(),
      site: SITE,
      killSwitchFor,
    })

    await runner.run('Cogenta Agent', { instruction: 'try to write' })

    expect(toolCalls.writeContent).toBe(0)
  })

  it('report-only (observe) never actually calls a side-effecting tool', async () => {
    await agents.create({
      name: 'Watcher',
      identity: { role: 'r', objectives: [] },
      model: { preferred: 'anthropic' },
      tools: ['content.write_draft'],
      autonomy: { default: 'observe' },
    })
    const client = scriptedClient('anthropic', [
      {
        content: null,
        toolCalls: [{ id: 'call-1', name: 'content.write_draft', input: {} }],
        stopReason: 'tool_use',
        usage: USAGE,
      },
      { content: 'reported only', toolCalls: [], stopReason: 'end_turn', usage: USAGE },
    ])
    const runner = createAgentRunner({
      agents,
      skills,
      tools,
      providers: { has: (name) => name === 'anthropic', get: () => client },
      auditLog: memoryAuditLog(),
      approvalQueue: createMemoryApprovalQueue(),
      site: SITE,
      killSwitchFor,
    })

    await runner.run('Watcher', { instruction: 'watch only' })

    expect(toolCalls.writeContent).toBe(0)
  })

  it('refuses to run a disabled agent', async () => {
    await agents.create({
      name: 'Off',
      identity: { role: 'r', objectives: [] },
      model: { preferred: 'anthropic' },
      tools: [],
      enabled: false,
    })
    const runner = createAgentRunner({
      agents,
      skills,
      tools,
      providers: { has: () => true, get: () => scriptedClient('anthropic', []) },
      auditLog: memoryAuditLog(),
      approvalQueue: createMemoryApprovalQueue(),
      site: SITE,
      killSwitchFor,
    })

    await expect(runner.run('Off', { instruction: 'x' })).rejects.toMatchObject({
      code: 'AGENT_DISABLED',
    })
  })

  it('a live kill switch stops a would-be-enabled agent from running', async () => {
    await agents.create({
      name: 'Killable',
      identity: { role: 'r', objectives: [] },
      model: { preferred: 'anthropic' },
      tools: [],
    })
    killSwitchFor('Killable').activate()
    const runner = createAgentRunner({
      agents,
      skills,
      tools,
      providers: { has: () => true, get: () => scriptedClient('anthropic', []) },
      auditLog: memoryAuditLog(),
      approvalQueue: createMemoryApprovalQueue(),
      site: SITE,
      killSwitchFor,
    })

    await expect(runner.run('Killable', { instruction: 'x' })).rejects.toMatchObject({
      code: 'AGENT_DISABLED',
    })
  })

  it('delegates to a named sub-agent via agent.delegate.<slug>, running the sub-agent’s own provider and tools', async () => {
    await agents.create({
      name: 'Helper',
      identity: { role: 'helper', objectives: [] },
      model: { preferred: 'openai' },
      tools: ['content.read'],
      autonomy: { default: 'autonomous' },
    })
    await agents.create({
      name: 'Cogenta Agent',
      identity: { role: 'r', objectives: [] },
      model: { preferred: 'anthropic' },
      tools: [],
      subagents: ['Helper'],
      autonomy: { default: 'autonomous' },
    })

    const parentClient = scriptedClient('anthropic', [
      {
        content: null,
        toolCalls: [{ id: 'call-1', name: 'agent.delegate.helper', input: { task: 'read it' } }],
        stopReason: 'tool_use',
        usage: USAGE,
      },
      { content: 'delegated successfully', toolCalls: [], stopReason: 'end_turn', usage: USAGE },
    ])
    const helperClient = scriptedClient('openai', [
      {
        content: null,
        toolCalls: [{ id: 'call-2', name: 'content.read', input: {} }],
        stopReason: 'tool_use',
        usage: USAGE,
      },
      { content: 'helper is done', toolCalls: [], stopReason: 'end_turn', usage: USAGE },
    ])

    const runner = createAgentRunner({
      agents,
      skills,
      tools,
      providers: {
        has: (name) => name === 'anthropic' || name === 'openai',
        get: (name) => (name === 'anthropic' ? parentClient : helperClient),
      },
      auditLog: memoryAuditLog(),
      approvalQueue: createMemoryApprovalQueue(),
      site: SITE,
      killSwitchFor,
    })

    const result = await runner.run('Cogenta Agent', { instruction: 'delegate this' })

    expect(result.stopReason).toBe('end_turn')
    expect(result.finalText).toBe('delegated successfully')
    expect(toolCalls.readContent).toBe(1) // the sub-agent actually ran its own tool
  })
})
