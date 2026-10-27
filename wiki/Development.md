# Development

**English** | [简体中文](开发与测试)

## Layout

```
client.js           # client half: Settings page, workspace menu overlay, Chat policy watcher
index.js            # host half: JSON store, web routes, Session inheritance
cordis.patch.yml    # bundle patch inserting the workspace-settings Host row
package.json        # bundle manifest (dsh.bundle / dsh.client, locale/icon exports)
locale/             # plugin title/description dictionaries (zh, en)
icon.svg            # plugin artwork
test/host.check.mjs # offline host checks (node:test)
wiki/               # sources for the GitHub wiki pages (not loaded by DSH)
```

## Offline checks

No browser or DSH instance is required:

```powershell
node --check index.js
node --check client.js
node --test test/host.check.mjs
```

`test/host.check.mjs` replaces Cordis services and the web server with small fakes and covers:

- path normalization and stored-record normalization;
- request validation against the live preset/permission/model catalog;
- catalog/save routes and the JSON store;
- preset and permission inheritance on `agent/created`;
- the first-request model override and its effort merge.

There is no build step: `client.js` is a hand-written single-file module bundle. React and the
UI primitives come from the running host module table; `package.json` declares
`@deepseek-ai/dsh-client-ui-primitives` under `dsh.client.external`.

## Local iteration

1. Install the checkout as a linked bundle (see [Installation](Installation)).
2. Edit client files; reload the DSH window after the first install.
3. Host changes need the plugin row to be disabled/re-enabled (or a window restart).
4. Use the Cordis inspection tools to confirm the live slots:
   - `cordis_inspect_query` client `Slots.listSubTree` root `settings.section` should list
     `workspace-settings`;
   - root `shell.overlay` should list `workspace-settings-overlay`.
5. Browser console messages from the plugin start with `[workspace-settings]`.

## Design rules

- Use the host's official primitives (`Menu`, `Modal`, `Button`, `Input`) and `--dsw-alias-*`
  theme tokens; do not copy the app shell or invent parallel chrome.
- Row/selector geometry mirrors the official permission-settings row; keep it that way when
  touching styles.
- New UI text goes through the client locale dictionaries (`NS = 'workspace-settings'`) and
  `locale/zh.json` / `locale/en.json` for plugin metadata.
- Store fields must remain nullable and additive; bump `version` and add a normalization step
  if the schema changes.

## Release process

1. Update `package.json` `version`.
2. Update [Releases](Releases) and the README feature list when behavior changes.
3. Commit and tag: `git tag v1.0.0 && git push --tags`.
4. Create a GitHub release from the tag with the same notes.
5. npm publication is optional and not done yet. If you publish, remove nothing: the package
   has no runtime dependencies and installs as a normal DSH plugin bundle.

Compatibility target: DSH `0.2.1-rc.3`; the manifest declares
`engines.dsh = ">=0.2.1-rc.3 <0.3.0-0"`.
