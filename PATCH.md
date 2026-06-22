# Patch Summary: Restore Closed Workspace Tabs

Branch: `split/restore-closed-tabs`

Base: `origin/main`

Primary commit before this writeup: `5f3754351 feat(app): restore closed workspace tabs`

## Purpose

This branch adds a recently closed workspace tab stack and UI/actions for restoring closed tabs. It allows users to reopen the last closed tab or pick a recently closed tab from the workspace tab row.

## User-Facing Changes

- Adds a recently closed tab menu to the workspace tab row.
- Adds a restore-last-closed-tab action.
- Adds keyboard shortcut support for restoring the last closed tab.
- Preserves enough tab metadata to reopen agent, terminal, file, browser, setup, and draft targets when they are restorable.
- Restores the tab into its previous pane when possible.
- Falls back to the current/focused layout when the original pane no longer exists.
- Removes restored entries from the recently closed list.
- Keeps non-restorable tabs out of the recently closed list.

## Workspace Layout Store Changes

### `packages/app/src/stores/workspace-layout-store.ts`

The persistent workspace layout store now tracks recently closed tabs.

#### New State

Adds:

```ts
recentlyClosedTabsByWorkspace: Record<string, RecentlyClosedWorkspaceTab[]>;
```

Each workspace key owns its own recently closed list.

#### `RecentlyClosedWorkspaceTab`

Represents a restorable closed tab:

- `key`: unique entry key used by restore actions and menu items.
- `tab`: normalized `WorkspaceTab` snapshot.
- `paneId`: pane the tab was closed from, if known.
- `parentTabId`: parent tab relation, if any.
- `closedAt`: timestamp used for sorting and menu display.

#### `trimNonEmpty(value)`

Normalizes optional strings:

- Returns `null` for non-strings.
- Trims strings.
- Returns `null` when the trimmed string is empty.
- Otherwise returns the trimmed string.

This is used across workspace keys, tab ids, pane ids, and persisted entry fields.

#### `isRestorableClosedTab(tab)`

Filters which tabs are allowed into the recently closed queue.

Implementation details:

- Accepts tabs that have a valid target.
- Excludes tab shapes that cannot safely be recreated.
- Prevents empty or malformed persisted tabs from entering the list.

#### `normalizeRecentlyClosedTab(value)`

Parses a persisted recently closed entry.

Implementation details:

- Rejects non-record values.
- Normalizes the nested tab through existing workspace-tab normalization.
- Uses a numeric `closedAt` when present, otherwise `Date.now()`.
- Uses a non-empty persisted `key` when available.
- Otherwise builds a fallback key from `closedAt` and `tab.tabId`.
- Normalizes `paneId` and `parentTabId` with `trimNonEmpty`.
- Returns `null` for entries whose tab is not restorable.

#### `normalizeRecentlyClosedTabs(value)`

Parses and limits a persisted recently closed list.

Implementation details:

- Returns an empty list for non-arrays.
- Maps each entry through `normalizeRecentlyClosedTab`.
- Drops null results.
- Sorts newest first by `closedAt`.
- Applies the store's list size cap.

This keeps persisted state compatible with older or malformed local storage.

#### `enqueueRecentlyClosedTab({ tab, paneId, parentTabId, closedAt, entries })`

Adds a newly closed tab to a workspace list.

Implementation details:

- Builds a key from `closedAt` and `tab.tabId`.
- Removes any existing entry for the same tab id or same key.
- Prepends the new entry.
- Trims the resulting list to the maximum recent count.

This keeps the newest close at the top and avoids duplicate menu entries for the same tab.

#### `removeRecentlyClosedEntry(entries, entryKey)`

Removes a restored or otherwise consumed entry from a recent list.

Implementation details:

- Returns a filtered list excluding entries whose `key` matches `entryKey`.
- Handles missing or empty lists by returning an empty list.

#### `restoreTabInLayout(...)`

Adds layout-level restoration.

Implementation details:

- Normalizes the stored tab.
- If an equivalent tab target is already open, focuses/updates that existing tab instead of duplicating it.
- If the requested pane still exists, inserts the restored tab into that pane.
- Otherwise inserts the restored tab into the currently focused pane/default layout path.
- Restores parent-tab mapping when `parentTabId` is provided.
- Returns the new layout and restored/focused tab id.

This keeps restore behavior idempotent when the user already reopened the same target manually.

#### `closeTab(workspaceKey, tabId)`

The existing close action now records restorable tabs.

Implementation details:

- Finds the closing tab and source pane before removing it.
- Calls the existing layout close operation.
- When the closed tab is restorable, enqueues it under the normalized workspace key.
- Stores source pane id and parent tab relation so restore can reconstruct context.
- Keeps existing layout focus behavior from the close operation.

#### `restoreClosedTab(workspaceKey, entryKey)`

Restores a specific recently closed entry.

Implementation details:

- Normalizes workspace key and entry key.
- Looks up the matching recent entry.
- Calls `restoreTabInLayout` with the stored tab, pane id, and parent tab id.
- Removes the entry from `recentlyClosedTabsByWorkspace` when restoration succeeds.
- Writes the updated layout to `layoutByWorkspace`.
- Returns the restored tab id, or `null` when nothing was restored.

#### `restoreLastClosedTab(workspaceKey)`

Restores the newest recently closed entry.

Implementation details:

- Reads the normalized workspace recent list.
- Takes the first entry, because lists are stored newest-first.
- Delegates to `restoreClosedTab`.
- Returns the restored tab id or `null`.

#### Workspace Cleanup And Persistence

Workspace cleanup now removes recent entries for deleted/reset workspaces.

Persistence now stores:

- `layoutByWorkspace`
- split sizes
- pinned/hidden agent sets
- focus restoration
- `recentlyClosedTabsByWorkspace`

On hydration, recent entries are normalized through `normalizeRecentlyClosedTabs`.

## Workspace Layout Actions

### `packages/app/src/stores/workspace-layout-actions.ts`

Adds action-level wiring for restore operations.

Important behavior:

- Exposes restore methods from the store through the workspace action layer.
- Keeps the restored tab focused by relying on the layout store's returned tab id and focus behavior.
- Preserves existing tab close/split/move behavior.

## Workspace Tab Row UI

### `packages/app/src/screens/workspace/workspace-desktop-tabs-row.tsx`

Adds the recently closed UI in the desktop tab row.

#### `WorkspaceInlineAddTabButton`

The inline add button now receives `recentlyClosedTabs` and restore callbacks.

Implementation details:

- Keeps the normal add-new-tab affordance.
- Adds a context/dropdown menu section for recently closed tabs.
- Shows an empty disabled entry when there are no recent tabs.
- Renders each recent entry with `RecentlyClosedTabMenuItem`.

#### `RecentlyClosedTabMenuItem`

Renders a restorable recent tab entry.

Implementation details:

- Resolves the tab presentation using the same workspace tab presentation machinery as normal tabs.
- Shows a readable label for the restored target.
- Uses the recent entry key in the test id.
- Calls the restore callback with the entry key.

#### `WorkspaceDesktopTabsRow`

The row now accepts:

- `recentlyClosedTabs`
- `onRestoreClosedTab`
- `onRestoreLastClosedTab`

It passes the recent list to the add button and hooks restore actions into menu items and keyboard/route actions.

## Workspace Screen Integration

### `packages/app/src/screens/workspace/workspace-screen.tsx`

The workspace screen now:

- Reads the current workspace's recent list from `useWorkspaceLayoutStore`.
- Passes it to `WorkspaceDesktopTabsRow`.
- Wires restore callbacks to the layout store.
- Navigates/focuses restored tabs through the normal layout focus path.

## Keyboard And Route Actions

### `packages/app/src/keyboard/actions.ts`

Adds a restore-closed-tab action id.

### `packages/app/src/keyboard/keyboard-action-dispatcher.ts`

Dispatches the restore-last-closed-tab action when the current route/workspace supports it.

### `packages/app/src/keyboard/keyboard-shortcuts.ts`

Registers the shortcut metadata for restoring the last closed workspace tab.

### `packages/app/src/keyboard/route-shortcut.ts`

Adds route-level support so the shortcut applies in workspace contexts.

### Tests

Updated keyboard tests cover action registration, dispatch, and route shortcut behavior.

## Localization

Adds recently closed tab labels and shortcut copy in:

- `packages/app/src/i18n/resources/ar.ts`
- `packages/app/src/i18n/resources/en.ts`
- `packages/app/src/i18n/resources/es.ts`
- `packages/app/src/i18n/resources/fr.ts`
- `packages/app/src/i18n/resources/ru.ts`
- `packages/app/src/i18n/resources/zh-CN.ts`

`packages/app/src/i18n/resources.test.ts` is updated so the new keys are covered by resource validation.

## Tests

### `packages/app/src/stores/workspace-layout-store.test.ts`

Adds coverage for:

- Enqueuing restorable tabs on close.
- Not enqueuing non-restorable tabs.
- Restoring a specific recent entry.
- Restoring the latest recent entry.
- Removing restored entries.
- Restoring to the original pane when it still exists.
- Falling back when the original pane no longer exists.
- Preserving parent tab relationships.
- Normalizing persisted recent entries.

### Keyboard Tests

Adds/updates tests for:

- Keyboard action dispatch.
- Shortcut registration.
- Route shortcut applicability.

## Verification

The branch commit was created with the repo pre-commit hook enabled.

The hook ran:

- `npm run lint` on changed files.
- `npm run format:check:files` on changed files.
- `npm run typecheck` across workspaces.

All passed for the implementation commit.
