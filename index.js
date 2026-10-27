/**
 * Host half of `dsh-workspace-settings`.
 *
 * Owns one durable JSON store of per-workspace session defaults (mode /
 * permission preset / model / reasoning effort), exposes it to the Web Client
 * through two authenticated POST routes, and applies the stored defaults to
 * every new —or reused blank —ordinary Session created in that workspace.
 *
 * Design notes:
 * - The Session log stays authoritative. The plugin only writes through the
 *   public setters (`agentPresets.select`, `permissionPresets.set`) and, for a
 *   model, through Agent-scoped one-shot request overrides on the first model
 *   request. Nothing here invents a Session event type.
 * - A per-Session "last applied" cache lets the plugin tell a workspace-derived
 *   value from a user's explicit in-session choice without extra Session events.
 *   It is a derived cache, safe to lose.
 * - The routes are registered through `ctx.connection.fetch` when present and
 *   fall back to a loopback-checked `ctx.webServer` prefix route.
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export const name = 'dsh-workspace-settings'
export const inject = ['webServer']

const API_PREFIX = '/api/workspace-settings'
const STORE_VERSION = 1
const BODY_LIMIT = 256 * 1024
const SESSION_CACHE_LIMIT = 800
const SESSION_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MODEL_INDEX_REFRESH_MS = 30_000

/** Work-details presentation modes accepted from the official Chat preference. */
export const TRANSCRIPT_VIEW_MODES = ['compact', 'standard', 'detailed', 'verbose']
/** Work-details collapse points accepted from the official Chat preference. */
export const COLLAPSE_TIMINGS = ['completion', 'next-input']

/* ------------------------------------------------------------------ */
/* Pure helpers (exported for tests)                                   */
/* ------------------------------------------------------------------ */

/** Canonical comparison key for one filesystem path. */
export function normalizePathKey(input) {
  if (typeof input !== 'string') return undefined
  const trimmed = input.trim()
  if (trimmed === '') return undefined
  let normalized
  try {
    normalized = resolve(trimmed)
  } catch {
    return undefined
  }
  normalized = normalized.replace(/[\\/]+$/, '')
  if (process.platform === 'win32') normalized = normalized.toLowerCase()
  return normalized
}

/** The on-disk location of the plugin store. */
export function storeFile() {
  const home = process.env.DSH_HOME?.trim()
  const base = home !== undefined && home !== '' ? resolve(home) : join(homedir(), '.dsh')
  return join(base, 'storages', 'workspace-settings', 'settings.json')
}

function emptyStore() {
  return { version: STORE_VERSION, workspaces: {}, sessions: {} }
}

function stringOrUndefined(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** Validate one stored model selection shape; `undefined` when unusable. */
export function normalizeModel(value) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'object') return undefined
  const provider = stringOrUndefined(value.provider)
  const model = stringOrUndefined(value.model)
  if (provider === undefined || model === undefined) return undefined
  const reasoningEffort = stringOrUndefined(value.reasoningEffort)
  return {
    provider,
    model,
    ...reasoningEffort === undefined ? {} : { reasoningEffort },
  }
}

/**
 * Validate a requested workspace setting document against the live catalogs.
 * `null` means "inherit the global default" for that dimension.
 * Throws an Error with a user-facing message on invalid input.
 */
export function normalizeRequestedSettings(raw, catalog) {
  if (raw === null) {
    return { preset: null, permission: null, model: null, transcriptView: null, collapseTiming: null }
  }
  if (raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('settings must be an object or null')
  }
  let preset = null
  if (raw.preset !== undefined && raw.preset !== null) {
    if (typeof raw.preset !== 'string') throw new Error('settings.preset must be a string or null')
    if (!catalog.presets.some((entry) => entry.id === raw.preset)) {
      throw new Error(`unknown agent preset "${raw.preset}"`)
    }
    preset = raw.preset
  }
  let permission = null
  if (raw.permission !== undefined && raw.permission !== null) {
    if (typeof raw.permission !== 'string') throw new Error('settings.permission must be a string or null')
    if (!catalog.permissions.some((entry) => entry.value === raw.permission)) {
      throw new Error(`unknown permission preset "${raw.permission}"`)
    }
    permission = raw.permission
  }
  let model = null
  if (raw.model !== undefined && raw.model !== null) {
    const normalized = normalizeModel(raw.model)
    if (normalized === undefined) throw new Error('settings.model must carry provider and model')
    const found = catalog.models.find(
      (entry) => entry.provider === normalized.provider && entry.model === normalized.model,
    )
    if (found === undefined) {
      throw new Error(`unknown model "${normalized.provider}/${normalized.model}"`)
    }
    if (normalized.reasoningEffort !== undefined) {
      const efforts = new Set((found.efforts ?? []).map((entry) => entry.id))
      if (!efforts.has(normalized.reasoningEffort)) {
        throw new Error(`model "${normalized.model}" has no reasoning effort "${normalized.reasoningEffort}"`)
      }
    }
    model = normalized
  }
  let transcriptView = null
  if (raw.transcriptView !== undefined && raw.transcriptView !== null) {
    if (typeof raw.transcriptView !== 'string' || !TRANSCRIPT_VIEW_MODES.includes(raw.transcriptView)) {
      throw new Error(`unknown work-details mode "${String(raw.transcriptView)}"`)
    }
    transcriptView = raw.transcriptView
  }
  let collapseTiming = null
  if (raw.collapseTiming !== undefined && raw.collapseTiming !== null) {
    if (typeof raw.collapseTiming !== 'string' || !COLLAPSE_TIMINGS.includes(raw.collapseTiming)) {
      throw new Error(`unknown collapse timing "${String(raw.collapseTiming)}"`)
    }
    collapseTiming = raw.collapseTiming
  }
  return { preset, permission, model, transcriptView, collapseTiming }
}

/** Normalize every loaded store record, dropping records that no longer validate. */
export function normalizeStore(raw) {
  const store = emptyStore()
  if (raw === null || typeof raw !== 'object') return store
  if (raw.workspaces !== null && typeof raw.workspaces === 'object' && !Array.isArray(raw.workspaces)) {
    for (const [key, value] of Object.entries(raw.workspaces)) {
      if (value === null || typeof value !== 'object') continue
      const normalizedKey = normalizePathKey(value.path) ?? normalizePathKey(key)
      if (normalizedKey === undefined) continue
      const model = normalizeModel(value.model)
      if (model === undefined) continue
      store.workspaces[normalizedKey] = {
        path: typeof value.path === 'string' ? value.path : key,
        ...stringOrUndefined(value.workspaceId) === undefined ? {} : { workspaceId: stringOrUndefined(value.workspaceId) },
        preset: stringOrUndefined(value.preset) ?? null,
        permission: stringOrUndefined(value.permission) ?? null,
        model,
        transcriptView: TRANSCRIPT_VIEW_MODES.includes(value.transcriptView) ? value.transcriptView : null,
        collapseTiming: COLLAPSE_TIMINGS.includes(value.collapseTiming) ? value.collapseTiming : null,
        updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : new Date(0).toISOString(),
      }
    }
  }
  if (raw.sessions !== null && typeof raw.sessions === 'object' && !Array.isArray(raw.sessions)) {
    const now = Date.now()
    for (const [sessionId, value] of Object.entries(raw.sessions)) {
      if (value === null || typeof value !== 'object') continue
      const at = typeof value.at === 'number' ? value.at : 0
      if (now - at > SESSION_CACHE_TTL_MS) continue
      store.sessions[sessionId] = {
        ...stringOrUndefined(value.preset) === undefined ? {} : { preset: stringOrUndefined(value.preset) },
        ...stringOrUndefined(value.permission) === undefined ? {} : { permission: stringOrUndefined(value.permission) },
        at,
      }
    }
  }
  return store
}

/**
 * Decide whether a workspace-derived value may replace the Session's current
 * value without stomping a user's explicit choice.
 */
export function mayApplyValue(current, globalDefault, lastApplied) {
  if (current === undefined) return true
  // An unknown global default means the catalog could not be read; prefer
  // applying the workspace value over silently keeping a stale Session value.
  if (globalDefault === undefined) return true
  if (current === globalDefault) return true
  if (lastApplied !== undefined && current === lastApplied) return true
  return false
}

function publicSettings(entry) {
  return {
    preset: entry?.preset ?? null,
    permission: entry?.permission ?? null,
    model: entry?.model ?? null,
    transcriptView: entry?.transcriptView ?? null,
    collapseTiming: entry?.collapseTiming ?? null,
    updatedAt: entry?.updatedAt ?? null,
  }
}

/**
 * Mask stored values that no longer exist in the live catalogs so the editor
 * never offers an unsavable selection.
 */
export function sanitizeCatalogSettings(entry, presets, permissions, modelInfo) {
  if (entry === undefined || entry === null) return publicSettings(undefined)
  const preset = entry.preset !== null && (presets?.presets ?? []).some((row) => row.id === entry.preset)
    ? entry.preset
    : null
  const permission = entry.permission !== null && (permissions?.permissions ?? []).some((row) => row.value === entry.permission)
    ? entry.permission
    : null
  let model = entry.model ?? null
  if (model !== null) {
    const found = (modelInfo?.models ?? []).find(
      (row) => row.provider === model.provider && row.model === model.model,
    )
    if (found === undefined) model = null
    else if (model.reasoningEffort !== undefined && !(found.efforts ?? []).some((effort) => effort.id === model.reasoningEffort)) {
      model = { provider: model.provider, model: model.model }
    }
  }
  return {
    preset,
    permission,
    model,
    transcriptView: TRANSCRIPT_VIEW_MODES.includes(entry.transcriptView) ? entry.transcriptView : null,
    collapseTiming: COLLAPSE_TIMINGS.includes(entry.collapseTiming) ? entry.collapseTiming : null,
    updatedAt: entry.updatedAt ?? null,
  }
}

/* ------------------------------------------------------------------ */
/* Plugin                                                              */
/* ------------------------------------------------------------------ */

/**
 * Register the store, routes, and Session inheritance behavior.
 * @param ctx - Host plugin context (requires `webServer`).
 */
export function apply(ctx) {
  const logger = ctx.logger ?? console
  let storePromise
  let database = emptyStore()
  let saveChain = Promise.resolve()
  let rememberTimer
  let modelIndex = new Map()
  let presetCache
  let presetCacheAt = 0
  /** sessionId -> disposer for the Agent-scoped model override. */
  const modelOverrides = new Map()

  function store() {
    storePromise ??= readStore().then((loaded) => {
      database = loaded
      return loaded
    }).catch((error) => {
      logger.warn(`workspace-settings: failed to read store, starting empty: ${String(error)}`)
      database = emptyStore()
      return database
    })
    return storePromise
  }

  async function readStore() {
    let text
    try {
      text = await readFile(storeFile(), 'utf8')
    } catch (error) {
      if (error?.code === 'ENOENT') return emptyStore()
      throw error
    }
    try {
      return normalizeStore(JSON.parse(text))
    } catch (error) {
      logger.warn(`workspace-settings: store is not valid JSON, starting empty: ${String(error)}`)
      return emptyStore()
    }
  }

  function persist() {
    saveChain = saveChain.then(async () => {
      const data = await store()
      pruneSessions(data)
      const file = storeFile()
      await mkdir(resolve(file, '..'), { recursive: true })
      const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
      await writeFile(temporary, JSON.stringify(data, null, 2), 'utf8')
      await rename(temporary, file)
    }).catch((error) => {
      logger.warn(`workspace-settings: failed to persist store: ${String(error)}`)
    })
    return saveChain
  }

  function pruneSessions(data) {
    const entries = Object.entries(data.sessions)
    if (entries.length <= SESSION_CACHE_LIMIT) return
    entries.sort((left, right) => (right[1]?.at ?? 0) - (left[1]?.at ?? 0))
    for (const [sessionId] of entries.slice(SESSION_CACHE_LIMIT)) delete data.sessions[sessionId]
  }

  function entryForCwd(cwd) {
    const key = normalizePathKey(cwd)
    if (key === undefined) return undefined
    return database.workspaces[key]
  }

  function rememberApplied(sessionId, value) {
    database.sessions[sessionId] = { ...value, at: Date.now() }
    if (rememberTimer !== undefined) return
    rememberTimer = setTimeout(() => {
      rememberTimer = undefined
      void persist()
    }, 400)
    if (typeof rememberTimer.unref === 'function') rememberTimer.unref()
  }

  /* ---------------- catalogs ---------------- */

  async function presetCatalog(force = false) {
    if (presetCache !== undefined && !force && Date.now() - presetCacheAt < MODEL_INDEX_REFRESH_MS) return presetCache
    const service = ctx.get('agentPresets')
    if (service === undefined) {
      presetCache = { presets: [], defaultPreset: undefined }
      presetCacheAt = Date.now()
      return presetCache
    }
    try {
      let roster
      try {
        roster = await service.remoteExportList()
      } catch {
        roster = { presets: await service.list() }
      }
      const presets = (roster?.presets ?? []).map((row) => ({
        id: row.id,
        name: row.name ?? row.id,
        ...row.description === undefined ? {} : { description: row.description },
        isDefault: row.isDefault === true,
        ...typeof row.broken === 'string' ? { broken: row.broken } : {},
      }))
      presetCache = {
        presets,
        defaultPreset: presets.find((row) => row.isDefault)?.id,
      }
      presetCacheAt = Date.now()
      return presetCache
    } catch (error) {
      logger.warn(`workspace-settings: agent preset catalog unavailable: ${String(error)}`)
      presetCache = { presets: [], defaultPreset: undefined }
      presetCacheAt = Date.now()
      return presetCache
    }
  }

  function permissionCatalog() {
    const service = ctx.get('permissionPresets')
    if (service === undefined) return { permissions: [], defaultPermission: undefined }
    try {
      const catalog = service.catalog()
      return {
        permissions: (catalog.options ?? []).map((option) => ({
          value: option.value,
          name: option.name ?? option.value,
          ...option.description === undefined ? {} : { description: option.description },
        })),
        defaultPermission: catalog.defaultPreset,
      }
    } catch (error) {
      logger.warn(`workspace-settings: permission catalog unavailable: ${String(error)}`)
      return { permissions: [], defaultPermission: undefined }
    }
  }

  function modelCatalog() {
    const service = ctx.get('sessionController')
    if (service === undefined || typeof service.modelCatalog !== 'function') {
      return Promise.resolve({ models: [], defaultModel: undefined })
    }
    return Promise.resolve(service.modelCatalog()).then((catalog) => {
      const models = []
      for (const group of catalog?.groups ?? []) {
        for (const model of group.models ?? []) {
          models.push({
            provider: group.id,
            providerName: group.name ?? group.id,
            model: model.id,
            name: model.name ?? model.id,
            ...model.description === undefined ? {} : { description: model.description },
            efforts: (model.reasoning?.efforts ?? []).map((effort) => ({
              id: effort.id,
              name: effort.name ?? effort.id,
              ...effort.description === undefined ? {} : { description: effort.description },
            })),
            ...model.reasoning?.defaultEffort === undefined ? {} : { defaultEffort: model.reasoning.defaultEffort },
          })
        }
      }
      let defaultModel
      const selected = ctx.get('agentDefaultModel')?.currentSelection?.()
      if (selected !== undefined && selected !== null) {
        defaultModel = {
          provider: selected.provider,
          model: selected.model,
          ...selected.reasoningEffort === undefined ? {} : { reasoningEffort: selected.reasoningEffort },
        }
      } else if (catalog?.default !== undefined) {
        defaultModel = {
          provider: catalog.default.provider,
          model: catalog.default.model,
          ...catalog.default.reasoningEffort === undefined ? {} : { reasoningEffort: catalog.default.reasoningEffort },
        }
      }
      return { models, defaultModel }
    }).catch((error) => {
      logger.warn(`workspace-settings: model catalog unavailable: ${String(error)}`)
      return { models: [], defaultModel: undefined }
    })
  }

  async function refreshModelIndex() {
    const { models } = await modelCatalog()
    const index = new Map()
    for (const model of models) {
      index.set(`${model.provider}\u0000${model.model}`, new Set((model.efforts ?? []).map((effort) => effort.id)))
    }
    modelIndex = index
    return models
  }

  async function buildCatalog() {    const [presets, permissions, modelInfo, workspaceRegistry] = await Promise.all([
      presetCatalog(true),
      Promise.resolve(permissionCatalog()),
      modelCatalog(),
      Promise.resolve(ctx.get('workspaceRegistry')),
    ])
    const data = await store()
    const workspaces = []
    try {
      for (const workspace of workspaceRegistry?.list?.() ?? []) {
        const key = normalizePathKey(workspace.path)
        const entry = key === undefined ? undefined : data.workspaces[key]
        workspaces.push({
          workspaceId: String(workspace.id),
          title: workspace.title ?? workspace.path,
          path: workspace.path,
          ...key === undefined ? {} : { key },
          settings: sanitizeCatalogSettings(entry, presets, permissions, modelInfo),
          configured: entry !== undefined,
        })
      }
    } catch (error) {
      logger.warn(`workspace-settings: workspace catalog unavailable: ${String(error)}`)
    }
    return {
      workspaces,
      presets: presets.presets,
      defaultPreset: presets.defaultPreset,
      permissions: permissions.permissions,
      defaultPermission: permissions.defaultPermission,
      models: modelInfo.models,
      defaultModel: modelInfo.defaultModel,
      storePath: storeFile(),
    }
  }

  function findWorkspace(workspaceId) {
    const registry = ctx.get('workspaceRegistry')
    try {
      const workspace = registry?.get?.(workspaceId)
      if (workspace !== undefined) return workspace
    } catch {
      // fall through to a linear scan for registries without get()
    }
    try {
      return (registry?.list?.() ?? []).find((workspace) => String(workspace.id) === String(workspaceId))
    } catch {
      return undefined
    }
  }

  /* ---------------- Session inheritance ---------------- */

  function isBlank(session) {
    const projections = ctx.get('sessionProjections')
    try {
      const boundary = projections?.stateOf?.(session, 'turnBoundary')
      if (boundary !== undefined && boundary !== null) {
        return boundary.openTurnStartSeq === null && (boundary.lastTurn ?? 0) === 0
      }
    } catch {
      // fall through to the event scan
    }
    try {
      return !session.ownEvents().some((event) => event.type === 'turn/start')
    } catch {
      return false
    }
  }

  function agentPresetOf(session) {
    try {
      return ctx.get('sessionProjections')?.stateOf?.(session, 'agentPreset')
    } catch {
      return undefined
    }
  }

  function pendingModelOf(session) {
    try {
      const projection = ctx.get('sessionProjections')?.stateOf?.(session, 'modelSelection')
      return projection?.pending ?? undefined
    } catch {
      return undefined
    }
  }

  /** Model overrides are dynamic: every decision re-reads the workspace entry. */
  function installModelOverride(agent) {
    if (modelOverrides.has(agent.id)) return
    const session = agent.session
    const decide = () => {
      try {
        if (session.requestHeader() !== undefined) return undefined
        if (pendingModelOf(session) !== undefined) return undefined
        const entry = entryForCwd(session.header.cwd)
        const selected = entry?.model
        if (selected === undefined || selected === null) return undefined
        if (modelIndex.size > 0) {
          const efforts = modelIndex.get(`${selected.provider}\u0000${selected.model}`)
          if (efforts === undefined) return undefined
          if (selected.reasoningEffort !== undefined && !efforts.has(selected.reasoningEffort)) {
            return { provider: selected.provider, model: selected.model }
          }
        }
        return selected
      } catch {
        return undefined
      }
    }
    const disposeAssembly = agent.ctx.on('system-prompt/assemble', async (_assembly, _context, next) => {
      const selected = decide()
      const assembled = await next()
      if (selected === undefined) return assembled
      return {
        ...assembled,
        variables: {
          ...assembled.variables,
          provider: selected.provider,
          model: selected.model,
        },
      }
    }, { prepend: true })
    const disposeRequest = agent.ctx.on('agent/request', async (_payload, next) => {
      const selected = decide()
      const resolved = await next()
      if (selected === undefined) return resolved
      const { reasoningEffort: _inherited, ...rest } = resolved
      return {
        ...rest,
        provider: selected.provider,
        model: selected.model,
        ...selected.reasoningEffort === undefined ? {} : { reasoningEffort: selected.reasoningEffort },
      }
    }, { prepend: true })
    const dispose = () => {
      try {
        disposeAssembly()
      } catch {
        // already disposed
      }
      try {
        disposeRequest()
      } catch {
        // already disposed
      }
    }
    modelOverrides.set(agent.id, dispose)
    try {
      agent.ctx.effect(() => () => {
        dispose()
        modelOverrides.delete(agent.id)
      }, 'workspace-settings: first-request model override')
    } catch (error) {
      logger.warn(`workspace-settings: could not scope the model override to the Agent: ${String(error)}`)
    }
  }

  /**
   * Apply the workspace entry to one live Agent when it is a blank ordinary
   * Session. Idempotent; returns whether anything changed.
   */
  async function applyToAgent(agent, reason = 'created') {
    const session = agent.session
    const header = session.header
    if (header.origin === 'subagent') return false
    if (header.parentSession !== undefined) return false
    if (!isBlank(session)) return false
    const data = await store()
    const entry = entryForCwd(header.cwd)
    if (entry === undefined) return false
    const last = data.sessions[session.id]
    let changed = false

    /* mode / agent preset */
    const presets = ctx.get('agentPresets')
    if (presets !== undefined) {
      try {
        const catalog = await presetCatalog(true)
        const target = entry.preset ?? catalog.defaultPreset
        const current = agentPresetOf(session)
        if (
          typeof target === 'string'
          && target !== ''
          && current !== target
          && mayApplyValue(current, catalog.defaultPreset, last?.preset)
        ) {
          await presets.select(agent, target)
          changed = true
          logger.info?.(`workspace-settings: applied preset "${target}" to session ${session.id} (${reason})`)
        }
      } catch (error) {
        logger.warn(`workspace-settings: could not apply the workspace mode to session ${session.id}: ${String(error)}`)
      }
    }

    /* permissions */
    const permissions = ctx.get('permissionPresets')
    if (permissions !== undefined) {
      try {
        const fallback = permissions.defaultPreset
        const target = entry.permission ?? fallback
        const current = permissions.current(session)
        if (
          typeof target === 'string'
          && target !== ''
          && target !== 'custom'
          && current !== target
          && mayApplyValue(current, fallback, last?.permission)
        ) {
          permissions.set(session, target)
          changed = true
        }
      } catch (error) {
        logger.warn(`workspace-settings: could not apply the workspace permission preset to session ${session.id}: ${String(error)}`)
      }
    }

    /* model + effort: installed as a dynamic first-request override whenever
       the workspace carries a model, and left installed so later edits apply
       to this still-blank Session too. */
    if (entry.model !== null && entry.model !== undefined) installModelOverride(agent)

    const next = {}
    const presetNow = agentPresetOf(session)
    if (presetNow !== undefined) next.preset = presetNow
    try {
      const permissionNow = ctx.get('permissionPresets')?.current?.(session)
      if (permissionNow !== undefined && permissionNow !== 'custom') next.permission = permissionNow
    } catch {
      // permission projection unavailable
    }
    last === undefined ? rememberApplied(session.id, next) : rememberApplied(session.id, { ...last, ...next })
    return changed
  }

  async function applyToWorkspaceBlankSessions(workspacePath) {
    const key = normalizePathKey(workspacePath)
    if (key === undefined) return 0
    let applied = 0
    for (const agent of ctx.get('agents')?.list?.() ?? []) {
      try {
        if (normalizePathKey(agent.session.header.cwd) !== key) continue
        if (await applyToAgent(agent, 'workspace-settings-saved')) applied += 1
      } catch (error) {
        logger.warn(`workspace-settings: applying to session ${agent.id} failed: ${String(error)}`)
      }
    }
    return applied
  }

  /**
   * Re-assert the workspace mode after an external blank-session preset switch.
   *
   * The built-in "new session" flow reuses a live blank session and first
   * switches its preset back to the requested/default one. That records an
   * `agent-preset/selected` event and does not re-run `agent/created`, so the
   * workspace value would otherwise be lost for every reused blank Session.
   * An explicit user choice in the session (not the default and not our own
   * last applied value) is still respected.
   */
  async function reapplyPresetOnSelection(sessionId, selectedPreset) {
    try {
      const session = ctx.get('sessions')?.get?.(sessionId)
      if (session === undefined) return
      const header = session.header
      if (header.origin === 'subagent' || header.parentSession !== undefined) return
      if (!isBlank(session)) return
      const presets = ctx.get('agentPresets')
      const agent = ctx.get('agents')?.get?.(sessionId)
      if (presets === undefined || agent === undefined) return
      const data = await store()
      const entry = entryForCwd(header.cwd)
      if (entry === undefined) return
      const catalog = await presetCatalog(true)
      const target = entry.preset ?? catalog.defaultPreset
      if (typeof target !== 'string' || target === '') return
      if (selectedPreset === target) return
      const last = data.sessions[sessionId]
      if (!mayApplyValue(selectedPreset, catalog.defaultPreset, last?.preset)) return
      await presets.select(agent, target)
      rememberApplied(sessionId, { ...(last ?? {}), preset: target })
    } catch (error) {
      logger.warn(`workspace-settings: could not re-apply the workspace mode after a preset switch: ${String(error)}`)
    }
  }

  ctx.on('agent-preset/selected', (sessionId, agentPreset) => reapplyPresetOnSelection(sessionId, agentPreset))

  ctx.on('agent/created', async ({ agent }) => {
    try {
      await applyToAgent(agent, 'created')
    } catch (error) {
      logger.warn(`workspace-settings: agent/created hook failed: ${String(error)}`)
    }
  })

  ctx.on('agent/disposed', ({ agent }) => {
    modelOverrides.delete(agent.id)
  })

  ctx.on('llm/adapters-updated', () => {
    void refreshModelIndex()
  })

  void (async () => {
    await store()
    await refreshModelIndex()
    for (const agent of ctx.get('agents')?.list?.() ?? []) {
      try {
        await applyToAgent(agent, 'startup')
      } catch {
        // startup best effort
      }
    }
  })()

  /* ---------------- API dispatch ---------------- */

  async function dispatch(method, payload) {
    if (method === 'catalog') {
      return await buildCatalog()
    }
    if (method === 'apply') {
      const request = payload !== null && typeof payload === 'object' ? payload : {}
      const sessionId = stringOrUndefined(request.sessionId)
      if (sessionId === undefined) throw new ApiError('bad-request', 'sessionId is required')
      const agent = ctx.get('agents')?.get?.(sessionId)
      if (agent === undefined) return { applied: false, reason: 'session-not-live' }
      const applied = await applyToAgent(agent, 'client-active-session')
      return { applied }
    }
    if (method === 'save') {
      const request = payload !== null && typeof payload === 'object' ? payload : {}
      const workspaceId = stringOrUndefined(request.workspaceId)
      if (workspaceId === undefined) throw new ApiError('bad-request', 'workspaceId is required')
      const workspace = findWorkspace(workspaceId)
      if (workspace === undefined) throw new ApiError('workspace/not-found', `workspace "${workspaceId}" was not found`)
      const catalog = await buildCatalog()
      let normalized
      try {
        normalized = normalizeRequestedSettings(request.settings, catalog)
      } catch (error) {
        throw new ApiError('bad-request', error instanceof Error ? error.message : String(error))
      }
      const path = workspace.path
      const key = normalizePathKey(path)
      if (key === undefined) throw new ApiError('bad-request', 'workspace path is not usable')
      const isEmpty = normalized.preset === null
        && normalized.permission === null
        && normalized.model === null
        && normalized.transcriptView === null
        && normalized.collapseTiming === null
      const data = await store()
      if (isEmpty) delete data.workspaces[key]
      else {
        data.workspaces[key] = {
          workspaceId,
          path,
          ...normalized,
          updatedAt: new Date().toISOString(),
        }
      }
      await persist()
      await refreshModelIndex()
      const applied = await applyToWorkspaceBlankSessions(path)
      return { catalog: await buildCatalog(), applied }
    }
    throw new ApiError('not-found', `unknown workspace-settings API method "${method}"`, 404)
  }

  const routes = [
    { method: 'catalog', path: `${API_PREFIX}/catalog` },
    { method: 'apply', path: `${API_PREFIX}/apply` },
    { method: 'save', path: `${API_PREFIX}/save` },
  ]
  const connection = ctx.get('connection')
  if (connection?.fetch?.register !== undefined) {
    ctx.effect(() => {
      const disposers = routes.map((route) => connection.fetch.register({
        path: route.path,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          try {
            const payload = await readWebJson(request)
            return jsonResponse(await dispatch(route.method, payload))
          } catch (error) {
            return errorResponse(error)
          }
        },
      }))
      return async () => {
        await Promise.allSettled(disposers.map((dispose) => dispose()))
      }
    }, 'workspace-settings: API routes')
  } else {
    ctx.effect(() => ctx.webServer.register({
      kind: 'prefix',
      path: API_PREFIX,
      handler: async (request, response) => {
        if (!trustedNodeRequest(request)) {
          writeNodeJson(response, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } })
          return
        }
        const url = new URL(request.url ?? '/', 'http://dsh.internal')
        const method = url.pathname.startsWith(`${API_PREFIX}/`)
          ? url.pathname.slice(API_PREFIX.length + 1)
          : undefined
        if (method === undefined || method.includes('/') || !routes.some((route) => route.method === method)) {
          writeNodeJson(response, 404, { ok: false, error: { code: 'not-found', message: 'unknown route' } })
          return
        }
        try {
          const payload = await readNodeJson(request)
          writeNodeJson(response, 200, { ok: true, value: await dispatch(method, payload) })
        } catch (error) {
          writeNodeError(response, error)
        }
      },
    }), 'workspace-settings: API fallback route')
  }
}

/* ------------------------------------------------------------------ */
/* HTTP plumbing                                                       */
/* ------------------------------------------------------------------ */

class ApiError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

function sanitizeError(error) {
  if (error instanceof ApiError) {
    return { status: error.status, body: { ok: false, error: { code: error.code, message: error.message } } }
  }
  return {
    status: 500,
    body: {
      ok: false,
      error: { code: 'internal', message: error instanceof Error ? error.message : String(error) },
    },
  }
}

function jsonResponse(value) {
  return Response.json({ ok: true, value })
}

function errorResponse(error) {
  const result = sanitizeError(error)
  return Response.json(result.body, { status: result.status })
}

async function readWebJson(request) {
  const length = Number(request.headers.get('content-length') ?? '0')
  if (Number.isFinite(length) && length > BODY_LIMIT) {
    throw new ApiError('bad-request', 'request body is too large', 413)
  }
  const text = await request.text()
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new ApiError('bad-request', 'request body is not valid JSON')
  }
}

function writeNodeJson(response, status, body) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  response.end(JSON.stringify(body))
}

function writeNodeError(response, error) {
  const result = sanitizeError(error)
  writeNodeJson(response, result.status, result.body)
}

async function readNodeJson(request) {
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk)
    total += buffer.length
    if (total > BODY_LIMIT) throw new ApiError('bad-request', 'request body is too large', 413)
    chunks.push(buffer)
  }
  const text = Buffer.concat(chunks).toString('utf8')
  if (text.trim() === '') return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new ApiError('bad-request', 'request body is not valid JSON')
  }
}

function trustedNodeRequest(request) {
  const host = request.headers.host
  if (typeof host !== 'string' || host === '') return false
  let hostUrl
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin !== undefined) {
    try {
      if (new URL(origin).host !== hostUrl.host) return false
    } catch {
      return false
    }
  }
  return true
}
