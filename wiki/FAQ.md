# FAQ

**English** | [简体中文](常见问题)

## I installed the plugin but see no entry

Reload the DSH window completely (not just switch panels). The client bundle enters the boot
graph on reload. Then check:

- a workspace row's `...` menu contains **Workspace settings**;
- the Settings navigation contains **Workspace settings**;
- the browser console has no `[workspace-settings] cannot mount` or `host primitives missing`
  messages.

If the console reports missing host primitives, the DSH build predates the required
`Menu`/`Modal`/`Button`/`Input` version; upgrade DSH.

## Why did the workspace `...` menu change?

DSH 0.2.1 has no extension slot for workspace menu items. To add one item to that exact menu,
the plugin recognizes the documented workspace row, intercepts its menu trigger, and renders
the menu with the **official** `Menu` primitive, adding the Workspace settings row while
keeping Rename / Delete (which call the public workspace service). See
[Architecture](Architecture).

## Why is there no Save button?

Workspace settings follow General Settings behavior: each selection is written immediately.
Closing the dialog keeps the accepted changes. Only failures are displayed. See
[Usage](Usage).

## The mode / permission preset I set was not applied to a new session

Check that:

- the session belongs to that workspace (the workspace row you configured);
- the session was blank when created — already-started sessions are never rewritten;
- the preset still exists and is not broken; broken presets are shown with a warning in the
  picker and are not applied;
- you did not explicitly pick another mode for that blank session. Explicit in-session choices
  are preserved; the plugin only replaces values that still look like the global default or a
  previous workspace-applied value.

## The model reverted to my global model in an existing session

Model and effort are applied to the **first** model request of a new session only. From the
second request onward the session's own model selector is authoritative. This is intentional:
workspace defaults must not lock the model for the whole conversation.

## Switching workspaces changes the values in General Settings

Expected. Work details and collapse timing are official global Chat preferences without a
per-session API. The plugin switches them while a session from the configured workspace is
active, and restores your global baseline when you leave. Changing the global value in General
Settings updates the baseline. See [Work details](Usage#the-six-defaults) and
[Architecture](Architecture#chat-presentation-watcher).

## The dropdown shows `standard` / `workspace-write` instead of a product label

Built-in presets and permissions are mapped to the host's product labels (Standard mode /
Workspace Write / …). A **custom** preset that publishes its own name is shown with that name;
custom permission presets configured with a machine-looking name are title-cased. If you see a
raw key for a built-in preset, the host catalog probably did not publish its roster — reload
the window and check the console.

## How do I reset one workspace?

Open its editor and set each field back to **Follow global default**. When all fields follow
global, the stored record is removed.

## How do I reset everything?

Stop DSH and delete `$DSH_HOME/storages/workspace-settings/settings.json`, or delete individual
workspace entries. To reset the Chat presentation baseline, clear the browser
`localStorage` key `dsh-workspace-settings:chat-baseline:v1`.

## What happens if I rename or move a workspace?

Renaming keeps the settings (the store is keyed by path, not title). Moving the directory
creates a new record under the new path; the old record remains until removed.

## Does it work in a CLI/headless profile?

The Host half can load, but the settings UI is client-only, so CLI compositions get no visible
surface. Use a Web UI profile.

## Does the plugin send anything over the network?

No. It stores one local JSON file, uses browser `localStorage` for the Chat baseline, and adds
no telemetry.
