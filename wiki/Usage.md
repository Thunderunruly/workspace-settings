# Usage

**English** | [简体中文](使用指南)

## Open the settings

Two entry points lead to the same editor:

1. **Workspace row menu** — hover a workspace row in the sidebar, click `...`, choose
   **Workspace settings**. Right-clicking the row opens the same official menu.
2. **Settings page** — Settings → **Workspace settings** → **Edit** on any workspace.

The dialog uses the official host row geometry: title and description on the left, a filled
selector with a chevron on the right. Changes are written immediately; there is no Save or
Cancel button. Closing the dialog with `×`, Escape or the backdrop keeps accepted changes.
Only failures are shown.

## The six defaults

| Field | Values | Effect |
| --- | --- | --- |
| **Mode** | any installed Agent preset, or the global default | Agent preset used by the new session |
| **Permissions** | any configured permission preset, or the global default | Sandbox + approval bundle recorded on the new session |
| **Model** | any routable model, or the global default | Model used by the session's first request |
| **Effort** | reasoning efforts of the selected model | Effort for that first request; disabled until a model is chosen |
| **Work details** | Compact / Standard / Detailed / Verbose, or the global value | Chat process-detail level while a session from this workspace is active |
| **Collapse timing** | On completion / On next message, or the global value | When completed work details fold away |

“Follow global default” shows the current global value in parentheses so you can see what it
resolves to without opening General Settings.

## Inheritance rules

When a session is created — or an existing blank session is reused — in the workspace:

- **Mode** is applied only while the session has not started a turn, through the official
  agent-preset switch.
- **Permissions** are applied through the official permission-preset setter and become normal
  Session events.
- **Model + effort** are installed as a first-request override. From the session's second
  model request onward, its own model selector wins again.
- **Work details / collapse timing** follow the workspace while a session from that workspace
  is active. The plugin restores your global baseline when you move to another workspace.

Sessions that have already started a turn are never rewritten. Subagent sessions and forks
are skipped. Explicit choices made inside a blank session (mode, permissions or model) are
preserved: the plugin only replaces values that still equal the global default or the value it
previously applied from the workspace.

## Typical workflow

1. Open the workspace row menu → **Workspace settings**.
2. Pick the mode, permissions, model and effort you want for that project.
3. Pick the work-details level and collapse timing if the project should read differently
   from other projects.
4. Close the dialog. Create a new session in that workspace: the session header, composer and
   Chat now reflect the workspace values.
5. Need a one-off change? Use the normal in-session selectors; they are not overwritten.

## What this plugin does not change

- It does not rewrite an existing conversation.
- It does not create Session events for work details / collapse timing.
- It does not replace the per-session selectors; those remain the final authority inside a
  session.
- Settings that have no per-workspace concept (appearance, language, link opening,
  performance/usage, privacy options) stay global.
