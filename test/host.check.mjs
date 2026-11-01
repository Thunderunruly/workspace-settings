/**
 * Headless checks for the host half. These replace the real Cordis services
 * with small fakes; they verify the store, the catalog/save routes, and the
 * Session-creation inheritance decisions without a running Harness.
 */
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const mod = await import('../index.js')

const workspace = {
  id: 'ws-1',
  path: process.platform === 'win32' ? 'C:\\Projects\\demo' : '/projects/demo',
  title: 'demo',
}

const globalModel = { provider: 'deepseek', model: 'deepseek-chat' }
const defaults = {
  preset: 'creative',
  permission: 'danger-full-access',
  model: { ...globalModel, reasoningEffort: 'max' },
}

let sessionCounter = 0

function fakeAgent(state, { id, cwd = workspace.path, preset = 'standard', permission = 'workspace-write', header = {}, started = false } = {}) {
  sessionCounter += 1
  const sessionId = id ?? `session-${sessionCounter}`
  const session = {
    id: sessionId,
    header: { version: 999, id: sessionId, createdAt: 1, isSeeded: false, cwd, ...header },
    requestHeader: () => undefined,
    ownEvents: () => started ? [{ type: 'turn/start' }] : [],
    append(type, data) {
      if (type === 'model/selection') state.modelSelections.set(sessionId, data)
      return 0
    },
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
  state.agentStates.set(agent, { preset, permission, started })
  return agent
}

function makeCtx(state) {
  state.modelSelections ??= new Map()
  state.warnings ??= []
  const handlers = new Map()
  const serviceMap = new Map()
  const routes = []
  const ctx = {
    logger: { warn(message) { state.warnings.push(message) }, info() {} },
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
    async emit(event, ...args) {
      for (const listener of handlers.get(event) ?? []) await listener(...args)
    },
  }
  const presets = {
    selected: [],
    async remoteExportList() {
      return {
        presets: [
          { id: 'standard', name: 'standard', isDefault: true },
          { id: 'creative', name: 'creative', isDefault: false },
          { id: 'minimal', name: 'minimal', isDefault: false },
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
  serviceMap.set('sessions', {
    get(id) {
      return [...state.agentStates.keys()].find((agent) => agent.id === id)?.session
    },
  })
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
      if (key === 'turnBoundary') return { openTurnStartSeq: null, lastTurn: values.started ? 1 : 0 }
      if (key === 'modelSelection') return {
        lastUsed: null,
        pending: state.modelSelections.get(session.id) ?? null,
      }
      return undefined
    },
  })
  state.routes = routes
  return ctx
}

function makeRequest(payload) {
  const method = payload?.__method ?? 'catalog'
  const url = `/api/workspace-settings/${method}`
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

async function startHost(state) {
  const ctx = makeCtx(state)
  mod.apply(ctx)
  ctx.__routes = state.routes
  await callRoute(ctx, {})
  // Finish the startup model-catalog refresh and live-Agent scan.
  await new Promise((done) => setImmediate(done))
  return ctx
}

async function setup(t, { state = { agentStates: new Map() }, settings = defaults, sessions = {} } = {}) {
  // Store writes are flushed through the routes. Do not let a deferred write
  // from an old Host generation race a simulated reload or fixture cleanup.
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const previousHome = process.env.DSH_HOME
  const home = await mkdtemp(join(tmpdir(), 'dsh-workspace-settings-'))
  process.env.DSH_HOME = home
  t.after(async () => {
    t.mock.timers.reset()
    assert.equal(resolve(home, '..'), resolve(tmpdir()))
    assert.ok(home.startsWith(join(tmpdir(), 'dsh-workspace-settings-')))
    await rm(home, { recursive: true, force: true })
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    assert.deepEqual(state.warnings, [])
  })
  const file = join(home, 'storages', 'workspace-settings', 'settings.json')
  if (settings !== null || Object.keys(sessions).length > 0) {
    await mkdir(resolve(file, '..'), { recursive: true })
    await writeFile(file, JSON.stringify({
      version: 1,
      workspaces: settings === null ? {} : { [workspace.path]: { path: workspace.path, ...settings } },
      sessions,
    }))
  }
  const ctx = await startHost(state)
  return { ctx, state, file }
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

test('catalog, save, reset and inheritance', async (t) => {
  const { ctx, state, file } = await setup(t, { settings: null })
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
  // Saving may sync the workspace model, but must not reset an existing
  // Session's mode or permissions, even while it is blank.
  assert.equal(state.agentStates.get(blank).preset, 'standard')
  assert.equal(state.agentStates.get(blank).permission, 'workspace-write')
  assert.deepEqual(state.modelSelections.get(blank.id), {
    provider: 'deepseek',
    model: 'deepseek-chat',
    reasoningEffort: 'max',
  })

  const stored = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(Object.keys(stored.workspaces).length, 1)

  // A second blank Session created through the normal agent/created hook inherits too.
  const second = fakeAgent(state)
  await ctx.emit('agent/created', { agent: second, source: 'startup' })
  assert.equal(state.agentStates.get(second).preset, 'creative')
  assert.equal(state.agentStates.get(second).permission, 'danger-full-access')
  assert.deepEqual(state.modelSelections.get(second.id), {
    provider: 'deepseek',
    model: 'deepseek-chat',
    reasoningEffort: 'max',
  })

  // First-request model override is installed by the blank-agent pass.
  const resolved = await second.emitRequest(async () => ({ provider: 'deepseek', model: 'deepseek-chat' }))
  assert.equal(resolved.reasoningEffort, 'max')

  // An explicit in-session model pick wins over the workspace model.
  state.modelSelections.set(second.id, { provider: 'other', model: 'other-model' })
  const applyResponse = await callRoute(ctx, { __method: 'apply', sessionId: second.id })
  assert.equal(applyResponse.status, 200, JSON.stringify(applyResponse.body))
  assert.deepEqual(state.modelSelections.get(second.id), { provider: 'other', model: 'other-model' })

  // Selecting the global default is an explicit choice. A preset-selection
  // event cannot distinguish it from blank-session reuse, so do not undo it.
  state.agentStates.set(second, { ...state.agentStates.get(second), preset: 'standard' })
  await ctx.emit('agent-preset/selected', second.id, 'standard')
  assert.equal(state.agentStates.get(second).preset, 'standard')

  // Reset removes the record.
  const resetResponse = await callRoute(ctx, { __method: 'save', workspaceId: 'ws-1', settings: null })
  assert.equal(resetResponse.status, 200)
  assert.equal(resetResponse.body.ok, true)
  assert.equal(resetResponse.body.value.catalog.workspaces[0].configured, false)
})

test('workspace defaults initialize fresh sessions exactly once', async (t) => {
  const { ctx, state } = await setup(t)
  const fresh = fakeAgent(state)
  await ctx.emit('agent/created', { agent: fresh, source: 'startup' })
  assert.equal(state.agentStates.get(fresh).preset, 'creative')
  assert.equal(state.agentStates.get(fresh).permission, 'danger-full-access')
  assert.deepEqual(state.modelSelections.get(fresh.id), defaults.model)
  assert.equal((await fresh.emitRequest(async () => globalModel)).reasoningEffort, 'max')

  // Selecting the global default is a deliberate choice, not a reset to undo.
  Object.assign(state.agentStates.get(fresh), { preset: 'standard', permission: 'workspace-write' })
  await ctx.emit('agent-preset/selected', fresh.id, 'standard')
  assert.equal(state.agentStates.get(fresh).preset, 'standard')
  const response = await callRoute(ctx, { __method: 'apply', sessionId: fresh.id })
  assert.equal(response.status, 200)
  assert.deepEqual(response.body.value, { applied: false })
  assert.equal(state.agentStates.get(fresh).preset, 'standard')
  assert.equal(state.agentStates.get(fresh).permission, 'workspace-write')

  await Promise.all([
    ctx.emit('agent/created', { agent: fresh, source: 'startup' }),
    callRoute(ctx, { __method: 'apply', sessionId: fresh.id }),
  ])
  assert.equal(ctx.get('agentPresets').selected.length, 1)
  assert.equal(ctx.get('permissionPresets').calls.length, 1)

  state.agentStates.get(fresh).preset = 'minimal'
  await ctx.emit('agent-preset/selected', fresh.id, 'minimal')
  await callRoute(ctx, { __method: 'apply', sessionId: fresh.id })
  assert.equal(state.agentStates.get(fresh).preset, 'minimal')

  // Explicit model choices and later requests retain upstream authority.
  state.modelSelections.set(fresh.id, globalModel)
  assert.deepEqual(await fresh.emitRequest(async () => globalModel), globalModel)
  state.modelSelections.delete(fresh.id)
  fresh.session.requestHeader = () => ({ config: globalModel })
  assert.deepEqual(await fresh.emitRequest(async () => globalModel), globalModel)
})

test('saving workspace defaults affects future sessions, not existing blanks', async (t) => {
  const { ctx, state } = await setup(t)
  const existing = fakeAgent(state)
  await ctx.emit('agent/created', { agent: existing, source: 'startup' })
  const changed = { ...defaults, preset: 'minimal', permission: 'workspace-write' }
  const saved = await callRoute(ctx, { __method: 'save', workspaceId: workspace.id, settings: changed })
  assert.equal(saved.status, 200)
  assert.equal(saved.body.value.applied, 0)
  assert.equal(state.agentStates.get(existing).preset, 'creative')
  assert.equal(state.agentStates.get(existing).permission, 'danger-full-access')
  const fresh = fakeAgent(state)
  await ctx.emit('agent/created', { agent: fresh, source: 'startup' })
  assert.equal(state.agentStates.get(fresh).preset, 'minimal')
  assert.equal(state.agentStates.get(fresh).permission, 'workspace-write')
})

test('workspace model edits and clearing retain upstream selection behavior', async (t) => {
  const { ctx, state } = await setup(t)
  const fresh = fakeAgent(state)
  await ctx.emit('agent/created', { agent: fresh, source: 'startup' })
  Object.assign(state.agentStates.get(fresh), { preset: 'standard', permission: 'workspace-write' })

  const model = { ...globalModel, reasoningEffort: 'low' }
  const saved = await callRoute(ctx, { __method: 'save', workspaceId: workspace.id, settings: { ...defaults, model } })
  assert.equal(saved.status, 200)
  assert.equal(saved.body.value.applied, 1)
  assert.deepEqual(state.modelSelections.get(fresh.id), model)
  assert.equal((await fresh.emitRequest(async () => globalModel)).reasoningEffort, 'low')

  const cleared = await callRoute(ctx, { __method: 'save', workspaceId: workspace.id, settings: { ...defaults, model: null } })
  assert.equal(cleared.status, 200)
  assert.equal(cleared.body.value.applied, 1)
  assert.deepEqual(state.modelSelections.get(fresh.id), globalModel)
  assert.deepEqual(await fresh.emitRequest(async () => globalModel), globalModel)
  assert.equal(state.agentStates.get(fresh).preset, 'standard')
  assert.equal(state.agentStates.get(fresh).permission, 'workspace-write')
  assert.equal(ctx.get('agentPresets').selected.length, 1)
  assert.equal(ctx.get('permissionPresets').calls.length, 1)
})

test('startup, resume, active-view and save never initialize pre-existing blanks', async (t) => {
  const state = { agentStates: new Map() }
  const existing = fakeAgent(state)
  const { ctx } = await setup(t, { state })
  assert.equal(state.agentStates.get(existing).preset, 'standard')
  assert.equal(state.agentStates.get(existing).permission, 'workspace-write')
  await ctx.emit('agent/created', { agent: existing, source: 'resume' })
  await callRoute(ctx, { __method: 'apply', sessionId: existing.id })
  const saved = await callRoute(ctx, { __method: 'save', workspaceId: workspace.id, settings: defaults })
  assert.equal(saved.status, 200)
  assert.equal(state.agentStates.get(existing).preset, 'standard')
  assert.equal(state.agentStates.get(existing).permission, 'workspace-write')
  assert.equal(ctx.get('agentPresets').selected.length, 0)
  assert.equal(ctx.get('permissionPresets').calls.length, 0)
})

test('concurrent initialization claims the session before awaiting the catalog', async (t) => {
  const { ctx, state } = await setup(t)
  const presets = ctx.get('agentPresets')
  const list = presets.remoteExportList
  let release
  const gate = new Promise((done) => { release = done })
  presets.remoteExportList = async () => { await gate; return list() }
  const fresh = fakeAgent(state)
  const first = ctx.emit('agent/created', { agent: fresh, source: 'startup' })
  const second = ctx.emit('agent/created', { agent: fresh, source: 'startup' })
  await new Promise((done) => setImmediate(done))
  release()
  await Promise.all([first, second])
  assert.equal(presets.selected.length, 1)
  assert.equal(ctx.get('permissionPresets').calls.length, 1)
})

test('reload preserves manual selections and reattaches first-request model behavior', async (t) => {
  const { ctx, state, file } = await setup(t)
  const fresh = fakeAgent(state)
  await ctx.emit('agent/created', { agent: fresh, source: 'startup' })
  Object.assign(state.agentStates.get(fresh), { preset: 'standard', permission: 'workspace-write' })
  const saved = await callRoute(ctx, { __method: 'save', workspaceId: workspace.id, settings: defaults })
  assert.equal(saved.status, 200)
  assert.ok(JSON.parse(await readFile(file, 'utf8')).sessions[fresh.id])
  assert.equal(ctx.get('agentPresets').selected.length, 1)
  assert.equal(ctx.get('permissionPresets').calls.length, 1)

  // A restored Agent has no listeners from the old Host generation.
  state.agentStates.delete(fresh)
  state.modelSelections.delete(fresh.id)
  const restored = fakeAgent(state, { id: fresh.id })
  const resumedCtx = await startHost(state)
  await resumedCtx.emit('agent/created', { agent: restored, source: 'resume' })
  await callRoute(resumedCtx, { __method: 'apply', sessionId: restored.id })
  assert.equal(state.agentStates.get(restored).preset, 'standard')
  assert.equal(state.agentStates.get(restored).permission, 'workspace-write')
  assert.equal(resumedCtx.get('agentPresets').selected.length, 0)
  assert.equal(resumedCtx.get('permissionPresets').calls.length, 0)
  assert.equal((await restored.emitRequest(async () => globalModel)).reasoningEffort, 'max')
})

test('global-only new sessions do not acquire later workspace defaults', async (t) => {
  const { ctx, state } = await setup(t, { settings: null })
  const fresh = fakeAgent(state)
  await ctx.emit('agent/created', { agent: fresh, source: 'startup' })
  const saved = await callRoute(ctx, { __method: 'save', workspaceId: workspace.id, settings: defaults })
  assert.equal(saved.status, 200)
  await callRoute(ctx, { __method: 'apply', sessionId: fresh.id })
  await ctx.emit('agent/created', { agent: fresh, source: 'startup' })
  assert.equal(state.agentStates.get(fresh).preset, 'standard')
  assert.equal(state.agentStates.get(fresh).permission, 'workspace-write')
  assert.equal(ctx.get('agentPresets').selected.length, 0)
  assert.equal(ctx.get('permissionPresets').calls.length, 0)
})

test('legacy initialization markers survive age and more than 800 sessions', async (t) => {
  const records = Object.fromEntries(Array.from({ length: 805 }, (_, index) => [
    `old-session-${index}`, { preset: 'creative', at: 1 },
  ]))
  assert.equal(Object.keys(mod.normalizeStore({ sessions: records }).sessions).length, 805)
  const { ctx, state, file } = await setup(t, { sessions: records })
  const existing = fakeAgent(state, { id: 'old-session-0' })
  await ctx.emit('agent/created', { agent: existing, source: 'startup' })
  const saved = await callRoute(ctx, { __method: 'save', workspaceId: workspace.id, settings: defaults })
  assert.equal(saved.status, 200)
  const stored = JSON.parse(await readFile(file, 'utf8'))
  assert.equal(Object.keys(stored.sessions).length, 805)
  assert.ok(stored.sessions['old-session-0'])
  assert.equal(state.agentStates.get(existing).preset, 'standard')
  assert.equal(ctx.get('agentPresets').selected.length, 0)
})

test('forks, subagents, started sessions and explicit initial choices remain untouched', async (t) => {
  const { ctx, state } = await setup(t)
  for (const options of [
    { header: { origin: 'subagent' } },
    { header: { parentSession: 'parent' } },
    { started: true },
    { cwd: join(workspace.path, '..', 'other-workspace') },
    { preset: 'minimal', permission: 'custom' },
  ]) {
    const agent = fakeAgent(state, options)
    const before = { ...state.agentStates.get(agent) }
    await ctx.emit('agent/created', { agent, source: 'startup' })
    assert.deepEqual(state.agentStates.get(agent), before)
  }
  assert.equal(ctx.get('agentPresets').selected.length, 0)
  assert.equal(ctx.get('permissionPresets').calls.length, 0)
})
