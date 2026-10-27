# DSH Workspace Settings Wiki

**English** | [简体中文](首页)

DSH Workspace Settings is a workspace-scoped settings plugin for **DeepSeek Harness (DSH)**.
Each workspace can save its own Agent mode, permission preset, model, reasoning effort, Chat
work-details level and collapse timing. Sessions created in a workspace start from its
values, while choices made inside a session keep priority.

- Repository: [Thunderunruly/workspace-settings](https://github.com/Thunderunruly/workspace-settings)
- Issues: [github.com/Thunderunruly/workspace-settings/issues](https://github.com/Thunderunruly/workspace-settings/issues)
- Releases: [Releases](https://github.com/Thunderunruly/workspace-settings/releases)
- 中文文档：[简体中文 Wiki](首页) ·
  [README](https://github.com/Thunderunruly/workspace-settings/blob/main/README.zh-CN.md)

## Quick start

```sh
git clone https://github.com/Thunderunruly/workspace-settings.git
```

Install the cloned folder through **Settings → Plugins → Add plugin → local bundle** in the
desktop app (or `dsh plugin --profile web add file:/path/to/workspace-settings` for a CLI
profile), then reload the DSH window once. Hover a workspace row, click `...` and choose
**Workspace settings**. See [Installation](Installation) for upgrade and uninstall notes.

## Documentation

| Page | Content |
| --- | --- |
| [Installation](Installation) | Requirements, local install, verify, upgrade, uninstall |
| [Usage](Usage) | Entry points, the six defaults, inheritance and in-session overrides |
| [Configuration](Configuration) | Storage locations, inherit-global, reset, profiles |
| [Architecture](Architecture) | Host routes, session inheritance, client slots, Chat policy watcher |
| [Data Model](Data-Model) | `settings.json` schema, workspace keys, session cache, Chat baseline |
| [Development](Development) | Offline checks, linked debugging, release process |
| [FAQ](FAQ) | Troubleshooting and common questions |
| [Releases](Releases) | Per-version changes and upgrade notes |
| [简体中文首页](首页) | Chinese documentation starting point |

## Features

- **Workspace menu entry** — `...` on each workspace row gains **Workspace settings** above
  Rename/Delete; right-click opens the same official menu.
- **Workspace settings page** — Settings → Workspace settings lists every workspace with its
  overrides and an Edit action.
- **Six defaults per workspace** — mode, permissions, model, effort, work details, collapse
  timing. Every dimension can follow the global value instead.
- **Applies to new sessions** — new or reused blank sessions receive the workspace defaults;
  explicit in-session choices win.
- **Official UI** — official `Menu` / `Modal` / `Button` / `Input` and the same row geometry
  as General Settings; changes apply immediately with no Save/Cancel.
- **Local only** — one JSON file under the DSH home; no telemetry and no network calls.
