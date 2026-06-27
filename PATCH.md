# Patch Summary: Find Dots And Stream Navigation

Branch: `feat/find-dots`

Base: `origin/main`

Anchor commit: 655b63a966e17ea43785938ae8cc55d3687b018e — feat(app): add find match scroll markers

## Prompt Scroll Markers

### Purpose

Adds a desktop-web marker rail beside the agent stream so users can see where user prompts occur in a long conversation and jump directly to them. The rail is web-only and desktop-only: compact/mobile layouts and native renderers do not show it. Prompt markers are enabled by default and can be disabled from appearance settings.

### Files

- `packages/app/src/agent-stream/prompt-scroll-marker-layout.ts`
- `packages/app/src/agent-stream/strategy-web.tsx`
- `packages/app/src/agent-stream/strategy.ts`
- `packages/app/src/agent-stream/strategy-native.tsx`
- `packages/app/src/agent-stream/view.tsx`
- `packages/app/src/hooks/use-settings/storage.ts`
- `packages/app/src/hooks/use-settings/index.ts`
- `packages/app/src/hooks/use-settings/storage.test.ts`
- `packages/app/src/screens/settings/appearance/appearance-section.tsx`
- `packages/app/src/i18n/resources/{ar,en,es,fr,ru,zh-CN}.ts`
- `packages/app/src/agent-stream/strategy-web.test.tsx`

### Public Surface

- `PROMPT_MARKER_SIZE = 6`, `PROMPT_MARKER_HIT_SIZE = 28`, `PROMPT_SCROLLBAR_RESERVED_WIDTH = 12`, `PROMPT_MARKER_RAIL_RIGHT = PROMPT_SCROLLBAR_RESERVED_WIDTH`, and `PROMPT_MARKER_RESERVED_RIGHT_LANE = PROMPT_SCROLLBAR_RESERVED_WIDTH + PROMPT_MARKER_HIT_SIZE` define the rail geometry.
- `AppSettings.promptScrollMarkers: boolean` is persisted with a default of `true`.
- `StreamViewportHandle.scrollToStreamItemTop(itemId: string): void` lets the stream jump to a specific item in both web and native strategies.

### Behavior

- `strategy-web.tsx` collects user messages from `segments.historyVirtualized`, `segments.historyMounted`, and `segments.liveHead`. Each marker descriptor stores the user message id, text, index, and segment so offsets can be resolved for virtualized and mounted rows.
- The marker rail is shown only when the desktop web scrollbar overlay is enabled and `settings.promptScrollMarkers` is true. It is hidden when the stream content does not overflow the viewport or when find-match markers are active.
- Virtualized-history prompt offsets are resolved through `rowVirtualizer.getOffsetForIndex(index, "start")` plus the virtual rows container offset. Mounted-history and live-head offsets are resolved through `[data-stream-item-id]` anchors.
- Marker positions map `targetOffset / contentSize` onto the usable viewport height minus the marker hit size. Clicking a marker scrolls to `targetOffset - 15px`, clamped between `0` and the maximum scroll offset.
- Prompt dots use a muted surface color with lower opacity by default. The active prompt marker is the last marker whose target offset is above the current scroll context (`scrollTop + 15px`) and is shown at full opacity with a stronger shadow.
- Hovering a prompt marker opens a preview containing a trimmed version of the user prompt. Preview text is capped at 140 characters, preserves line breaks, wraps long words, and is clamped within the chat-space bounds using measured preview height. A `ResizeObserver` keeps preview positioning current when dimensions change.
- `AppearanceSection` adds a display section on web with a `Switch` for prompt markers. The row is hidden on native. Settings parsing accepts only boolean `promptScrollMarkers`; missing or invalid stored values fall back to the default.

### Tests

- `strategy-web.test.tsx` covers prompt marker rendering, active-state selection, click navigation, virtualized offset handling, preview clamping, settings toggling, compact/native hiding, and coexistence with scrollbar behavior.
- `storage.test.ts` covers defaulting, persistence, migration, and parsing for `promptScrollMarkers`.

## Bottom Anchoring And Stream Jump Support

### Purpose

Stabilizes stream scroll behavior so prompt jumps, find jumps, viewport changes, message sends, initial entry, and resume navigation do not fight with sticky-bottom behavior.

### Files

- `packages/app/src/agent-stream/bottom-anchor-controller.ts`
- `packages/app/src/agent-stream/bottom-anchor-controller.test.ts`
- `packages/app/src/agent-stream/strategy.ts`
- `packages/app/src/agent-stream/strategy-web.tsx`
- `packages/app/src/agent-stream/strategy-native.tsx`
- `packages/app/src/agent-stream/view.tsx`

### Public Surface

- `BottomAnchorRouteRequest` supports route reasons `"initial-entry"` and `"resume"` with `agentId` and `requestKey`.
- `BottomAnchorLocalRequest` supports local reasons `"jump-to-bottom"` and `"message-sent"`.
- `BottomAnchorMode` is `"sticky-bottom" | "detached"`.
- `BottomAnchorBlockedReason` reports `"waiting_for_history_readiness"`, `"waiting_for_measurable_viewport"`, `"waiting_for_measurable_content"`, or `"waiting_for_post_layout_verification"`.
- `StreamViewportHandle` exposes `scrollToBottom`, `scrollToStreamItemTop`, `prepareForViewportChange`, and `pauseBottomAnchoringForNextLayoutChange`.
- `BottomAnchorTransportBehavior` configures verification delay frames and whether failed verification retries by rescrolling or rechecking.

### Behavior

- The bottom-anchor controller queues route and local anchor requests, waits for authoritative history plus measurable viewport and content, scrolls to bottom, then verifies after strategy-specific frame delays.
- Sticky mode detaches when the user scrolls away from bottom by more than 24px, and resumes when the user reaches bottom or a local anchor request succeeds.
- Web uses non-inverted DOM scrolling and verifies immediately; native uses inverted `FlatList` scrolling, tracks keyboard-induced settling for four frames, and delays verification while native layout is settling.
- `pauseBottomAnchoringForNextLayoutChange` lets inline expansions and thinking-group expansions suppress one layout-induced sticky-bottom correction so intentional jumps remain stable.
- `scrollToStreamItemTop` detaches from follow-output behavior, cancels pending stick-to-bottom work, scrolls directly to rendered DOM anchors when present, and falls back to virtualizer or `FlatList.scrollToIndex` for virtualized history.

### Tests

- `bottom-anchor-controller.test.ts` covers blocked reason derivation, pending request handling, retry behavior, route/local request lifecycles, and detach/resume behavior.
- `strategy-web.test.tsx` covers jump-to-item behavior and bottom-anchor integration in the web strategy.

## Collapsible Thinking Groups

### Purpose

Adds an appearance setting that can collapse intermediate assistant reasoning, thought, tool-call, and todo-list content into a single "Thinking" group per turn, while leaving the final assistant answer visible.

### Files

- `packages/app/src/agent-stream/collapse-thinking.ts`
- `packages/app/src/agent-stream/collapse-thinking.test.ts`
- `packages/app/src/agent-stream/view.tsx`
- `packages/app/src/components/message.tsx`
- `packages/app/src/hooks/use-settings/storage.ts`
- `packages/app/src/hooks/use-settings/index.ts`
- `packages/app/src/hooks/use-settings/storage.test.ts`
- `packages/app/src/screens/settings/appearance/appearance-section.tsx`
- `packages/app/src/i18n/resources/{ar,en,es,fr,ru,zh-CN}.ts`

### Public Surface

- `CollapseThinkingBehavior = "never" | "completed" | "completed-and-active"`.
- `AppSettings.collapseThinking: CollapseThinkingBehavior` defaults to `"never"`.
- `buildCollapseThinkingGroups({ items, behavior, agentStatus }): ThinkingGroupIndex` returns ordered groups plus `groupByAnchorItemId` and `groupByItemId` maps.
- `ThinkingGroup` contains `id`, `anchorItemId`, `itemIds`, `defaultExpanded`, `status`, and `finalAssistantItemId`.
- `getThinkingGroupCounts`, `getThinkingGroupPreviewMessages`, and `shouldShowThinkingGroupPreview` provide row metadata for the UI.

### Behavior

- Group construction walks chronological stream items turn by turn, using each user message as a turn boundary. Groupable items are assistant messages, thoughts, tool calls, and todo lists.
- For completed turns, a trailing suffix of assistant messages is treated as the final answer and excluded from the thinking group. Earlier assistant messages in the same turn remain groupable.
- The currently running final turn is marked `active` and has no final assistant id. Completed turns are marked `completed`.
- `"completed"` collapses completed thinking but keeps the active turn expanded by default. `"completed-and-active"` collapses both completed and active thinking. `"never"` skips group construction in the display path.
- `AgentStreamView` renders only the anchor item for each group. Non-anchor group items return `null`; the anchor renders `ThinkingGroupRow`, which replays the grouped layout items inside an expandable container.
- The group header shows a chevron, localized "Thinking" label, message and tool-count pills, and a pulsing title overlay while active. Collapsed active groups show a scrollable preview of thinking messages with top/bottom fade bands and bottom-pinning behavior as new preview content arrives.
- Expanding a group calls `pauseBottomAnchoringForNextLayoutChange` before changing the layout to avoid unwanted sticky-bottom correction.
- The setting parser accepts legacy boolean values, mapping `true` to `"completed"` and `false` to `"never"`.

### Tests

- `collapse-thinking.test.ts` covers turn boundary detection, final-answer exclusion, active/completed defaults, group indexes, counts, preview selection, and legacy behavior.
- `storage.test.ts` covers parsing and persistence for the new setting.

## Find In Thread

### Purpose

Adds in-thread search for agent conversations. Users can open a find bar, search visible conversation records, move through matches, optionally include collapsed thinking content, and see highlighted matches in message, tool, thought, speak, and todo text.

### Files

- `packages/app/src/agent-stream/find-in-thread.ts`
- `packages/app/src/agent-stream/find-in-thread.test.ts`
- `packages/app/src/agent-stream/find-runner-core.ts`
- `packages/app/src/agent-stream/find-runner-core.test.ts`
- `packages/app/src/agent-stream/find-runner.ts`
- `packages/app/src/agent-stream/find-runner.web.ts`
- `packages/app/src/agent-stream/find-worker.ts`
- `packages/app/src/agent-stream/view.tsx`
- `packages/app/src/components/find-highlighted-text.tsx`
- `packages/app/src/components/message.tsx`
- `packages/app/src/keyboard/actions.ts`
- `packages/app/src/keyboard/focus-scope.ts`
- `packages/app/src/keyboard/keyboard-action-dispatcher.ts`
- `packages/app/src/keyboard/keyboard-shortcuts.ts`
- `packages/app/src/keyboard/keyboard-shortcuts.test.ts`
- `packages/app/src/keyboard/route-shortcut.ts`
- `packages/app/src/keyboard/route-shortcut.test.ts`
- `packages/app/src/panels/agent-panel.tsx`
- `packages/app/src/i18n/resources/{ar,en,es,fr,ru,zh-CN}.ts`

### Public Surface

- Search part constants:
  - `FIND_PART_MESSAGE = "message"`
  - `FIND_PART_TOOL_TITLE = "tool:title"`
  - `FIND_PART_TOOL_SUMMARY = "tool:summary"`
  - `FIND_PART_TOOL_DETAIL = "tool:detail"`
  - `FIND_PART_TOOL_ERROR = "tool:error"`
  - `FIND_PART_SPEAK_MESSAGE = "speak:message"`
- `FindRecord` stores `id`, `itemId`, `part`, and `text`.
- `FindInThreadMatch` stores `id`, `recordId`, `itemId`, `part`, `start`, and `end`.
- `FindHighlightRange` stores `id`, `start`, `end`, and `active`.
- `FindHighlightsByItemId = Map<string, Map<string, FindHighlightRange[]>>`.
- `buildFindRecords`, `findNextMatchInRecord`, `findMatchesInRecords`, `normalizeFindQuery`, `buildFindHighlights`, and `getFindHighlightRanges` are the pure find helpers.
- `startFindThreadJob(input): FindThreadJob` starts a cancellable progressive search job.
- Keyboard actions add `agent.find.open`, `agent.find.next`, `agent.find.previous`, and `agent.find.close`.
- `KeyboardFocusScope` adds `"find-in-thread"`.

### Behavior

- `AgentStreamView` keeps find UI state local to the stream: open/closed state, query, include-thinking toggle, matches, active match id, scanning state, progress counts, and input ref.
- Opening find focuses the input on the next animation frame. Closing find clears the query, matches, active match, scan state, and progress counts.
- The find bar floats over the stream. Closed state shows a search icon button. Open state shows search input, previous/next icon buttons, current/total count, optional scanning progress, a "search thinking" checkbox, and close button.
- Search records are built from chronological stream items. User messages and visible assistant messages are searchable by default. Thinking-group content is searchable only when the user enables "search thinking"; then thoughts, grouped assistant messages, tool calls, and todo item text are included.
- Tool-call records include the display title and summary from `buildToolCallDisplayModel`, any `speak` message input, JSON/stringified detail, and JSON/stringified errors. Legacy/non-agent tool calls map `arguments` and `result` into an unknown detail for searching.
- Matching lowercases both query and record text with `toLocaleLowerCase()`. Matches are non-overlapping because scanning advances to the previous match end.
- Progressive search scans records in slices with a default 4ms frame budget and 120-match max batch. It reports progress batches, preserves the active match when still present across rescans, and chooses the first available match otherwise.
- `find-runner.web.ts` uses a module worker for large jobs (`>= 500` records or `>= 200 KiB` of searchable text) unless a test scheduler is supplied. Worker creation or runtime errors fall back to the progressive in-main-thread runner. `cancel()` terminates the worker and cancels any fallback job.
- When the active match changes, the stream expands the containing thinking group if needed, pauses bottom anchoring for that layout change, then scrolls to the matched item. Group expansion waits 40ms before scrolling so the row exists.
- Match navigation wraps around. Previous from no active match selects the last match; next from no active match selects the first.
- `FindHighlightedText` renders sorted, clamped, non-overlapping ranges inside React Native `Text`. Active matches use accent background and accent foreground; inactive matches use `surface4` background and foreground text. Highlight spans expose `data-find-match-id` through `dataSet` so the web marker rail can anchor to the exact match span.
- `message.tsx` threads find ranges through user messages, assistant markdown, thought/tool labels and summaries, speak messages, and todo rows. Markdown rendering tracks a running plain-text offset so ranges can be localized to individual text nodes. Todo highlights are keyed by `todo:<index>`.
- Keyboard routing maps find shortcuts through the workspace dispatcher. Find controls get their own focus scope via `[data-testid='find-in-thread-root']` so typing in the find input does not route as generic editable input.

### Tests

- `find-in-thread.test.ts` covers record construction, thinking inclusion/exclusion, tool-call search fields, speak messages, todo parts, query normalization, match IDs/ranges, and highlight grouping.
- `find-runner-core.test.ts` covers progressive batching, frame budget behavior, cancellation, empty query completion, and progress/complete callbacks.
- `keyboard-shortcuts.test.ts` and `route-shortcut.test.ts` cover the new find actions and routing.
- `strategy-web.test.tsx` covers find marker rail behavior and exact-match anchoring.

## Find Match Scroll Markers

### Purpose

Extends the prompt marker rail so, while find is open and has matches, the rail switches to blue dots for every find match. This makes match distribution visible across the whole thread and lets users jump directly to any match.

### Files

- `packages/app/src/agent-stream/strategy.ts`
- `packages/app/src/agent-stream/strategy-web.tsx`
- `packages/app/src/agent-stream/view.tsx`
- `packages/app/src/components/find-highlighted-text.tsx`
- `packages/app/src/agent-stream/strategy-web.test.tsx`

### Public Surface

- `StreamFindMarker` contains `id` and `itemId`.
- `StreamFindIndicator` contains `isActive`, `markers`, `activeMarkerId`, and `onMarkerPress(markerId)`.
- `StreamRenderInput.findIndicator?: StreamFindIndicator` passes find marker state from `AgentStreamView` into the render strategy.

### Behavior

- `AgentStreamView` derives `findIndicator` from current find state. Each match becomes `{ id: match.id, itemId: match.itemId }`; `activeMarkerId` follows `activeFindMatchId`; `onMarkerPress` sets the active match id.
- `strategy-web.tsx` chooses marker rail mode in this order: no rail on compact/mobile web, find rail when find is open and there is at least one match, prompt rail when prompt markers are enabled, otherwise no rail.
- Find markers reuse the prompt marker rail geometry but use blue dots, no hover preview, `data-testid="find-marker-rail"`, marker ids under `find-scroll-marker-<match id>`, and aria label "Jump to find match".
- Find marker offsets prefer exact `[data-find-match-id]` anchors emitted by highlighted text spans. If a match span is not mounted or measurable, the rail falls back to the containing stream item offset, including virtualized-history offset resolution.
- The active find marker is the active match id, not the scroll-derived prompt marker id. Clicking a find dot first calls `findIndicator.onMarkerPress(marker.id)` to update active match state, then scrolls to the exact match offset minus 15px when available.
- Prompt markers are suppressed while find markers are active so the rail never mixes prompt and find dots.

### Tests

- `strategy-web.test.tsx` covers find rail priority over prompt markers, active blue-dot state, marker click selecting the match, exact highlighted-span offset resolution, fallback to item offsets, and hiding when find has no matches.

## Tool Call And Codex Presentation Polish

### Purpose

Improves display names and summaries for special tool calls so collapsed thinking and find records show useful labels, and adjusts Codex app-server behavior so daemon-side app-server requests do not present as user-originating Paseo activity.

### Files

- `packages/protocol/src/tool-call-display.ts`
- `packages/protocol/src/tool-call-display.test.ts`
- `packages/server/src/server/agent/providers/codex-app-server-agent.ts`
- `packages/server/src/server/agent/providers/codex-app-server-agent.test.ts`

### Public Surface

- `buildToolCallDisplayModel(input: ToolCallDisplayInput): ToolCallDisplayModel` now recognizes more unknown-detail special cases.
- `CODEX_NON_ORIGINATING_APP_SERVER_CLIENT_INFO` is the reserved client info object `{ name: "codex_app_server_daemon", title: "Codex App Server Daemon", version: "0.0.0" }`.

### Behavior

- Tool name humanization still preserves names with namespace/path separators or double underscores, strips Paseo tool prefixes down to their leaf names, and title-cases simple names.
- Unknown detail tool calls named `thinking` display as `Thinking`.
- Unknown detail tool calls named `task` display as `Task` and use `metadata.subAgentActivity` as the summary when present.
- Tool calls named `terminal` display as `Terminal` and use a plain-text detail label as the summary when present.
- Codex app-server launch/client setup uses the reserved non-originating client identity so requests keep Codex's default CLI identity instead of being reported as Paseo-originated in provider usage/activity.

### Tests

- `tool-call-display.test.ts` covers the new special-case display names and summaries.
- `codex-app-server-agent.test.ts` covers the adjusted Codex app-server client identity behavior.

## Localization

### Purpose

Adds translated UI strings for the new stream controls and settings in every existing resource file.

### Files

- `packages/app/src/i18n/resources/ar.ts`
- `packages/app/src/i18n/resources/en.ts`
- `packages/app/src/i18n/resources/es.ts`
- `packages/app/src/i18n/resources/fr.ts`
- `packages/app/src/i18n/resources/ru.ts`
- `packages/app/src/i18n/resources/zh-CN.ts`

### Behavior

- Adds `agentStream.find.*` strings for opening/closing find, placeholder text, previous/next labels, match count, scanning progress, and the search-thinking toggle.
- Adds `agentStream.thinking.*` strings for the group label and message/tool count accessibility labels.
- Adds `settings.appearance.messages.collapseThinking.*` strings for the collapse-thinking setting and its three options.
- Adds `settings.appearance.display.promptMarkers*` strings for the prompt-marker setting row and accessibility label.

## Verification Added On Branch

- `packages/app/src/agent-stream/bottom-anchor-controller.test.ts`
- `packages/app/src/agent-stream/collapse-thinking.test.ts`
- `packages/app/src/agent-stream/find-in-thread.test.ts`
- `packages/app/src/agent-stream/find-runner-core.test.ts`
- `packages/app/src/agent-stream/strategy-web.test.tsx`
- `packages/app/src/hooks/use-settings/storage.test.ts`
- `packages/app/src/keyboard/keyboard-shortcuts.test.ts`
- `packages/app/src/keyboard/route-shortcut.test.ts`
- `packages/protocol/src/tool-call-display.test.ts`
- `packages/server/src/server/agent/providers/codex-app-server-agent.test.ts`
