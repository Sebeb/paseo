# Patch Summary: Prompt Scroll Markers

Branch: `feat/scroll-prompt-indicators`

Base: `origin/main`

Anchor commit: 5f4a178aa3028f53c25b0ee432a95a3fc2bdae67 — feat(app): index prompts across unloaded history

## Purpose

This branch adds a web-only prompt marker rail to the agent stream. The rail places compact markers along the scroll track for user prompts, lets users jump back to a prompt, shows a text preview on hover, and highlights the active prompt based on scroll position.

The feature is enabled by default through a new Appearance setting.

## User-Facing Changes

- Adds prompt scroll markers to desktop/web agent streams.
- Adds a `promptScrollMarkers` Appearance setting.
- Defaults `promptScrollMarkers` to `true`.
- Shows a small rail marker for each user message when the stream is tall enough to scroll.
- Hovering a marker shows a bounded preview of the prompt text.
- Clicking a marker scrolls the stream to that prompt with a small top offset.
- Clicking a marker preserves the existing follow-output state; unlike pinned-input navigation, prompt-marker navigation should not force `followOutput` off.
- The marker associated with the prompt at or before the current scroll context is visually highlighted.
- Prompt markers can include prompts from unloaded older history when the daemon advertises the timeline prompt-index capability.
- Clicking an unloaded-history marker scrolls to its estimated position and requests older history until the real row is loaded.
- The branch also updates the stream loading indicator color in `turn-footer.tsx` to use the simplified blue treatment from the original aggregate branch.

## Restored Main Polish

These details were previously implemented on `main`, then became easy to lose when the prompt-marker and pinned-input stream changes were split apart. They are part of this branch's intended behavior and should be preserved when rebasing or batching features again.

- Mounted and live prompt offsets are resolved by querying DOM anchors marked with `data-stream-item-id`, not only by reading a side map owned by pinned-input rendering. This keeps prompt markers accurate when other stream features wrap or replace row elements.
- Prompt rail metrics are recalculated in a layout effect after segment objects change, so marker positions update before paint after virtualization/live-head changes.
- The `ResizeObserver` also observes the chat-space preview-bounds element, not just the scroll/content nodes, so hover previews stay clamped when the containing chat area changes size.
- Marker activation uses the prompt at or before the current scroll context, with `PROMPT_SCROLL_TARGET_TOP_PADDING` included in that context, so the highlighted marker matches what the reader is looking at.
- Prompt marker clicks scroll to the prompt but do not call `setFollowOutput(false)`.

## Layout Constants

### `packages/app/src/agent-stream/prompt-index-geometry.ts`

This module converts daemon-provided timeline prompt-index rows into estimated geometry for older history that is not loaded in the stream yet.

Public surface:

```ts
export interface PromptIndexGeometry {
  unloadedSpacerHeight: number;
  unloadedPromptOffsetsById: Map<string, number>;
}

export function estimatePromptIndexRowHeight(row: AgentTimelinePromptIndexRow): number;
export function buildPromptIndexGeometry(input: {
  rows: readonly AgentTimelinePromptIndexRow[];
  loadedStartSeq: number | null;
}): PromptIndexGeometry;
```

Behavior:

- Returns an empty geometry when the loaded history start sequence is unknown.
- Iterates prompt-index rows until a row reaches the loaded history window.
- Estimates row heights by row kind, using larger estimates for image prompts and long assistant text.
- Records offsets only for `user_message` rows before loaded history.
- Returns the total estimated height as `unloadedSpacerHeight` so web rendering can reserve scroll space for not-yet-loaded history.

### `packages/app/src/agent-stream/prompt-scroll-marker-layout.ts`

This new module centralizes rail dimensions:

- `PROMPT_MARKER_SIZE = 6`
- `PROMPT_MARKER_HIT_SIZE = 28`
- `PROMPT_SCROLLBAR_RESERVED_WIDTH = 12`
- `PROMPT_MARKER_RAIL_RIGHT = PROMPT_SCROLLBAR_RESERVED_WIDTH`
- `PROMPT_MARKER_RESERVED_RIGHT_LANE = PROMPT_SCROLLBAR_RESERVED_WIDTH + PROMPT_MARKER_HIT_SIZE`

The strategy uses these constants for marker placement. Other UI surfaces can reserve the right-side lane when prompt markers are active.

## Web Strategy Implementation

All marker rendering and measurement work lives in `packages/app/src/agent-stream/strategy-web.tsx`.

### Marker Data Shapes

#### `PromptMarkerDescriptor`

Represents a user-message item before its scroll offset is resolved:

- `id`: stream item id.
- `text`: user prompt text.
- `index`: index within its segment.
- `segment`: one of `unloadedHistory`, `virtualizedHistory`, `mountedHistory`, or `liveHead`.

The segment is needed because unloaded history offsets come from prompt-index geometry, virtualized history offsets come from the virtualizer, and mounted/live offsets come from DOM anchors.

#### `PromptMarker`

Extends `PromptMarkerDescriptor` with:

- `targetOffset`: absolute scroll content offset for the prompt.

Only descriptors with resolved offsets become renderable markers.

#### `PromptRailMetrics`

Caches the rail's measured state:

- `viewportSize`
- `contentSize`
- `scrollOffset`
- `previewBoundsTop`
- `previewBoundsBottom`
- `offsetsById`

`offsetsById` maps prompt ids to their current scroll offsets.

### Helper Functions

#### `clamp(value, min, max)`

Returns `Math.min(max, Math.max(min, value))`. It is used by marker and preview positioning to keep UI inside valid bounds.

#### `arePromptRailMetricsEqual(left, right)`

Compares rail metrics before committing React state updates.

Implementation details:

- Compares viewport size, content size, scroll offset, preview bounds, and map size.
- Iterates `left.offsetsById` and checks that each id maps to the same offset in `right`.
- Returns true only when all fields match.

This avoids unnecessary state updates during scroll and resize measurement churn.

#### `getPromptPreviewBoundsElement(scrollContainer)`

Finds the element used to bound prompt previews:

- Looks for the nearest ancestor matching `[data-testid="agent-chat-space"]`.
- Falls back to the scroll container when no chat-space ancestor exists.

This keeps previews constrained to the visible chat area instead of the full document.

#### `getPromptPreviewBounds(scrollContainer)`

Computes preview bounds in scroll-container coordinates.

Implementation details:

- Reads `getBoundingClientRect()` from the scroll container and bounds element.
- Converts bounds to scroll-container-relative `top` and `bottom`.
- Falls back to `{ top: 0, bottom: scrollContainer.clientHeight }` when measurements are invalid or inverted.

#### `collectPromptMarkerDescriptors(segments, promptIndex, loadedHistoryStartSeq)`

Collects every `user_message` from unloaded prompt-index rows and all loaded stream segments.

Implementation details:

- When prompt index data and a loaded-history start sequence are available, visits prompt-index rows before the loaded window and adds `user_message` rows as `unloadedHistory` markers.
- Visits `segments.historyVirtualized` with segment `virtualizedHistory`.
- Visits `segments.historyMounted` with segment `mountedHistory`.
- Visits `segments.liveHead` with segment `liveHead`.
- Pushes descriptors only for `item.kind === "user_message"`.

This creates a stable list of prompt candidates regardless of whether rows are virtualized.

#### `findStreamItemAnchor(contentElement, itemId)`

Searches mounted DOM stream rows for the requested item id.

Implementation details:

- Returns `null` when the content element is absent.
- Queries `[data-stream-item-id]`.
- Returns the first element whose `dataset.streamItemId` matches the item id.

Mounted and live prompts use this to resolve exact offsets.

#### `getPromptMarkerTop({ targetOffset, viewportSize, contentSize })`

Maps a content offset to a marker top inside the visible rail.

Implementation details:

- Calculates `maxMarkerTop = max(0, viewportSize - PROMPT_MARKER_HIT_SIZE)`.
- Returns `0` when content size is non-positive.
- Clamps the target offset between `0` and `contentSize`.
- Scales the clamped offset by `maxMarkerTop / contentSize`.

#### `getPromptPreviewTop(...)`

Positions the hover preview so it tracks the marker dot while staying inside preview bounds.

Implementation details:

- Computes the dot center using marker top and marker/dot sizes.
- Applies top/bottom padding using `PROMPT_PREVIEW_EDGE_PADDING`.
- Calculates a max top that keeps the preview height within bounds.
- Returns the clamped top.

#### `getPromptPreviewText(text)`

Trims preview text and truncates it to `PROMPT_PREVIEW_TEXT_MAX_LENGTH` characters.

Implementation details:

- Returns trimmed text unchanged when it fits.
- Otherwise slices to `max - 3`, trims trailing whitespace, and appends `...`.

#### `getActivePromptMarkerId({ markers, scrollOffset })`

Finds the active prompt marker for the current scroll context.

Implementation details:

- Returns `null` for an empty marker list.
- Adds `PROMPT_SCROLL_TARGET_TOP_PADDING` to the current scroll offset.
- Starts with the first marker as active.
- Iterates markers in order and keeps advancing while `marker.targetOffset <= contextOffset`.
- Stops at the first marker after the context offset.
- Returns the last marker at or before the context offset.

This makes the active marker represent the prompt the reader has most recently passed.

### Components

#### `PromptMarkerRailItem`

Renders one marker button and its hover preview.

Implementation details:

- Uses `getPromptPreviewText` to compute preview copy.
- Builds dot style from the base dot style and overlays active style when `isActive` is true.
- Positions the button at `markerTop`.
- Positions the preview relative to the marker button using `previewTop - markerTop`.
- Reports preview height through `onPreviewHeightChange` after layout.
- Uses `ResizeObserver` when available so preview positioning stays correct if text wraps differently.
- Calls `onMarkerPress(marker)` on click.
- Calls `onHoveredPromptChange(marker.id)` on mouse enter and clears it on mouse leave.

#### `PromptMarkerRail`

Renders the complete rail and owns hover/preview-height state.

Implementation details:

- Keeps `hoveredPromptId` in React state.
- Keeps `previewHeightsById` in a `Map` so each marker can clamp its preview using actual measured height.
- Returns `null` when there are no markers, content does not overflow, or viewport size is non-positive.
- Computes `activePromptId` with `getActivePromptMarkerId`.
- For each marker, computes marker top, preview top, hover state, and active state.

### `WebStreamViewport` Integration

`WebStreamViewport` now:

- Reads `settings.promptScrollMarkers` from `useAppSettings`.
- Enables markers only on non-mobile web where the custom scrollbar is shown.
- Suppresses markers while a full-history prompt index is expected but still loading.
- Builds prompt-index geometry and renders a fixed-height unloaded-history spacer above loaded rows.
- Disables the virtualizer when the unloaded spacer is present so loaded virtual-history rows can be mounted beneath the estimated unloaded area.
- Keeps `promptRailMetrics` in state.
- Resolves unloaded prompt offsets through `promptIndexGeometry.unloadedPromptOffsetsById`.
- Resolves virtualized prompt offsets through `rowVirtualizer.getOffsetForIndex`.
- Resolves mounted/live prompt offsets through `findStreamItemAnchor`.
- Updates metrics on scroll, resize, virtualizer measurement, and stream changes.
- Tracks `scrollOffset` separately during scroll so active-marker highlighting updates without recalculating all prompt offsets.
- Scrolls to a prompt on marker click using `targetOffset - PROMPT_SCROLL_TARGET_TOP_PADDING`.
- For unloaded-history markers, records the pending target id and calls `onNearHistoryStart()` until older history loads enough for that marker to leave the unloaded range.

## Timeline Prompt Index Protocol

### `packages/protocol/src/messages.ts`

Adds a dotted, capability-gated timeline prompt-index RPC:

```ts
agent.timeline.prompt_index.request;
agent.timeline.prompt_index.response;
```

The response payload includes:

- `requestId`
- `agentId`
- `epoch`
- `window`
- `rows`
- nullable `error`

`AgentTimelinePromptIndexRow` includes stable row identity, row kind, sequence bounds, optional text preview, image/attachment hints, and text length. The server advertises support through `server_info.features.timelinePromptIndex`.

### `packages/server/src/server/agent/timeline-prompt-index.ts`

Adds prompt-index row construction for projected timeline entries.

Behavior:

- Generates deterministic fallback ids from item type, timestamp, and item JSON when a timeline item lacks a message id.
- Preserves user/assistant message ids where available.
- Truncates user-message preview text to 180 characters.
- Maps internal timeline item types to protocol row kinds: user message, assistant message, thought, tool call, todo list, activity log, and compaction.
- Carries sequence bounds through to the client so it can distinguish unloaded rows from loaded rows.

### `packages/server/src/server/session.ts`

Handles `agent.timeline.prompt_index.request` by loading the agent if needed, fetching the full projected timeline with a zero-row tail page, converting projected entries to prompt-index rows, and emitting the response. Errors are reported in-band on the response payload and logged server-side.

### `packages/client/src/daemon-client.ts`

Adds `fetchAgentTimelinePromptIndex(agentId)` to the daemon client. The method sends the dotted request, waits for the matching response, throws on an in-band response error, and returns the typed prompt-index payload.

### `packages/app/src/stores/session-store.ts`

Adds `agentTimelinePromptIndex`, keyed by agent id, plus `setAgentTimelinePromptIndex` for storing fetched indexes per session.

## Settings And Persistence

### `packages/app/src/hooks/use-settings/storage.ts`

Adds `promptScrollMarkers: boolean` to `AppSettings`.

Implementation details:

- Default value is `true`.
- Persisted values are accepted only when the stored value is a boolean.
- Invalid persisted values fall back to the default.

### `packages/app/src/hooks/use-settings/index.ts`

Adds `promptScrollMarkers` to the settings update path.

### `packages/app/src/hooks/use-settings/storage.test.ts`

Adds coverage for the setting default and persisted values.

## Appearance Settings

`packages/app/src/screens/settings/appearance/appearance-section.tsx` adds the UI control for prompt scroll markers.

## Agent Panel Integration

`packages/app/src/panels/agent-panel.tsx` passes the necessary chat-space context so prompt previews can be bounded against the correct agent chat region.

## Localization

Adds prompt-marker setting copy in:

- `packages/app/src/i18n/resources/ar.ts`
- `packages/app/src/i18n/resources/en.ts`
- `packages/app/src/i18n/resources/es.ts`
- `packages/app/src/i18n/resources/fr.ts`
- `packages/app/src/i18n/resources/ru.ts`
- `packages/app/src/i18n/resources/zh-CN.ts`

## Tests

`packages/app/src/agent-stream/strategy-web.test.tsx` adds coverage for:

- Rendering prompt markers for user messages.
- Preview text behavior.
- Marker positioning from virtualized and mounted segments.
- Clicking a marker scrolls to the prompt target.
- Marker bounds clamp against chat space.
- Active marker highlighting follows scroll offset.

## Verification

The branch commit was created with the repo pre-commit hook enabled.

The hook ran:

- `npm run lint` on changed files.
- `npm run format:check:files` on changed files.
- `npm run typecheck` across workspaces.

All passed for the implementation commit.
