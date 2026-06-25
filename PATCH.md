# Patch Summary: Embedded Workspace Tabs In Sidebar

Branch: `feat/sidebar-workspace-tabs`

Base: `origin/main`

Anchor commit: 25ff932af152990c2bd54ce1d96ea3a6ea62e9e6 — feat(app): unify sidebar entry rows with per-kind status counts

## Purpose

This branch redesigns the sidebar so workspace tabs can be shown and controlled directly under each workspace. It adds sidebar-specific tab ordering, recent tab filtering, status badges, grouping controls, tab-close cleanup, and layout state needed for embedded tab presentation.

The branch is intentionally grouped because the sidebar list, workspace layout store, tab close behavior, status summaries, and sidebar preferences depend on each other.

## User-Facing Changes

- Adds embedded workspace tabs inside sidebar workspace rows.
- Adds sidebar grouping controls for:
  - project/status grouping
  - workspace title source
  - auto-collapse workspaces
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

The tab sort mode menu includes four options: Manual, Created, Last Updated, and **Status** (sorts by most urgent status, with recency as a tiebreaker).

#### Menu Item Components

The selector defines typed item components for:

- workspace title source
- group mode
- tab sort mode
- recent tab count
- badge mode

Each component creates a stable `handleSelect` callback that passes its typed value back to the parent.

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

The sidebar list now supports embedded tabs under workspace rows, per-kind status badges, and context menus on project rows.

Key behavior:

- Reads workspace tab layouts and pane state.
- Builds embedded tab rows for each workspace.
- Applies per-server tab sort and recent-count preferences.
- Applies manual order merges through `mergeEmbeddedVisibleTabOrder`.
- Supports workspace collapse/expand and auto-collapse behavior.
- Supports status-mode grouping via `SidebarStatusWorkspaceList`.
- Supports drag/drop where available.
- Uses `SidebarWorkspaceRowContent` for workspace row presentation and `SidebarEntryRowContent` for embedded tab rows.
- Provides context menu actions for workspace and embedded tabs.

#### `useSidebarTabStatusSummaries`

Now also reads `queuedMessages` from the session store and `draftInputsByKey` from the draft store, passing both into `summarizeSidebarTabs`. This enables queued-message badges and draft-text propagation in workspace-level status summaries.

- `queuedMessageCountsByAgentId` is derived by mapping agent queues from session state to a `Map<agentId, queue.length>`.
- `draftInputsByKey` is derived by iterating active draft records and extracting their `input` values.

#### `sortEmbeddedTabs`

Added `"status"` sort mode:

- Looks up each tab's `SidebarTabStatusSummary` from `statusSummariesByTabId`.
- Compares by `getSidebarEntryStatusSortRank` (lower rank = higher priority).
- Ties are broken by `lastUpdatedAt` descending.

Old `SidebarStatusSummaryBadges`, `StatusSummaryCountBadge`, and `SidebarTabStatusSymbol` local components were removed. Callers now use `SidebarEntryStatusBadges` from `sidebar-entry-row.tsx`.

`ProjectHeaderTrailingContent` was removed. Project rows build their trailing content inline and pass `SidebarEntryStatusBadges` directly.

Added `ProjectContextMenuContent` — a `ContextMenuContent` panel mirroring the project kebab menu, wrapping the project row with `ContextMenu`/`ContextMenuTrigger`.

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

The workspace screen now uses the shared close hook and exposes tab actions needed by sidebar embedded tab controls. It also adds split-pane creation controls to the workspace header.

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

## Split Container

### `packages/app/src/components/split-container.tsx`

Added `embeddedMainPaneId?: string | null` prop to `SplitContainerProps`.

When `embeddedMainPaneId` equals the current pane's id, the pane's tab row (`WorkspaceDesktopTabsRow`) is suppressed entirely. This allows the workspace screen to hide the redundant tab row for the primary pane while the sidebar shows it instead.

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
- `packages/app/src/components/sidebar/sidebar-entry-row.test.tsx`
- `packages/app/src/components/sidebar/sidebar-workspace-row-content.test.tsx`
- `packages/app/src/stores/sidebar-view-store.test.ts`
- `packages/app/src/stores/workspace-layout-store.find-main-pane.test.ts`
- `packages/app/src/utils/sidebar-tab-status-summary.test.ts`
- navigation and collapsed-section store tests
- workspace layout store tests

These cover ordering, row rendering, persisted sidebar preferences, main-pane lookup, tab status summaries (including draft state and queued message counts), navigation behavior, and collapsed-section state.

## Verification

The branch commits were created with the repo pre-commit hook enabled.

The hook ran:

- `npm run lint` on changed files.
- `npm run format:check:files` on changed files.
- `npm run typecheck` across workspaces.

All passed for each implementation commit.
