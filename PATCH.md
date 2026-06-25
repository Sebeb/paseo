# Patch Summary: Vertical Pane Tab Layout

Branch: `split/vertical-pane-tabs`

Base: `origin/main`

Primary commit before this writeup: `56ab4b836 feat(app): add vertical pane tab layout`

## Purpose

This branch adds support for displaying workspace pane tabs vertically. It extends pane layout state with per-pane tab-bar orientation, updates drag/drop math for vertical tab bars, adds the tab-row UI needed for vertical presentation, and adds a display menu entry to switch orientation.

## User-Facing Changes

- Adds vertical tab bar orientation for workspace panes.
- Adds UI for selecting vertical tab layout.
- Allows vertical tab rows to show icons, labels, close buttons, and active/focus indicators in a vertical stack.
- Keeps horizontal tabs as the default.
- Updates drag/drop insertion previews so reordering works with both horizontal and vertical tab bars.
- Updates split-container layout so pane content and tab bars size correctly when a tab bar is vertical.
- Adds localized copy for the vertical-tabs action.

## Restored Main Polish

These details were previously implemented on `main`, then lost when this feature was split out. They are part of this branch's intended behavior and should be preserved when rebasing or batching the feature again.

- The vertical tab bar header includes the primary new-tab button, the same new-tab dropdown used by horizontal tab bars, and a tab-specific display preferences button.
- The vertical tab bar header does not draw a divider between the header controls and the tab list.
- The lower vertical action strip is reserved for pane split actions; new-tab type selection lives in the header.
- Vertical tabs can be right-clicked to open the same context menu as the tab action menu.
- Vertical tabs show a three-dot context action button in the right hover action area, next to the close button.
- Vertical tabs render status in a dynamic right-side badge lane. The title consumes the available row width when no badge or hover actions are visible.
- Vertical status markers render as filled circles in the trailing badge lane instead of replacing or decorating the leading tab icon.
- Vertical tab hover previews show up to four subtitle lines when a tab descriptor provides preview text.
- When the top-left/main pane uses vertical tabs, its split-tab creation control moves to the workspace header beside the sidebar toggle. The trigger shows the horizontal split icon by default, switches to the vertical split icon while Command is held on macOS or Control is held on non-macOS platforms, and opens the new-tab menu so the selected agent/browser/terminal/profile is created inside that split.

## Tab Drop Preview

### `packages/app/src/components/split-container-tab-drop-preview.ts`

#### `ComputeTabDropPreviewInput`

Adds:

```ts
orientation?: "horizontal" | "vertical";
```

The default remains `"horizontal"` when no orientation is passed.

#### `computeTabDropPreview(input)`

Computes where a dragged tab should be inserted.

Implementation details:

1. Finds the target tab index from `input.targetTabs` using `overTabId`.
2. Resolves orientation with `input.orientation ?? "horizontal"`.
3. Uses `overRect.height` for vertical orientation and `overRect.width` for horizontal orientation.
4. Returns `null` when the target tab is not found or the relevant size is non-positive.
5. Computes the dragged tab center:
   - vertical: `activeRect.top + activeRect.height / 2`
   - horizontal: `activeRect.left + activeRect.width / 2`
6. Computes the hovered tab center using the same axis.
7. Inserts after the target when the active center is greater than or equal to the hovered center.
8. Sets `indicatorIndex` to the target index plus one when inserting after.
9. Starts `insertionIndex` from `indicatorIndex`.
10. If dragging within the same pane, finds the source index and subtracts one when the source was before the insertion point.
11. Clamps same-pane insertion to the valid tab list range.
12. Returns `{ paneId, insertionIndex, indicatorIndex }`.

This preserves existing horizontal behavior while making vertical tab drop position depend on y-axis position.

## Workspace Layout State

### `packages/app/src/stores/workspace-layout-store.ts`

Adds support for tab-bar orientation state.

#### New Orientation Type

The store introduces/uses a `WorkspaceTabBarOrientation` shape with values:

- `"horizontal"`
- `"vertical"`

#### Store State

Adds state for:

- per-pane tab bar orientation
- top-left pane tab bar orientation fallback/default

The top-left pane is treated specially so the primary pane can retain a stable orientation preference even when pane ids/layouts change.

#### `setPaneTabBarOrientation(workspaceKey, paneId, orientation)`

Sets the orientation for a pane.

Implementation details:

- Normalizes workspace key and pane id.
- Ignores missing/empty values.
- Loads the current normalized layout.
- Verifies the target pane exists with `findPaneById`.
- If the pane is the top-left pane, updates `topLeftPaneTabBarOrientation` when changed.
- Otherwise updates the pane's stored orientation metadata.
- Writes the updated layout state back under the workspace key.

This keeps orientation changes scoped to the selected workspace and pane.

#### Layout Normalization

The layout normalization path accepts persisted orientation values and falls back to horizontal behavior for missing or invalid data.

#### Tests

`packages/app/src/stores/workspace-layout-store.test.ts` adds coverage for setting and preserving pane tab orientation.

## Workspace Layout Actions

### `packages/app/src/stores/workspace-layout-actions.ts`

Adds action wiring around `setPaneTabBarOrientation` so UI components can change pane orientation through the workspace action layer.

The action normalizes ids before delegating to the store, consistent with other layout operations.

## Workspace Tab Row

### `packages/app/src/screens/workspace/workspace-desktop-tabs-row.tsx`

This is the primary UI integration for vertical tabs.

#### New Props

`WorkspaceDesktopTabsRow` accepts:

- `tabBarOrientation?: "horizontal" | "vertical"`
- `verticalTabsSelected?: boolean`
- callback for changing vertical-tab selection/orientation

#### `WorkspaceTabDisplayMenu`

Adds a display menu option for vertical tabs.

Implementation details:

- Receives `verticalTabsSelected`.
- Toggles by calling `onVerticalTabsChange(!verticalTabsSelected)`.
- Renders the `workspace-display-menu-vertical-tabs` menu item.
- Uses localized `workspace.tabs.actions.verticalTabs` copy.

#### `TabChip`

Tab chip rendering now branches by orientation.

Implementation details:

- `orientation === "vertical"` enables vertical chip styling.
- Vertical chips use overlay close-button behavior because there is less horizontal room.
- Active/focus indicators use vertical-specific styles.
- Tooltips use `side="right"` for vertical tabs and `side="bottom"` for horizontal tabs.
- Label, icon, close button, dragging, and highlighted states are preserved.

#### `WorkspaceDesktopTabsRow`

Computes layout differently by orientation.

Implementation details:

- `isVertical = tabBarOrientation === "vertical"`.
- Computes the existing horizontal layout through `useWorkspaceTabLayout`.
- Computes vertical layout separately with vertical-friendly sizing.
- Selects vertical layout when `isVertical`, otherwise horizontal layout.
- Passes orientation into tab chips, drop preview, row extras, and menu controls.
- Uses vertical container styles when the row is vertical.
- Keeps add-tab and split controls available in both orientations.

#### `ResolvedDesktopTabChip`

Receives orientation and passes it through to `TabChip`, including context-menu and close-button behavior.

## Split Container Integration

### `packages/app/src/components/split-container.tsx`

The split container now:

- Reads pane tab orientation from layout/store state.
- Passes `tabBarOrientation` to `WorkspaceDesktopTabsRow`.
- Passes orientation into `computeTabDropPreview`.
- Adapts pane tab/container styles for vertical tab bars.
- Keeps content fill behavior stable when a vertical tab column is present.

The split-container drag/drop code now uses axis-aware preview math from `computeTabDropPreview`.

## Sortable Inline List

### `packages/app/src/components/sortable-inline-list.web.tsx`

Updates sortable list behavior so drag sensors and sorting strategy can support vertical lists in addition to inline horizontal lists.

### `packages/app/src/components/sortable-inline-list.native.tsx`

Keeps the native fallback API aligned with the web component's updated props.

## Synced Loader And Sidebar Updates

### `packages/app/src/components/synced-loader.tsx`

The synced loader is refactored/styled so it fits both horizontal and vertical tab contexts.

### Sidebar Files

The branch includes companion updates to:

- `packages/app/src/components/left-sidebar.tsx`
- `packages/app/src/components/sidebar-workspace-list.tsx`
- `packages/app/src/components/sidebar/sidebar-status-list.tsx`
- `packages/app/src/components/sidebar/sidebar-workspace-row-content.tsx`
- `packages/app/src/components/sidebar/sidebar-grouping-selector.tsx`

These keep sidebar controls and status rows compatible with the new tab layout option without requiring the embedded-sidebar-tabs branch.

## I18n

Adds the vertical tab action string in:

- `packages/app/src/i18n/resources/ar.ts`
- `packages/app/src/i18n/resources/en.ts`
- `packages/app/src/i18n/resources/es.ts`
- `packages/app/src/i18n/resources/fr.ts`
- `packages/app/src/i18n/resources/ru.ts`
- `packages/app/src/i18n/resources/zh-CN.ts`

## Tests

### `packages/app/src/components/split-container-tab-drop-preview.test.ts`

Adds/updates tests for:

- Horizontal insertion behavior.
- Vertical insertion behavior using y-axis centers.
- Same-pane index adjustment when dragging from before the insertion point.
- Invalid target or invalid size returning `null`.

### `packages/app/src/screens/workspace/workspace-pane-state.test.ts`

Updates pane state expectations for orientation-aware layout.

### `packages/app/src/stores/workspace-layout-store.test.ts`

Adds coverage for tab bar orientation persistence and update behavior.

### `packages/app/src/utils/split-navigation.test.ts`

Updates expectations for split navigation with the new layout metadata.

## Verification

The branch commit was created with the repo pre-commit hook enabled.

The hook ran:

- `npm run lint` on changed files.
- `npm run format:check:files` on changed files.
- `npm run typecheck` across workspaces.

All passed for the implementation commit.
