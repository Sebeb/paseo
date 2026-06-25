# Patch Summary: Embedded Workspace Tabs In Sidebar

Branch: `split/sidebar-workspace-tabs`

Base: `origin/main`

Primary commit before this writeup: `c0d85bb61 feat(app): embed workspace tabs in sidebar`

## Purpose

This branch redesigns the sidebar so workspace tabs can be shown and controlled directly under each workspace. It adds sidebar-specific tab ordering, recent tab filtering, status badges, grouping controls, tab-close cleanup, and layout state needed for embedded tab presentation.

The branch is intentionally grouped because the sidebar list, workspace layout store, tab close behavior, status summaries, and sidebar preferences depend on each other.

## User-Facing Changes

- Adds embedded workspace tabs inside sidebar workspace rows.
- Adds sidebar grouping controls for:
  - project/status grouping
  - workspace title source
  - auto-collapse workspaces
  - embedded tab sort mode
  - recent tab count
  - sidebar badge mode
- Adds status count badges for workspace tabs.
- Adds workspace expansion/collapse behavior for showing or hiding embedded tabs.
- Adds shift-click workspace expansion controls.
- Prevents attention-driven navigation from overriding explicit navigation.
- Moves close-tab cleanup into a reusable workspace hook.
- Keeps tab close/rename/split actions available while the tab is represented in the sidebar.
- Updates sidebar docs/design notes for the new lifecycle/presentation behavior.

## Restored Main Polish

These details were previously implemented on `main`, then lost when this feature was split out. They are part of this branch's intended behavior and should be preserved when rebasing or batching the feature again.

- Status summary badges render as filled circles. When a badge includes a number, the counter text is black.
- Status summary badges suppress the number when the count is `1`, except for `needs_input`, which represents queued/blocked user input and still shows its count.
- In status badge mode, new/unread response markers remain in the row's badge area instead of replacing the workspace/project icon.
- Workspace rows, status-group workspace rows, and project rows can be right-clicked to open the same menu shown by their three-dot action button.
- The sidebar header no longer shows a global "new workspace" action.
- The history/sessions action lives in the sidebar footer beside the open-folder action.
- Project and workspace hover actions must not change row height or vertical spacing; trailing action buttons are overlaid within a stable row layout.

## Sidebar View Store

### `packages/app/src/stores/sidebar-view-store.ts`

This new persisted zustand store owns sidebar-specific display preferences.

#### Types

- `SidebarGroupMode = "project" | "status"`
- `SidebarEmbeddedTabSortMode = "manual" | "created" | "lastUpdated"`
- `SidebarEmbeddedRecentTabCount = 3 | 5 | 10 | "all"`
- `SidebarBadgeMode = "diff" | "status" | "none"`

#### Normalizers

##### `normalizeTabSortMode(value)`

Returns a valid tab sort mode:

- accepts `"created"`, `"lastUpdated"`, and `"manual"`
- falls back to `"manual"`

##### `normalizeRecentTabCount(value)`

Returns a valid recent tab count:

- accepts `3`, `5`, `10`, and `"all"`
- falls back to `5`

##### `normalizeBadgeMode(value)`

Returns a valid badge mode:

- accepts `"status"`, `"none"`, and `"diff"`
- falls back to `"diff"`

#### Store Methods

##### `getGroupMode(serverId)`

- Trims the server id.
- Returns `"project"` for empty server ids.
- Returns a stored mode for the server or `"project"` by default.

##### `setGroupMode(serverId, mode)`

- Trims the server id.
- Ignores empty ids.
- Stores the selected mode by server id.

##### `getEmbeddedTabSortMode(serverId)` / `setEmbeddedTabSortMode(serverId, mode)`

- Store and read per-server tab sort mode.
- Always normalize values through `normalizeTabSortMode`.

##### `getEmbeddedRecentTabCount(serverId)` / `setEmbeddedRecentTabCount(serverId, count)`

- Store and read per-server recent tab count.
- Always normalize values through `normalizeRecentTabCount`.

##### `getBadgeMode(serverId)` / `setBadgeMode(serverId, mode)`

- Store and read per-server badge mode.
- Always normalize values through `normalizeBadgeMode`.

##### `setAutoCollapseWorkspaces(enabled)`

- Stores the global auto-collapse toggle.

#### Persistence

The store persists to `AsyncStorage` under `sidebar-group-mode`. It partializes only the preference maps and `autoCollapseWorkspaces`, not derived getter/setter functions.

## Sidebar Grouping Selector

### `packages/app/src/components/sidebar/sidebar-grouping-selector.tsx`

This replaces the narrower display preferences menu with a broader sidebar controls menu.

#### `SidebarGroupingSelector`

Implementation details:

- Reads app settings and sidebar view store state.
- Reads current group mode, tab sort mode, recent count, badge mode, and auto-collapse state.
- Writes per-server preferences only when `serverId` is non-null.
- Shows embedded-tab controls only when `settings.tabLayoutMode !== "horizontal"`.
- Uses `closeOnSelect = !showTabControls` so simple grouping closes the menu, while multi-control embedded tab settings can stay open.
- Preserves the current `workspaceTitleSource` setting by writing through `updateSettings`.

#### Menu Item Components

The selector defines typed item components for:

- workspace title source
- group mode
- tab sort mode
- recent tab count
- badge mode

Each component creates a stable `handleSelect` callback that passes its typed value back to the parent.

## Embedded Tab Ordering

### `packages/app/src/components/sidebar/embedded-tabs-order.ts`

#### `EmbeddedTabOrderItem`

Represents an item in the embedded sidebar tab list:

- `mainPane`: whether the tab belongs to the main pane.
- `tab.tabId`: tab id used for ordering.

#### `mergeEmbeddedVisibleTabOrder({ mainPaneItems, nextVisibleItems })`

Merges a drag-reordered visible subset back into the full main-pane order.

Implementation details:

- Extracts reordered visible ids from `nextVisibleItems`, keeping only items where `mainPane` is true.
- Builds a set of visible ids.
- Iterates the full `mainPaneItems`.
- For hidden/non-visible items, preserves the original tab id in place.
- For visible items, consumes the next reordered visible id.
- Falls back to the original id if the reordered visible list is unexpectedly short.

This lets users reorder the currently visible embedded tabs without losing hidden tabs from the full pane order.

## Sidebar Tab Status Summaries

### `packages/app/src/utils/sidebar-tab-status-summary.ts`

This new module computes aggregate status badges for workspace tabs.

#### Buckets

`SIDEBAR_TAB_STATUS_BUCKETS`:

- `needs_input`
- `failed`
- `running`
- `attention`
- `done`

`SIDEBAR_TAB_STATUS_BADGE_BUCKETS` excludes `done` because the badge display focuses on actionable/non-idle states.

#### `createEmptySidebarTabStatusSummary()`

Returns:

- `total: 0`
- zero counts for every bucket

#### `summarizeSidebarTabs(input)`

Builds a status summary for a workspace tab list.

Implementation details:

- Starts with `createEmptySidebarTabStatusSummary`.
- Iterates tabs in order.
- Resolves each tab bucket with `resolveSidebarTabStatusBucket`.
- Increments `total`.
- Increments the selected bucket count.

#### `combineSidebarTabStatusSummaries(summaries)`

Combines summaries across workspaces or groups.

Implementation details:

- Starts with an empty summary.
- Adds each summary's `total`.
- Adds each bucket count using `SIDEBAR_TAB_STATUS_BUCKETS`.

#### `resolveSidebarTabStatusBucket(input)`

Maps each tab target kind to a sidebar bucket:

- `agent`: delegates to `resolveAgentTabStatus`.
- `draft`: delegates to `resolveDraftTabStatus`.
- `setup`: delegates to `resolveSetupTabStatus`.
- `browser`: returns `running` when the browser record is loading, otherwise `done`.
- `terminal`: delegates to `deriveTerminalActivityStatusBucket`, falling back to `done`.
- `file`: returns `done`.

#### `resolveAgentTabStatus(agent)`

Uses `deriveSidebarStateBucket` with:

- agent status
- pending permission count
- attention flags

Missing agents are treated as `done`.

#### `resolveDraftTabStatus({ pending, serverId })`

Returns `running` when the pending create attempt is for the current server and has lifecycle `active`; otherwise `done`.

#### `resolveSetupTabStatus(...)`

Builds the workspace tab persistence key from server/workspace ids, reads the setup snapshot, and returns `running` only when the snapshot status is `running`.

## Workspace Tab Close Hook

### `packages/app/src/screens/workspace/use-workspace-tab-close.ts`

This new hook centralizes tab-close cleanup used by sidebar and workspace tab surfaces.

#### `useCloseTabs()`

Private helper that tracks tab ids currently closing.

Implementation details:

- Maintains a mutable `pendingRef` set.
- Exposes a React state `closingTabIds` set for rendering spinners/disabled states.
- `closeTab(tabId, action)` trims the id, ignores empty ids, and ignores duplicate close attempts.
- Adds the tab id to pending state, awaits the action, and removes it in `finally`.

#### `trimNonEmpty(value)`

Local string normalizer:

- Returns `null` for non-strings.
- Trims strings.
- Returns `null` for empty strings.

#### `closeWorkspaceTabWithCleanup(closeInput)`

Closes a tab and performs target-specific cleanup.

Implementation details:

- Normalizes the tab id.
- Requires a workspace persistence key.
- For agent tabs:
  - unpins the agent from the workspace
  - hides the agent from the workspace
- For browser tabs:
  - removes the browser record from `useBrowserStore`
  - clears the Electron browser partition when the desktop host exposes that bridge
- Calls `closeWorkspaceTab` in the layout store.
- Calls optional `onTabClosed`.

#### `removeTerminalFromCache(terminalId)`

Updates the React Query terminal payload by applying `removeTerminalFromPayload` to the cached terminal list.

#### `killTerminal(terminalId)`

Calls `client.killTerminal`.

Implementation details:

- Throws the localized disconnected-host error if no runtime client exists.
- Throws `"Unable to close terminal"` when the payload reports failure.

#### `handleCloseTerminalTab({ tabId, terminalId })`

Closes a terminal tab with confirmation and daemon cleanup.

Implementation details:

- Uses `closeTab` so duplicate close actions are ignored.
- Shows destructive confirmation.
- Optimistically removes the terminal from cache.
- Closes the workspace tab locally.
- Starts terminal kill asynchronously.
- Invalidates terminal queries if the kill request fails.

#### `handleCloseAgentTab({ tabId, agentId })`

Closes an agent tab and archives the agent when policy requires it.

Implementation details:

- Reads the agent from the session store.
- Resolves policy with `resolveCloseAgentTabPolicy`.
- If the agent is running and policy is `archive-on-close`, shows destructive confirmation.
- Closes the tab locally.
- Returns immediately for `layout-only` policy.
- Otherwise fires `archiveAgent` and intentionally swallows mutation errors because the mutation handles settlement.

#### `handleClosePassiveTab(...)`

Closes non-agent/non-terminal tabs through `closeWorkspaceTabWithCleanup`.

#### `handleCloseTabById(tabId)`

Dispatches close behavior by target kind:

- terminal -> `handleCloseTerminalTab`
- agent -> `handleCloseAgentTab`
- everything else -> `handleClosePassiveTab`

The hook returns `closingTabIds`, raw `closeTab`, `closeWorkspaceTabWithCleanup`, and `handleCloseTabById`.

## Sidebar List And Row Changes

### `packages/app/src/components/sidebar-workspace-list.tsx`

The sidebar list now supports embedded tabs under workspace rows.

Key behavior:

- Reads workspace tab layouts and pane state.
- Builds embedded tab rows for each workspace.
- Applies per-server tab sort and recent-count preferences.
- Applies manual order merges through `mergeEmbeddedVisibleTabOrder`.
- Supports workspace collapse/expand and auto-collapse behavior.
- Supports status-mode grouping via `SidebarStatusWorkspaceList`.
- Supports drag/drop where available.
- Uses `SidebarWorkspaceRowContent` for row presentation.
- Provides context menu actions for workspace and embedded tabs.

### `packages/app/src/components/sidebar/sidebar-workspace-row-content.tsx`

The row content component now owns the visual composition for workspace rows, embedded tab rows, status badges, shortcut badges, and trailing actions.

Tests cover row content behavior and status/shortcut rendering.

### `packages/app/src/components/sidebar/sidebar-status-list.tsx`

The status-group list is updated to account for embedded workspace tab status summaries and revised row layout.

## Workspace Layout And Navigation Store Changes

### `packages/app/src/stores/workspace-layout-store.ts`

Adds layout metadata needed for embedded sidebar tab behavior, including main-pane lookup support and tests for finding the main pane.

### `packages/app/src/stores/workspace-layout-actions.ts`

Adds/updates actions used by sidebar tab close, reorder, and layout operations.

### `packages/app/src/stores/navigation-active-workspace-store/navigation.ts`

Updates navigation behavior so explicit workspace navigation wins over attention-agent redirects.

Tests verify the active workspace store behavior.

### `packages/app/src/stores/panel-store`

Adds panel state needed for resizable/sidebar-aware workspace tab presentation.

## Workspace Screen Integration

### `packages/app/src/screens/workspace/workspace-screen.tsx`

The workspace screen now uses the shared close hook and exposes tab actions needed by sidebar embedded tab controls.

### `packages/app/src/screens/workspace/use-workspace-tab-close.ts`

The new close hook is imported by workspace screen and can also be used by sidebar tab controls.

## Styling And UI Foundation Changes

The branch adjusts a broad set of components so embedded sidebar tabs align with the existing UI system:

- `left-sidebar.tsx`
- `split-container.tsx`
- `terminal-pane.tsx`
- UI button/context/dropdown menu components
- composer/input components
- file and git pane controls
- provider/settings sections
- loading spinner usage

These changes are mostly spacing, hover, icon, spinner, and row-layout updates needed for consistent sidebar embedded tab presentation.

## Settings And Localization

### App Settings

Adds or uses `tabLayoutMode` and existing `workspaceTitleSource` in the sidebar menu.

### Localization

Adds sidebar/tab preference strings in:

- `packages/app/src/i18n/resources/ar.ts`
- `packages/app/src/i18n/resources/en.ts`
- `packages/app/src/i18n/resources/es.ts`
- `packages/app/src/i18n/resources/fr.ts`
- `packages/app/src/i18n/resources/ru.ts`
- `packages/app/src/i18n/resources/zh-CN.ts`

## Documentation

Updates:

- `docs/agent-lifecycle.md`
- `docs/design.md`

The docs describe tab/archive semantics and the visual conventions used by the new sidebar controls.

## Tests

New and updated tests include:

- `packages/app/src/components/sidebar/embedded-tabs-order.test.ts`
- `packages/app/src/components/sidebar/sidebar-workspace-row-content.test.tsx`
- `packages/app/src/stores/sidebar-view-store.test.ts`
- `packages/app/src/stores/workspace-layout-store.find-main-pane.test.ts`
- `packages/app/src/utils/sidebar-tab-status-summary.test.ts`
- navigation and collapsed-section store tests
- workspace layout store tests

These cover ordering, row rendering, persisted sidebar preferences, main-pane lookup, tab status summaries, navigation behavior, and collapsed-section state.

## Verification

The branch commit was created with the repo pre-commit hook enabled.

The hook ran:

- `npm run lint` on changed files.
- `npm run format:check:files` on changed files.
- `npm run typecheck` across workspaces.

All passed for the implementation commit.
