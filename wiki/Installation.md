# Installation

**English** | [简体中文](安装)

## Requirements

- **DeepSeek Harness (DSH)** with the Web UI and plugin support. Developed and verified against
  DSH `0.2.1-rc.3`, desktop profile.
- A Chromium-based DSH Web UI. The plugin registers client slots, so a CLI-only composition
  will not render it.
- The bundle is ESM (`"type": "module"`). At runtime it loads `react` and
  `@deepseek-ai/dsh-client-ui-primitives` from the host module table; nothing is bundled.
- `node` is only needed for the offline checks.

## From npm (recommended)

```sh
dsh plugin --profile <profile> add dsh-workspace-settings
```

Install a pinned version or upgrade later:

```sh
dsh plugin --profile <profile> add dsh-workspace-settings@1.0.1
dsh plugin --profile <profile> add dsh-workspace-settings@latest
```

Then reload the DSH window once so the client bundle enters the boot graph. Later client-only
changes hot-reload in place.

## From a local checkout (development)

```sh
git clone https://github.com/Thunderunruly/workspace-settings.git
```

### Desktop app

Open **Settings → Plugins → Add plugin → local bundle** and select the cloned folder. The
desktop profile is managed by the Electron app, so install through the in-app plugin manager
rather than editing `cordis.patch.yml` by hand.

### CLI profile

Add the folder as a linked package and let the bundle patch insert the plugin row:

```sh
dsh plugin --profile web add file:/absolute/path/to/workspace-settings
```

Then reload the DSH window once so the client bundle enters the boot graph. Later client-only
changes hot-reload in place.

## Verify the installation

1. Hover a workspace row in the sidebar: its `...` menu contains **Workspace settings** above
   Rename / Delete.
2. Settings gains a **Workspace settings** page in the sidebar navigation.
3. The page lists every workspace with an Edit button and a summary of its overrides.

See [Usage](Usage) for the first configuration.

## Upgrade

- **npm**: run the `@latest` install command above and reload the window.
- **Local checkout**: `git pull` in the clone, reinstall / refresh the bundle through the
  plugin manager, and reload the window. Host-side changes require the plugin row to be
  re-enabled.

## Uninstall

Remove the bundle in the plugin manager, or remove the dependency from the profile.
Client slots, styles and the settings page disappear on reload. The stored values in
`$DSH_HOME/storages/workspace-settings/settings.json` are kept until you delete that file.

## Troubleshooting

If the entry does not appear after install, reload the window completely (not just switch
panels) and check the browser console for `[workspace-settings]` messages. See [FAQ](FAQ).
