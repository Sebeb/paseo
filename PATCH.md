# Patch Summary: Full Width Tables And Integrated Workspace UX

Branch: `feat/full-width-tables`

Base: `origin/main`

Anchor commit: 28d52fe4d36b3cb12528bf73d71ae74e5785af50 - feat(stream): improve full-width table rendering

## Purpose

This branch is an integration branch for a set of app UX improvements around the agent stream, workspace navigation, sidebar tabs, title generation, and rendered message content. It also includes the latest markdown table layout change: assistant-message markdown tables now break out to the full available message row width instead of being constrained to the text column.

The branch touches the app, protocol, client, server, CLI worktree output, Electron entitlements, tests, and system docs. The implementation keeps the protocol backward-compatible by adding optional schema fields and capability flags rather than requiring new fields from old daemons.

## Agent Stream Reading Tools

### Purpose

The message stream now has tools for staying oriented in long agent runs: pinned user prompts, collapsible thinking blocks, prompt position markers, find-in-thread controls, match dots, and a more stable bottom-anchor pipeline.

### Files

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
- Related tests under `packages/app/src/agent-stream/*.test.ts` and `packages/app/src/components/*find*.test.ts`.

### Public Surface

- `PinnedUserInputGeometry`, `PinnedUserInputCandidate`, and `PinnedUserInputState` model prompt ownership and renderable pinned-prompt state.
- `collectEstimatedPinnedUserInputCandidates`, `collectPinnedUserInputCandidatesFromGeometries`, `findEstimatedStreamItemTop`, and `selectPinnedUserInput` provide pure selection logic for web and native stream strategies.
- `CollapsedThinkingGroup`, `getCollapsedThinkingGroups`, and related helpers group reasoning/tool lifecycle stream items into collapsible units.
- `FindInThreadRecord`, `FindInThreadMatch`, and runner helpers index stream records, scan loaded and unloaded history, and return match ranges.
- `PromptIndexGeometry` and prompt marker helpers convert server prompt-index data into marker positions in the current scroll range.
- `BottomAnchorController` stabilizes "stick to bottom unless the user scrolled away" behavior across streaming updates, older-history prepends, and dynamic row measurement.

### Behavior

- Pinned user inputs are off by default and are controlled by the persisted `pinUserInputs` setting in `packages/app/src/hooks/use-settings/*`.
- When enabled, each user message is grouped with the response items that follow it until the next user message. If the original prompt has scrolled out of view and one of its response items is visible, the prompt nearest the viewport bottom is rendered as a pinned overlay.
- Web uses DOM/virtualizer geometry plus estimated heights for unmounted rows. Native uses measured React Native layouts. Both feed the same pure selector, so selection rules are shared.
- Collapsed thinking groups summarize reasoning/tool lifecycle activity. Live groups show a pulsing elapsed-time title, completed groups expose counts/previews, and pressing collapsed previews expands the group.
- Find-in-thread scans visible stream content and unloaded history. The web implementation can run through a worker-backed runner, supports next/previous navigation, highlights text ranges in rendered markdown, and can include thinking content when toggled.
- Prompt scroll markers and find match dots render alongside the stream to show where prompts and search matches exist in the total timeline. Marker geometry handles partial history, unloaded history, and current viewport bounds.
- The bottom-anchor controller preserves scroll position when older history loads above the viewport, avoids accidental jumps during live streaming, and restores "near bottom" behavior when the user explicitly returns to the tail.

## Markdown Message Rendering

### Purpose

Assistant messages can render richer content without trapping wide content in a narrow text column. This includes markdown image previews, file-link handling improvements, find highlights, and the latest full-width markdown table layout.

### Files

- `packages/app/src/components/markdown/renderer.tsx`
- `packages/app/src/components/message.tsx`
- `packages/app/src/components/message-layout-context.tsx`
- `packages/app/src/components/message-layout-context.test.ts`
- `packages/app/src/agent-stream/view.tsx`
- `packages/app/src/utils/assistant-image-source.ts`
- `packages/app/src/assistant-file-links/parse.ts`
- `packages/app/src/assistant-file-links/resolver.test.ts`

### Public Surface

- `MessageLayoutMetrics` contains `tableBreakoutOffset` and `tableWidth`.
- `MessageTableLayoutInput` contains `breakoutOffset` and `contentWidth`.
- `MessageLayoutProvider` supplies stream-level message layout metrics to message renderers.
- `useMessageLayoutMetrics()` reads the current metrics.
- `getMessageTableLayoutMetrics(input)` clamps negative values to zero and returns `tableWidth = contentWidth + breakoutOffset * 2`.
- `createMarkdownTableRules(input?: { tableStyle?: StyleProp<ViewStyle> })` now accepts caller-provided table style and composes it with the renderer's markdown table style.
- `StreamRenderInput.layoutProbe?: ReactNode` lets stream strategies mount a shared, zero-height measurement probe in the same horizontal layout context as normal rows.

### Behavior

- `AgentStreamView` creates one `StreamLayoutProbe` and passes it through `StreamRenderInput.layoutProbe`; the web strategy mounts it at the top of the virtualized content container, and the native strategy mounts it before the live-head rows.
- `StreamLayoutProbe` is non-interactive and zero-height. Its outer wrapper reuses `streamItemWrapper` to measure the row breakout offset, and its inner wrapper reuses `streamItemInner` to measure the message content width.
- The probe reports only after both measurements are available. `AgentStreamView` converts them through `getMessageTableLayoutMetrics()` and stores them in `MessageLayoutProvider`, ignoring sub-pixel churn below `STREAM_LAYOUT_EPSILON`.
- Normal `StreamItemWrapper` rows no longer participate in table layout measurement, so regular row mounting, recycling, and live stream churn do not repeatedly rewrite global table metrics.
- `AssistantMessage` reads the metrics and, when both values are positive, gives markdown tables `{ alignSelf: "center", marginHorizontal: -tableBreakoutOffset, maxWidth: tableWidth }`.
- Markdown tables remain horizontally scrollable with `nestedScrollEnabled`, but their scroll container can use the full row width available to the message, including side breakout space.
- The default context value is zeroed, so messages rendered outside the stream keep the old constrained table behavior.
- Markdown image source handling resolves assistant-provided image paths into previewable sources, and markdown text rendering cooperates with find highlight ranges.
- `file://` links are accepted by the markdown parser and passed to the assistant file-link actions, which open them in the main pane while suppressing duplicate markdown-display link handling.

## Workspace Tabs, Pane Layout, And Navigation

### Purpose

Workspaces are now navigable as persistent tabs with richer desktop controls, vertical pane tabs, close/restore behavior, tab tooltips, and active-workspace memory.

### Files

- `packages/app/src/screens/workspace/workspace-screen.tsx`
- `packages/app/src/screens/workspace/workspace-desktop-tabs-row.tsx`
- `packages/app/src/screens/workspace/workspace-tab-menu.ts`
- `packages/app/src/screens/workspace/workspace-tab-tooltip-preview.tsx`
- `packages/app/src/screens/workspace/workspace-tab-close-tree.ts`
- `packages/app/src/screens/workspace/use-workspace-tab-close.ts`
- `packages/app/src/screens/workspace/workspace-tabs-types.ts`
- `packages/app/src/screens/workspace/workspace-pane-state.ts`
- `packages/app/src/screens/workspace/workspace-route-state-views.tsx`
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

### Public Surface

- Workspace layout store state tracks panes, tabs, active tab ids, split orientation, tab ordering, and the main pane.
- `workspace-layout-actions.ts` exposes actions for opening, focusing, moving, splitting, closing, and restoring workspace tabs.
- `findMainPane` logic is covered by `workspace-layout-store.find-main-pane.test.ts`.
- `workspace-tab-close-tree.ts` computes the affected tab subtree for close operations.
- `useWorkspaceTabClose` centralizes close confirmation and tab-removal side effects.
- `tab-navigation.ts` resolves next/previous tab targets for keyboard and UI navigation.

### Behavior

- Desktop workspace tabs are embedded in the workspace header and sidebar, can show context menus, and expose tab info tooltips.
- Users can create vertical pane splits from the header, move workspace tabs between panes, and keep the script run button label visible in split layouts.
- Closing a workspace tab respects child/subagent relationships and can restore recently closed workspace tabs.
- The active workspace selection is remembered and restored through the navigation active-workspace store.
- The workspace route state handles archived workspaces, restored tabs, explicit source-of-truth resolution, and active host routing.
- `packages/app/src/app/_layout.tsx` adds an app render error boundary so route-level render failures are presented through `AppRenderErrorBoundary` instead of a blank app shell.

## Sidebar Workspace Tree

### Purpose

The sidebar now treats projects, workspaces, and embedded workspace tabs as one sortable, filterable tree with status counts, visibility controls, active ancestor highlighting, and stable trailing actions.

### Files

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

### Public Surface

- `sidebar-entry-row.tsx` is the shared row shell for project, workspace, and tab rows.
- `sidebar-workspace-row-content.tsx` renders workspace labels, status, draft badges, and row actions.
- `sidebar-workspace-row-visibility.ts` and `workspace-row-right-visibility.ts` decide which controls are always visible, hover-visible, or hidden.
- `sidebar-tab-sort.ts`, `embedded-tabs-order.ts`, and `sidebar-embedded-tab-tree.ts` produce deterministic embedded tab ordering and tree shape.
- `sidebar-tab-status-summary.ts` computes per-kind status counts for grouped sidebar entries.
- `sidebar-view-store.ts` persists grouping, sorting, and visibility preferences.

### Behavior

- Sidebar rows share consistent indentation, active state, hover state, draft badges, operation badges, and right-side action slots.
- Embedded workspace tabs appear under their owning workspace/project, can be collapsed independently, and sort predictably by user preference and tab metadata.
- Active child tabs highlight their ancestor rows so users can see which project/workspace owns the selected tab.
- The sidebar reveals the active workspace on navigation and keeps row action slots stable to avoid layout shifts.
- Display preferences replace the older display menu with grouping/sorting/visibility controls, including status mode views.
- Localization resources add the new sidebar labels in `ar`, `en`, `es`, `fr`, `ja`, `pt-BR`, `ru`, and `zh-CN`.

## Workspace Scripts And Git Actions

### Purpose

Workspace script execution and git actions gained compact split-button controls that preserve labels where space allows and keep destructive/secondary actions in menus.

### Files

- `packages/app/src/screens/workspace/workspace-scripts-button.tsx`
- `packages/app/src/git/actions-split-button.tsx`
- `packages/app/src/git/actions-store.ts`
- `packages/app/src/components/ui/button.tsx`
- `packages/app/src/components/ui/context-menu.tsx`
- `packages/app/src/components/ui/dropdown-menu.tsx`

### Behavior

- Workspace scripts expose a primary run action plus a menu for alternate script choices.
- The split script control keeps a visible label in split-pane layouts instead of collapsing to an ambiguous icon-only control.
- Git actions use a split-button pattern backed by `actions-store.ts`, with tests covering the action state model.
- Shared button/menu primitives gained the minor styling and prop support needed by the new controls.

## Auto Titles, Prompt Index, And Protocol Additions

### Purpose

The daemon can generate better titles and expose prompt index data to clients through optional protocol fields and feature gates.

### Files

- `packages/server/src/server/agent-title-generator.ts`
- `packages/server/src/server/agent/agent-manager.ts`
- `packages/server/src/server/agent/timeline-prompt-index.ts`
- `packages/server/src/server/agent/tools/paseo-tools.ts`
- `packages/server/src/server/websocket-server.ts`
- `packages/client/src/daemon-client.ts`
- `packages/protocol/src/messages.ts`
- `packages/protocol/src/messages.workspaces.test.ts`
- `packages/protocol/src/messages.test.ts`

### Public Surface

- `AgentTitleGenerator` asks the configured provider for a short JSON title using the initial prompt and attachments, validates it with Zod, trims it, and returns `null` on generation failure.
- Workspace title RPCs use dotted names: `workspace.title.set.request` and `workspace.title.set.response`.
- Workspace list and update schemas accept optional `title` data so old daemons and clients continue to parse messages.
- `server_info.features.timelinePromptIndex?: boolean` is added with a `COMPAT(timelinePromptIndex)` cleanup comment.
- Timeline prompt index data is produced by `timeline-prompt-index.ts` and consumed by the app when the feature flag is present.

### Behavior

- Thread and workspace title generation are split so user-set workspace titles can override derived names without losing the agent/thread title.
- Server prompt indexing identifies user prompt positions in the persisted timeline. The client gates prompt marker behavior on `server_info.features.timelinePromptIndex` instead of attempting a degraded legacy path.
- Protocol schema changes are optional or nullable where needed, preserving old-client/new-daemon and new-client/old-daemon parsing.
- Tool-call display parsing accepts the new display data while maintaining compatibility with older tool-call payloads.

## Subagent Tabs And Visibility

### Purpose

Subagents can automatically open in tabs with useful context, and workspace/subagent visibility is consistently modeled across the stream, sidebar, and workspace tabs.

### Files

- `packages/app/src/subagents/auto-open-tab-policy.ts`
- `packages/app/src/subagents/select.ts`
- `packages/app/src/subagents/track.tsx`
- `packages/app/src/subagents/track-presentation.ts`
- `packages/app/src/stores/workspace-subagents-integration.test.ts`
- `packages/app/src/workspace-tabs/agent-visibility.ts`
- `packages/app/src/workspace/legacy-daemon-workspaces.ts`

### Behavior

- Subagent track presentation now separates selection logic from rendering shape.
- Auto-open policy decides when a subagent should become a workspace tab, avoiding duplicate tabs and respecting current workspace state.
- Visibility helpers decide whether agents appear as primary workspaces, embedded tabs, archived entries, or hidden children.
- Legacy daemon workspace compatibility keeps older workspace payloads readable without adding feature-level fallback behavior.

## File Explorer And Preview Enhancements

### Purpose

File preview behavior handles images and active hosts more accurately, and project/workspace helper utilities understand the richer tab model.

### Files

- `packages/app/src/components/file-pane.tsx`
- `packages/app/src/components/file-pane-image-size.ts`
- `packages/app/src/file-explorer/preview-target.ts`
- `packages/app/src/components/file-explorer-pane.tsx`
- `packages/app/src/utils/active-host.ts`
- `packages/app/src/utils/host-routes.ts`
- `packages/app/src/utils/projects.ts`
- `packages/app/src/hooks/use-open-project-picker.ts`

### Public Surface

- `file-pane-image-size.ts` computes image sizing constraints for preview panes.
- `preview-target.ts` resolves which file or directory should be previewed from explorer state.
- `active-host.ts` determines the active host context for routes and utilities.

### Behavior

- Image previews size to the pane without stretching beyond natural constraints.
- File preview target resolution is covered for directory/file edge cases.
- Host route helpers and open-project picker calls account for the current active workspace/project source.

## Settings, Localization, Keyboard, And Polish

### Purpose

The branch adds settings and keyboard affordances needed by the new UI while polishing loading, toast, overlay, and status presentations.

### Files

- `packages/app/src/hooks/use-settings/index.ts`
- `packages/app/src/hooks/use-settings/storage.ts`
- `packages/app/src/screens/settings/appearance/appearance-section.tsx`
- `packages/app/src/i18n/resources/*.ts`
- `packages/app/src/keyboard/actions.ts`
- `packages/app/src/keyboard/focus-scope.ts`
- `packages/app/src/keyboard/keyboard-action-dispatcher.ts`
- `packages/app/src/keyboard/keyboard-shortcuts.ts`
- `packages/app/src/keyboard/route-shortcut.ts`
- `packages/app/src/components/synced-loader.tsx`
- `packages/app/src/components/ui/loading-spinner.tsx`
- `packages/app/src/components/download-toast.tsx`
- `packages/app/src/components/quitting-overlay.tsx`
- `packages/app/src/components/realtime-voice-overlay.tsx`
- `packages/app/src/components/dictation-controls.tsx`

### Behavior

- Appearance settings include toggles for new stream/sidebar presentation choices, including pinned prompts.
- Settings storage validates persisted values by type and falls back to defaults on invalid data.
- Keyboard action registration includes shortcuts for find, route navigation, and workspace/tab movement.
- Loading and overlay components use the updated visual language from `docs/design.md`, including restored blue chat loading indicators.

## CLI, Desktop, And Documentation

### Purpose

Supporting packages and docs are updated for the richer workspace model and app behavior.

### Files

- `packages/cli/src/commands/worktree/archive.ts`
- `packages/cli/src/commands/worktree/ls.ts`
- `packages/desktop/build/entitlements.mac.plist`
- `packages/desktop/build/entitlements.mac.inherit.plist`
- `docs/agent-lifecycle.md`
- `docs/data-model.md`
- `docs/design.md`
- `docs/development.md`

### Behavior

- CLI worktree archive/list output handles the updated workspace/title/archive fields.
- Desktop entitlements include the allowances required by the updated desktop build.
- System docs capture the agent lifecycle, data-model, design, and development gotchas introduced or clarified while the feature branches were integrated.

## Tests

The branch adds focused tests rather than broad-suite changes. Coverage includes:

- pinned prompt selection and geometry
- collapse-thinking grouping and preview behavior
- stream bottom-anchor behavior
- web strategy rendering and find integration
- prompt index geometry and server prompt indexing
- sidebar tree ordering, visibility, row content, row actions, status summaries, active ancestor highlight, and active workspace reveal
- workspace layout store actions, main pane selection, tab close trees, and tab navigation
- settings persistence
- markdown table layout metrics
- file pane image sizing and preview target resolution
- protocol parsing for optional workspace/title/prompt-index fields
- server title generation and timeline prompt indexing
