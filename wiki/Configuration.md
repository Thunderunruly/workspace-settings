# Configuration

**English** | [简体中文](配置)

The plugin has no profile `cordis.patch.yml` configuration fields. Everything is stored in
its own local state.

## Storage locations

| Item | Location |
| --- | --- |
| Workspace defaults | `$DSH_HOME/storages/workspace-settings/settings.json` |
| Chat presentation baseline | browser `localStorage`, key `dsh-workspace-settings:chat-baseline:v1` |
| Last-applied session cache | `settings.json`, `sessions` section (derived; safe to lose) |

`$DSH_HOME` defaults to `~/.dsh` (`C:\Users\<user>\.dsh` on Windows). The JSON file is
created on the first accepted change; deleting it clears every workspace default.

## Follow global vs. override

Every field has an explicit “follow the global default” value. Selecting it removes that
override from the stored record. When all six fields follow global, the workspace record is
deleted entirely.

The global values themselves are still owned by the official DSH settings:

- Mode default: Settings → Agent presets / new-session preset selector.
- Permission default: Settings → General → Permission.
- Model default: the model selector / Models settings.
- Work details and collapse timing: Settings → General.

## Workspace keys

Records are keyed by the workspace's canonical path, not its display title or workspace id.
Therefore:

- Renaming a workspace keeps its settings.
- Moving a workspace to a different directory creates a new record; the old one stays under
  the old path until removed.
- Two workspace entries pointing at the same path share one record.

Paths are normalized (separator and trailing-slash insensitive, case-insensitive on Windows)
before matching a new session's `cwd`.

## Manual editing

The JSON file is plain and can be edited while DSH is stopped:

```json
{
  "version": 1,
  "workspaces": {
    "c:/projects/demo": {
      "path": "C:\\Projects\\demo",
      "workspaceId": "workspace-...",
      "preset": "creative",
      "permission": "workspace-write",
      "model": { "provider": "deepseek-official", "model": "deepseek-flash", "reasoningEffort": "max" },
      "transcriptView": "standard",
      "collapseTiming": "completion",
      "updatedAt": "2026-10-27T00:00:00.000Z"
    }
  },
  "sessions": {}
}
```

Invalid records are dropped on load; unknown preset/permission/model values are masked in the
editor until the live catalogs provide them again.

## Chat presentation baseline

Work details and collapse timing are official global Chat preferences. The plugin records the
value that was active before it first applied a workspace override in the browser
`localStorage` key above. To reset the plugin's baseline, clear that key. See
[Architecture](Architecture#chat-presentation-watcher) for the full switching rules.

## Profiles

The store follows `$DSH_HOME`, so different DSH homes/profiles have independent workspace
settings. The browser baseline is per browser origin/profile via `localStorage`.
