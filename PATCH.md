# Patch Summary: Vertical Pane Tabs And Sidebar Workspace Tabs

Branch: `feat/vertical-pane-tabs`

Merged source: `feat/sidebar-workspace-tabs`

Base: `origin/main`

## Purpose

This merged branch combines two related workspace-tab features:

- Per-pane vertical tab bars in the desktop split container.
- Embedded workspace tabs in the sidebar, including sidebar tab sorting, status badges, context menus, and close cleanup.

The important merge decision is that the code now keeps two pane concepts:

- The **top-left pane** controls the shared vertical-tab preference used by the existing vertical pane-tab feature.
- The **main pane** is the earliest-created pane and is used by embedded sidebar tabs so the main pane's desktop tab row can be hidden while its tabs are shown in the sidebar.

## User-Facing Changes

- Workspace panes can switch between horizontal and vertical tab bars.
- Vertical tab bars keep drag/drop ordering, close/context actions, status badges, and split actions.
- The sidebar can show workspace tabs under each workspace with sorting by manual order, creation time, last update, or status urgency.
- Sidebar workspace rows and embedded tab rows share a unified row component and fixed row height.
- Sidebar status badges aggregate queued messages, draft state, input-required state, unread responses, in-progress work, and failures.
- Workspace and tab context menus are available from row right-click and row action buttons.
- The workspace header shows a split-create menu when tabs are embedded in the sidebar, and also when the top-left pane uses vertical tabs.

## Layout State

`packages/app/src/stores/workspace-layout-actions.ts` now stores both:

- `createdAt` on panes, used by `findMainPane`.
- `tabBarOrientation` on panes, used by vertical pane tabs.

Missing or invalid orientation in persisted layouts normalizes to `"horizontal"`. Missing pane creation time normalizes to `0` for the default pane and `Date.now()` for other panes.

`packages/app/src/stores/workspace-layout-store.ts` exposes:

- `findMainPane(root)`
- `findTopLeftPaneId(root)`
- `setPaneTabBarOrientation(workspaceKey, paneId, orientation)`

Top-left pane orientation remains a shared store preference so it survives workspace purges and layout id churn. Non-top-left pane orientation is persisted on the pane.

## Split Container

`packages/app/src/components/split-container.tsx` keeps the vertical-tab implementation and adds `embeddedMainPaneId`.

When a pane id matches `embeddedMainPaneId`, the desktop tab row is not rendered for that pane. Pane content still mounts and remains focusable. Other panes continue to render their tab rows, including vertical tab bars.

Tab drag/drop preview still uses orientation-aware math:

- horizontal rows compare x-axis centers
- vertical rows compare y-axis centers

## Workspace Screen

`packages/app/src/screens/workspace/workspace-screen.tsx` computes:

- `mainPaneId` via `findMainPane`
- `topLeftPaneId` via `findTopLeftPaneId`
- `headerSplitPaneId` as `mainPaneId` when embedded sidebar tabs are enabled, otherwise `topLeftPaneId`

The header split menu is shown when desktop pane splits are available and either:

- embedded sidebar tabs are enabled, or
- the top-left pane tab bar orientation is vertical

Split creations from that menu target `headerSplitPaneId`.

## Sidebar Workspace Tabs

The source branch adds:

- `packages/app/src/components/sidebar/sidebar-entry-row.tsx`
- `packages/app/src/utils/sidebar-tab-sort.ts`
- `packages/app/src/utils/sidebar-tab-status-summary.ts`
- `packages/app/src/workspace-tabs/tab-navigation.ts`
- `packages/app/src/screens/workspace/use-workspace-tab-close.ts`

The sidebar view store owns per-server display preferences for grouping, embedded tab sort mode, recent tab count, and badge mode.

## Tests

Relevant focused tests include:

- `packages/app/src/stores/workspace-layout-store.test.ts`
- `packages/app/src/stores/workspace-layout-store.find-main-pane.test.ts`
- `packages/app/src/components/sidebar/embedded-tabs-order.test.ts`
- `packages/app/src/components/sidebar/sidebar-entry-row.test.tsx`
- `packages/app/src/components/sidebar/sidebar-workspace-row-content.test.tsx`
- `packages/app/src/utils/sidebar-tab-sort.test.ts`
- `packages/app/src/utils/sidebar-tab-status-summary.test.ts`
- `packages/app/src/workspace-tabs/tab-navigation.test.ts`
