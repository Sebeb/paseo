# Patch Summary: Project Icon Picker And Integrated Workspace UX

Branch: `feat/project-icon-picker`

Base: `origin/main`

Anchor commit: 9ef7185b9dc742e7ae4f01b9a336761158599d68 - feat(projects): normalize project icons

## Purpose

This branch is an integration branch for app UX and daemon support work around long agent streams, workspace tabs, sidebar navigation, generated titles, project configuration, and file previews. The latest feature adds an Electron-only project icon picker that writes a project-relative icon path into `paseo.json` and asks the daemon to validate/render that icon immediately.

Protocol changes stay backward-compatible: new message fields and feature flags are optional, and new client features gate on host capabilities rather than synthesizing legacy fallback behavior.

## Agent Stream Reading Tools

**Purpose** - Make long agent conversations easier to read and navigate with pinned prompts, collapsible thinking groups, prompt markers, find-in-thread, find match dots, and more stable bottom anchoring.

**Files**

- `packages/app/src/agent-stream/pinned-user-input.ts`
- `packages/app/src/agent-stream/collapse-thinking.ts`
- `packages/app/src/agent-stream/find-in-thread.ts`
- `packages/app/src/agent-stream/find-runner-core.ts`
- `packages/app/src/agent-stream/find-runner.ts`
- `packages/app/src/agent-stream/find-runner.web.ts`
- `packages/app/src/agent-stream/find-worker.ts`
- `packages/app/src/agent-stream/prompt-index-geometry.ts`
- `packages/app/src/agent-stream/prompt-scroll-marker-layout.ts`
- `packages/app/src/agent-stream/bottom-anchor-controller.ts`
- `packages/app/src/agent-stream/spacing.ts`
- `packages/app/src/agent-stream/strategy.ts`
- `packages/app/src/agent-stream/strategy-web.tsx`
- `packages/app/src/agent-stream/strategy-native.tsx`
- `packages/app/src/agent-stream/view.tsx`
- `packages/app/src/agent-stream/turn-footer.tsx`
- `packages/app/src/components/find-highlighted-text.tsx`

**Public surface**

- `PinnedUserInputGeometry`, `PinnedUserInputCandidate`, and `PinnedUserInputState` describe prompt ownership and renderable pinned-prompt state.
- `collectEstimatedPinnedUserInputCandidates`, `collectPinnedUserInputCandidatesFromGeometries`, `findEstimatedStreamItemTop`, and `selectPinnedUserInput` provide pure pinned-prompt selection logic shared by web and native strategies.
- `CollapseThinkingBehavior = "never" | "completed" | "completed-and-active"` is persisted in app settings.
- `buildCollapseThinkingGroups`, `ThinkingGroup`, `ThinkingGroupIndex`, `getThinkingGroupCounts`, `getThinkingGroupPreviewMessages`, and `shouldShowThinkingGroupPreview` model collapsed reasoning/tool groups.
- `FindRecord`, `FindInThreadMatch`, `FindHighlightRange`, `FindHighlightsByItemId`, `buildFindRecords`, `findMatchesInRecords`, `buildFindHighlights`, and `startFindThreadJob` implement find-in-thread indexing and progressive search.
- `StreamViewportHandle` now exposes `scrollToBottom`, `scrollToStreamItemTop`, `prepareForViewportChange`, and `pauseBottomAnchoringForNextLayoutChange`.
- `BottomAnchorController` models sticky-bottom versus detached mode, route/local anchor requests, blocked reasons, verification retries, and paused layout anchoring.
- `StreamFindMarker` and `StreamFindIndicator` let the web strategy render blue scroll markers for find matches.

**Behavior**

- Pinned prompts are off by default through `AppSettings.pinUserInputs`. When enabled, stream strategies group each user message with the response items until the next user message and pin the prompt only when the original is offscreen and a response in that turn is visible.
- Web pinned-prompt selection combines measured DOM rows with estimated virtualized-history geometry. Native uses React Native layout measurements. Both feed the same pure selector.
- Collapsible thinking groups hide intermediate assistant/thought/tool/todo content while keeping final assistant answers visible. Completed groups can collapse independently from active groups depending on the persisted setting.
- Active collapsed thinking groups can show preview text, elapsed `Working for {{duration}}` copy, and a press target that expands the group without fighting sticky-bottom scroll behavior.
- Find-in-thread opens from keyboard actions, scans loaded content and unloaded history progressively, optionally includes thinking-group content, highlights matches in messages/tool labels/todo rows, and expands collapsed thinking before scrolling to a match.
- Web find uses a worker for large corpora and falls back to the sliced main-thread runner if worker setup fails. Native uses the shared JavaScript runner.
- Prompt marker dots show user-prompt distribution in desktop web streams. While find is open and matches exist, the rail switches to find-match dots and uses exact highlighted-span anchors when mounted.
- Bottom anchoring waits for authoritative history and measurable viewport/content before satisfying route/local bottom requests, detaches when the user scrolls away, and preserves position when older history prepends or thinking groups expand.
- Stream spacing, loaders, and turn footers restore the blue active chat loading treatment and shared spinner usage.

## Markdown, File Preview, And Message Layout

**Purpose** - Render richer assistant output and file previews without constraining wide content to the text column.

**Files**

- `packages/app/src/components/markdown/renderer.tsx`
- `packages/app/src/components/markdown/html-ish.ts`
- `packages/app/src/components/message.tsx`
- `packages/app/src/components/message-layout-context.tsx`
- `packages/app/src/components/file-pane.tsx`
- `packages/app/src/components/file-pane-image-size.ts`
- `packages/app/src/file-explorer/preview-target.ts`
- `packages/app/src/utils/assistant-image-source.ts`
- `packages/app/src/assistant-file-links/parse.ts`

**Public surface**

- `MessageLayoutMetrics` includes `tableBreakoutOffset` and `tableWidth`.
- `MessageLayoutProvider`, `useMessageLayoutMetrics`, and `getMessageTableLayoutMetrics` let markdown renderers widen tables to the full message row.
- `createMarkdownTableRules(input?: { tableStyle?: StyleProp<ViewStyle> })` composes caller-provided table styles.
- `readImagePixelSize`, `resolveImagePreviewDisplaySize`, `imageExceedsViewport`, and `resolveImageZoomScrollOffset` parse image headers and compute fit/zoom behavior.
- `resolveFilePreviewReadTarget` and `resolveAssistantImageSource` accept a `baseDirectory` for relative Markdown image paths.

**Behavior**

- Assistant markdown tables break out to full row width using stream-measured row/content metrics while retaining horizontal scrolling.
- HTML-ish markdown tables are rendered instead of displayed as raw syntax.
- Markdown image references resolve relative to the Markdown file's directory, then workspace root. Data URLs are persisted as attachments; project files are read through the file RPC path.
- Image file previews use true PNG/JPEG/GIF/WebP dimensions from bytes rather than density-adjusted browser dimensions, fit to the viewport, and toggle to true pixel size when larger than the pane.
- Assistant file links decode percent-escaped path tokens and include `.gd` in supported extensions.
- `file://` links are accepted by markdown parsing and routed to file-link actions without duplicate link handling.

## Workspace Tabs, Pane Layout, And Navigation

**Purpose** - Make workspaces navigable as persistent tabs with restore, close, split, vertical-layout, tooltip, and active-workspace memory.

**Files**

- `packages/app/src/screens/workspace/workspace-screen.tsx`
- `packages/app/src/screens/workspace/workspace-desktop-tabs-row.tsx`
- `packages/app/src/screens/workspace/workspace-tab-menu.ts`
- `packages/app/src/screens/workspace/workspace-tab-tooltip-preview.tsx`
- `packages/app/src/screens/workspace/workspace-tab-close-tree.ts`
- `packages/app/src/screens/workspace/use-workspace-tab-close.ts`
- `packages/app/src/screens/workspace/workspace-pane-state.ts`
- `packages/app/src/stores/workspace-layout-store.ts`
- `packages/app/src/stores/workspace-layout-actions.ts`
- `packages/app/src/stores/panel-store/state.ts`
- `packages/app/src/stores/navigation-active-workspace-store/navigation.ts`
- `packages/app/src/workspace-tabs/tab-navigation.ts`
- `packages/app/src/workspace-tabs/agent-visibility.ts`
- `packages/app/src/utils/prepare-workspace-tab.ts`
- `packages/app/src/utils/workspace-navigation.ts`
- `packages/app/src/utils/workspace-archive-navigation.ts`
- `packages/app/src/utils/split-navigation.ts`

**Public surface**

- `AppTabLayoutMode = "horizontal" | "vertical" | "sidebar"` persists the desktop tab layout.
- `SplitPane` records `createdAt` and `tabBarOrientation: "horizontal" | "vertical"`.
- `findMainPane`, `findTopLeftPaneId`, and `setPaneTabBarOrientation` identify the main pane and persist per-pane tab row orientation.
- `SplitContainer` accepts `embeddedMainPaneId?: string | null` to suppress the main pane's horizontal row when tabs are embedded elsewhere.
- `useWorkspaceTabClose()` centralizes close cleanup for agent, terminal, browser, file, setup, and draft tabs.
- `workspace-tab-close-tree.ts` computes tab subtrees for parent/child close operations.
- `mergeTabNavigationOrder` and `getRelativeTabId` resolve deterministic keyboard and close-successor ordering.

**Behavior**

- Appearance settings expose Horizontal, Vertical, and Sidebar tab layouts. Legacy `embeddedTabs` settings migrate to `"sidebar"` or `"horizontal"`.
- Desktop panes can render horizontal tab rows or vertical rails; vertical drag/drop math compares y-axis centers and horizontal rows compare x-axis centers.
- Sidebar mode hides the main pane row and treats the embedded sidebar list as the primary tab surface while keeping pane content mounted.
- The workspace header exposes a split creation menu when desktop splits are available and either sidebar mode is active or the top-left pane is vertical. Command on macOS or Control elsewhere switches the target placement from right to bottom.
- `useWorkspaceTabClose` unpins/hides agent tabs, removes browser records and Electron partitions, updates terminal query caches, closes the layout tab, and applies the root-agent versus subagent close policy from lifecycle docs.
- Closing a parent tab can close its descendant subtree; close successor selection uses the same effective order as the visible sidebar/workspace tab list.
- Recently closed workspace tabs can be restored.
- Agent tab tooltips show title, short id, initial prompt, created/updated times, and prompt count.
- `AppRenderErrorBoundary` protects the app route shell from blank screens on render failures.

## Sidebar Workspace Tree

**Purpose** - Treat projects, workspaces, and embedded workspace tabs as one sortable, filterable tree with status counts, stable action slots, context menus, and active ancestor highlighting.

**Files**

- `packages/app/src/components/left-sidebar.tsx`
- `packages/app/src/components/sidebar-workspace-list.tsx`
- `packages/app/src/components/sidebar/sidebar-entry-row.tsx`
- `packages/app/src/components/sidebar/sidebar-workspace-row.tsx`
- `packages/app/src/components/sidebar/sidebar-workspace-row-content.tsx`
- `packages/app/src/components/sidebar/sidebar-workspace-row-visibility.ts`
- `packages/app/src/components/sidebar/workspace-row-right-visibility.ts`
- `packages/app/src/components/sidebar/sidebar-grouping-selector.tsx`
- `packages/app/src/components/sidebar/sidebar-status-list.tsx`
- `packages/app/src/components/sidebar/sidebar-vc-operation-badge.tsx`
- `packages/app/src/components/sidebar/embedded-tabs-order.ts`
- `packages/app/src/components/sidebar/sidebar-scroll-context.ts`
- `packages/app/src/hooks/sidebar-workspaces-view-model.ts`
- `packages/app/src/hooks/use-sidebar-workspaces-list.ts`
- `packages/app/src/hooks/use-status-mode-workspaces.ts`
- `packages/app/src/stores/sidebar-view-store.ts`
- `packages/app/src/stores/sidebar-collapsed-sections-store/state.ts`
- `packages/app/src/utils/sidebar-embedded-tab-tree.ts`
- `packages/app/src/utils/sidebar-tab-sort.ts`
- `packages/app/src/utils/sidebar-tab-status-summary.ts`
- `packages/app/src/utils/sidebar-active-ancestor-highlight.ts`
- `packages/app/src/utils/sidebar-active-workspace-reveal.ts`

**Public surface**

- `SIDEBAR_ENTRY_ROW_HEIGHT = 36`.
- `SidebarEntryRowContent`, `SidebarEntryStatusBadges`, and `SidebarEntryPrimaryStatusBadge` provide the shared fixed-height row primitive and status badge UI.
- `SidebarGroupMode = "project" | "status"`.
- `SidebarEmbeddedTabSortMode = "manual" | "created" | "lastUpdated" | "status"`.
- `SidebarWorkspaceSortMode` uses the same sort modes as embedded tabs.
- `SidebarEmbeddedRecentTabCount = 3 | 5 | 10 | "all"`.
- `SidebarBadgeMode = "diff" | "status" | "none"` and `SidebarTabBarBadgeMode = "status" | "none"`.
- `SidebarDisplayPreferencesMenuSections` is reused by the global sidebar menu, embedded tab header menu, and vertical tab menus.
- `summarizeSidebarTabs`, `combineSidebarTabStatusSummaries`, `getVisibleSidebarEntryStatusKinds`, `getPrimarySidebarEntryStatusKind`, and `getSidebarEntryStatusSortRank` compute status badges and urgency ordering.

**Behavior**

- Sidebar rows use a fixed 36 px shell with leading icon, hover-leading overlay, label/subtitle, stable right context, hover action overlay, and optional shortcut badge.
- Embedded tabs appear under their workspace, can be collapsed, sort by manual/created/lastUpdated/status, and cap visible recent tabs with Show all/Show less controls.
- Embedded tab trees follow subagent parentage and persist parent expansion state.
- Active child tabs highlight ancestor project/workspace rows with a quieter selected state while the direct selected tab keeps the stronger selected treatment.
- The sidebar can group by project or status, sort workspaces by creation/activity/status/name, auto-collapse projects, auto-collapse workspaces, and remember the last selected workspace per project.
- Workspace, project, status-workspace, and embedded-tab rows support right-click context menus mirroring kebab menu actions.
- Workspace rows show git operation badges while checkout-store operations are running.
- Row trailing controls reserve stable widths so hover actions do not change row height or vertical spacing.
- The vertical tab rail remains visible when the main project/workspace sidebar is closed in vertical layout mode.
- Workspace hover cards show creation and activity timestamps with absolute or recent formatting.

## Workspace Scripts And Git Actions

**Purpose** - Provide compact split-button controls for scripts and git actions while preserving useful labels in dense layouts.

**Files**

- `packages/app/src/screens/workspace/workspace-scripts-button.tsx`
- `packages/app/src/git/actions-split-button.tsx`
- `packages/app/src/git/actions-store.ts`
- `packages/app/src/components/ui/button.tsx`
- `packages/app/src/components/ui/context-menu.tsx`
- `packages/app/src/components/ui/dropdown-menu.tsx`

**Behavior**

- Workspace scripts expose a primary play action plus a dropdown selector. The first script is the default primary target until the user runs another script.
- Running from the dropdown updates the primary action target.
- Split presentation always shows the current script label even when surrounding toolbar labels are hidden.
- Git actions use a split-button state model backed by `actions-store.ts`, preserving primary versus secondary actions and pending state.

## Auto Titles, Prompt Index, And Protocol Additions

**Purpose** - Generate better agent/workspace titles, expose prompt index data, and add optional metadata without breaking old clients or daemons.

**Files**

- `packages/server/src/server/agent-title-generator.ts`
- `packages/server/src/server/agent/agent-manager.ts`
- `packages/server/src/server/agent/agent-sdk-types.ts`
- `packages/server/src/server/agent/providers/codex-app-server-agent.ts`
- `packages/server/src/server/agent/timeline-prompt-index.ts`
- `packages/server/src/server/agent/tools/paseo-tools.ts`
- `packages/server/src/server/websocket-server.ts`
- `packages/client/src/daemon-client.ts`
- `packages/protocol/src/messages.ts`
- `packages/protocol/src/tool-call-display.ts`

**Public surface**

- `generateAgentTitleFromFirstAgentContext(options)` generates per-agent titles from first prompt/attachment context.
- `AgentCapabilityFlags.supportsNativeThreadTitle?: boolean`.
- `AgentSession.getNativeTitle?(): Promise<string | null>`.
- `AgentManager.supportsNativeThreadTitle(agentId)` and `AgentManager.refreshNativeThreadTitle(agentId)`.
- `server_info.features.timelinePromptIndex?: boolean` with a `COMPAT(timelinePromptIndex)` cleanup comment.
- Workspace title RPCs use dotted names: `workspace.title.set.request` and `workspace.title.set.response`.
- Workspace descriptor payloads accept optional `createdAt?: string`.

**Behavior**

- Agent/thread title generation is decoupled from workspace title generation. Later agents update only their own title and do not overwrite the workspace title.
- The first non-internal agent in a workspace may initialize both the agent title and workspace title from the same generated or provider-native title.
- First-agent worktree branch naming remains separate and updates only the workspace branch field.
- Codex app-server agents can report native thread titles by querying `thread/list`; the daemon refreshes those titles after completed stream turns and polls for the first workspace title.
- Timeline prompt indexing identifies user prompt positions in persisted timelines and is consumed by prompt marker UI only when the feature flag is present.
- Tool-call display recognizes more canonical and unknown-detail cases, including `thinking`, `task`, and `terminal`, so collapsed thinking and find records show useful labels.
- Codex app-server daemon requests use a reserved non-originating client identity so provider activity is not misreported as user-originating Paseo activity.

## Subagent Tabs And Visibility

**Purpose** - Auto-open active subagents in workspace tabs while preserving the subagents track as their persistent home.

**Files**

- `packages/app/src/subagents/auto-open-tab-policy.ts`
- `packages/app/src/subagents/select.ts`
- `packages/app/src/subagents/track.tsx`
- `packages/app/src/subagents/track-presentation.ts`
- `packages/app/src/workspace-tabs/agent-visibility.ts`
- `packages/app/src/workspace/legacy-daemon-workspaces.ts`

**Behavior**

- `shouldAutoOpenAgentTab` returns true for all agents, including subagents.
- Subagent rows include `workspaceId`, `workspaceName`, and `chatTitle`.
- `formatSubagentRowSubtitle` joins workspace name and chat title with `·`, and row accessibility labels include the subtitle when present.
- Closing a subagent tab remains layout-only; archive/detach stay explicit subagent track actions.
- Workspace visibility snapshots include `parentAgentIdByAgentId`, and reconciliation opens parent tabs before child tabs when needed.
- Legacy daemon workspace payload handling keeps older workspace data readable.

## Project Icon Picker And Project Config Editing

**Purpose** - Let users choose a project icon from the desktop app, store it as a project-relative `icon` path in `paseo.json`, and make the daemon honor that configured icon before falling back to icon discovery.

**Files**

- `packages/app/src/screens/project-settings-screen.tsx`
- `packages/app/src/components/project-icon-view.tsx`
- `packages/app/src/utils/project-icon-path.ts`
- `packages/app/src/utils/project-config-form.ts`
- `packages/client/src/daemon-client.ts`
- `packages/protocol/src/messages.ts`
- `packages/protocol/src/paseo-config-schema.ts`
- `package-lock.json`
- `packages/server/package.json`
- `packages/server/src/server/session/files/workspace-files-session.ts`
- `packages/server/src/server/websocket-server.ts`
- `packages/server/src/utils/project-icon.ts`

**Public surface**

- `PaseoConfigRawSchema` accepts optional `icon: string`.
- `ProjectConfigDraft` includes `iconPath: string`.
- `configToDraft(config, { defaultIconPath?: string | null })` seeds the editable icon path from `config.icon` or a daemon-discovered default.
- `applyDraftToConfig({ draft, base })` writes trimmed `draft.iconPath` to `config.icon` or deletes `icon` when empty.
- `PROJECT_ICON_FILE_EXTENSIONS = ["ico", "png", "svg", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "tif", "tiff"]`.
- `normalizeProjectIconRelativePath(value): string | null` rejects empty, absolute, drive-rooted, UNC, and escaping `..` paths, normalizes slashes, and returns a clean project-relative path.
- `absolutePathForProjectIcon(projectRoot, relativeIconPath): string` builds a platform-shaped absolute path for dialog defaults.
- `relativeProjectIconPathFromAbsolute({ projectRoot, selectedPath }): string | null` returns a normalized relative path only when the selected absolute path is inside the project root.
- `ProjectIconRequestSchema` accepts optional `iconPath?: string`.
- `DaemonClient.requestProjectIcon(cwd, { iconPath?, requestId? })` sends `project_icon_request` and waits for `project_icon_response`.
- `server_info.features.projectIconOverride?: boolean` gates the picker UI with a `COMPAT(projectIconOverride)` cleanup comment.
- `getProjectIcon(projectDir, options?: { iconPath?: string })` reads a configured or explicit project-relative icon path before auto-discovery and returns normalized 96x96 PNG data.

**Behavior**

- The project settings header renders the current project icon through `ProjectTitleIcon`. When editing is allowed, clicking the icon opens the desktop file picker.
- Editing is allowed only on web Electron, only for the local daemon, and only when the host advertises `projectIconOverride`.
- The dialog defaults to the currently effective icon path when available, otherwise the project root. It filters to icon/image extensions.
- A selected file must be inside the project root. Outside selections show the localized `settings.project.icon.outsideProject` error.
- The app calls `client.requestProjectIcon(repoRoot, { iconPath })` before accepting the choice. If the daemon returns no valid icon or no data URI can be built, the app shows `settings.project.icon.invalidIcon`.
- A valid picked icon is previewed immediately by storing `{ path, dataUri }` in local state. The project config form receives the effective path so saving writes the new `icon` value.
- `ProjectIconView` resets its image-error fallback state whenever `iconDataUri` changes, so a failed previous icon does not suppress a newly selected icon preview.
- Changing project, host, or repo root clears the transient picked icon.
- The daemon's project icon lookup first uses an explicit request `iconPath`, then `paseo.json`'s configured `icon`, then auto-discovers favicon/icon/logo files.
- Server-side path normalization resolves configured icon paths under the project root and rejects traversal outside the root.
- Returned icons include `path?: string`, the project-relative path chosen by either configured lookup or discovery.
- Icon reads accept ICO, PNG, SVG, JPEG, GIF, WebP, AVIF, BMP, and TIFF source files up to 10 MiB. The server uses `sharp` to render every accepted source into a transparent 96x96 PNG with `fit: "contain"` and returns `mimeType: "image/png"` regardless of source format.
- PNG-backed ICO files are normalized by extracting the highest-scoring embedded PNG when available before passing the input to `sharp`; other ICO inputs fall through to `sharp` directly.
- Normalized icon results are cached by absolute source path, file mtime, file size, and returned relative path. The cache keeps the most recently used 256 entries and evicts the oldest key after that.
- Invalid configured or explicit icon paths still return no icon rather than falling back to discovery. Unsupported extensions and source files that cannot be decoded by `sharp` return no icon.

## File Explorer, Active Host, CLI, Desktop, And Supporting Polish

**Purpose** - Keep supporting packages aligned with the richer workspace, project, and preview model.

**Files**

- `packages/app/src/components/file-explorer-pane.tsx`
- `packages/app/src/utils/active-host.ts`
- `packages/app/src/utils/host-routes.ts`
- `packages/app/src/utils/projects.ts`
- `packages/app/src/hooks/use-open-project-picker.ts`
- `packages/cli/src/commands/worktree/archive.ts`
- `packages/cli/src/commands/worktree/ls.ts`
- `packages/desktop/build/entitlements.mac.plist`
- `packages/desktop/build/entitlements.mac.inherit.plist`

**Behavior**

- Active host helpers and host routes account for the current selected workspace/project source.
- Project utilities handle richer project metadata and icon paths.
- CLI worktree archive/list output handles updated workspace title/archive fields.
- Desktop entitlements include the allowances required by updated desktop behavior.

## Settings, Localization, Keyboard, And Visual Polish

**Purpose** - Add persisted settings, shortcuts, and translations needed by the new stream/sidebar/project UI.

**Files**

- `packages/app/src/hooks/use-settings/index.ts`
- `packages/app/src/hooks/use-settings/storage.ts`
- `packages/app/src/screens/settings/appearance/appearance-section.tsx`
- `packages/app/src/i18n/resources/ar.ts`
- `packages/app/src/i18n/resources/en.ts`
- `packages/app/src/i18n/resources/es.ts`
- `packages/app/src/i18n/resources/fr.ts`
- `packages/app/src/i18n/resources/ja.ts`
- `packages/app/src/i18n/resources/pt-BR.ts`
- `packages/app/src/i18n/resources/ru.ts`
- `packages/app/src/i18n/resources/zh-CN.ts`
- `packages/app/src/keyboard/actions.ts`
- `packages/app/src/keyboard/focus-scope.ts`
- `packages/app/src/keyboard/keyboard-action-dispatcher.ts`
- `packages/app/src/keyboard/keyboard-shortcuts.ts`
- `packages/app/src/keyboard/route-shortcut.ts`
- `packages/app/src/components/synced-loader.tsx`
- `packages/app/src/components/ui/loading-spinner.tsx`

**Behavior**

- Appearance settings include controls for pinned prompts, collapse-thinking behavior, prompt markers, and tab layout.
- Settings storage validates persisted values by type and falls back to defaults on invalid data; legacy values migrate where possible.
- Keyboard actions include find open/next/previous/close, route navigation, and workspace/tab movement.
- Focus scopes include `find-in-thread` so Enter/Escape in the find input route to find behavior rather than composer or agent interruption.
- Localization resources include stream find/thinking labels, prompt marker settings, sidebar grouping/sorting/badge strings, tab layout labels, workspace hover-card timestamps, and project icon picker copy across shipped locales. The invalid-icon copy asks for a supported image rather than requiring a square icon because the daemon now normalizes source aspect ratios.

## Documentation

**Files**

- `docs/agent-lifecycle.md`
- `docs/data-model.md`
- `docs/design.md`
- `docs/development.md`

**Behavior**

- Agent lifecycle docs clarify root-agent tab closing versus subagent layout-only closing, subagent auto-open behavior, and tab/archive semantics.
- Data model docs clarify separate agent and workspace titles, first-agent title initialization, worktree branch naming, and stored project icon metadata.
- Design docs record the sidebar entry row primitive, fixed 36 px sidebar row height, and visual conventions used by sidebar controls.
- Development docs capture the image preview sizing gotcha: browser image APIs can report density-corrected CSS dimensions, so true preview sizing should use file bytes/headers.

## Tests

Focused test coverage added or updated on this branch includes:

- stream pinned prompt selection, prompt markers, find, find runners, bottom anchoring, collapse-thinking grouping, and web strategy integration
- markdown renderer table layout, HTML-ish tables, message layout metrics, and file-link parsing
- file pane image dimensions, fit/zoom math, markdown image source resolution, and preview target resolution
- sidebar row rendering, embedded-tab ordering, status summaries, tab sorting, row action visibility, active ancestor highlighting, active workspace reveal, collapsed-section persistence, and workspace list view models
- workspace layout store actions, main pane lookup, tab close trees, tab navigation, restore closed tabs, route source-of-truth, and archive navigation
- settings storage migrations and parsing
- keyboard action dispatch and route shortcuts
- project config form icon round-tripping, project icon path normalization, daemon project icon configured path handling, normalized PNG output for square and non-square images, SVG and PNG-backed ICO conversion, max source-size rejection, and project icon protocol parsing
- protocol parsing for optional workspace metadata, title fields, prompt index feature flags, project icon override feature flags, and project icon request/response messages
- server title generation, Codex native title refresh, timeline prompt indexing, tool-call display models, and Codex app-server client identity
