# Releases

**English** | [简体中文](版本记录)

## Versioning

Semantic versioning. The plugin targets DSH `0.2.1-rc.3` and declares
`engines.dsh = ">=0.2.1-rc.3 <0.3.0-0"`. Breaking DSH integrations may require a matching
plugin release even when the plugin's own behavior is unchanged.

## v1.0.1 — 2026-10-29

First npm release.

### Fixes

- The workspace mode is re-asserted when the built-in new-session flow reuses a live blank
  Session and resets its preset to the requested/default one.
- Any activation of a blank Session now re-applies the stored defaults through the new
  `POST /api/workspace-settings/apply` route, covering live reuse and restored blanks.

### Packaging

- Published on npm as [`dsh-workspace-settings`](https://www.npmjs.com/package/dsh-workspace-settings).
- Added a 180×180 storefront icon for plugin listings.
- Install with `dsh plugin --profile <profile> add dsh-workspace-settings` and reload the
  window once.

## v1.0.0 — 2026-10-27

First public release.

### Features

- Workspace-scoped session defaults: Agent mode, permission preset, model, reasoning effort.
- Workspace-scoped Chat presentation: work details and collapse timing.
- Entry in each workspace row's official `...` menu (and right-click) plus a Settings page.
- Official UI primitives (`Menu`, `Modal`, `Button`, `Input`) and settings-row geometry;
  changes apply immediately, no Save/Cancel.
- Product labels for built-in presets and permissions (never raw machine keys); custom
  presets keep their own names.
- Blank/new session inheritance with explicit in-session choices preserved.
- First-request-only model override, so the session model selector stays authoritative.
- Local JSON store with atomic writes; no network and no telemetry.
- Offline host checks (`node --test test/host.check.mjs`).

### Installation

This release is installed from the repository directory:

```sh
git clone https://github.com/Thunderunruly/workspace-settings.git
```

Then install the folder through the desktop plugin manager (local bundle) or a CLI profile
(`dsh plugin --profile web add file:/path/to/workspace-settings`), and reload the window once.
See [Installation](Installation).

### Known limitations

- No native workspace-menu slot in DSH 0.2.1; the menu is re-rendered with the official
  `Menu` primitive.
- Model/effort applies to the first model request only.
- Work details / collapse timing are switched through the official global Chat preference
  while a workspace session is active (no per-session API).
- Not an official DeepSeek product.

## Upgrade notes

No migrations are required at this time. The store is normalized on load; unknown or removed
preset/permission/model values are masked until they become available again.
