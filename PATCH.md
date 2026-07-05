# Patch Summary: Single Project Sidebar View

Branch: `feat/single-project-view`

Base: `origin/main`

Anchor commit: 92db0da70e62420de0ec89d6f0c856e1842adcbc - feat(sidebar): animate selected capsule fill to sidebar background

## Single Project Sidebar Mode

**Purpose** - adds an optional sidebar display mode for users who want the project-grouped sidebar to focus on one project at a time. The mode keeps the existing global "Group by Project" and "Group by Status" views intact, but when project grouping is active it can replace the full project list with a selected project's workspaces plus a compact project selector rail.

**Files**

- `packages/app/src/components/left-sidebar.tsx`
- `packages/app/src/components/sidebar-workspace-list.tsx`
- `packages/app/src/components/sidebar/sidebar-display-preferences-menu.tsx`
- `packages/app/src/stores/sidebar-view-store.ts`
- `packages/app/src/utils/sidebar-single-project-view.ts`
- `packages/app/src/stores/sidebar-view-store.test.ts`
- `packages/app/src/utils/sidebar-single-project-view.test.ts`

**Public surface**

- `SidebarWorkspaceList` now accepts:
  - `singleProjectViewEnabled?: boolean`
  - `singleProjectViewProject?: SidebarProjectEntry | null`
  - `onSingleProjectSelected?: (projectKey: string) => void`
  - `onSingleProjectHover?: (projectName: string | null) => void`
- `SidebarSelectedProjectHeaderActions` is exported from `packages/app/src/components/sidebar-workspace-list.tsx`:
  - props: `{ project: SidebarProjectEntry | null; onWorkspacePress?: () => void }`
- `SidebarViewStoreState` gains:
  - `singleProjectViewEnabled: boolean`
  - `singleProjectViewProjectKey: string | null`
  - `setSingleProjectViewEnabled(enabled: boolean): void`
  - `setSingleProjectViewProjectKey(projectKey: string | null): void`
- `migrateSidebarViewState(persistedState: unknown): SidebarViewPersistedState` now returns the single-project fields along with `groupMode` and `hostFilters`.
- `packages/app/src/utils/sidebar-single-project-view.ts` exports:
  - `interface SidebarProjectStatusCounts { attention: number; needsInput: number; failed: number }`
  - `resolveSingleProjectViewProject(input: { projects: readonly SidebarProjectEntry[]; activeWorkspaceSelection: ActiveWorkspaceSelection | null; storedProjectKey: string | null }): SidebarProjectEntry | null`
  - `orderSingleProjectViewProjects(input: { projects: readonly SidebarProjectEntry[]; selectedProjectKey: string | null }): SidebarProjectEntry[]`
  - `getProjectStatusCountsFromStatuses(input: { workspaceKeys: readonly string[]; statusByWorkspaceKey: ReadonlyMap<string, "needs_input" | "failed" | "running" | "attention" | "done"> }): SidebarProjectStatusCounts`

**Behavior**

- The display preferences dropdown shows a `Single project view` selectable item only when `groupMode === "project"`. Selecting it toggles `singleProjectViewEnabled` and leaves the dropdown open via `closeOnSelect={false}`.
- The effective mode is `groupMode === "project" && singleProjectViewEnabled`; switching to status grouping disables the feature for rendering purposes without clearing the stored preference.
- Project selection priority is:
  1. the stored `singleProjectViewProjectKey` when it still matches an available project,
  2. the project containing the active workspace selection,
  3. the first available project,
  4. `null` when no projects exist.
- While single-project view is active, `LeftSidebar` watches the active workspace selection. When the user navigates to a workspace in a different project, it syncs `singleProjectViewProjectKey` to that active project once per active workspace key, so navigation keeps the sidebar focused on the current project.
- The Workspaces section header becomes project-aware in both mobile and desktop sidebars:
  - title is the selected project name instead of `Workspaces`;
  - hovering another project capsule temporarily previews that project name in the header;
  - title styling switches from muted extra-small text to foreground small text;
  - selected-project actions are rendered before search and display preferences.
- `SidebarSelectedProjectHeaderActions` reuses the existing project row policy from `buildSidebarProjectRowModel` to expose:
  - the new workspace/worktree button when the selected project supports it;
  - the project kebab menu with settings, desktop-only "Open in new window", and remove actions.
- On mobile, invoking the selected project's new workspace button calls the sidebar close callback before routing to the new workspace flow.

## Project Selector Rail

**Purpose** - provides a compact project switcher for single-project mode without showing every project's full workspace list.

**Files**

- `packages/app/src/components/sidebar-workspace-list.tsx`
- `packages/app/src/utils/sidebar-single-project-view.ts`
- `packages/app/src/utils/sidebar-single-project-view.test.ts`

**Behavior**

- `ProjectModeList` still renders the normal empty state when there are no projects.
- With single-project view off, `ProjectModeList` renders the original draggable project list.
- With single-project view on and a selected project, it renders:
  - `SidebarProjectSelectorBar` at the top;
  - `SingleProjectWorkspaceBody` for only the selected project's workspaces;
  - the existing list footer below the selected-project body.
- `SidebarProjectSelectorBar` is a horizontal `ScrollView` of capsule buttons:
  - selected project is ordered first via `orderSingleProjectViewProjects`;
  - left/right fade overlays appear when the scroll position is not at the corresponding edge;
  - selecting the leading project scrolls the rail back to `x: 0`;
  - selecting a non-leading project records a pending leading project and updates the stored selected project immediately;
  - on native, the selected project is promoted to the leading position after a 260 ms timeout;
  - on web, the selected project is promoted immediately when the pointer is outside the rail, otherwise promotion waits until pointer leave so hover preview does not fight the user's current pointer position;
  - rail scroll animations are disabled when reduced motion is enabled.
- `ProjectSelectorCapsule` uses the project icon when available, otherwise the same placeholder-initial logic as project rows. Its base background color comes from `deriveProjectIconColor(project.projectKey)`.
- Selected capsules keep the taller tab-like shape with squared bottom corners and render an absolute `Animated.View` fill using `theme.colors.surfaceSidebar`. The fill opacity animates to `1` when selected and `0` when deselected over 180 ms with the native driver, making the active capsule visually connect to the sidebar content below it. When reduced motion is enabled, the fill opacity snaps immediately to the selected state instead of animating.
- Capsule accessibility labels include the project name, selected state, and non-zero status counts such as unread, needs input, and failed. `accessibilityState` carries `{ selected }`.
- Capsules show numeric badges only for actionable status buckets:
  - `attention` count is shown with a green-bordered badge;
  - `needs_input` count is shown with an amber-bordered badge;
  - `failed` count is shown with a red-bordered badge;
  - `running`, `done`, and missing statuses are ignored.
- When an actionable count increases and reduced motion is disabled, the capsule flashes a short overlay glow:
  - failure takes priority over needs-input;
  - needs-input takes priority over attention;
  - animation goes from opacity `0` to `0.32` over 140 ms, then back to `0` over 560 ms using the native driver.
- Hovering an unselected capsule reports that project name to the parent; leaving clears the hover name.

## Selected Project Workspace Body

**Purpose** - preserves workspace behavior while limiting the visible list to the selected project.

**Files**

- `packages/app/src/components/sidebar-workspace-list.tsx`

**Behavior**

- `SingleProjectWorkspaceBody` renders selected-project workspaces using the existing `MemoWorkspaceRowItem` row component and the same row capabilities as the full project list:
  - shortcut badges from `shortcutIndexByWorkspaceKey`;
  - active workspace selection;
  - creating state from `creatingWorkspaceIds`;
  - host labels when multi-host labels are visible;
  - branch-copy support only for git projects;
  - parent gesture coordination for native nested drag/scroll behavior.
- Reordering workspaces in single-project mode calls the existing workspace reorder callback with the selected `project.projectKey`, so persisted workspace ordering remains per project.
- The selected-project workspace list uses a draggable list with `testID="sidebar-single-project-workspace-list-${project.projectKey}"`, `workspaceKeyExtractor`, drag handles, native nesting, and active-selection `extraData`.
- If the selected project has zero workspaces and its row model exposes a `new_workspace` trailing action, the body renders `NewWorkspaceGhostRow` instead of an empty draggable list, preserving the quick-create affordance for empty projects.

## Sidebar View Persistence

**Purpose** - persists the single-project view preference and selected project alongside existing sidebar grouping and host filters.

**Files**

- `packages/app/src/stores/sidebar-view-store.ts`
- `packages/app/src/stores/sidebar-view-store.test.ts`

**Behavior**

- The Zustand persisted store version is bumped to `3`.
- New store defaults are:
  - `singleProjectViewEnabled: false`
  - `singleProjectViewProjectKey: null`
- `partialize` writes `groupMode`, `singleProjectViewEnabled`, `singleProjectViewProjectKey`, and `hostFilters`.
- `migrateSidebarViewState` keeps existing legacy behavior:
  - non-record persisted values become project grouping, single-project disabled, no selected project, and no host filters;
  - old `groupModeByServerId` state still migrates to one global group mode, preferring `status` if any host used status mode;
  - pre-v2 `hostFilter: string` still migrates to `hostFilters: [hostFilter]`.
- Current-shape persisted state preserves valid single-project fields:
  - `singleProjectViewEnabled` is accepted only when boolean, otherwise false;
  - `singleProjectViewProjectKey` is accepted only when string, otherwise null;
  - malformed `hostFilters` entries are filtered to strings.
- Existing fallback storage behavior remains: reads of `sidebar-view` fall back to `sidebar-group-mode` only when the current key is empty.

## Tests

**Purpose** - covers the new selection, ordering, status-counting, and persistence semantics without broad test-suite changes.

**Files**

- `packages/app/src/utils/sidebar-single-project-view.test.ts`
- `packages/app/src/stores/sidebar-view-store.test.ts`

**Behavior covered**

- Stored selected project wins over active workspace project so capsule clicks can switch project visibility.
- If no stored selected project exists, selection falls back to the active workspace's project and then the first project.
- Project ordering moves the selected project to the front without duplicating it.
- Status counts include only `attention`, `needs_input`, and `failed`.
- Store migration preserves current single-project preferences.
- Store setters keep single-project preferences independent from `groupMode`.

## Cross-Cutting Effects

- No WebSocket protocol, daemon, CLI, desktop main-process, relay, or website surface changes are introduced.
- The feature is app-only and uses existing host/project/workspace view models.
- Existing project row actions and workspace row actions are reused rather than introducing a separate action policy for single-project mode.
- No broad verification commands are part of this patch document update; the branch itself added focused Vitest coverage for the new utility and store behavior.
