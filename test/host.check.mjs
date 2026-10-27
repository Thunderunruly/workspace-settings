/**
 * Headless checks for the host half. These replace the real Cordis services
 * with small fakes; they verify the store, the catalog/save routes, and the
 * Session-creation inheritance decisions without a running Harness.
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const home = await mkdtemp(join(tmpdir(), 'dsh-workspace-settings-'))
process.env.DSH_HOME = home

const mod = await import('../index.js')

const workspace = {
  id: 'ws-1',
  path: process.platform === 'win32' ? 'C:\\Projects\\demo' : '/projects/demo',
  title: 'demo',
}

let sessionCounter = 0

function fakeAgent(state, { cwd = workspace.path, preset = 'standard', permission = 'workspace-write' } = {}) {
  sessionCounter += 1
  const sessionId = `session-${sessionCounter}`
  const session = {
    id: sessionId,
    header: { version: 999, id: sessionId, createdAt: 1, isSeeded: false, cwd },
    requestHeader: () => undefined,
    ownEvents: () => [],
  }
  const listeners = new Map()
  const agent = {
    id: sessionId,
    session,
    ctx: {
      on(event, listener) {
        const list = listeners.get(event) ?? []
        list.push(listener)
        listeners.set(event, list)
        return () => {
          const current = listeners.get(event) ?? []
          listeners.set(event, current.filter((entry) => entry !== listener))
        }
      },
      effect(callback) {
        const disposer = callback()
        return () => disposer?.()
      },
    },
    async emitRequest(next) {
      let pipeline = next
      const order = listeners.get('agent/request') ?? []
      for (const listener of [...order].reverse()) {
        const following = pipeline
        pipeline = () => listener({}, following)
      }
      return await pipeline()
    },
  }
  state.agentStates.set(agent, { preset, permission })
  return agent
}

function makeCtx(state) {
  const handlers = new Map()
  const serviceMap = new Map()
  const routes = []
  const ctx = {
    logger: { warn() {}, info() {} },
    get(name) {
      return serviceMap.get(name)
    },
    on(event, listener) {
      const list = handlers.get(event) ?? []
      list.push(listener)
      handlers.set(event, list)
      return () => {}
    },
    effect(callback) {
      const disposer = callback()
      return () => disposer?.()
    },
    webServer: {
      register(spec) {
        routes.push(spec)
        return () => {}
      },
    },
    async emit(event, payload) {
      await Promise.all((handlers.get(event) ?? []).map((listener) => listener(payload)))
    },
  }
  const presets = {
    selected: [],
    async remoteExportList() {
      return {
        presets: [
          { id: 'standard', name: 'standard', isDefault: true },
          { id: 'creative', name: 'creative', isDefault: false },
        ],
      }
    },
    async list() {
      return []
    },
    async select(agent, target) {
      presets.selected.push([agent.id, target])
      state.agentStates.set(agent, { ...(state.agentStates.get(agent) ?? {}), preset: target })
    },
  }
  const permissions = {
    calls: [],
    catalog() {
      return {
        options: [
          { value: 'workspace-write', name: 'workspace-write' },
          { value: 'danger-full-access', name: 'danger-full-access' },
        ],
        defaultOptions: [],
        defaultPreset: 'workspace-write',
      }
    },
    current(session) {
      const agent = [...state.agentStates.keys()].find((entry) => entry.session === session)
      return state.agentStates.get(agent)?.permission ?? 'workspace-write'
    },
    get defaultPreset() {
      return 'workspace-write'
    },
    set(session, target) {
      permissions.calls.push([session.id, target])
      const agent = [...state.agentStates.keys()].find((entry) => entry.session === session)
      state.agentStates.set(agent, { ...state.agentStates.get(agent), permission: target })
    },
  }
  const agents = {
    list() {
      return [...state.agentStates.keys()]
    },
    get(id) {
      return [...state.agentStates.keys()].find((agent) => agent.id === id)
    },
  }
  const models = [
    {
      provider: 'deepseek',
      providerName: 'DeepSeek',
      id: 'deepseek-chat',
      name: 'DeepSeek Chat',
      reasoning: {
        efforts: [{ id: 'low', name: 'low' }, { id: 'max', name: 'max' }],
        defaultEffort: 'low',
      },
    },
  ]
  serviceMap.set('workspaceRegistry', {
    list: () => [workspace],
    get: (id) => (String(id) === workspace.id ? workspace : undefined),
  })
  serviceMap.set('agentPresets', presets)
  serviceMap.set('permissionPresets', permissions)
  serviceMap.set('sessionController', {
    async modelCatalog() {
      return {
        default: { provider: 'deepseek', model: 'deepseek-chat' },
        groups: [{ id: 'deepseek', name: 'DeepSeek', models }],
      }
    },
  })
  serviceMap.set('agentDefaultModel', { currentSelection: () => ({ provider: 'deepseek', model: 'deepseek-chat' }) })
  serviceMap.set('agents', agents)
  serviceMap.set('sessionProjections', {
    stateOf(session, key) {
      const agent = [...state.agentStates.keys()].find((entry) => entry.session === session)
      const values = state.agentStates.get(agent) ?? {}
      if (key === 'agentPreset') return values.preset
      if (key === 'turnBoundary') return { openTurnStartSeq: null, lastTurn: 0 }
      if (key === 'modelSelection') return { lastUsed: null, pending: values.modelPending ?? null }
      return undefined
    },
  })
  state.routes = routes
  return ctx
}

function makeRequest(payload) {
  const url = payload?.__method === 'save'
    ? '/api/workspace-settings/save'
    : '/api/workspace-settings/catalog'
  const body = JSON.stringify(payload ?? {})
  return {
    method: 'POST',
    url,
    headers: { host: '127.0.0.1:62022', 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(body)
    },
  }
}

function makeResponse() {
  return {
    status: 0,
    body: null,
    writeHead(status) {
      this.status = status
    },
    end(text) {
      this.body = JSON.parse(String(text))
    },
  }
}

async function callRoute(ctx, payload) {
  const route = ctx.__routes.find((entry) => entry.path === '/api/workspace-settings')
  assert.ok(route, 'fallback route registered')
  const response = makeResponse()
  await route.handler(makeRequest(payload), response)
  return response
}

test('pure helpers', () => {
  const key = mod.normalizePathKey(' C:\\Projects\\demo\\ ')
  assert.ok(key.endsWith('projects\\demo'))
  assert.equal(mod.normalizePathKey('   '), undefined)
  const normalized = mod.normalizeRequestedSettings(
    {
      preset: 'creative',
      permission: 'danger-full-access',
      model: { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'max' },
    },
    {
      presets: [{ id: 'creative' }],
      permissions: [{ value: 'danger-full-access' }],
      models: [{ provider: 'deepseek', model: 'deepseek-chat', efforts: [{ id: 'max' }] }],
    },
  )
  assert.deepEqual(normalized, {
    preset: 'creative',
    permission: 'danger-full-access',
    model: { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'max' },
    transcriptView: null,
    collapseTiming: null,
  })
  assert.throws(
    () => mod.normalizeRequestedSettings({ preset: 'nope' }, { presets: [], permissions: [], models: [] }),
    /unknown agent preset/,
  )
  const sanitized = mod.sanitizeCatalogSettings(
    {
      preset: 'gone',
      permission: 'workspace-write',
      model: { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'ultra' },
      updatedAt: 't',
    },
    { presets: [] },
    { permissions: [{ value: 'workspace-write' }] },
    { models: [{ provider: 'deepseek', model: 'deepseek-chat', efforts: [] }] },
  )
  assert.deepEqual(sanitized, {
    preset: null,
    permission: 'workspace-write',
    model: { provider: 'deepseek', model: 'deepseek-chat' },
    transcriptView: null,
    collapseTiming: null,
    updatedAt: 't',
  })
})

test('catalog, save, reset and inheritance', async () => {
  const state = { agentStates: new Map() }
  const ctx = makeCtx(state)
  mod.apply(ctx)
  ctx.__routes = state.routes
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.equal(state.routes.length, 1, 'one webServer fallback route registered')

  const blank = fakeAgent(state)

  const catalogResponse = await callRoute(ctx, {})
  assert.equal(catalogResponse.status, 200)
  assert.equal(catalogResponse.body.ok, true)
  const catalog = catalogResponse.body.value
  assert.equal(catalog.workspaces.length, 1)
  assert.equal(catalog.workspaces[0].configured, false)
  assert.equal(catalog.defaultPreset, 'standard')
  assert.equal(catalog.models.length, 1)

  const saveResponse = await callRoute(ctx, {
    __method: 'save',
    workspaceId: 'ws-1',
    settings: {
      preset: 'creative',
      permission: 'danger-full-access',
      model: { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'max' },
    },
  })
  assert.equal(saveResponse.status, 200, JSON.stringify(saveResponse.body))
  assert.equal(saveResponse.body.ok, true)
  assert.equal(saveResponse.body.value.catalog.workspaces[0].settings.preset, 'creative')
  assert.equal(saveResponse.body.value.applied, 1)
  assert.equal(state.agentStates.get(blank).preset, 'creative')
  assert.equal(state.agentStates.get(blank).permission, 'danger-full-access')

  const stored = JSON.parse(await readFile(join(home, 'storages', 'workspace-settings', 'settings.json'), 'utf8'))
  assert.equal(Object.keys(stored.workspaces).length, 1)

  // A second blank Session created through the normal agent/created hook inherits too.
  const second = fakeAgent(state)
  await ctx.emit('agent/created', { agent: second })
  assert.equal(state.agentStates.get(second).preset, 'creative')
  assert.equal(state.agentStates.get(second).permission, 'danger-full-access')

  // First-request model override is installed by the blank-agent pass.
  const resolved = await second.emitRequest(async () => ({ provider: 'deepseek', model: 'deepseek-chat' }))
  assert.equal(resolved.reasoningEffort, 'max')

  // Reset removes the record.
  const resetResponse = await callRoute(ctx, { __method: 'save', workspaceId: 'ws-1', settings: null })
  assert.equal(resetResponse.status, 200)
  assert.equal(resetResponse.body.ok, true)
  assert.equal(resetResponse.body.value.catalog.workspaces[0].configured, false)

  await rm(home, { recursive: true, force: true })
})
