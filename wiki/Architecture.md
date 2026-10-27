# Architecture

**English** | [简体中文](架构)

The bundle has two halves plus a Loader patch.

## Host half — `index.js`

Injects `webServer` (optional `connection`, used when present) and reads other public
services lazily through `ctx.get()` so the plugin stays inert in compositions that lack them:

- `workspaceRegistry` — workspace ids, titles and canonical paths.
- `agentPresets` — preset roster and `select(agent, id)` for blank sessions.
- `permissionPresets` — preset catalog/effective preset and `set(session, name)`.
- `sessionController.modelCatalog()` — routable models and reasoning efforts.
- `agentDefaultModel.currentSelection()` — the global default model.
- `sessionProjections` — `turnBoundary`, `agentPreset` and `modelSelection` state.
- `agents` — live sessions for startup and save-time blank-session application.

### Routes

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/workspace-settings/catalog` | Workspaces, live presets/permissions/models, defaults, stored values |
| `POST` | `/api/workspace-settings/save` | Validate + persist one workspace document; returns the refreshed catalog and how many blank sessions were updated |

When `ctx.connection.fetch` exists the routes are registered there (authenticated browser
carrier). Otherwise a `ctx.webServer` prefix route is used and guarded by a same-origin/host
check. Bodies are bounded to 256 KiB and failures carry stable `{ code, message }` errors.

### Inheritance on session creation

`agent/created` is a serial, awaited event, so the plugin applies defaults before the new
agent is usable by a prompt. It:

1. Skips subagent, forked and already-started sessions.
2. Looks up the workspace record by the session header's `cwd`.
3. Applies the preset with `agentPresets.select()` only while the session is blank.
4. Applies the permission preset with `permissionPresets.set()` (normal Session events).
5. Installs the first-request model override when a model is stored.
6. Records the effective preset/permission in a small per-session cache.

The cache distinguishes “still global default” and “value this plugin applied” from “the user
changed it in the session”. Only the first two are eligible for replacement on a later reuse
of the same blank session. The cache is derived state and may be lost.

### Model override

The model is not written into the global default. Instead the plugin registers Agent-scoped
`system-prompt/assemble` and `agent/request` listeners (`{ prepend: true }`) that override the
resolved provider/model/effort only while:

- the session has no request header yet (first request), and
- the `modelSelection` projection has no pending explicit choice.

Once the request header is recorded, the listeners stop changing anything and the normal
session model selector owns subsequent requests.

### Chat presentation watcher

Work details / collapse timing are global `ui-chat` preferences. The client watcher:

1. Reads `ctx.configForms.get('ui-chat')` and subscribes to its snapshot.
2. Finds the active session from `ctx.sessions.list` (`retainedBy.mainView > 0`).
3. Resolves its workspace through the shared catalog.
4. Switches the two official preference fields to the workspace value, or to the captured
   global baseline when the session belongs to a workspace without an override.
5. Treats changes not written by the watcher as the new baseline (so a manual global change
   becomes the value restored when leaving).

No Session events are written for these two preferences.

## Client half — `client.js`

Registers:

- `settings.section` — the **Workspace settings** page (id `workspace-settings`, order 25).
- `shell.overlay` — a frame-level layer that recognizes the workspace row
  `data-row-key="workspace:<id>"`, intercepts that row's `...` trigger and right-click, and
  renders the complete menu with the official `Menu` primitive. Rename/Delete call the public
  `ctx.workspaces` service.
- A local `<style>` plus dictionaries; all controls use host primitives
  (`Menu`, `Modal`, `Button`, `Input`) and theme tokens. The dialog rows/selector copy the
  host permission-settings row geometry, so the plugin follows the official look in both
  themes.

DSH 0.2.1 has no extension slot for workspace menu items, which is why the overlay
interception exists. If a future host exposes a native slot, the client half should register
the extra menu row there instead.

## Loader patch

`cordis.patch.yml` inserts the `workspace-settings` Host row with an empty config; the client
manifest lives under `dsh.client` in `package.json`.
