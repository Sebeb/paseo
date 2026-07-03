# Patch Summary: Embedded Workspace Tabs In Sidebar

Branch: `feat/sidebar-workspace-tabs`

Base: `origin/main`

Anchor commit: 2b32f4b52c2251418bf2d5eb81e4387674aa5e35 — fix(app): refine sidebar active highlight states

## Purpose

This branch redesigns the sidebar so workspace tabs can be shown and controlled directly under each workspace. It adds sidebar-specific tab ordering, recent tab filtering, status badges, grouping controls, tab-close cleanup, and layout state needed for embedded tab presentation.

The branch is intentionally grouped because the sidebar list, workspace layout store, tab close behavior, status summaries, and sidebar preferences depend on each other.

## User-Facing Changes

- Adds embedded workspace tabs inside sidebar workspace rows.
- Adds sidebar grouping controls for:
  - project/status grouping
  - workspace title source
  - auto-collapse projects
  - auto-collapse workspaces
  - workspace sort mode (manual, created, lastUpdated, **status**)
  - embedded tab sort mode (manual, created, lastUpdated, **status**)
  - recent tab count
  - sidebar badge mode
- Adds per-kind status count badges for workspace tabs (queued messages, draft, input required, unread, in-progress, failed).
- Adds workspace expansion/collapse behavior for showing or hiding embedded tabs.
- Adds shift-click workspace expansion controls.
- Prevents attention-driven navigation from overriding explicit navigation.
- Moves close-tab cleanup into a reusable workspace hook.
- Keeps tab close/rename/split actions available while the tab is represented in the sidebar.
- Updates sidebar docs/design notes for the new lifecycle/presentation behavior.
- Adds right-click context menu on workspace rows in the status-group list.
- Shows provider icon on draft tabs when badge mode is "status".
- Adds a split-pane creation button to the workspace header that uses horizontal/vertical split depending on modifier key held.
- Adds right-click and kebab menus on embedded sidebar tabs with the same copy/reload/rename/close actions as workspace tabs, plus bulk close-left/close-right/close-others actions.
- Renders embedded tabs as a collapsible parent/child tree that follows subagent relationships, persists parent expansion state, and shows aggregated child status badges on parent rows.
- Keeps active secondary-pane tabs visible in the embedded sidebar list even though manual reordering only applies to the main pane.
- Shows pending branch-operation badges on workspace rows while checkout-store git actions such as pull/push/merge/create-PR are running.
- Uses the current sidebar sort order for close-successor selection and keyboard tab cycling, instead of falling back to pane insertion order.
- Adds non-manual workspace sorting by creation time, last activity, or status urgency; manual workspace drag/drop remains available only in manual sort mode.
- Auto-reveals the active workspace row by expanding its project, respecting project auto-collapse, and either expanding only the active workspace in workspace auto-collapse mode or uncollapsing that workspace in normal mode.
- Remembers the last selected workspace inside each project and navigates back to it when reopening an auto-collapsed project.
- Replaces agent tab tooltips with a detail card showing the tab label, short agent id, initial prompt, created/updated timestamps, and prompt count.
- Distinguishes ancestor highlighting from direct selection so active project/workspace ancestors use a quieter row background while the selected embedded tab keeps the stronger selected treatment.

## Restored Main Polish

These details were previously implemented on `main`, then lost when this feature was split out. They are part of this branch's intended behavior and should be preserved when rebasing or batching the feature again.

- Status summary badges render as filled circles. When a badge includes a number, the counter text is black.
- Status summary badges suppress the number when the count is `1`, except for `needs_input`, which represents queued/blocked user input and still shows its count.
- In status badge mode, new/unread response markers remain in the row's badge area instead of replacing the workspace/project icon.
- Workspace rows, status-group workspace rows, and project rows can be right-clicked to open the same menu shown by their three-dot action button.
- The sidebar header no longer shows a global "new workspace" action.
- The history/sessions action lives in the sidebar footer beside the open-folder action.
- Project and workspace hover actions must not change row height or vertical spacing; trailing action buttons are overlaid within a stable row layout.
- In vertical tab layout, the vertical workspace tab rail remains visible when the main workspace sidebar is toggled closed. Closing the sidebar hides only the workspace/project list, not the separate vertical tab rail.
- In sidebar/vertical tab layout, the main pane's split-tab creation action lives in the workspace header immediately after the sidebar toggle instead of floating over the pane body. The trigger shows the horizontal split icon by default, switches to the vertical split icon while Command is held on macOS or Control is held on non-macOS platforms, and opens the new-tab menu so the selected agent/browser/terminal/profile is created inside that split.

## Sidebar View Store

### `packages/app/src/stores/sidebar-view-store.ts`

This new persisted zustand store owns sidebar-specific display preferences.

#### Types

- `SidebarGroupMode = "project" | "status"`
- `SidebarEmbeddedTabSortMode = "manual" | "created" | "lastUpdated" | "status"`
- `SidebarWorkspaceSortMode = SidebarEmbeddedTabSortMode`
- `SidebarEmbeddedRecentTabCount = 3 | 5 | 10 | "all"`
- `SidebarBadgeMode = "diff" | "status" | "none"`

#### Normalizers

##### `normalizeTabSortMode(value)`

Returns a valid tab sort mode:

- accepts `"created"`, `"lastUpdated"`, `"manual"`, and `"status"`
- falls back to `"manual"`

##### `normalizeRecentTabCount(value)`

Returns a valid recent tab count:

- accepts `3`, `5`, `10`, and `"all"`
- falls back to `5`

##### `normalizeBadgeMode(value)`

Returns a valid badge mode:

- accepts `"status"`, `"none"`, and `"diff"`
- falls back to `"status"`

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

##### `getWorkspaceSortMode(serverId)` / `setWorkspaceSortMode(serverId, mode)`

- Store and read per-server workspace sort mode.
- Use the same value space and normalization as embedded tab sort mode: `"manual"`, `"created"`, `"lastUpdated"`, and `"status"`.
- Empty server ids read as `"manual"` and are ignored on write.

##### `getEmbeddedRecentTabCount(serverId)` / `setEmbeddedRecentTabCount(serverId, count)`

- Store and read per-server recent tab count.
- Always normalize values through `normalizeRecentTabCount`.

##### `getBadgeMode(serverId)` / `setBadgeMode(serverId, mode)`

- Store and read per-server badge mode.
- Always normalize values through `normalizeBadgeMode`.

##### `setAutoCollapseWorkspaces(enabled)`

- Stores the global auto-collapse toggle.

##### `setAutoCollapseProjects(enabled)`

- Stores the global project auto-collapse toggle.

#### Persistence

The store persists to `AsyncStorage` under `sidebar-group-mode`. It partializes only the preference maps, `autoCollapseProjects`, and `autoCollapseWorkspaces`, not derived getter/setter functions.

Persisted preference maps are:

- `groupModeByServerId`
- `workspaceSortModeByServerId`
- `embeddedTabSortModeByServerId`
- `embeddedRecentTabCountByServerId`
- `badgeModeByServerId`

Persisted global toggles are:

- `autoCollapseProjects`
- `autoCollapseWorkspaces`

## Sidebar Grouping Selector

### `packages/app/src/components/sidebar/sidebar-grouping-selector.tsx`

This replaces the narrower display preferences menu with a broader sidebar controls menu.

#### `SidebarGroupingSelector`

Implementation details:

- Reads app settings and sidebar view store state.
- Reads current group mode, workspace sort mode, tab sort mode, recent count, badge mode, project auto-collapse state, and workspace auto-collapse state.
- Writes per-server preferences only when `serverId` is non-null.
- Shows embedded-tab controls only when `settings.tabLayoutMode !== "horizontal"`.
- Shows the workspace auto-collapse toggle only for the sidebar tab layout; the project auto-collapse toggle is always available from the sidebar controls.
- Uses `closeOnSelect = !showTabControls` so simple grouping closes the menu, while multi-control embedded tab settings can stay open.
- Preserves the current `workspaceTitleSource` setting by writing through `updateSettings`.

The workspace sort menu includes the same four options as tab sorting: Manual, Created, Last Updated, and **Status**. Status sorts workspaces by urgency, with recency and name as tiebreakers.

The tab sort mode menu includes four options: Manual, Created, Last Updated, and **Status** (sorts by most urgent status, with recency as a tiebreaker).

The top-level menu includes two persistent toggle items:

- **Auto collapse projects** toggles `autoCollapseProjects` and keeps the menu open.
- **Auto collapse workspaces** toggles `autoCollapseWorkspaces`, keeps the menu open, and is only rendered while the app uses sidebar tab layout.

#### Menu Item Components

The selector defines typed item components for:

- workspace title source
- group mode
- workspace sort mode
- tab sort mode
- recent tab count
- badge mode

Each component creates a stable `handleSelect` callback that passes its typed value back to the parent.

## Left Sidebar Shell

### `packages/app/src/components/left-sidebar.tsx`

The left sidebar now coordinates the workspace/project list and the optional vertical workspace tab rail.

Behavior:

- Reads `settings.tabLayoutMode` and treats `"vertical"` on non-compact layouts as a mode where workspace tab content must remain mounted even when the project/workspace list is closed.
- Calls `useSidebarWorkspacesList` when compact, when the main sidebar is open, or when the desktop vertical tab rail is visible.
- Replaces `SidebarDisplayPreferencesMenu` with `SidebarGroupingSelector`, so one header/menu controls grouping, title source, workspace sorting, tab sorting, recent tab count, badge mode, and collapse preferences.
- Removes the global "new workspace" header/footer action from the sidebar shell.
- Moves the sessions/history action into the footer and marks it active when the current route is the sessions route.
- Passes active workspace selection and sidebar badge mode into the desktop sidebar so `SidebarVerticalWorkspaceTabs` can render only the vertical tab rail while the workspace/project list is closed.
- Uses a separate persisted `verticalTabsSidebarWidth` for the vertical tab rail instead of reusing the normal project/workspace sidebar width.

The desktop layout has two separate width domains:

- normal sidebar width: `MIN_SIDEBAR_WIDTH..MAX_SIDEBAR_WIDTH`
- vertical tab rail width: `MIN_VERTICAL_TABS_SIDEBAR_WIDTH..MAX_VERTICAL_TABS_SIDEBAR_WIDTH`

Closing the sidebar in vertical-tab mode hides the workspace/project list but keeps the rail available, preserving tab navigation.

## Sidebar Entry Row

### `packages/app/src/components/sidebar/sidebar-entry-row.tsx`

A new unified row component used by both workspace rows and embedded tab rows in the sidebar.

#### Constants

- `SIDEBAR_ENTRY_ROW_HEIGHT = 36` — fixed row height used by both workspace and embedded tab rows.

#### `SidebarEntryRowContent` (memo)

Props:

- `leading: ReactNode` — primary leading icon slot.
- `hoverLeading?: ReactNode` — alternative leading shown when `showHoverLeading` is true.
- `showHoverLeading?: boolean` — cross-fades `hoverLeading` over `leading` when true (original dims to opacity 0, overlay appears absolutely positioned).
- `leadingStatus?: SidebarEntryStatusKind | null` — renders a `SidebarEntryLeadingStatusBadge` over the lower-right corner of the leading slot when set.
- `label: string` — primary text, single line with tail truncation.
- `subtitle?: string | null` — secondary text below label, muted color, xs size.
- `rightContext?: ReactNode` — trailing content slot (badges, actions).
- `hoverRightContext?: ReactNode` — trailing content shown when `showHoverRightContext` is true.
- `showHoverRightContext?: boolean` — switches between `rightContext` and `hoverRightContext`.
- `shortcutBadge?: ReactNode` — absolutely positioned shortcut chip in the lower-right corner.

Layout: 36 px tall row, leading slot is `iconSize.md` × `iconSize.md` with `position: relative` for the status badge overlay. Text column is flex 1, right context is flex-shrink 0 and capped at 70% width.

#### `SidebarEntryStatusBadges` (exported)

Renders a row of per-kind status badges for a given `SidebarTabStatusSummary`.

- Calls `getVisibleSidebarEntryStatusKinds(summary)` to get the ordered list of non-zero kinds.
- Renders a `SidebarEntryStatusBadge` for each.
- Returns null when no kinds are visible.

#### `SidebarEntryPrimaryStatusBadge` (exported)

Renders a single `SidebarEntryLeadingStatusBadge` for the highest-priority non-zero kind in the summary.

- Calls `getPrimarySidebarEntryStatusKind(summary)`.
- Returns null when all counts are zero.

#### `SidebarEntryStatusBadge` (internal)

Per-kind badge variant logic:

- `count <= 0` → null.
- `count === 1 && definition.singleIcon` → renders a `SingleStatusIcon` (amber CircleAlert for `input_required`, red CircleX for `failed`).
- `kind === "draft"` → plain slot with a muted SquarePen icon (no counter).
- `kind === "in_progress"` → plain slot with a blue SyncedLoader; count floats bottom-right when `shouldShowStatusCount` returns true.
- Otherwise → filled circle badge (`statusBadge` style) with either a count text or a `StatusBadgeIcon`.

#### `shouldShowStatusCount(kind, count)`

- `countMode === "always"` → true.
- `countMode === "off"` → false.
- `countMode === "onePlus"` → true only when `count > 1`.

#### `getStatusBadgeColorStyle(kind)`

Returns the appropriate fill style:

| Kind              | Style                  |
| ----------------- | ---------------------- |
| `queued_messages` | zinc[300] background   |
| `input_required`  | amber[500] background  |
| `unread`          | green[500] background  |
| `in_progress`     | blue[500] background   |
| `failed`          | red[500] background    |
| `draft`           | transparent background |

#### `SidebarEntryLeadingStatusBadge` (internal)

Small 8 × 8 px badge in the lower-right corner of the leading slot with a surface-colored border to separate it from the icon. Displays a tiny SquarePen for `draft` and a tiny SyncedLoader for `in_progress`; otherwise renders nothing inside the frame.

## Sidebar Tab Status Summaries

### `packages/app/src/utils/sidebar-tab-status-summary.ts`

This module computes aggregate status badges for workspace tabs at both the bucket level and the per-kind entry level.

#### Types

```ts
type SidebarTabStatusBucket = SidebarStateBucket; // "needs_input" | "failed" | "running" | "attention" | "done"
type SidebarEntryStatusKind =
  | "queued_messages"
  | "draft"
  | "input_required"
  | "unread"
  | "in_progress"
  | "failed";
type SidebarEntryStatusCountMode = "always" | "off" | "onePlus";
type SidebarEntryStatusSingleIcon = "input_required" | "failed";
```

#### `SidebarEntryStatusDefinition`

```ts
interface SidebarEntryStatusDefinition {
  kind: SidebarEntryStatusKind;
  countMode: SidebarEntryStatusCountMode;
  propagateUp: boolean;
  singleIcon?: SidebarEntryStatusSingleIcon;
}
```

#### `SidebarTabStatusSummary`

```ts
interface SidebarTabStatusSummary {
  total: number;
  counts: Record<SidebarTabStatusBucket, number>;
  draft: number;
  propagatedDraft: number;
  entryCounts: Record<SidebarEntryStatusKind, number>;
  propagatedEntryCounts: Record<SidebarEntryStatusKind, number>;
}
```

- `counts` tracks per-bucket tab counts (old bucket-level badging path).
- `entryCounts` tracks per-kind counts that appear in entry row badges.
- `propagatedEntryCounts` tracks the subset of `entryCounts` that propagate up to parent rows (controlled by `propagateUp` on each definition). Used by `combineSidebarTabStatusSummaries` so a parent only reflects children that opted in.
- `draft` / `propagatedDraft` track draft-content tabs separately because draft propagation depends on whether the draft has actual text.

#### Constants

`SIDEBAR_TAB_STATUS_BUCKETS`: `["needs_input", "failed", "running", "attention", "done"]`

`SIDEBAR_TAB_STATUS_BADGE_BUCKETS`: same except `"done"` — used for badge display.

`SIDEBAR_ENTRY_STATUS_DISPLAY_ORDER`: `["queued_messages", "draft", "input_required", "unread", "in_progress", "failed"]` — controls left-to-right badge rendering order.

`SIDEBAR_ENTRY_STATUS_SORT_ORDER`: `["draft", "input_required", "failed", "unread", "in_progress"]` — priority order for sort-by-status (excludes `queued_messages`).

`SIDEBAR_ENTRY_STATUS_DEFINITIONS`:

| Kind              | countMode | propagateUp | singleIcon       |
| ----------------- | --------- | ----------- | ---------------- |
| `queued_messages` | always    | true        | —                |
| `draft`           | off       | true        | —                |
| `input_required`  | onePlus   | true        | `input_required` |
| `unread`          | onePlus   | true        | —                |
| `in_progress`     | onePlus   | true        | —                |
| `failed`          | onePlus   | true        | `failed`         |

#### `createEmptySidebarTabStatusSummary()`

Returns a zeroed-out summary with all bucket counts and entry counts at zero.

#### `summarizeSidebarTabs(input)`

Builds a status summary for a workspace tab list.

Input fields:

- `tabs`, `serverId`, `workspaceId`, `agents`, `pendingCreatesByDraftId`, `setupSnapshots`, `browsersById`, `terminalsById`
- `draftInputsByKey?: Record<string, DraftInput | undefined>` — used to compute draft badge propagation.
- `queuedMessageCountsByAgentId?: ReadonlyMap<string, number>` — used to compute queued message counts per agent tab.

Implementation details:

- Starts with `createEmptySidebarTabStatusSummary`.
- Iterates tabs.
- Resolves bucket via `resolveSidebarTabStatusBucket`.
- Increments `total` and `counts[bucket]`.
- Converts bucket to entry statuses via `sidebarEntryStatusesFromBucket`.
- For each entry status, calls `addEntryStatus(summary, kind, true)` (propagates).
- Resolves queued message count for agent tabs via `resolveQueuedMessageCount`; if > 0, calls `addEntryStatus(summary, "queued_messages", true, count)`.
- Resolves draft state via `resolveSidebarTabDraftState`; if `hasDraftBadge`, increments `draft` and calls `addEntryStatus(summary, "draft", propagatesToParent)`.
- If draft propagates, increments `propagatedDraft`.

#### `combineSidebarTabStatusSummaries(summaries)`

Combines per-workspace summaries up to a project row.

Implementation details:

- Starts with an empty summary.
- For each child summary: adds `total`; adds bucket counts; adds `propagatedEntryCounts` into both `entryCounts` and `propagatedEntryCounts` of the combined result (only propagated counts bubble up); adds `propagatedDraft` into both `draft` and `propagatedDraft`.

#### `getSidebarEntryStatusCount(summary, kind)`

Returns `summary.entryCounts[kind]`.

#### `getVisibleSidebarEntryStatusKinds(summary)`

Returns the subset of `SIDEBAR_ENTRY_STATUS_DISPLAY_ORDER` where `entryCounts[kind] > 0`.

#### `getPrimarySidebarEntryStatusKind(summary)`

Returns the first non-zero kind in priority order: `input_required`, `failed`, `unread`, `in_progress`, `queued_messages`, `draft`. Returns null when all counts are zero.

#### `getSidebarEntryStatusSortRank(summary)`

Returns the 0-based index of the first non-zero kind in `SIDEBAR_ENTRY_STATUS_SORT_ORDER`, or `SIDEBAR_ENTRY_STATUS_SORT_ORDER.length` when all are zero. Lower rank = higher urgency.

#### `resolveSidebarTabDraftState(input)`

```ts
interface SidebarTabDraftState {
  hasDraftBadge: boolean;
  propagatesToParent: boolean;
}
```

For `draft` targets:

- Always `hasDraftBadge: true`.
- `propagatesToParent` = whether the draft record has non-empty trimmed text.

For `agent` targets:

- Looks up the draft record by `buildDraftStoreKey({ serverId, agentId })`.
- If no record, `hasDraftBadge: false`.
- `hasDraftBadge` = `hasDraftContent({ text, attachments })` (true when text or attachments present).
- `propagatesToParent` = whether the text is non-empty.

All other target kinds: `{ hasDraftBadge: false, propagatesToParent: false }`.

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

## Embedded Tab Ordering And Tree Building

### `packages/app/src/components/sidebar/embedded-tabs-order.ts`

Still owns the manual drag/drop merge step for the main pane.

#### `EmbeddedTabOrderItem`

Represents an embedded sidebar row candidate:

- `mainPane`: whether the tab belongs to the main workspace pane.
- `tab.tabId`: stable tab id used for order persistence.

#### `mergeEmbeddedVisibleTabOrder({ mainPaneItems, nextVisibleItems })`

Merges a drag-reordered visible subset back into the full main-pane order.

Implementation details:

- Reads reordered ids only from visible rows whose `item.mainPane` is true.
- Preserves hidden main-pane tabs in place.
- Ignores secondary-pane rows so dragging the sidebar tree never rewrites split-pane ordering.
- Falls back to original ids if the reordered visible subset is shorter than expected.

### `packages/app/src/utils/sidebar-tab-sort.ts`

Extracts tab sorting into a shared utility used by both the sidebar tree and workspace-screen navigation order.

#### Types

```ts
interface SidebarTabSortItem {
  tab: WorkspaceTab;
}
```

#### `sortSidebarTabItems({ items, sortMode, agents, statusSummariesByTabId })`

- Returns a shallow copy in `"manual"` mode.
- `"created"` sorts by `tab.createdAt` descending.
- `"lastUpdated"` sorts by agent `lastUserMessageAt` when the target is an agent, otherwise `tab.createdAt`, descending.
- `"status"` sorts by `getSidebarEntryStatusSortRank(summary)` first, then `lastUpdatedAt` descending.

#### `sortSidebarWorkspaceTabs({ tabs, ... })`

Thin adapter that maps raw `WorkspaceTab[]` through `sortSidebarTabItems` and returns sorted tabs.

### `packages/app/src/utils/sidebar-embedded-tab-tree.ts`

Builds the nested row model for the embedded sidebar tab list.

#### Types

```ts
interface SidebarEmbeddedTabTreeItem {
  tab: WorkspaceTab;
}

interface SidebarEmbeddedTabTreeRow<Item extends SidebarEmbeddedTabTreeItem> {
  item: Item;
  depth: number;
  childCount: number;
  expanded: boolean;
  parentTabKey: string | null;
  statusSummary: SidebarTabStatusSummary;
}
```

#### `buildSidebarParentTabKey({ workspaceKey, tabId })`

Creates the persisted expansion key as `<workspaceKey>:<tabId>`.

#### `buildSidebarEmbeddedTabTreeRows({ workspaceKey, items, parentTabIdByTabId, expandedParentTabKeys, statusSummariesByTabId })`

Implementation details:

- Creates a node for every visible embedded-tab item.
- Treats tabs without an in-list parent as roots.
- Uses `parentTabIdByTabId` only when the parent tab is also present in `items`; missing parents do not create phantom rows.
- Computes each node's aggregate `statusSummary` by combining its own summary with descendant summaries.
- Emits rows depth-first.
- Only emits children when the row's `parentTabKey` is present in `expandedParentTabKeys`.
- Marks leaf rows with `parentTabKey: null` and `expanded: false`.

#### `combineOwnAndDescendantSummaries(ownSummary, descendantSummaries)`

Combines descendant propagated counts via `combineSidebarTabStatusSummaries`, then adds the row's own bucket counts, draft counts, and entry counts back on top so a parent row reflects both itself and its subtree.

## Workspace Tab Close Hook

### `packages/app/src/screens/workspace/use-workspace-tab-close.ts`

This hook now centralizes close cleanup, descendant-close ordering, and sorted close-successor behavior used by both workspace tabs and embedded sidebar tabs.

#### Inputs

```ts
interface UseWorkspaceTabCloseInput {
  serverId: string;
  workspaceId: string;
  workspaceDirectory?: string | null;
  tabs: readonly WorkspaceTab[];
  orderedTabIds?: readonly string[] | null;
  parentTabIdByTabId?: Readonly<Record<string, string>> | null;
  onTabClosed?: (tabId: string) => void;
}
```

#### `useCloseTabs()`

- Maintains a mutable `pendingRef` set.
- Exposes a React state `closingTabIds` set for rendering spinners/disabled states.
- `closeTab(tabId, action)` trims the id, ignores empty ids, and ignores duplicate close attempts.
- Adds the tab id to pending state, awaits the action, and removes it in `finally`.

#### `trimNonEmpty(value)`

- Returns `null` for non-strings.
- Trims strings.
- Returns `null` for empty strings.

#### `closeWorkspaceTabWithCleanup(closeInput)`

- Normalizes the tab id.
- Requires a workspace persistence key.
- For agent tabs: unpins and hides the agent in the workspace layout store.
- For browser tabs: removes the browser record from `useBrowserStore` and clears the Electron browser partition when available.
- Calls `closeWorkspaceTab(persistenceKey, normalizedTabId, orderedTabIds)` so close-successor selection follows the current sorted order.
- Calls optional `onTabClosed`.

#### `removeTerminalFromCache(terminalId)`

Updates the React Query terminal payload by applying `removeTerminalFromPayload` to the cached terminal list.

#### `killTerminal(terminalId)`

- Throws the localized disconnected-host error if no runtime client exists.
- Throws `"Unable to close terminal"` when the payload reports failure.

#### `handleCloseTerminalTab({ tabId, terminalId })`

- Uses `closeTab` so duplicate close actions are ignored.
- Shows destructive confirmation.
- Optimistically removes the terminal from cache.
- Closes the workspace tab locally.
- Starts terminal kill asynchronously.
- Invalidates terminal queries if the kill request fails.

#### `handleCloseSingleAgentTab({ tabId, agentId })`

- Reads the agent from the session store.
- Resolves policy with `resolveCloseAgentTabPolicy`.
- If the agent is running and policy is `archive-on-close`, shows destructive confirmation.
- Closes the tab locally.
- Returns immediately for `layout-only` policy.
- Otherwise fires `archiveAgent` and intentionally swallows mutation errors because the mutation handles settlement.

#### `handleCloseAgentTab({ tabId, agentId })`

- Builds `descendantTabIdsByParentTabId` from the current tab list and `parentTabIdByTabId`.
- Calls `closeDescendantTabsBeforeParent` first, so child agent tabs are closed deepest-first before the parent row disappears.
- Aborts the parent close if any descendant close returns `false` (for example a declined terminal confirmation).
- After descendants are closed, runs the single-agent close/archive logic.

#### `handleCloseSingleTabById(tabId)`

- Dispatches terminal and agent tabs through the same close helpers used by the public API.
- Returns `true` when the tab no longer exists in `tabTargetById`, allowing descendant close passes to tolerate already-closed rows.

#### `handleClosePassiveTab(...)`

Closes non-agent/non-terminal tabs through `closeWorkspaceTabWithCleanup`.

#### `handleCloseTabById(tabId)`

Dispatches close behavior by target kind:

- terminal -> `handleCloseTerminalTab`
- agent -> `handleCloseAgentTab`
- everything else -> `handleClosePassiveTab`

The hook returns `closingTabIds`, raw `closeTab`, `closeWorkspaceTabWithCleanup`, and `handleCloseTabById`.

### `packages/app/src/screens/workspace/workspace-tab-close-tree.ts`

Extracts the descendant-closing helpers used by `useWorkspaceTabClose`.

#### `collectDescendantTabIdsByParentTabId({ tabs, parentTabIdByTabId })`

- Builds `childrenByParent` from the layout parent map.
- Recursively collects each tab's descendants.
- Stores descendants in deepest-first order (`grandchildren` before their parent child) so callers can close leaves first.
- Breaks parent cycles by tracking an `ancestors` set and returning an empty list when a cycle is detected.

#### `closeDescendantTabsBeforeParent({ parentTabId, descendantTabIdsByParentTabId, closeSingleTabById })`

Sequentially closes every recorded descendant for `parentTabId`, stopping and returning `false` on the first failed close.

## Sidebar List And Row Changes

### `packages/app/src/hooks/sidebar-workspaces-view-model.ts`

The sidebar workspace view model now supports explicit workspace sorting while preserving manual ordering as the persisted/default behavior.

#### `SidebarWorkspaceEntry`

Adds data needed by sort and visibility decisions:

- `createdAt: Date | null`
- `activityAt: Date | null`
- `statusBucket: SidebarStateBucket`
- `statusEnteredAt: Date | null`

#### `createSidebarWorkspaceEntry(...)`

`packages/app/src/hooks/use-sidebar-workspaces-list.ts` now derives an effective workspace status before building each entry:

- If the workspace descriptor status is not `done`, that descriptor status wins.
- Otherwise, an active pending initial-agent create for the same server/workspace makes the row `running`, using the newest pending-create timestamp as `statusEnteredAt`.
- Otherwise, the newest non-archived root agent in the workspace can promote the row to `needs_input`, `failed`, `attention`, or `running` via `deriveSidebarStateBucket`.
- Subagents do not contribute directly to this workspace row activity calculation because workspace-level status is keyed to root agent activity.

#### `sortSidebarWorkspaceProjects({ projects, sortMode })`

Sorts workspaces within each project:

- `"manual"` returns the original `projects` array by identity.
- `"created"` sorts by `createdAt` descending.
- `"lastUpdated"` sorts by `activityAt ?? createdAt ?? statusEnteredAt` descending.
- `"status"` sorts by urgency rank first, then the same last-updated timestamp descending, then workspace name.

Workspace status urgency rank:

| Bucket        | Rank |
| ------------- | ---- |
| `needs_input` | 0    |
| `failed`      | 1    |
| `attention`   | 2    |
| `running`     | 3    |
| `done`        | 4    |

Name tiebreaking uses `localeCompare` with `{ numeric: true, sensitivity: "base" }`, then falls back to `workspaceKey`.

#### `useSidebarWorkspacesList(...)`

- Reads `getWorkspaceSortMode(serverId)` from `useSidebarViewStore`.
- In manual mode, returns the host-project structure order and relies on `useSidebarOrderStore` for persisted drag order.
- In non-manual modes, hydrates each structural workspace row from the session workspace map before sorting so sort decisions use current timestamps/status.
- Subscribes to `agents` and pending create attempts only for status sort, because those are only needed for effective status.
- Continues writing missing project/workspace keys into the manual order store from the unsorted `baseProjects`, so switching back to manual preserves the user's order.

### `packages/app/src/components/sidebar/sidebar-workspace-row-visibility.ts`

This pure helper centralizes the trailing-slot arbitration for workspace rows.

#### `getWorkspaceRowRightVisibility(input)`

Input:

```ts
interface WorkspaceRowRightVisibilityInput {
  badgeMode: SidebarBadgeMode;
  expanded: boolean;
  hasArchiveAction: boolean;
  hasCreateTabAction: boolean;
  hasDiffStat: boolean;
  hasVcOperationBadges: boolean;
  isCompactLayout: boolean;
  isHovered: boolean;
  isTouchPlatform: boolean;
  showShortcutBadge: boolean;
  shortcutNumber: number | null;
  tabStatusSummary: SidebarTabStatusSummary;
}
```

Output:

```ts
interface WorkspaceRowRightVisibility {
  showCreateTab: boolean;
  showKebabInSlot: boolean;
  showVcOperationBadges: boolean;
  showDiffStat: boolean;
  showStatusSummary: boolean;
  shouldRenderActionSlot: boolean;
}
```

Behavior:

- `showCreateTab` is currently always `false`.
- Action controls are considered visible on hover, touch platforms, or compact layout.
- A shortcut badge suppresses kebab, VC operation badges, diff stat, and status summary.
- In `status` badge mode, a collapsed workspace row with non-empty tab status badges keeps those status badges visible even while hovered, so action controls do not replace the attention signal.
- In `diff` badge mode, diff stats show only when there is a diff stat, the row is not hovered, and no shortcut badge is visible.
- VC operation badges show only when there are pending operations and neither action controls, shortcut badges, nor status summaries should occupy the slot.
- The action slot is still rendered when archive/create actions exist, when diff mode has diff/VC metadata, when VC operations exist in other modes, or when a collapsed status-mode row has status badges.

### `packages/app/src/utils/sidebar-active-workspace-reveal.ts`

Adds `findActiveSidebarWorkspaceRevealTarget({ projects, selection, serverId, selectionEnabled })`.

Behavior:

- Returns `null` unless route-based selection is enabled, there is a selection, and the selection's server id matches the current sidebar server.
- Scans visible projects for the selected workspace id.
- Returns `{ projectKey, workspaceKey }` for the containing project/workspace when found.
- Returns `null` when the active workspace is not present in the current sidebar model.

### `packages/app/src/components/sidebar/sidebar-vc-operation-badge.tsx`

Adds the compact git-operation badges shown on workspace rows when checkout actions are in progress.

#### `usePendingCheckoutBranchActionIds({ serverId, cwd })`

- Reads `useCheckoutGitActionsStore.getPendingBranchActionIds`.
- Returns `[]` when there is no workspace directory.
- Uses a custom equality function so unchanged action id arrays do not rerender rows.

#### `SidebarVcOperationBadges`

- Renders one 16 px loader-backed badge per pending action id.
- Uses a small overlay icon to distinguish action type:
  - commit -> `GitCommitHorizontal`
  - pull -> `Download`
  - push -> `Upload`
  - pull-and-push -> `ArrowDownUp`
  - merge-branch -> `GitMerge`
  - merge-from-base -> `RefreshCcw`
  - PR operations -> `GitHubIcon`
  - refresh/archive-worktree -> no overlay icon, spinner only

### `packages/app/src/components/sidebar-workspace-list.tsx`

The sidebar list now supports nested embedded tabs under workspace rows, subtree status aggregation, workspace git-operation badges, workspace sorting, active-row reveal, and full embedded-tab context menus.

Key behavior:

- Reads workspace tab layouts and pane state.
- Builds embedded tab rows for each workspace.
- Applies per-server tab sort and recent-count preferences.
- Applies per-server workspace sort preferences in `useSidebarWorkspacesList`.
- Applies manual order merges through `mergeEmbeddedVisibleTabOrder`.
- Supports workspace collapse/expand and auto-collapse behavior.
- Supports status-mode grouping via `SidebarStatusWorkspaceList`.
- Supports drag/drop where available.
- Uses `SidebarWorkspaceRowContent` for workspace row presentation and `SidebarEntryRowContent` for embedded tab rows.
- Provides context menu actions for workspace and embedded tabs.
- Treats non-main-pane active tabs as forced-visible embedded rows so split panes stay reachable from the sidebar.
- Renders workspace rows through a `DraggableList` only when `workspaceSortMode === "manual"`; created/lastUpdated/status modes render a static list so drag gestures cannot rewrite a derived sort order.
- Uses `findActiveSidebarWorkspaceRevealTarget` whenever the route points at a workspace. The containing project is expanded, or becomes the only expanded project when `autoCollapseProjects` is enabled. The workspace is uncollapsed, or becomes the only expanded workspace when sidebar-layout `autoCollapseWorkspaces` is enabled.
- Tracks the last auto-revealed workspace key to avoid repeatedly rewriting collapsed-section state for the same active workspace.
- Uses a three-state row highlight model (`"idle"`, `"active"`, `"selected"`) so project/workspace ancestors can show a subdued active background while directly selected rows and embedded active tabs keep the stronger selected background.

#### `useSidebarTabStatusSummaries`

Now also reads `queuedMessages` from the session store and `draftInputsByKey` from the draft store, passing both into `summarizeSidebarTabs`. This enables queued-message badges and draft-text propagation in workspace-level status summaries.

- `queuedMessageCountsByAgentId` is derived by mapping agent queues from session state to a `Map<agentId, queue.length>`.
- `draftInputsByKey` is derived by iterating active draft records and extracting their `input` values.

Old `SidebarStatusSummaryBadges`, `StatusSummaryCountBadge`, and `SidebarTabStatusSymbol` local components were removed. Callers now use `SidebarEntryStatusBadges` from `sidebar-entry-row.tsx`.

`ProjectHeaderTrailingContent` was removed. Project rows build their trailing content inline and pass `SidebarEntryStatusBadges` directly.

`ProjectHeaderRow`, `WorkspaceRowInner`, and `EmbeddedWorkspaceTabRow` share the row highlight semantics:

- `SidebarRowHighlightState = "idle" | "active" | "selected"` is exported from `sidebar-active-ancestor-highlight.ts`.
- `"selected"` maps to `styles.sidebarRowSelected` and is used for direct selection, including active embedded tab rows.
- `"active"` maps to `styles.sidebarRowActive` and is used for project/workspace ancestor rows when a selected embedded tab lives beneath them.
- `"idle"` applies no highlight style.
- Workspace rows report `aria-selected` / `accessibilityState.selected` only when the highlight state is `"selected"`, not for the softer ancestor-active state.
- `WorkspaceRowWithMenu` checks the workspace layout before treating a selected workspace as an embedded-tab ancestor: the main pane must have an active tab, or the focused non-main pane must have an active tab. This avoids soft-highlighting a workspace as an embedded ancestor when embedded tabs are enabled but no embedded tab is actually selected.

Added `ProjectContextMenuContent` — a `ContextMenuContent` panel mirroring the project kebab menu, wrapping the project row with `ContextMenu`/`ContextMenuTrigger`.

`ProjectModeList` also routes project disclosure clicks through `handleToggleProjectCollapsed`. When `autoCollapseProjects` is enabled and the clicked project is currently collapsed, it calls `setOnlyProjectExpanded(projectKey, allProjectKeys)` so opening one project collapses all other visible projects. Otherwise it falls back to the normal toggle handler.

The active-workspace reveal effect also calls `rememberProjectWorkspaceSelection(projectKey, workspaceId)` whenever a project/workspace reveal target is available. When a collapsed project is reopened while `autoCollapseProjects` is enabled, `handleToggleProjectCollapsed(project)` looks up the remembered workspace id for that project, verifies it still exists in the current `project.workspaces`, calls `onWorkspacePress?.()`, and navigates to the remembered workspace before returning. The handler receives the whole `SidebarProjectEntry` so it can perform that lookup without re-deriving project contents from global state.

#### `WorkspaceRowRightGroup` / `WorkspaceRowActionSlot`

- Workspace rows now query `usePendingCheckoutBranchActionIds` using the workspace directory.
- Workspace rows call `getWorkspaceRowRightVisibility` to decide which right-side content should occupy the stable trailing slot.
- Trailing metadata is split into:
  - `WorkspaceRowTrailingMeta` for diff stat / PR hint / status badges / VC operation badges.
  - `WorkspaceRowActionControls` for hover-visible create-tab and kebab actions.
- When branch-operation badges are visible, they replace diff/status trailing metadata for that row unless a collapsed status summary or shortcut badge has priority.

#### `EmbeddedWorkspaceTabs`

This component now owns the embedded sidebar tree for one workspace.

Implementation details:

- Reads the persisted layout, collects all panes, and finds the main pane.
- Builds `allItems` from every main-pane tab plus the active tab from each non-main pane.
- Computes per-tab status summaries through `summarizeSidebarTabs`.
- Sorts with `sortSidebarTabItems`.
- Converts the sorted rows into a visible tree with `buildSidebarEmbeddedTabTreeRows`.
- Applies `applyRecentTreeRowCount`, which limits visible rows by top-level tree position but force-includes pinned/active rows.
- Persists parent expansion state through `useSidebarCollapsedSectionsStore(...expandedParentTabKeys...)`.
- Uses `useWorkspaceTabClose` with both `orderedTabIds` and `parentTabIdByTabId`.

#### `EmbeddedWorkspaceTabRow`

- Renders parent rows with an `EmbeddedTabChevronButton` instead of the tab icon.
- Indents descendant rows by `24 + depth * 16`.
- In diff mode, shows the highest-priority status as the leading overlay badge.
- In status mode, renders subtree badges in the trailing slot using the row's aggregate `statusSummary`.
- Shows kebab + close controls on hover/native/compact layouts.
- Supports middle-click close on web by attaching an `auxclick` handler directly to the row element.
- Allows drag handles only for depth-0 main-pane rows in manual mode.
- Wraps both the row and kebab surface around the same `WorkspaceTabMenuEntry[]` produced by `buildWorkspaceTabMenuEntries`.
- Passes `surface: "vertical"` when building embedded sidebar tab menu entries so left/right bulk close commands use vertical tab semantics.
- Applies `entry.iconRotation === "clockwise-90"` to arrow menu icons so vertical close-left/close-right affordances point in the correct visual direction. The same rotation support is used by the mobile tab dropdown.

#### Embedded tab menus and bulk close

- `EmbeddedTabContextMenuContent` and `EmbeddedTabKebabMenu` render the same menu entry list for right-click and three-dot surfaces.
- `buildMenuEntries(item)` passes callbacks for:
  - copy agent id
  - copy file path
  - copy provider resume command
  - reload agent
  - rename tab
  - close tab
  - close tabs to the left
  - close tabs to the right
  - close other tabs
- Bulk close actions operate on the selected pane's ordered tabs, not the full workspace tab set.

### `packages/app/src/components/sidebar/sidebar-workspace-row-content.tsx`

`SidebarWorkspaceRowContent` was refactored to delegate to `SidebarEntryRowContent`.

Changes:

- Removed `isCreating` prop (was only used for a muted label style; replaced by leading status badge).
- Added `leadingStatusKind?: SidebarEntryStatusKind | null` — passed through as `leadingStatus` to `SidebarEntryRowContent`.
- Layout is now fully owned by `SidebarEntryRowContent` instead of a local flex hierarchy.
- `WorkspaceLeadingVisual` is passed as the `leading` prop via `createElement`.
- `scriptIconKind` and `children` are composed into a single `rightContext` `View` via `createElement` — avoiding JSX to satisfy the memo equality contract at the call sites.
- Shortcut badge is passed as `shortcutBadge` prop.

### `packages/app/src/components/sidebar/sidebar-status-list.tsx`

The status-group list now wraps workspace rows with a `ContextMenu` and shows a `StatusWorkspaceContextMenuContent` panel.

Changes:

- `StatusWorkspaceRowWithMenu` changed from a `<>` fragment to a `<ContextMenu>` wrapper.
- The inner `<Pressable>` in `StatusWorkspaceRowInner` was replaced with `<ContextMenuTrigger>`.
- Added `StatusWorkspaceContextMenuContent` — a `ContextMenuContent` component with the same menu items as the kebab `StatusKebabMenu`:
  - Copy path (when handler present).
  - Copy branch name (for git projects only).
  - Rename workspace.
  - Mark as read (when handler present).
  - Archive (always, with shortcut badge when workspace is selected).

## Workspace Layout And Navigation Store Changes

### `packages/app/src/stores/workspace-layout-store.ts`

`closeTab` now accepts an optional `orderedTabIds?: readonly string[] | null` argument and forwards it into `closeTabInLayout`.

### `packages/app/src/stores/workspace-layout-actions.ts`

Adds/updates actions used by sidebar tab close, reorder, tree parenting, and layout reconciliation.

#### `WorkspaceTabSnapshot`

Adds:

```ts
parentAgentIdByAgentId?: ReadonlyMap<string, string> | Iterable<readonly [string, string]>;
```

This snapshot field carries subagent parentage from live agent visibility into the persisted tab layout reconciler.

#### `closeTabInLayout({ layout, tabId, orderedTabIds })`

- Passes `orderedTabIds` into `getCloseSuccessorTabId`.
- Keeps the existing "prefer parent tab if still open" rule.
- Otherwise chooses next/previous using `mergeTabNavigationOrder({ fallbackTabIds: pane.tabIds, orderedTabIds })`.

#### Parent/child tab helpers

- `normalizeStringMap` trims and validates parent-agent mappings from the snapshot.
- `attachParentTabInLayout` writes `parentTabIdByTabId[childTabId] = parentTabId` and re-normalizes the map.
- `pruneStaleAgentParentTabMappings` removes agent-tab parent edges whose live agent parent no longer matches the open parent tab.

#### Reconciliation

- `reconcileWorkspaceTabs` normalizes `parentAgentIdByAgentId` from the snapshot.
- `addMissingEntityTabs` now recursively ensures a parent agent tab exists before opening an auto-open subagent tab.
- When both parent and child agent tabs are open, it attaches a layout parent edge between their deterministic tab ids.
- Parent edges are pruned before stale-tab collapse runs, so removed subagent relationships do not leave orphan tree links behind.

### `packages/app/src/stores/navigation-active-workspace-store/navigation.ts`

Updates navigation behavior so explicit workspace navigation wins over attention-agent redirects.

Tests verify the active workspace store behavior.

### `packages/app/src/stores/sidebar-collapsed-sections-store/state.ts`

Adds persisted parent-tab expansion state and remembered per-project workspace selection:

- `expandedParentTabKeys: Set<string>` on in-memory state.
- `lastSelectedWorkspaceIdByProjectKey: Record<string, string>` on in-memory state.
- `toggleParentTabExpanded(state, parentTabKey)` to expand/collapse one parent row.
- `rememberProjectWorkspaceSelection(state, projectKey, workspaceId)` trims both ids, ignores empty ids, returns the same state when the stored selection is unchanged, and otherwise writes the latest workspace id for the project.
- serialization/deserialization of `expandedParentTabKeys` and `lastSelectedWorkspaceIdByProjectKey` beside the existing project/status/workspace collapsed key sets.
- persisted workspace selections accept only object values whose workspace ids are strings; invalid values are dropped during hydration.
- `mergePersistedCollapsedProjects` compares both sets and selection records so hydration preserves referential identity when nothing changed.

### `packages/app/src/stores/sidebar-collapsed-sections-store/index.ts`

The zustand store now exposes:

- `lastSelectedWorkspaceIdByProjectKey`.
- `rememberProjectWorkspaceSelection(projectKey, workspaceId)`, which delegates to the pure state transition and updates the persisted store.

The initial store state seeds `lastSelectedWorkspaceIdByProjectKey` to `{}`.

### `packages/app/src/workspace-tabs/agent-visibility.ts`

`deriveWorkspaceAgentVisibility` now returns `parentAgentIdByAgentId`.

Rules:

- Only records a parent mapping when both child and parent belong to the same workspace.
- Subagent tabs are auto-opened even if they would not otherwise satisfy `shouldAutoOpenAgentTab`.
- `buildWorkspaceTabSnapshot` passes the parent map into `WorkspaceTabSnapshot`.
- `workspaceAgentVisibilityEqual` now compares both sets and the parent map.

### `packages/app/src/workspace-tabs/tab-navigation.ts`

Shared navigation helpers used by layout close-successor logic and workspace keyboard cycling.

#### `mergeTabNavigationOrder({ fallbackTabIds, orderedTabIds })`

- Starts with `orderedTabIds` when present.
- Drops ids that are not currently open.
- De-dupes repeated ids.
- Appends any remaining fallback ids so transiently unsorted tabs still remain navigable.

#### `getRelativeTabId({ tabIds, activeTabId, delta })`

- Returns `null` for an empty list.
- Uses the active tab's position when present, otherwise starts from index 0.
- Wraps cyclically for both forward and backward movement.

## Workspace Screen Integration

### `packages/app/src/screens/workspace/workspace-screen.tsx`

The workspace screen now uses the shared sort/navigation helpers so the main workspace view and embedded sidebar tree agree on ordering, close-successor behavior, and keyboard traversal. It also adds split-pane creation controls to the workspace header.

### `packages/app/src/screens/workspace/workspace-desktop-tabs-row.tsx`

The desktop tab row now gives agent tabs a richer tooltip instead of the previous label-plus-agent-id row.

#### Agent tab info

- `AgentTabInfo` carries `createdAt: Date | null`, `updatedAt: Date | null`, `initialPrompt: string | null`, and `userPromptCount: number`.
- `getUserPromptSummary(items)` scans stream head/tail items, counts `user_message` entries, and captures the first non-empty trimmed user message as the initial prompt.
- `useAgentTabInfo(serverId, tab)` returns `null` for non-agent tabs. For agent tabs it reads the session store with `useStoreWithEqualityFn` and `fast-deep-equal`, resolves agent metadata from `agents` or `agentDetails`, combines `agentStreamHead` and `agentStreamTail`, and falls back to the tab's `createdAt` timestamp when agent metadata does not include a creation date.
- Empty stream arrays are stable module constants so missing stream state does not allocate during selector runs.

#### Tooltip formatting

- `formatAbsoluteDateTime(date)` renders month/day/year/hour/minute with the current locale.
- `formatUpdatedDateTime(date)` uses `formatTimeAgo` for timestamps newer than seven days and absolute formatting for older updates.
- `AgentTabTooltipContent` renders a 260 px detail card with the tab label, seven-character agent id, initial prompt capped at three lines, created/updated rows when present, and a `MessageCircle` prompt-count row.
- `TabChip` passes `normalizedServerId` into the tooltip path so the hook can read the right session. Agent tab tooltips use `AgentTabTooltipContent`; terminal/browser/draft tabs still use the simple label tooltip.
- The tooltip delay is set to `0` for immediate desktop disclosure.

#### `useDesktopEmbeddedTabsEnabled(isMobile)`

Returns `true` when `appSettings.tabLayoutMode !== "horizontal"` and not mobile. Used to gate split-menu and embedded-tab presentation.

#### `WorkspaceHeaderSplitMenu`

New header component for split-pane creation.

Props: `normalizedServerId`, `showCreateBrowserTab`, `createTerminalDisabled`, icon props, and four creation callbacks:

- `onCreateDraftSplit(placement)` — creates a draft tab in a new split.
- `onCreateTerminalSplit(placement)` — creates a terminal tab in a new split.
- `onCreateTerminalProfileSplit(placement, profile)` — creates a terminal with a specific profile.
- `onCreateBrowserSplit(placement)` — creates a browser tab in a new split.

The `placement` argument is either `"right"` (default) or `"bottom"` and is driven by `useWorkspaceHeaderSplitPlacement`.

#### `useWorkspaceHeaderSplitPlacement()`

Returns `"bottom"` when the platform modifier key (Command on macOS, Control elsewhere) is held; otherwise `"right"`. Uses `keydown`/`keyup`/`blur` listeners on `window` — web only, guarded by `isWeb`.

#### `shouldShowWorkspaceHeaderSplitMenu(input)`

Returns true only when: `embeddedTabsEnabled && canRenderDesktopPaneSplits && mainPaneId !== null`.

#### `renderWorkspaceHeaderSplitMenu(input)`

Returns null when `input.visible` is false; otherwise renders the `WorkspaceHeaderSplitMenu`.

#### `WorkspaceHeaderSplitMenuTriggerIcon`

Shows `ThemedColumns2` (horizontal split) or `ThemedRows2` (vertical split) based on current placement. Color follows hover/open state.

#### Tab ordering and close integration

- Computes `statusSummariesByTabId` for all UI tabs.
- Derives `effectiveTabSortMode` with `getWorkspaceTabNavigationSortMode`.
- Builds `orderedTabIds` with `sortSidebarWorkspaceTabs`.
- Passes those ids into `useWorkspaceTabClose`, so closing a tab from the main workspace view uses the same successor order as the sidebar.
- Reorders `navigationTabs` from `orderedTabIds` whenever sort mode is not manual.
- Uses `getRelativeTabId` for cyclic previous/next tab keyboard navigation.

## Split Container

### `packages/app/src/components/split-container.tsx`

Added `embeddedMainPaneId?: string | null` prop to `SplitContainerProps`.

When `embeddedMainPaneId` equals the current pane's id, the pane's tab row (`WorkspaceDesktopTabsRow`) is suppressed entirely. This allows the workspace screen to hide the redundant tab row for the primary pane while the sidebar shows it instead.

## Protocol And Workspace Metadata

### `packages/protocol/src/messages.ts`

`WorkspaceDescriptorPayloadSchema` accepts a new optional field:

```ts
createdAt?: string;
```

The schema keeps the field optional for old daemons. The field carries a `COMPAT(workspaceCreatedAt)` comment noting that the optional gate was added in `v0.1.102` and can be removed when the compatibility floor reaches that version.

### `packages/server/src/server/session.ts`

Workspace descriptor payloads now include `createdAt: workspace.createdAt` in both normal workspace descriptors and newly-created worktree descriptors.

The worktree creation response also uses `result.workspace.createdAt` as `statusEnteredAt`, so newly-created empty workspaces have a stable creation/activity timestamp.

### `packages/protocol/src/messages.workspaces.test.ts`

Adds coverage that legacy workspace descriptors without `createdAt` still parse successfully and expose `createdAt` as `undefined`.

The client-side sidebar uses this metadata for creation-time workspace sorting while preserving backward compatibility with older daemons.

## Panel Store Width State

### `packages/app/src/stores/panel-store/state.ts`

Adds a dedicated width range for the vertical workspace tab rail:

```ts
DEFAULT_VERTICAL_TABS_SIDEBAR_WIDTH = 240;
MIN_VERTICAL_TABS_SIDEBAR_WIDTH = 180;
MAX_VERTICAL_TABS_SIDEBAR_WIDTH = 420;
clampVerticalTabsSidebarWidth(width): number;
```

`migratePanelState` initializes `verticalTabsSidebarWidth` for persisted versions below `12`, defaults invalid values, and clamps valid numeric persisted values into the rail-specific range.

### `packages/app/src/stores/panel-store/index.ts`

`PanelState` adds:

```ts
verticalTabsSidebarWidth: number;
setVerticalTabsSidebarWidth(width: number): void;
```

The persisted store version is bumped from `11` to `12`, `verticalTabsSidebarWidth` is included in `partialize`, and the setter clamps through `clampVerticalTabsSidebarWidth`.

## Agent Panel

### `packages/app/src/panels/agent-panel.tsx`

`useDraftPanelDescriptor` now uses the provider icon instead of a plain `SquarePen` when badge mode is `"status"`.

Changes:

- The `target` parameter now accepts an optional `setup?: WorkspaceDraftTabSetup` field.
- Reads `getBadgeMode` from `useSidebarViewStore`.
- Reads `preferences.provider` from `useFormPreferences` as a fallback provider.
- Resolves `draftProvider` as `target.setup?.provider ?? preferences.provider ?? "codex"`.
- When `badgeMode === "status"`, uses `getProviderIcon(draftProvider)` as the icon; otherwise uses `SquarePen`.

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

Adds persisted tab layout selection and keeps `workspaceTitleSource` available to the sidebar menu.

#### `packages/app/src/hooks/use-settings/storage.ts`

Adds:

```ts
export type AppTabLayoutMode = "horizontal" | "vertical" | "sidebar";

interface AppSettings {
  tabLayoutMode: AppTabLayoutMode;
}
```

Defaults `tabLayoutMode` to `"horizontal"`.

Settings parsing accepts only `"horizontal"`, `"vertical"`, and `"sidebar"`. It also migrates the legacy boolean `embeddedTabs` value:

- `embeddedTabs: true` -> `tabLayoutMode: "sidebar"`
- `embeddedTabs: false` -> `tabLayoutMode: "horizontal"`

Invalid or missing tab layout values are ignored so the default applies.

#### `packages/app/src/hooks/use-settings/index.ts`

Re-exports `AppTabLayoutMode` and allows `updateSettings({ tabLayoutMode })` to flow into persisted app settings.

#### `packages/app/src/screens/settings/appearance/appearance-section.tsx`

Adds a Tab Layout row to Appearance settings.

Behavior:

- Renders a dropdown with Horizontal, Vertical, and Sidebar options.
- Uses `getTabLayoutLabel(t, value)` to resolve localized labels.
- Writes through `updateSettings({ tabLayoutMode })`.
- Keeps the current settings card structure: theme row first, tab layout row second.

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
- `packages/app/src/components/sidebar/sidebar-entry-row.test.tsx`
- `packages/app/src/components/sidebar/sidebar-workspace-row-content.test.tsx`
- `packages/app/src/stores/sidebar-view-store.test.ts`
- `packages/app/src/stores/workspace-layout-store.find-main-pane.test.ts`
- `packages/app/src/stores/workspace-layout-store.test.ts`
- `packages/app/src/utils/sidebar-active-ancestor-highlight.test.ts`
- `packages/app/src/utils/sidebar-embedded-tab-tree.test.ts`
- `packages/app/src/utils/sidebar-tab-sort.test.ts`
- `packages/app/src/utils/sidebar-tab-status-summary.test.ts`
- `packages/app/src/workspace-tabs/agent-visibility.test.ts`
- `packages/app/src/workspace-tabs/tab-navigation.test.ts`
- `packages/app/src/screens/workspace/workspace-tab-close-tree.test.ts`
- navigation and collapsed-section store tests

These cover ordering, nested tree construction, row rendering, persisted sidebar preferences, main-pane lookup, close-descendant sequencing, tab status summaries (including draft state and queued message counts), navigation behavior, and collapsed-section state.

## Verification

The branch commits were created with the repo pre-commit hook enabled.

The hook ran:

- `npm run lint` on changed files.
- `npm run format:check:files` on changed files.
- `npm run typecheck` across workspaces.

All passed for each implementation commit.
