# Patch Summary: Vertical Workspace Tab Layouts

Branch: `feat/vertical-pane-tabs`

Base: `origin/main`

Anchor commit: d906cf0a35df459c24426eecfeb10d87f8339679 — docs(patch): refresh PATCH.md for feat/vertical-pane-tabs

## Purpose

This branch expands Paseo's desktop workspace tabs from a single horizontal tab strip into three user-selectable layout modes:

- `horizontal`: the existing desktop pane tab rows.
- `vertical`: a dedicated left-side vertical tab rail that still participates in desktop pane splits.
- `sidebar`: embedded workspace tabs inside the left sidebar, with the main pane's desktop tab row suppressed so the sidebar becomes the canonical tab surface.

The branch also consolidates sidebar workspace rows and embedded tab rows onto shared status, sorting, and row-layout primitives so both vertical modes expose the same actions, badges, and close behavior.

## Settings And Persisted State

**Files**

- `packages/app/src/hooks/use-settings/storage.ts`
- `packages/app/src/hooks/use-settings/index.ts`
- `packages/app/src/hooks/use-settings/storage.test.ts`
- `packages/app/src/screens/settings/appearance/appearance-section.tsx`
- `packages/app/src/i18n/resources/{en,ar,es,fr,ru,zh-CN}.ts`

**Public surface**

- `type AppTabLayoutMode = "horizontal" | "vertical" | "sidebar"`
- `AppSettings.tabLayoutMode: AppTabLayoutMode`
- `useSettings().updateSettings()` and `useAppSettings().updateSettings()` now accept `tabLayoutMode`.

**Behavior**

- App settings now persist a single `tabLayoutMode` value instead of relying on the older embedded-tabs boolean.
- Storage migration accepts legacy `embeddedTabs: boolean` and maps it to `"sidebar"` or `"horizontal"`.
- The Appearance settings screen adds a `Tab layout` dropdown with Horizontal, Vertical, and Sidebar options.
- The workspace shell only enables the non-horizontal modes on desktop; compact/mobile keeps the existing compact tab experience.
- Translation resources add the new tab-layout labels and accessibility strings in every shipped locale.

## Workspace Layout Store And Pane Metadata

**Files**

- `packages/app/src/stores/workspace-layout-actions.ts`
- `packages/app/src/stores/workspace-layout-store.ts`
- `packages/app/src/stores/workspace-layout-store.test.ts`
- `packages/app/src/stores/workspace-layout-store.find-main-pane.test.ts`
- `packages/app/src/screens/workspace/workspace-pane-state.test.ts`

**Public surface**

- `interface SplitPane { id: string; tabIds: string[]; focusedTabId: string | null; tabBarOrientation: "horizontal" | "vertical"; createdAt?: number }`
- `findMainPane(root): SplitPane | null`
- `findTopLeftPaneId(root): string | null`
- `setPaneTabBarOrientation(workspaceKey, paneId, orientation): void`

**Behavior**

- Each pane now persists two extra pieces of metadata:
  - `createdAt`, used to identify the earliest-created pane as the "main pane".
  - `tabBarOrientation`, used to render per-pane horizontal versus vertical tab rows.
- Layout normalization repairs missing or invalid data:
  - invalid/missing `tabBarOrientation` becomes `"horizontal"`;
  - missing `createdAt` becomes `0` for the default pane and `Date.now()` for non-default panes.
- The store keeps a separate `topLeftPaneTabBarOrientation` preference. The top-left pane continues to act as the stable preference owner for vertical-pane mode so the user's orientation survives workspace purges and pane-id churn.
- Other panes persist their own `tabBarOrientation` on the pane itself.

## Workspace Screen Routing And Split Targeting

**Files**

- `packages/app/src/screens/workspace/workspace-screen.tsx`
- `packages/app/src/screens/workspace/use-workspace-tab-close.ts`
- `packages/app/src/utils/workspace-navigation.test.ts`
- `packages/app/src/workspace-tabs/tab-navigation.ts`
- `packages/app/src/workspace-tabs/tab-navigation.test.ts`

**Public surface**

- `useWorkspaceTabClose()` centralizes tab-close cleanup for agent, terminal, and browser tabs.

**Behavior**

- The workspace screen derives three routing values from the layout:
  - `mainPaneId` from `findMainPane()`
  - `topLeftPaneId` from `findTopLeftPaneId()`
  - `headerSplitPaneId`, which points at `mainPaneId` for sidebar mode and `topLeftPaneId` otherwise
- The header-level split creation menu is visible whenever desktop splits are supported and either:
  - sidebar mode is active, or
  - the top-left pane is currently vertical.
- Split actions created from that header target `headerSplitPaneId`, so sidebar mode continues splitting the hidden main pane instead of a sidebar-only rail.
- Embedded/sidebar mode passes `embeddedMainPaneId` into the split container so the main pane's desktop tab row disappears while the pane content remains mounted and focusable.
- `useWorkspaceTabClose()` removes agent pin/hidden state, removes browser partitions, updates terminal query caches, and then closes the layout tab. Agent tabs still defer to the subagent close policy from `docs/agent-lifecycle.md`: root agents archive on close, subagents become layout-only closes.

## Split Container And Vertical Pane Rows

**Files**

- `packages/app/src/components/split-container.tsx`
- `packages/app/src/components/split-container-tab-drop-preview.ts`
- `packages/app/src/components/split-container-tab-drop-preview.test.ts`
- `packages/app/src/screens/workspace/workspace-desktop-tabs-row.tsx`
- `packages/app/src/screens/workspace/workspace-tab-tooltip-preview.tsx`

**Public surface**

- `SplitContainer` accepts `embeddedMainPaneId?: string | null`.
- `WorkspaceDesktopTabsRow` now supports:
  - `tabBarOrientation?: "horizontal" | "vertical"`
  - `verticalTabsSelected?: boolean`
  - per-row display-preference sections for sort, badge mode, and recent-tab count
- `WorkspaceNewTabDropdown(props: WorkspaceNewTabDropdownProps)` is exported for reuse by other tab surfaces.
- `interface WorkspaceNewTabDropdownProps` contains:
  - `onCreateAgentTab(): void`
  - `onCreateTerminal(): void`
  - `onCreateBrowser(): void`
  - `onCreateTerminalWithProfile(profile: TerminalProfileInput): void`
  - `onEditProfiles(): void`
  - `normalizedServerId: string`
  - `showCreateBrowserTab: boolean`
  - `terminalDisabled: boolean`
  - `testIDPrefix?: string`

**Behavior**

- Each pane can render either a horizontal tab row or a vertical rail.
- Vertical rails preserve the same tab actions as horizontal rows:
  - focus/navigate
  - drag reorder
  - close current tab
  - close tabs to the left/right
  - close other tabs
  - rename
  - reload/copy actions from the workspace tab menu
  - split actions and new-tab actions
- Drag/drop preview math is orientation-aware:
  - horizontal rows compare tab centers along the x-axis;
  - vertical rows compare tab centers along the y-axis.
- Vertical rows move close buttons and overflow affordances into overlay positions that do not widen the rail, and they suppress the icon status badge in favor of the denser right-side presentation.
- Hover/focus tooltips for vertical rows use `workspace-tab-tooltip-preview.tsx` so truncated vertical entries still expose file/agent context.
- Per-pane display menus expose a `Vertical tabs` toggle and reuse the same display-preference sections as the sidebar features.
- The shared new-tab dropdown exposes the same create-agent, create-terminal, create-browser, terminal-profile, edit-profile, and pinnable-target behavior used by the desktop tab row. The desktop row wraps that dropdown with the pinned launcher row; sidebar call sites reuse only the dropdown.
- `testIDPrefix` defaults to `workspace-new-tab-menu` for the desktop row and lets sidebar call sites generate workspace-specific trigger/item ids without duplicating dropdown logic.

## Sidebar Mode And Vertical Sidebar Rail

**Files**

- `packages/app/src/components/left-sidebar.tsx`
- `packages/app/src/components/sidebar-workspace-list.tsx`
- `packages/app/src/components/sidebar/sidebar-scroll-context.ts`
- `packages/app/src/stores/panel-store/{index.ts,state.ts,state.test.ts}`

**Behavior**

- When `tabLayoutMode === "vertical"` on desktop, the left sidebar grows a separate resizable vertical-tabs rail.
- The rail width is stored in the panel store using the vertical-tabs width keys and is clamped between dedicated min/max constants separate from the normal sidebar width.
- The rail shows a workspace-specific header, an empty state when no workspace is selected, and a scroll context used to add the same top border treatment as the main sidebar when scrolled.
- The vertical rail header shows a quick new-agent button, the shared new-tab dropdown, and the shared display-preferences menu.
- The rail header's shared dropdown can create draft, terminal, terminal-profile, and Electron browser tabs. It focuses the workspace's main pane before opening the tab, reports disconnected hosts and missing workspace paths through toast errors, updates the terminal query cache after terminal creation, and routes `Edit terminal profiles` to the host terminal settings section.
- When `tabLayoutMode === "sidebar"` on desktop, the standard sidebar workspace list becomes expandable and renders embedded tabs beneath each workspace.
- The embedded list is driven from the workspace layout store's main pane tab order, then post-processed through the sidebar ordering helpers so user drag order stays stable even when sort mode changes away from `manual`.
- The sidebar can cap the number of shown embedded tabs via a persisted `recentTabCount` preference and expose `Show all` / `Show less` toggles per workspace.
- Workspace rows get a richer right-hand control policy:
  - hover/desktop shows create-tab controls plus archive/kebab actions when available;
  - touch/compact keeps those controls visible;
  - keyboard shortcut badges suppress row actions while the shortcut overlay is active;
  - diff badges and status summaries hide while row actions or shortcut badges are visible.
- Creating a tab from a collapsed sidebar workspace expands that workspace so the newly created embedded tab is visible.
- Workspace row action slots reserve enough width for the three tab-header controls plus the kebab menu, so the quick actions do not overlap status or diff metadata.

## Shared Sidebar Display Preferences, Sorting, And Badges

**Files**

- `packages/app/src/components/sidebar/sidebar-grouping-selector.tsx`
- `packages/app/src/stores/sidebar-view-store.ts`
- `packages/app/src/stores/sidebar-view-store.test.ts`
- `packages/app/src/utils/sidebar-tab-sort.ts`
- `packages/app/src/utils/sidebar-tab-sort.test.ts`
- `packages/app/src/components/sidebar/workspace-row-right-visibility.ts`
- `packages/app/src/components/sidebar/workspace-row-right-visibility.test.ts`

**Public surface**

- `type SidebarEmbeddedTabSortMode = "manual" | "created" | "lastUpdated" | "status"`
- `type SidebarEmbeddedRecentTabCount = 3 | 5 | 10 | "all"`
- `type SidebarBadgeMode = "diff" | "status" | "none"`
- `type SidebarTabBarBadgeMode = "status" | "none"`
- `SidebarDisplayPreferencesMenuSections(...)`

**Behavior**

- The sidebar view store now persists per-server display preferences for:
  - workspace grouping mode
  - embedded-tab sort mode
  - embedded recent-tab count
  - workspace badge mode
  - vertical-tab-bar badge mode
  - auto-collapse workspaces
- `SidebarDisplayPreferencesMenuSections` is the shared menu block used by:
  - the global sidebar grouping menu
  - the sidebar embedded-tab header menu
  - the per-pane/workspace vertical tab menus
- Sorting rules:
  - `manual` preserves the current layout order
  - `created` sorts descending by tab `createdAt`
  - `lastUpdated` sorts descending by agent `lastUserMessageAt`, falling back to tab `createdAt`
  - `status` sorts by urgency rank (`input_required`, `failed`, `unread`, `in_progress`) and then by newest activity
- Badge mode rules:
  - sidebar workspace rows can show diff stats, propagated status summaries, or nothing;
  - vertical tab bars only expose `status` or `none`.
- `getWorkspaceRowRightVisibility()` returns `showCreateTab: true` when a workspace row has a create-tab action, the row action controls are visible by hover/touch/compact layout, and no shortcut badge is being shown.

## Shared Sidebar Row And Status Primitives

**Files**

- `packages/app/src/components/sidebar/sidebar-entry-row.tsx`
- `packages/app/src/components/sidebar/sidebar-workspace-row-content.tsx`
- `packages/app/src/components/sidebar/sidebar-workspace-row.tsx`
- `packages/app/src/components/sidebar/sidebar-status-list.tsx`
- `packages/app/src/utils/sidebar-tab-status-summary.ts`
- `packages/app/src/utils/sidebar-tab-status-summary.test.ts`
- `packages/app/src/components/synced-loader.tsx`

**Public surface**

- `SIDEBAR_ENTRY_ROW_HEIGHT = 36`
- `SidebarEntryRowContent`
- `SidebarEntryStatusBadges`
- `SidebarEntryPrimaryStatusBadge`
- `summarizeSidebarTabs(...)`
- `combineSidebarTabStatusSummaries(...)`
- `getVisibleSidebarEntryStatusKinds(...)`
- `getPrimarySidebarEntryStatusKind(...)`

**Behavior**

- Sidebar workspace rows and embedded tab rows now share a fixed-height row primitive with:
  - leading icon slot
  - optional hover-leading overlay
  - primary/secondary text column
  - stable right-context slot
  - optional keyboard-shortcut overlay
- Status summaries aggregate both direct tab state and parent-propagated child state. The visible entry kinds are:
  - `queued_messages`
  - `draft`
  - `input_required`
  - `unread`
  - `in_progress`
  - `failed`
- Draft propagation distinguishes "tab is a draft" from "tab has draft text": draft icons can appear locally without necessarily propagating upward.
- Running tabs use the synchronized loader badge; input-required and failed can collapse to a single icon when the count is exactly one.
- Workspace-level summaries are built by combining the propagated portions of child tab summaries, which keeps workspace badges aligned with the embedded-tab rows beneath them.

## Navigation, Docs, And Supporting Updates

**Files**

- `docs/agent-lifecycle.md`
- `docs/design.md`
- `packages/app/src/stores/navigation-active-workspace-store/{index.ts,navigation.ts,navigation.test.ts}`
- `packages/app/src/utils/prepare-workspace-tab.ts`

**Behavior**

- `docs/agent-lifecycle.md` now documents the intentional distinction between closing root-agent tabs and closing subagent tabs.
- `docs/design.md` records the shared sidebar-entry primitive and its fixed 36px row height as the canonical sidebar row layout.
- Navigation store changes support the new tab surfaces without re-opening attention tabs over an explicit user tab selection.

## Test Coverage

Focused tests added or updated on this branch include:

- `packages/app/src/hooks/use-settings/storage.test.ts`
- `packages/app/src/stores/workspace-layout-store.test.ts`
- `packages/app/src/stores/workspace-layout-store.find-main-pane.test.ts`
- `packages/app/src/components/sidebar/embedded-tabs-order.test.ts`
- `packages/app/src/components/sidebar/sidebar-display-preferences-menu.test.tsx`
- `packages/app/src/components/sidebar/sidebar-entry-row.test.tsx`
- `packages/app/src/components/sidebar/sidebar-workspace-row-content.test.tsx`
- `packages/app/src/components/sidebar/workspace-row-right-visibility.test.ts`
- `packages/app/src/stores/sidebar-view-store.test.ts`
- `packages/app/src/utils/sidebar-tab-sort.test.ts`
- `packages/app/src/utils/sidebar-tab-status-summary.test.ts`
- `packages/app/src/components/split-container-tab-drop-preview.test.ts`
- `packages/app/src/workspace-tabs/tab-navigation.test.ts`

These tests cover settings migration, pane metadata normalization, main-pane detection, embedded-tab ordering, display-menu persistence, sidebar badge/status rendering, workspace-row action visibility, and orientation-aware tab-drop preview logic.
