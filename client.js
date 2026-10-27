/**
 * Client half of `dsh-workspace-settings`.
 *
 * Registers two native surfaces:
 * 1. `settings.section` — a Workspace Settings page listing every workspace
 *    with its saved defaults and an editor.
 * 2. `shell.overlay` — a frame-level layer that upgrades each workspace row's
 *    "..." menu with a "Workspace Settings" entry. The shipped sidebar has no
 *    workspace-menu slot, so the layer recognizes the documented
 *    `data-row-key="workspace:<id>"` row, intercepts that row's menu trigger
 *    (and right-click on the row), and renders the complete menu with the
 *    host's own Menu primitive: Workspace Settings, Rename, Delete Workspace.
 *    Rename and Delete call the same public `ctx.workspaces` service the host
 *    menu uses, so the whole interaction follows the official chrome.
 *
 * The UI deliberately reuses the host's official primitives
 * (`@deepseek-ai/dsh-client-ui-primitives`): Menu, Modal, Button and Input,
 * plus the host icon set. When those primitives are missing on an older host
 * the plugin declines registration instead of rendering a lookalike.
 */
window.__ModuleLoader__.load({
  id: 'dsh-workspace-settings',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'workspace-settings'
    const API = '/api/workspace-settings'
    const REQUIRED_PRIMITIVES = ['Menu', 'Modal', 'Button', 'Input']
    const PRIMITIVES_ID = '@deepseek-ai/dsh-client-ui-primitives'

    let P = null
    try {
      P = require(PRIMITIVES_ID)
    } catch (error) {
      console.warn(`[workspace-settings] ${PRIMITIVES_ID} is unavailable, so the plugin will not mount:`, error)
    }
    const missingPrimitives = P === null
      ? REQUIRED_PRIMITIVES
      : REQUIRED_PRIMITIVES.filter((name) => P[name] === null || P[name] === undefined)
    if (missingPrimitives.length > 0) {
      console.warn(`[workspace-settings] host primitives missing: ${missingPrimitives.join(', ')}; plugin declines to mount`)
    }

    /** Render one optional host icon; a missing glyph leaves no artwork. */
    function icon(name, props) {
      const Component = P?.[name]
      if (Component === null || Component === undefined) return null
      return h(Component, props ?? {})
    }

    /* ---------------------------------------------------------------- */
    /* localisation                                                      */
    /* ---------------------------------------------------------------- */

    const DICT = {
      zh: {
        nav: '工作区设置',
        'page.title': '工作区设置',
        'page.description': '为每个工作区保存新会话的模式、权限、模型与推理强度。设置只影响该工作区之后新建（或复用的空白）会话；会话内的临时修改仍然优先。',
        'page.empty': '还没有工作区。先在侧边栏创建一个工作区，再回来为它设置默认值。',
        'page.loading': '正在读取工作区与可选项…',
        'page.retry': '重试',
        'page.inherit': '继承全局设置',
        'page.edit': '编辑',
        'page.refresh': '刷新',
        'field.mode': '模式',
        'field.modeHint': '新会话使用的代理预设（Agent preset）。',
        'field.permission': '审查与权限',
        'field.permissionHint': '新会话的沙箱与审批级别。',
        'field.model': '模型',
        'field.modelHint': '新会话首个请求使用的模型。',
        'field.effort': '强度',
        'field.effortHint': '所选模型的推理强度；不选模型时跟随全局。',
        'field.inheritGlobal': '跟随全局默认',
        'field.modelDefault': '模型默认',
        'field.noEffort': '该模型不支持调整强度',
        'field.chooseModelFirst': '先选择一个模型',
        'field.transcript': '工作步骤展示',
        'field.transcriptHint': '选择希望看到多少工具调用细节；进入该工作区的会话时生效。',
        'field.collapse': '工作步骤收起时机',
        'field.collapseHint': '选择何时自动收起工作步骤；进入该工作区的会话时生效。',
        'chat.hint': '这两项沿用官方 Chat 展示偏好：进入该工作区的会话时自动切换，离开工作区会话后恢复全局值。',
        'dialog.title': '工作区设置',
        'dialog.save': '保存',
        'dialog.saving': '保存中…',
        'dialog.cancel': '取消',
        'dialog.close': '关闭',
        'dialog.reset': '恢复继承全局设置',
        'dialog.resetting': '正在恢复…',
        'dialog.hint': '修改立即生效，并同步到该工作区中当前打开的空白会话。',
        'menu.settings': '工作区设置',
        'menu.rename': '重命名',
        'menu.delete': '删除工作区',
        'menu.loading': '正在加载…',
        'rename.title': '重命名工作区',
        'rename.label': '名称',
        'rename.save': '保存',
        'delete.title': '删除工作区',
        'delete.description': '将删除工作区“{name}”。工作区中的会话会保留，但不再分组到这个工作区。',
        'delete.confirm': '删除',
        'summary.globalMode': '模式：{name}',
        'summary.globalPermission': '权限：{name}',
        'summary.globalModel': '模型：{name}',
        'summary.transcript': '工作步骤展示：{name}',
        'summary.collapse': '收起时机：{name}',
        'summary.inherit': '继承全局设置：{mode} · {permission} · {model}',
        'summary.none': '未设置（跟随全局）',
        'error.load': '读取工作区设置失败：{message}',
        'error.save': '保存失败：{message}',
        'error.rename': '重命名失败：{message}',
        'error.delete': '删除失败：{message}',
        'error.unavailable': '该操作在当前界面不可用。',
        'common.workspace': '工作区',
        'common.generic': '未知错误',
      },
      en: {
        nav: 'Workspace Settings',
        'page.title': 'Workspace Settings',
        'page.description': 'Save default mode, permissions, model and reasoning effort per workspace. Defaults apply to new (or reused blank) sessions created in that workspace; in-session overrides still win.',
        'page.empty': 'No workspaces yet. Create one in the sidebar, then come back to set its defaults.',
        'page.loading': 'Loading workspaces and options…',
        'page.retry': 'Retry',
        'page.inherit': 'Inherit global settings',
        'page.edit': 'Edit',
        'page.refresh': 'Refresh',
        'field.mode': 'Mode',
        'field.modeHint': 'Agent preset used by new sessions.',
        'field.permission': 'Review & permissions',
        'field.permissionHint': 'Sandbox and approval level for new sessions.',
        'field.model': 'Model',
        'field.modelHint': 'Model used by the first request of new sessions.',
        'field.effort': 'Effort',
        'field.effortHint': 'Reasoning effort for the selected model; inherits global without a model.',
        'field.inheritGlobal': 'Follow global default',
        'field.modelDefault': 'Model default',
        'field.noEffort': 'This model has no effort control',
        'field.chooseModelFirst': 'Choose a model first',
        'field.transcript': 'Work details',
        'field.transcriptHint': 'Choose how much detail to show for tool calls; applies while a session in this workspace is active.',
        'field.collapse': 'Collapse work details',
        'field.collapseHint': 'Choose when to automatically collapse work details; applies while a session in this workspace is active.',
        'chat.hint': 'These two reuse the official Chat presentation preference: switched while a session in this workspace is active and restored to the global value otherwise.',
        'dialog.title': 'Workspace Settings',
        'dialog.save': 'Save',
        'dialog.saving': 'Saving…',
        'dialog.cancel': 'Cancel',
        'dialog.close': 'Close',
        'dialog.reset': 'Reset to global',
        'dialog.resetting': 'Resetting…',
        'dialog.hint': 'Changes apply immediately, including to the blank session already open in this workspace.',
        'menu.settings': 'Workspace settings',
        'menu.rename': 'Rename',
        'menu.delete': 'Delete workspace',
        'menu.loading': 'Loading…',
        'rename.title': 'Rename workspace',
        'rename.label': 'Name',
        'rename.save': 'Save',
        'delete.title': 'Delete workspace',
        'delete.description': 'Delete workspace “{name}”. Its sessions are kept but no longer grouped under this workspace.',
        'delete.confirm': 'Delete',
        'summary.globalMode': 'Mode: {name}',
        'summary.globalPermission': 'Permissions: {name}',
        'summary.globalModel': 'Model: {name}',
        'summary.transcript': 'Work details: {name}',
        'summary.collapse': 'Collapse: {name}',
        'summary.effort': 'Effort: {name}',
        'summary.inherit': 'Inherit global: {mode} · {permission} · {model}',
        'summary.none': 'Not set (follow global)',
        'error.load': 'Could not load workspace settings: {message}',
        'error.save': 'Save failed: {message}',
        'error.rename': 'Rename failed: {message}',
        'error.delete': 'Delete failed: {message}',
        'error.unavailable': 'This action is unavailable in the current UI.',
        'common.workspace': 'Workspace',
        'common.generic': 'Unknown error',
      },
    }

    /**
     * Product copy that ships with the host's own plugins instead of the
     * Host roster JSON: shipped presets publish no name, and built-in
     * permission presets report their machine key as the name. These maps
     * mirror ui-agent-preset and ui-permission-presets so the plugin shows the
     * same labels the official selectors show.
     */
    const LOCALE_COPY = {
      zh: {
        presets: { standard: '标准模式', ptc: 'PTC 模式', minimal: '极简模式', cordis: '创造模式' },
        permissions: { 'read-only': '仅可查看', 'workspace-write': '工作区内修改', 'danger-full-access': '完全权限', auto: '自动审查' },
        transcript: { compact: '简洁', standard: '标准', detailed: '详细', verbose: '完全展开' },
        collapse: { completion: '回答结束后', 'next-input': '下次有新消息时' },
      },
      en: {
        presets: { standard: 'Standard mode', ptc: 'PTC mode', minimal: 'Minimal mode', cordis: 'Creator mode' },
        permissions: { 'read-only': 'Read Only', 'workspace-write': 'Workspace Write', 'danger-full-access': 'Full access', auto: 'Auto review' },
        transcript: { compact: 'Compact', standard: 'Standard', detailed: 'Detailed', verbose: 'Verbose' },
        collapse: { completion: 'On completion', 'next-input': 'On next message' },
      },
    }
    const EN_PERMISSION_NAMES = LOCALE_COPY.en.permissions

    function displayTitleCase(name) {
      if (typeof name !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) return name
      return name.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
    }

    function displayPreset(catalog, id, copy) {
      const preset = catalog?.presets?.find((entry) => entry.id === id)
      const builtin = copy?.presets?.[id]
      if (builtin !== undefined && (preset?.name === undefined || preset.name === id || preset.name === '')) return builtin
      return preset?.name ?? builtin ?? id
    }

    function displayPermission(catalog, value, copy) {
      const option = catalog?.permissions?.find((entry) => entry.value === value)
      const builtin = copy?.permissions?.[value]
      if (builtin !== undefined && (option?.name === undefined || option.name === value || option.name === EN_PERMISSION_NAMES[value])) return builtin
      return displayTitleCase(option?.name ?? value)
    }

    function transcriptLabel(copy, value) {
      return copy?.transcript?.[value] ?? value
    }

    function collapseLabel(copy, value) {
      return copy?.collapse?.[value] ?? value
    }


    const CSS = `
.wsx-root{position:fixed;inset:0;z-index:2147483000;pointer-events:none;overflow:visible}
.wsx-root *{box-sizing:border-box}
.wsx-page{display:flex;flex-direction:column;width:100%;min-width:0}
/* Row and selector geometry copied from the host's official PermissionRow
   settings row (ui-permission-presets): title 14/22 regular, description
   12/18 tertiary, filled 36px selector with trailing chevron. */
.wsx-row{border-bottom:.5px solid var(--dsw-alias-border-l2);align-items:center;gap:8px;padding:16px 0;display:flex}
.wsx-row:last-child{border-bottom:none}
.wsx-row-text{flex-direction:column;flex:1;gap:4px;min-width:160px;padding-right:48px;display:flex}
.wsx-row-title{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:400;line-height:22px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wsx-row-desc{color:var(--dsw-alias-label-tertiary);font-size:12px;font-weight:400;line-height:18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wsx-selector{border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-module-platform);height:36px;font:inherit;color:var(--dsw-alias-label-primary);cursor:pointer;border:none;align-items:center;gap:12px;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex;max-width:280px;flex:none}
.wsx-selector:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.wsx-selector:disabled{color:var(--dsw-alias-label-dimmed);background:var(--dsw-alias-fill-tsp-secondary);cursor:default}
.wsx-selector-label{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}
.wsx-chevron{flex:none;color:var(--dsw-alias-label-caption)}
.wsx-dialog{width:min(620px,calc(100vw - 48px));max-width:min(620px,calc(100vw - 48px))}
.wsx-empty{padding:28px 0;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;display:flex;flex-direction:column;align-items:flex-start;gap:12px}
.wsx-dialog-hint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;margin:14px 0 0}
.wsx-dialog-status{margin-top:10px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.wsx-error{margin-top:12px;padding:9px 10px;border-radius:8px;background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;word-break:break-word}
.wsx-status{display:flex;align-items:center;gap:10px;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;padding:20px 0}
.wsx-spinner{width:14px;height:14px;border-radius:50%;border:2px solid color-mix(in srgb,var(--dsw-alias-label-secondary) 35%,transparent);border-top-color:var(--dsw-alias-label-secondary);animation:wsx-spin .8s linear infinite;flex:none}
.wsx-danger-button{color:var(--dsw-alias-state-error-primary)}
@keyframes wsx-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion: reduce){.wsx-spinner{animation:none}}
`

    /* ---------------------------------------------------------------- */
    /* helpers                                                           */
    /* ---------------------------------------------------------------- */

    function errorText(t, key, error) {
      const message = error instanceof Error && error.message !== '' ? error.message : t('common.generic')
      return t(key, { message })
    }

    function interpolate(text, params) {
      if (text === undefined || text === null) return ''
      if (params === undefined) return String(text)
      return String(text).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
      )
    }

    async function api(method, payload) {
      const response = await fetch(`${API}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
      })
      let body = null
      try {
        body = await response.json()
      } catch {
        body = null
      }
      if (body === null || body.ok !== true) {
        const message = body?.error?.message ?? `HTTP ${response.status}`
        throw new Error(message)
      }
      return body.value
    }

    /* The workspace menu, the Settings page and the Chat-policy watcher all
       need the same catalog; keep one shared copy so a workspace save is
       visible to the watcher without polling. */
    let sharedCatalog = null
    let sharedCatalogAt = 0
    let sharedCatalogPromise = null
    const catalogSubscribers = new Set()

    function publishCatalog(catalog) {
      if (catalog === null || catalog === undefined) return
      sharedCatalog = catalog
      sharedCatalogAt = Date.now()
      for (const subscriber of catalogSubscribers) {
        try {
          subscriber()
        } catch {
          // subscriber failures must not break the publisher
        }
      }
    }

    function ensureSharedCatalog() {
      if (sharedCatalog !== null && Date.now() - sharedCatalogAt < 300_000) return Promise.resolve(sharedCatalog)
      if (sharedCatalogPromise !== null) return sharedCatalogPromise
      sharedCatalogPromise = api('catalog', {}).then((catalog) => {
        publishCatalog(catalog)
        return catalog
      }).catch(() => null).finally(() => {
        sharedCatalogPromise = null
      })
      return sharedCatalogPromise
    }

    function useCatalog(t) {
      const [state, setState] = React.useState({ phase: 'idle', catalog: null, error: null })
      const load = React.useCallback(async () => {
        setState((current) => ({ ...current, phase: current.catalog === null ? 'loading' : 'refreshing', error: null }))
        try {
          const catalog = await api('catalog', {})
          publishCatalog(catalog)
          setState({ phase: 'ready', catalog, error: null })
          return catalog
        } catch (error) {
          setState((current) => ({
            ...current,
            phase: current.catalog === null ? 'error' : 'ready',
            error: errorText(t, 'error.load', error),
          }))
          return null
        }
      }, [t])
      return [state, load]
    }

    function presetOf(catalog, id) {
      return catalog?.presets?.find((entry) => entry.id === id)
    }

    function permissionOf(catalog, value) {
      return catalog?.permissions?.find((entry) => entry.value === value)
    }

    function modelOf(catalog, selection) {
      if (selection === null || selection === undefined) return undefined
      return catalog?.models?.find(
        (entry) => entry.provider === selection.provider && entry.model === selection.model,
      )
    }

    function modelName(catalog, selection) {
      const entry = modelOf(catalog, selection)
      if (entry === undefined) return `${selection.provider}/${selection.model}`
      return entry.providerName === entry.name ? entry.name : `${entry.providerName} / ${entry.name}`
    }

    function effortName(catalog, selection) {
      const entry = modelOf(catalog, selection)
      if (entry === undefined || selection?.reasoningEffort === undefined) return undefined
      return (entry.efforts ?? []).find((effort) => effort.id === selection.reasoningEffort)?.name ?? selection.reasoningEffort
    }

    function summaryChips(catalog, settings, t, copy) {
      const chips = []
      if (settings?.preset) chips.push(t('summary.globalMode', { name: displayPreset(catalog, settings.preset, copy) }))
      else chips.push(t('summary.globalMode', { name: `${catalog?.defaultPreset ? displayPreset(catalog, catalog.defaultPreset, copy) : '—'} · ${t('field.inheritGlobal')}` }))
      if (settings?.permission) chips.push(t('summary.globalPermission', { name: displayPermission(catalog, settings.permission, copy) }))
      else chips.push(t('summary.globalPermission', { name: `${catalog?.defaultPermission ? displayPermission(catalog, catalog.defaultPermission, copy) : '—'} · ${t('field.inheritGlobal')}` }))
      if (settings?.model) {
        const effort = effortName(catalog, settings.model)
        chips.push(t('summary.globalModel', { name: modelName(catalog, settings.model) + (effort === undefined ? '' : ` · ${effort}`) }))
      } else {
        const fallback = catalog?.defaultModel === undefined ? '—' : modelName(catalog, catalog.defaultModel)
        chips.push(t('summary.globalModel', { name: `${fallback} · ${t('field.inheritGlobal')}` }))
      }
      if (settings?.transcriptView) chips.push(t('summary.transcript', { name: transcriptLabel(copy, settings.transcriptView) }))
      if (settings?.collapseTiming) chips.push(t('summary.collapse', { name: collapseLabel(copy, settings.collapseTiming) }))
      return chips
    }

    /* ---------------------------------------------------------------- */
    /* error boundary                                                    */
    /* ---------------------------------------------------------------- */

    class SurfaceErrorBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { failed: false }
      }
      static getDerivedStateFromError() {
        return { failed: true }
      }
      componentDidCatch(error) {
        console.error('[workspace-settings] surface crashed:', error)
      }
      render() {
        if (this.state.failed) return this.props.label ?? null
        return this.props.children
      }
    }

    /* ---------------------------------------------------------------- */
    /* official primitive building blocks                                */
    /* ---------------------------------------------------------------- */

    function BusyLine({ t, text }) {
      return h('div', { className: 'wsx-status', role: 'status' }, [
        h('span', { key: 'spin', className: 'wsx-spinner' }),
        h('span', { key: 'text' }, text),
      ])
    }

    function FieldRow({ label, hint, control }) {
      return h('div', { className: 'wsx-row' },
        h('div', { key: 'text', className: 'wsx-row-text' }, [
          h('div', { key: 'title', className: 'wsx-row-title' }, label),
          hint === undefined || hint === null ? null : h('div', { key: 'desc', className: 'wsx-row-desc' }, hint),
        ]),
        control)
    }

    /** One official Menu-backed select used by the settings dialog. */
    function MenuSelect({ label, hint, value, options, onChange, disabled, placeholder }) {
      const [open, setOpen] = React.useState(false)
      const current = options.find((option) => option.value === value)
      const items = options.map((option) => ({
        id: option.value,
        label: option.label,
        ...(option.disabled === true ? { disabled: true } : {}),
      }))
      const anchor = h('button', {
        type: 'button',
        className: 'wsx-selector',
        disabled: disabled === true || options.length === 0,
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-label': label,
        onClick: () => setOpen((currentOpen) => !currentOpen),
      }, [
        h('span', { key: 'value', className: 'wsx-selector-label' }, current?.label ?? placeholder ?? ''),
        icon('IconChevronDownOutlineRegular', { key: 'chevron', className: 'wsx-chevron' }),
      ])
      return h(FieldRow, {
        label,
        hint,
        control: h(P.Menu, {
          open: open && options.length > 0,
          anchor,
          items,
          selectedId: value,
          onSelect: (id) => {
            setOpen(false)
            onChange(id)
          },
          onClose: () => setOpen(false),
          align: 'end',
          side: 'bottom',
          portal: true,
        }),
      })
    }

    function ModalFooter({ onCancel, cancelLabel, primary, primaryLabel, busy, reset, resetLabel }) {
      return h(React.Fragment, null, [
        reset === undefined ? null : h(P.Button, {
          key: 'reset',
          variant: 'ghost',
          disabled: busy,
          onClick: reset,
        }, resetLabel),
        h(P.Button, {
          key: 'cancel',
          variant: 'outline',
          disabled: busy,
          onClick: onCancel,
        }, cancelLabel),
        h(P.Button, {
          key: 'primary',
          variant: 'primary',
          disabled: busy,
          onClick: primary,
        }, primaryLabel),
      ].filter(Boolean))
    }

    /* ---------------------------------------------------------------- */
    /* workspace settings dialog                                         */
    /* ---------------------------------------------------------------- */

    function WorkspaceSettingsDialog({ t, copy, workspace, catalog, onClose, onSaved }) {
      const [form, setForm] = React.useState(() => {
        const settings = workspace.settings ?? {}
        return {
          preset: settings.preset ?? '',
          permission: settings.permission ?? '',
          modelKey: settings.model === null || settings.model === undefined ? '' : `${settings.model.provider}\u0000${settings.model.model}`,
          effort: settings.model?.reasoningEffort ?? '',
          transcriptView: settings.transcriptView ?? '',
          collapseTiming: settings.collapseTiming ?? '',
        }
      })
      const [saving, setSaving] = React.useState(false)
      const [error, setError] = React.useState(null)
      const queue = React.useRef(Promise.resolve())

      const modelOptions = catalog.models ?? []
      const selectedModel = form.modelKey === ''
        ? undefined
        : modelOptions.find((entry) => `${entry.provider}\u0000${entry.model}` === form.modelKey)
      const efforts = selectedModel?.efforts ?? []
      const effortAvailable = selectedModel !== undefined && efforts.length > 0

      /**
       * Official General Settings apply each change immediately, so this
       * dialog does the same: every selector writes the whole workspace
       * document through one serialized queue and shows only failures.
       */
      const persist = (next) => {
        const nextModel = next.modelKey === ''
          ? undefined
          : modelOptions.find((entry) => `${entry.provider}\u0000${entry.model}` === next.modelKey)
        const model = nextModel === undefined
          ? null
          : {
            provider: nextModel.provider,
            model: nextModel.model,
            ...next.effort === '' ? {} : { reasoningEffort: next.effort },
          }
        const settings = {
          preset: next.preset === '' ? null : next.preset,
          permission: next.permission === '' ? null : next.permission,
          model,
          transcriptView: next.transcriptView === '' ? null : next.transcriptView,
          collapseTiming: next.collapseTiming === '' ? null : next.collapseTiming,
        }
        queue.current = queue.current.then(async () => {
          setSaving(true)
          try {
            const result = await api('save', { workspaceId: workspace.workspaceId, settings })
            setError(null)
            onSaved?.(result?.catalog ?? null)
          } catch (failure) {
            setError(errorText(t, 'error.save', failure))
          } finally {
            setSaving(false)
          }
        })
      }

      const update = (patch) => {
        const next = { ...form, ...patch }
        setForm(next)
        persist(next)
      }

      const presetOptions = [{
        value: '',
        label: `${t('field.inheritGlobal')}${catalog.defaultPreset ? `（${displayPreset(catalog, catalog.defaultPreset, copy)}）` : ''}`,
      }, ...catalog.presets.map((preset) => ({
        value: preset.id,
        label: `${displayPreset(catalog, preset.id, copy)}${typeof preset.broken === 'string' ? ' ⚠' : ''}`,
        disabled: typeof preset.broken === 'string',
      }))]

      const permissionOptions = [{
        value: '',
        label: `${t('field.inheritGlobal')}${catalog.defaultPermission ? `（${displayPermission(catalog, catalog.defaultPermission, copy)}）` : ''}`,
      }, ...catalog.permissions.map((permission) => ({
        value: permission.value,
        label: displayPermission(catalog, permission.value, copy),
      }))]

      const transcriptOptions = [{
        value: '',
        label: t('field.inheritGlobal'),
      }, ...['compact', 'standard', 'detailed', 'verbose'].map((value) => ({
        value,
        label: transcriptLabel(copy, value),
      }))]

      const collapseOptions = [{
        value: '',
        label: t('field.inheritGlobal'),
      }, ...['completion', 'next-input'].map((value) => ({
        value,
        label: collapseLabel(copy, value),
      }))]

      const modelSelectOptions = [{
        value: '',
        label: `${t('field.inheritGlobal')}${catalog.defaultModel ? `（${modelName(catalog, catalog.defaultModel)}）` : ''}`,
      }, ...modelOptions.map((entry) => ({
        value: `${entry.provider}\u0000${entry.model}`,
        label: entry.providerName === entry.name ? entry.name : `${entry.providerName} / ${entry.name}`,
      }))]

      const effortOptions = selectedModel === undefined
        ? [{ value: '', label: t('field.chooseModelFirst') }]
        : efforts.length === 0
          ? [{ value: '', label: t('field.noEffort') }]
          : [{ value: '', label: t('field.modelDefault') }, ...efforts.map((effort) => ({ value: effort.id, label: effort.name }))]

      return h(P.Modal, {
        open: true,
        onClose,
        title: t('dialog.title'),
        description: workspace.path,
        closeLabel: t('dialog.close'),
        className: 'wsx-dialog',
      }, [
        h(MenuSelect, {
          key: 'mode',
          t,
          label: t('field.mode'),
          hint: t('field.modeHint'),
          value: form.preset,
          options: presetOptions,
          disabled: false,
          placeholder: t('field.inheritGlobal'),
          onChange: (value) => update({ preset: value }),
        }),
        h(MenuSelect, {
          key: 'permission',
          t,
          label: t('field.permission'),
          hint: t('field.permissionHint'),
          value: form.permission,
          options: permissionOptions,
          disabled: false,
          placeholder: t('field.inheritGlobal'),
          onChange: (value) => update({ permission: value }),
        }),
        h(MenuSelect, {
          key: 'model',
          t,
          label: t('field.model'),
          hint: t('field.modelHint'),
          value: form.modelKey,
          options: modelSelectOptions,
          disabled: false,
          placeholder: t('field.inheritGlobal'),
          onChange: (value) => {
            const nextModel = value === ''
              ? undefined
              : modelOptions.find((entry) => `${entry.provider}\u0000${entry.model}` === value)
            const stillValid = nextModel === undefined || (nextModel.efforts ?? []).some((effort) => effort.id === form.effort)
            update({ modelKey: value, effort: stillValid ? form.effort : '' })
          },
        }),
        h(MenuSelect, {
          key: 'effort',
          t,
          label: t('field.effort'),
          hint: selectedModel === undefined
            ? t('field.chooseModelFirst')
            : efforts.length === 0 ? t('field.noEffort') : t('field.effortHint'),
          value: effortAvailable ? form.effort : '',
          options: effortOptions,
          disabled: !effortAvailable,
          placeholder: t('field.modelDefault'),
          onChange: (value) => update({ effort: value }),
        }),
        h(MenuSelect, {
          key: 'transcript',
          t,
          label: t('field.transcript'),
          hint: t('field.transcriptHint'),
          value: form.transcriptView,
          options: transcriptOptions,
          disabled: false,
          placeholder: t('field.inheritGlobal'),
          onChange: (value) => update({ transcriptView: value }),
        }),
        h(MenuSelect, {
          key: 'collapse',
          t,
          label: t('field.collapse'),
          hint: t('field.collapseHint'),
          value: form.collapseTiming,
          options: collapseOptions,
          disabled: false,
          placeholder: t('field.inheritGlobal'),
          onChange: (value) => update({ collapseTiming: value }),
        }),
        h('div', { key: 'hint', className: 'wsx-dialog-hint' }, t('chat.hint')),
        h('div', { key: 'hint-primary', className: 'wsx-dialog-hint' }, t('dialog.hint')),
        saving ? h('div', { key: 'saving', className: 'wsx-dialog-status', role: 'status' }, t('dialog.saving')) : null,
        error === null ? null : h('div', { key: 'error', className: 'wsx-error', role: 'alert' }, error),
      ])
    }

    /* ---------------------------------------------------------------- */
    /* rename / delete dialogs (official Modal + Button + Input)         */
    /* ---------------------------------------------------------------- */

    function RenameWorkspaceDialog({ t, workspace, onClose, onDone }) {
      const [value, setValue] = React.useState(workspace.title ?? '')
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)
      const run = async () => {
        if (busy) return
        const title = value.trim()
        if (title === '') return
        setBusy(true)
        setError(null)
        try {
          await onDone(title)
          onClose()
        } catch (failure) {
          setError(errorText(t, 'error.rename', failure))
        } finally {
          setBusy(false)
        }
      }
      return h(P.Modal, {
        open: true,
        onClose: busy ? () => {} : onClose,
        title: t('rename.title'),
        description: workspace.path,
        closeLabel: t('dialog.cancel'),
        footer: h(ModalFooter, {
          onCancel: onClose,
          cancelLabel: t('dialog.cancel'),
          primary: run,
          primaryLabel: busy ? t('dialog.saving') : t('rename.save'),
          busy,
        }),
      }, [
        h(FieldRow, {
          key: 'field',
          label: t('rename.label'),
          control: h('div', { style: { width: '260px', maxWidth: '100%' } }, h(P.Input, {
            value,
            autoFocus: true,
            disabled: busy,
            maxLength: 200,
            'aria-label': t('rename.label'),
            onChange: (event) => setValue(event.target.value),
            onKeyDown: (event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void run()
              }
            },
          })),
        }),
        error === null ? null : h('div', { key: 'error', className: 'wsx-error', role: 'alert' }, error),
      ])
    }

    function DeleteWorkspaceDialog({ t, workspace, onClose, onDelete }) {
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)
      const run = async () => {
        if (busy) return
        setBusy(true)
        setError(null)
        try {
          await onDelete()
          onClose()
        } catch (failure) {
          setError(errorText(t, 'error.delete', failure))
        } finally {
          setBusy(false)
        }
      }
      return h(P.Modal, {
        open: true,
        onClose: busy ? () => {} : onClose,
        title: t('delete.title'),
        description: interpolate(t('delete.description'), { name: workspace.title }),
        closeLabel: t('dialog.cancel'),
        footer: h(React.Fragment, null, [
          h(P.Button, { key: 'cancel', variant: 'outline', disabled: busy, onClick: onClose }, t('dialog.cancel')),
          h(P.Button, {
            key: 'delete',
            variant: 'outline',
            className: 'wsx-danger-button',
            disabled: busy,
            onClick: run,
          }, t('delete.confirm')),
        ]),
      }, error === null ? null : h('div', { key: 'error', className: 'wsx-error', role: 'alert' }, error))
    }

    /* ---------------------------------------------------------------- */
    /* settings page                                                     */
    /* ---------------------------------------------------------------- */

    function SettingsPage({ t, copy, client }) {
      const [catalogState, reload] = useCatalog(t)
      const [editing, setEditing] = React.useState(null)
      React.useEffect(() => {
        void reload()
      }, [reload])
      const catalog = catalogState.catalog
      const workspaces = catalog?.workspaces ?? []
      const onSaved = React.useCallback(() => {
        void reload()
      }, [reload])
      return h(React.Fragment, null, [
        h('div', { key: 'page', className: 'wsx-page' },
          catalogState.phase === 'loading' || catalogState.phase === 'idle'
            ? h(BusyLine, { key: 'loading', text: t('page.loading') })
            : catalog === null
              ? h('div', { key: 'error', className: 'wsx-empty' }, [
                h('div', { key: 'msg' }, catalogState.error ?? t('error.load', { message: t('common.generic') })),
                h(P.Button, { key: 'retry', variant: 'outline', onClick: () => { void reload() } }, t('page.retry')),
              ])
              : workspaces.length === 0
                ? h('div', { key: 'empty', className: 'wsx-empty' }, t('page.empty'))
                : workspaces.map((workspace) => h('div', {
                  key: workspace.workspaceId,
                  className: 'wsx-row',
                }, [
                  h('div', { key: 'text', className: 'wsx-row-text' }, [
                    h('div', { key: 'title', className: 'wsx-row-title' }, workspace.title ?? workspace.path),
                    h('div', { key: 'path', className: 'wsx-row-desc', title: workspace.path }, workspace.path),
                    h('div', { key: 'summary', className: 'wsx-row-desc' }, workspace.configured
                      ? summaryChips(catalog, workspace.settings, t, copy).join(' · ')
                      : t('page.inherit')),
                  ]),
                  h(P.Button, {
                    key: 'edit',
                    variant: 'outline',
                    onClick: () => setEditing(workspace),
                  }, t('page.edit')),
                ]))),
        editing === null || catalog === null ? null : h(WorkspaceSettingsDialog, {
          key: 'dialog',
          t,
          copy,
          workspace: editing,
          catalog,
          onClose: () => setEditing(null),
          onSaved,
        }),
      ])
    }

    /* ---------------------------------------------------------------- */
    /* workspace menu overlay (official Menu)                            */
    /* ---------------------------------------------------------------- */

    const ROW_PREFIX = 'workspace:'

    function workspaceTriggerOf(event) {
      const target = event.target
      if (target === null || target === undefined || typeof target.closest !== 'function') return undefined
      const row = target.closest('[data-row-key^="workspace:"]')
      if (row === null) return undefined
      const key = row.getAttribute('data-row-key') ?? ''
      if (!key.startsWith(ROW_PREFIX)) return undefined
      const workspaceId = key.slice(ROW_PREFIX.length)
      if (workspaceId === '') return undefined
      const buttons = Array.from(row.querySelectorAll('button'))
      if (buttons.length === 0) return undefined
      return { row, workspaceId, menuButton: buttons[0] }
    }

    function rectOf(button) {
      const rect = button.getBoundingClientRect()
      return {
        x: rect.left,
        y: rect.top,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      }
    }

    function pointRect(x, y) {
      return { x, y, left: x, top: y, right: x, bottom: y, width: 0, height: 0 }
    }

    function Overlay({ t, copy, client }) {
      const [catalogState, loadCatalog] = useCatalog(t)
      const [menu, setMenu] = React.useState(null)
      const [dialog, setDialog] = React.useState(null)
      const [rename, setRename] = React.useState(null)
      const [remove, setRemove] = React.useState(null)
      const catalog = catalogState.catalog
      const catalogRef = React.useRef(catalog)
      catalogRef.current = catalog

      const openMenu = React.useCallback((workspaceId, rect) => {
        setMenu({ workspaceId, rect })
        if (catalogRef.current === null) void loadCatalog()
      }, [loadCatalog])

      React.useEffect(() => {
        const onClick = (event) => {
          const found = workspaceTriggerOf(event)
          if (found === undefined) return
          const target = event.target
          const button = typeof target.closest === 'function' ? target.closest('button') : null
          if (button !== found.menuButton) return
          event.preventDefault()
          event.stopPropagation()
          openMenu(found.workspaceId, rectOf(found.menuButton))
        }
        const onContextMenu = (event) => {
          const found = workspaceTriggerOf(event)
          if (found === undefined) return
          event.preventDefault()
          event.stopPropagation()
          openMenu(found.workspaceId, pointRect(event.clientX, event.clientY))
        }
        document.addEventListener('click', onClick, true)
        document.addEventListener('contextmenu', onContextMenu, true)
        return () => {
          document.removeEventListener('click', onClick, true)
          document.removeEventListener('contextmenu', onContextMenu, true)
        }
      }, [openMenu])

      const workspaceOf = React.useCallback((workspaceId) => (
        catalogRef.current?.workspaces?.find((workspace) => workspace.workspaceId === workspaceId)
      ), [])

      const pick = React.useCallback((id) => {
        if (menu === null) return
        const workspace = workspaceOf(menu.workspaceId)
        setMenu(null)
        if (id === 'rename' && workspace !== undefined) setRename(workspace)
        else if (id === 'delete' && workspace !== undefined) setRemove(workspace)
        else if (id === 'settings' && workspace !== undefined) setDialog(workspace)
        else if (workspace === undefined) void loadCatalog()
      }, [menu, workspaceOf, loadCatalog])

      const menuItems = [
        {
          id: 'settings',
          label: catalog === null ? t('menu.loading') : t('menu.settings'),
          icon: icon('IconSettingsOutlineMedium', { size: 14 }),
        },
        {
          id: 'rename',
          label: t('menu.rename'),
          icon: icon('IconEditOutlineRegular', { size: 14 }),
          disabled: catalog === null,
        },
        {
          id: 'delete',
          label: t('menu.delete'),
          icon: icon('IconTrashOutlineRegular', { size: 14 }),
          danger: true,
          disabled: catalog === null,
        },
      ]

      const dialogs = []
      if (dialog !== null && catalog !== null) {
        const fresh = catalog.workspaces.find((workspace) => workspace.workspaceId === dialog.workspaceId) ?? dialog
        dialogs.push(h(WorkspaceSettingsDialog, {
          key: 'settings-dialog',
          t,
          copy,
          workspace: fresh,
          catalog,
          onClose: () => setDialog(null),
          onSaved: () => { void loadCatalog() },
        }))
      }
      if (rename !== null) {
        dialogs.push(h(RenameWorkspaceDialog, {
          key: 'rename-dialog',
          t,
          workspace: rename,
          onClose: () => setRename(null),
          onDone: async (title) => {
            await client.renameWorkspace(rename.workspaceId, title)
            await loadCatalog()
          },
        }))
      }
      if (remove !== null) {
        dialogs.push(h(DeleteWorkspaceDialog, {
          key: 'delete-dialog',
          t,
          workspace: remove,
          onClose: () => setRemove(null),
          onDelete: async () => {
            await client.deleteWorkspace(remove.workspaceId)
            await loadCatalog()
          },
        }))
      }

      return h('div', { className: 'wsx-root' }, [
        menu === null ? null : h(P.Menu, {
          key: 'workspace-menu',
          open: true,
          anchor: null,
          getAnchorRect: () => menu.rect,
          items: menuItems,
          onSelect: pick,
          onClose: () => setMenu(null),
          portal: true,
          align: 'end',
          side: 'bottom',
          closeOnPointerLeave: true,
        }),
        ...dialogs,
      ])
    }

    /* ---------------------------------------------------------------- */
    /* plugin apply                                                      */
    /* ---------------------------------------------------------------- */

    function createClientActions(ctx) {
      return {
        async renameWorkspace(workspaceId, title) {
          const service = ctx.get('workspaces')
          if (service === undefined || typeof service.rename !== 'function') {
            throw new Error('workspace service unavailable')
          }
          return await service.rename(workspaceId, title)
        },
        async deleteWorkspace(workspaceId) {
          const service = ctx.get('workspaces')
          if (service === undefined || typeof service.delete !== 'function') {
            throw new Error('workspace service unavailable')
          }
          return await service.delete(workspaceId)
        },
      }
    }

    /** Product copy for the active locale; host-preset/permission labels live here. */
    function readCopy(ctx) {
      let active = 'zh'
      try {
        const snapshot = ctx.locale.getSnapshot?.()
        active = snapshot?.active ?? snapshot?.id ?? 'zh'
      } catch {
        active = 'zh'
      }
      return LOCALE_COPY[active] ?? LOCALE_COPY.zh
    }

    const CHAT_BASELINE_KEY = 'dsh-workspace-settings:chat-baseline:v1'
    const TRANSCRIPT_MODES = ['compact', 'standard', 'detailed', 'verbose']
    const COLLAPSE_TIMINGS = ['completion', 'next-input']

    /**
     * Work-details presentation is an official Chat preference stored in the
     * profile, not a Session value. While a Session from a workspace with a
     * workspace-level choice is active, switch the official preference to that
     * choice; when the active Session belongs to another workspace, restore the
     * user's own global value captured as a baseline.
     */
    function startChatPolicy(ctx) {
      const forms = ctx.get('configForms')
      const chat = forms?.get?.('ui-chat')
      const sessions = ctx.get('sessions')
      const list = sessions?.list
      if (chat === undefined || typeof chat.getSnapshot !== 'function' || typeof chat.set !== 'function') return () => {}
      if (list === undefined || typeof list.getSnapshot !== 'function') return () => {}

      const readChat = () => {
        const snapshot = chat.getSnapshot()
        const value = snapshot?.value ?? {}
        return {
          transcriptView: TRANSCRIPT_MODES.includes(value.transcriptView) ? value.transcriptView : undefined,
          collapseTiming: COLLAPSE_TIMINGS.includes(value.collapseTiming) ? value.collapseTiming : undefined,
        }
      }

      let baseline = readChat()
      try {
        const raw = localStorage.getItem(CHAT_BASELINE_KEY)
        if (raw !== null) {
          const parsed = JSON.parse(raw)
          if (TRANSCRIPT_MODES.includes(parsed?.transcriptView)) baseline.transcriptView = parsed.transcriptView
          if (COLLAPSE_TIMINGS.includes(parsed?.collapseTiming)) baseline.collapseTiming = parsed.collapseTiming
        }
      } catch {
        // a malformed baseline falls back to the current profile value
      }
      const saveBaseline = () => {
        try {
          localStorage.setItem(CHAT_BASELINE_KEY, JSON.stringify(baseline))
        } catch {
          // storage may be unavailable; baseline still lives for this page
        }
      }

      let applying = false
      let stopped = false
      let lastApplied = { transcriptView: undefined, collapseTiming: undefined }
      const unsubChat = typeof chat.subscribe === 'function' ? chat.subscribe(() => {
        if (applying || stopped) return
        const current = readChat()
        let changed = false
        for (const field of ['transcriptView', 'collapseTiming']) {
          if (current[field] !== undefined && current[field] !== lastApplied[field]) {
            baseline[field] = current[field]
            changed = true
          }
        }
        if (changed) saveBaseline()
      }) : undefined

      const applyPolicy = (desired) => {
        const current = readChat()
        for (const field of ['transcriptView', 'collapseTiming']) {
          const next = desired[field]
          if (next === undefined || next === current[field]) continue
          applying = true
          try {
            const result = chat.set(field, next)
            if (result !== undefined && typeof result.catch === 'function') result.catch(() => {})
          } catch {
            // an unavailable preference write leaves the previous value in place
          } finally {
            applying = false
          }
          lastApplied[field] = next
        }
      }

      const normalize = (path) => String(path ?? '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
      const check = async () => {
        if (stopped) return
        try {
          const snapshot = list.getSnapshot()
          const rows = snapshot?.byId ?? {}
          const active = Object.values(rows).find((row) => ((row?.retainedBy?.mainView) ?? 0) > 0)
          const catalog = await ensureSharedCatalog()
          let settings
          if (active?.cwd && catalog !== null) {
            const key = normalize(active.cwd)
            const workspace = (catalog.workspaces ?? []).find((row) => normalize(row.path) === key)
            settings = workspace?.settings
          }
          const desired = {
            transcriptView: settings?.transcriptView ?? baseline.transcriptView,
            collapseTiming: settings?.collapseTiming ?? baseline.collapseTiming,
          }
          if (!stopped) applyPolicy(desired)
        } catch {
          // a missing catalog or session snapshot simply leaves the policy alone
        }
      }

      const unsubSessions = typeof list.subscribe === 'function' ? list.subscribe(() => { void check() }) : undefined
      const subscriber = () => { void check() }
      catalogSubscribers.add(subscriber)
      void ensureSharedCatalog().then(() => { void check() })
      return () => {
        stopped = true
        try {
          unsubChat?.()
        } catch {
          // already disposed
        }
        try {
          unsubSessions?.()
        } catch {
          // already disposed
        }
        catalogSubscribers.delete(subscriber)
      }
    }

    const plugin = {
      name: 'dsh-workspace-settings-client',
      inject: ['slots', 'locale', 'theme'],
      apply(ctx) {
        if (missingPrimitives.length > 0) {
          console.error(`[workspace-settings] cannot mount: missing host primitives ${missingPrimitives.join(', ')}`)
          return
        }
        ctx.effect(() => ctx.locale.register(NS, DICT), 'workspace-settings: dictionaries')
        const t = ctx.locale.bind(NS)
        const translate = (key, params) => interpolate(t(key, params), params)
        const client = createClientActions(ctx)

        ctx.effect(() => {
          const tag = document.createElement('style')
          tag.dataset.plugin = 'dsh-workspace-settings'
          tag.dataset.pluginCss = 'dsh-workspace-settings/client.css'
          tag.textContent = CSS
          document.head.appendChild(tag)
          return () => tag.remove()
        }, 'workspace-settings: styles')

        ctx.effect(() => startChatPolicy(ctx), 'workspace-settings: chat presentation policy')

        const pageProps = () => ({ t: translate, client, copy: readCopy(ctx) })
        const overlayProps = () => ({ t: translate, client, copy: readCopy(ctx) })

        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'workspace-settings',
          order: 25,
          label: () => translate('nav'),
          locale: NS,
          inject: pageProps,
        }, (props) => h(SurfaceErrorBoundary, { label: null },
          h(SettingsPage, { t: props.t ?? translate, copy: props.copy ?? readCopy(ctx), client: props.client ?? client }))))

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'workspace-settings-overlay',
          label: () => translate('menu.settings'),
          locale: NS,
          inject: overlayProps,
        }, (props) => h(SurfaceErrorBoundary, { label: null },
          h(Overlay, { t: props.t ?? translate, copy: props.copy ?? readCopy(ctx), client: props.client ?? client }))))
      },
    }

    return plugin
  },
})
