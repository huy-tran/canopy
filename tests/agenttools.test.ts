import { describe, expect, it } from 'vitest'
import { AGENT_TOOLS, handleMcp } from '../shared/agenttools'

const call = async (tool: string, args: Record<string, unknown>) => ({ ok: tool !== 'close_worker', text: `${tool}:${JSON.stringify(args)}` })
const rpc = (method: string, params?: unknown, id = 1) => ({ jsonrpc: '2.0', id, method, params })

describe('handleMcp', () => {
  it('answers initialize with the version asked for when it knows it, else its newest', async () => {
    const a: any = await handleMcp(rpc('initialize', { protocolVersion: '2024-11-05' }), call, '1.2.3')
    expect(a.result).toMatchObject({ protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'canopy', version: '1.2.3' } })
    const b: any = await handleMcp(rpc('initialize', { protocolVersion: '2099-01-01' }), call)
    expect(b.result.protocolVersion).toBe('2025-06-18')
  })

  it('says nothing to a notification', async () => {
    expect(await handleMcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, call)).toBeNull()
  })

  it('lists the tools, each with a schema', async () => {
    const r: any = await handleMcp(rpc('tools/list'), call)
    expect(r.result.tools.map((t: any) => t.name)).toEqual(AGENT_TOOLS.map(t => t.name))
    expect(r.result.tools.every((t: any) => t.inputSchema.type === 'object' && t.description)).toBe(true)
  })

  it('runs a tool and returns its text, marking a failure as an error result', async () => {
    const okay: any = await handleMcp(rpc('tools/call', { name: 'start_worker', arguments: { prompt: 'Hi' } }, 7), call)
    expect(okay).toEqual({ jsonrpc: '2.0', id: 7, result: { content: [{ type: 'text', text: 'start_worker:{"prompt":"Hi"}' }], isError: false } })
    const bad: any = await handleMcp(rpc('tools/call', { name: 'close_worker', arguments: { id: 'x' } }), call)
    expect(bad.result.isError).toBe(true)
    const thrown: any = await handleMcp(rpc('tools/call', { name: 'list_sessions' }), async () => { throw new Error('boom') })
    expect(thrown.result).toEqual({ content: [{ type: 'text', text: 'boom' }], isError: true })
  })

  it('refuses unknown tools, unknown methods and what is not JSON-RPC', async () => {
    expect(((await handleMcp(rpc('tools/call', { name: 'rm_rf' }), call)) as any).error.code).toBe(-32602)
    expect(((await handleMcp(rpc('resources/list'), call)) as any).error.code).toBe(-32601)
    expect(((await handleMcp({ id: 1, method: 'ping' } as any, call)) as any).error.code).toBe(-32600)
  })
})
