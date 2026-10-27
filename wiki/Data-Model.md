# Data Model

**English** | [简体中文](数据模型)

## Workspace store

`$DSH_HOME/storages/workspace-settings/settings.json`:

```json
{
  "version": 1,
  "workspaces": {
    "<normalized-path>": {
      "path": "C:\\Projects\\demo",
      "workspaceId": "workspace-…",
      "preset": "creative",
      "permission": "workspace-write",
      "model": {
        "provider": "deepseek-official",
        "model": "deepseek-flash",
        "reasoningEffort": "max"
      },
      "transcriptView": "standard",
      "collapseTiming": "completion",
      "updatedAt": "2026-10-27T00:00:00.000Z"
    }
  },
  "sessions": {
    "session-…": { "preset": "creative", "permission": "workspace-write", "at": 1761523200000 }
  }
}
```

### Record fields

| Field | Type | Meaning |
| --- | --- | --- |
| `path` | string | Original workspace path as shown in the UI |
| `workspaceId` | string? | Informational; matching uses the path |
| `preset` | string \| null | Agent preset id; `null` = follow global |
| `permission` | string \| null | Permission preset key; `null` = follow global |
| `model` | object \| null | `{ provider, model, reasoningEffort? }`; `null` = follow global |
| `transcriptView` | `compact` \| `standard` \| `detailed` \| `verbose` \| null | Work details; `null` = global |
| `collapseTiming` | `completion` \| `next-input` \| null | Collapse point; `null` = global |
| `updatedAt` | ISO string | Last accepted write |

Every dimension is nullable and independent. A record with every field `null` is deleted.

### Keys and normalization

The map key is the normalized path:

- `/` and `\` are treated the same, trailing separators are stripped;
- Windows paths are lower-cased before comparison;
- matching a session uses its stored `cwd`.

Renaming a workspace keeps the key. Moving the directory produces a new key; the old record
is retained until removed. Two workspaces with the same path share a record.

### Sessions cache

`lastApplied` values per session id let the plugin distinguish an explicit in-session choice
from a value it applied itself. Entries older than seven days and the oldest beyond 800
entries are pruned. Losing this section only affects the conservativeness of later
replacements, never correctness of Session state.

## Chat baseline

`localStorage["dsh-workspace-settings:chat-baseline:v1"]`:

```json
{ "transcriptView": "standard", "collapseTiming": "completion" }
```

This is the user's own global Chat presentation value, captured before the first workspace
override. It is browser-profile scoped; clearing the key re-captures the current value on the
next load.

## Validation

- `version` mismatches are tolerated by normalizing fields; unknown shape is replaced with an
  empty store.
- Invalid/unknown preset, permission, model or effort values are dropped from the stored
  record when the live catalogs no longer provide them.
- All writes go through one serialized chain and an atomic temp-file rename; a failed write
  keeps the previous file.
