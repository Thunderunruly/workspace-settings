# DSH Workspace Settings

[![npm version](https://img.shields.io/npm/v/dsh-workspace-settings?color=cb3837&logo=npm)](https://www.npmjs.com/package/dsh-workspace-settings)
[![npm downloads](https://img.shields.io/npm/dm/dsh-workspace-settings)](https://www.npmjs.com/package/dsh-workspace-settings)
[![GitHub stars](https://img.shields.io/github/stars/Thunderunruly/workspace-settings?style=social)](https://github.com/Thunderunruly/workspace-settings)
[![MIT license](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.2.1--rc.3-4a6cff)](https://github.com/deepseek-ai/deepseek-harness)

**English** | [简体中文](README.zh-CN.md)

A plugin for **DeepSeek Harness (DSH)** that saves session defaults **per workspace**. Each
workspace can carry its own agent mode, permission preset, model, reasoning effort — and,
for the Chat transcript, its own work-details level and collapse timing. New sessions in a
workspace start from that workspace's values instead of one global setting, while in-session
choices keep winning.

Built on the official DSH UI primitives: the Workspace Settings dialog uses the host
`Modal` / `Menu` / `Button` / `Input` components and the same row geometry as the built-in
General Settings page. Changes apply immediately; there is no Save/Cancel step.

## Table of contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Work-details preferences](#work-details-preferences)
- [How it works](#how-it-works)
- [Privacy](#privacy)
- [Development](#development)
- [Project structure](#project-structure)
- [Limitations](#limitations)
- [License](#license)

## Features

- **Workspace menu entry** — each workspace row's `...` menu gains a **Workspace settings**
  item above Rename / Delete. Right-clicking the workspace row opens the same official menu.
- **Settings page** — Settings → **Workspace settings** lists every workspace with a summary
  of its overrides and an Edit action.
- **Six per-workspace defaults**:

  | Setting | Values |
  | --- | --- |
  | Mode | any installed Agent preset, or the global default |
  | Permissions | any configured permission preset, or the global default |
  | Model | any routable model, or the global default |
  | Effort | reasoning effort of the chosen model |
  | Work details | Compact / Standard / Detailed / Verbose, or the global value |
  | Collapse timing | On completion / On next message, or the global value |

- **Automatic inheritance** — a new or reused blank session in the workspace receives the
  stored mode, permission preset and model. In-session overrides still win: the plugin only
  replaces values that still look global-default- or workspace-derived.
- **Official labels** — built-in presets and permissions render as **Standard mode / PTC mode
  / Minimal mode / Creator mode** and **Read Only / Workspace Write / Full access / Auto
  review**, never as machine keys such as `standard` or `workspace-write`.
- **Immediate save** — every selector writes on change, exactly like General Settings;
  closing the dialog keeps what you picked and only failures are surfaced.
- **Native chrome** — the menu, modal, selectors and settings rows reuse the host primitives
  and theme tokens, so light/dark switching and future theme changes apply automatically.
- **Local and quiet** — settings live in one JSON file under the DSH home; no telemetry and
  no network requests.

## Requirements

- **DeepSeek Harness (DSH)** with the Web UI and plugin support. Developed and verified
  against DSH `0.2.1-rc.3` (desktop profile).
- The plugin is ESM (`"type": "module"`) and loads `react` plus the host UI primitives from
  the running DSH client; no runtime dependencies are bundled.
- A Chromium-based DSH Web UI is required (the plugin does not render in CLI-only
  compositions).
- `node` is only needed for the offline checks.

## Installation

### From npm (recommended)

```sh
dsh plugin --profile <profile> add dsh-workspace-settings
```

Install a pinned version or upgrade later:

```sh
dsh plugin --profile <profile> add dsh-workspace-settings@1.0.1
dsh plugin --profile <profile> add dsh-workspace-settings@latest
```

Reload the DSH window once after installation so the client bundle enters the boot graph.
After that, client-only changes hot-reload in place.

### From a local checkout (development)

```sh
git clone https://github.com/Thunderunruly/workspace-settings.git
```

Then install the folder into your profile:

- **Desktop app**: open **Settings → Plugins → Add plugin → local bundle**, and select the
  cloned folder. The desktop profile is managed by the Electron app, so install through the
  in-app plugin manager.
- **CLI profile**: add the folder as a linked package and let the bundle patch mount it:

  ```sh
  dsh plugin --profile web add file:/absolute/path/to/workspace-settings
  ```

### Verify

1. The workspace row's `...` menu now contains **Workspace settings** above Rename/Delete.
2. The sidebar Settings entry gains a **Workspace settings** page.
3. Opening it shows one row per workspace, with Edit and the global-default summary.

### Upgrade / uninstall

- Upgrade from npm: run the `@latest` install command above and reload the window.
- Upgrade a local checkout: `git pull`, reinstall/refresh through the plugin manager and
  reload the window.
- Uninstall: remove the bundle through the plugin manager (or remove the dependency from the
  profile). The stored workspace values in
  `$DSH_HOME/storages/workspace-settings/settings.json` are kept until you delete the file.

## Usage

### Open the settings

1. Hover a workspace row in the sidebar, click its `...` button, choose **Workspace
   settings**; or right-click the row and choose it from the same menu.
2. Or open **Settings → Workspace settings** and click **Edit** on any workspace.

### What happens on save

There is no Save button: each change is persisted immediately. The dialog only reports
failures. Closing it through `×`, Escape or the backdrop keeps the last accepted changes.

When a session is created (or a blank session is reused) in that workspace, the Host applies
the stored defaults:

- **Mode** via the official agent-preset switch, only while the session is still blank.
- **Permissions** via the official permission-preset setter; the standard Session events are
  recorded.
- **Model + effort** as a first-request override; from the second model request on, the
  session's own model selector is authoritative again.
- **Work details / collapse timing** through the official Chat presentation preference while
  a session from that workspace is active; the global value is restored when you leave.

Sessions that already started a turn are never rewritten. Subagent and forked sessions are
skipped. Explicit user choices in a blank session are respected by comparing the current
value with the global default and the last workspace-applied value.

## Configuration

There is no profile configuration field: everything lives in the plugin's own store.

| Item | Location |
| --- | --- |
| Workspace defaults | `$DSH_HOME/storages/workspace-settings/settings.json` |
| Chat baseline for work details / collapse timing | browser `localStorage` key `dsh-workspace-settings:chat-baseline:v1` |
| Last-applied per-session cache | same `settings.json`, `sessions` section (derived cache, safe to lose) |

Workspaces are keyed by their canonical path, so renaming a workspace keeps its values.
Setting every dimension back to **Follow global default** removes the workspace record.

## Work-details preferences

DSH 0.2.1 stores **work details** and **collapse timing** as global Chat preferences
(`ui-chat`), not per session. The plugin therefore treats its workspace value as a
presentation override:

1. When the active session belongs to a workspace with a stored value, the plugin switches
   the official Chat preference to that value.
2. When you move to a session in another workspace (or leave the workspace), it restores
   your own global choice, captured as a baseline.
3. Changing the global value in General Settings updates that baseline; the workspace value
   is re-applied the next time a session from that workspace becomes active.

While a workspace override is active, General Settings shows the workspace value for those
two rows. This is expected. No Session events are written for presentation preferences.

## How it works

Two halves ship in one bundle:

- **`index.js`** — host half. Owns the JSON store, exposes two authenticated POST routes
  (`/api/workspace-settings/catalog`, `/api/workspace-settings/save`), and listens to
  `agent/created` to apply workspace defaults to blank ordinary sessions. It uses the public
  `workspaceRegistry`, `agentPresets`, `permissionPresets`, `sessionController` and
  `agentDefaultModel` services and the Session projections for blankness/preset/pending-model
  state.
- **`client.js`** — client half. Registers a `settings.section` page and a `shell.overlay`
  layer. The overlay recognizes the documented `data-row-key="workspace:<id>"` row,
  intercepts its menu trigger (and right-click), and renders the menu with the official
  `Menu` primitive; rename/delete call the public `ctx.workspaces` service. The settings
  dialog uses official `Modal` / `Button` / `Input` and the same row/selector geometry as the
  built-in permission settings row. A small watcher follows the active session and applies
  the Chat presentation preferences.
- **`cordis.patch.yml`** — bundle patch that inserts the plugin row into the profile.

The model override is installed as Agent-scoped `system-prompt/assemble` and
`agent/request` listeners on the first request, so it never mutates the global default model
and stops overriding once the session records its own request header.

## Privacy

- The plugin makes no network requests; all defaults are local files.
- No credentials, session contents or personal data are collected.
- The plugin adds no telemetry.
- The Chat preference switching only rewrites the same `ui-chat` profile values General
  Settings would write, and restores your global baseline when leaving.

## Development

Offline checks, no browser required:

```powershell
node --check index.js
node --check client.js
node --test test/host.check.mjs
```

There is no build step: `client.js` is loaded as a single-file module bundle and obtains
React / the UI primitives from the running host module table. The tests replace Cordis
services with small fakes and cover validation, storage, the catalog/save routes, preset /
permission inheritance and the first-request model override.

To iterate on a linked installation, edit the files in this folder and reload the DSH
window; Host-side changes need the plugin row to be re-enabled, client-only changes
hot-reload.

## Project structure

```
client.js           # browser half: Settings page, workspace menu overlay, Chat policy watcher
index.js            # host half: JSON store, web routes, Session inheritance
cordis.patch.yml    # bundle patch inserting the plugin row
package.json        # bundle manifest (dsh.bundle / dsh.client)
locale/             # plugin title/description dictionaries (zh, en)
icon.svg            # plugin artwork
test/host.check.mjs # offline host checks
wiki/               # sources for the GitHub wiki pages (not loaded by DSH)
LICENSE             # MIT
```

## Limitations

- DSH 0.2.1 has no workspace-menu extension slot. The plugin therefore intercepts the
  workspace row's `...` menu and re-renders it with the **official** `Menu` primitive. If a
  future DSH release exposes a native slot, this should move there.
- Model/effort defaults only affect the first model request of a new session; that keeps the
  in-session model selector fully authoritative afterwards.
- Work details / collapse timing are presentation preferences without a per-session API, so
  they are applied by switching the official global preference while the workspace session
  is active (see above).
- Other General Settings (appearance, language, link opening, performance usage, privacy
  options) remain global.
- This is a local/experimental plugin, not an official DeepSeek product.

## License

[MIT](LICENSE) © Thunderunruly
