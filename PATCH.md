# Patch Summary: Collapsible Thinking Groups

Branch: `feat/collapse-thinking`

Base: `origin/main`

Anchor commit: aa751e1632a2606b5991a89c89b973eef09033fc — feat(collapse-thinking): preserve active expansion state

## Purpose

This branch adds a configurable stream presentation that collapses intermediate thinking/tool activity into grouped sections. The goal is to reduce visual noise while preserving access to reasoning messages, tool calls, and todo-list items.

It also updates bottom anchoring so expanding/collapsing thinking groups does not fight the user or unexpectedly pull the stream to the bottom.

## User-Facing Changes

- Adds an Appearance setting for collapse-thinking behavior.
- Supports three collapse modes:
  - `never`
  - `completed`
  - `completed-and-active`
- Collapses thinking/tool-call groups for completed turns depending on the selected mode.
- Optionally collapses the active turn while the agent is still running.
- Shows group headers with message and tool-call counts.
- Shows previews for collapsed active thinking groups when there are visible thinking messages.
- Lets users expand a collapsed thinking group by pressing the lower half of its preview area.
- Balances vertical spacing around a collapsed completed thinking group when it sits between the user prompt and final assistant response.
- Keeps final assistant responses and plan cards outside collapsed thinking groups while allowing assistant progress messages to stay with the hidden work they describe.
- Preserves normal access to tool calls and thinking content through expand/collapse controls.

## Restored Main Polish

This detail was previously implemented on `main`, then lost when this feature was split out. It is part of this branch's intended behavior and should be preserved when rebasing or batching the feature again.

- The in-flight chat turn footer uses the blue synced loading indicator, matching the active chat state instead of the older amber warning treatment.
- Stream loading indicators use the shared blue `LoadingSpinner` in both web and native history loading states, and permission action buttons use the same spinner while a response is pending.
- Collapsed thinking headers show elapsed timing again:
  - Active collapsed thinking groups render `Working for {{duration}}`.
  - Completed collapsed thinking groups render `Worked for {{duration}}`.
  - Expanded groups keep the stable `Thinking` label.

## Settings And Persistence

### `packages/app/src/hooks/use-settings/storage.ts`

Adds:

```ts
export type CollapseThinkingBehavior = "never" | "completed" | "completed-and-active";
```

Adds `collapseThinking: CollapseThinkingBehavior` to `AppSettings`.

Implementation details:

- Default value is `"never"`.
- The persisted app-settings parser uses a `StoredAppSettings` type where `collapseThinking` is `unknown`, because older clients may have stored booleans.
- `parseCollapseThinkingBehavior(value)` handles the persisted value:
  - Valid strings are returned unchanged.
  - Boolean `true` migrates to `"completed"`.
  - Boolean `false` migrates to `"never"`.
  - Invalid values return `null`, which means the default is kept.
- `pickAppSettings` calls `parseCollapseThinkingBehavior` and only writes the result when non-null.

### `packages/app/src/hooks/use-settings/index.ts`

Adds `collapseThinking` to the settings update path so callers can persist the mode.

### Tests

`packages/app/src/hooks/use-settings/storage.test.ts` adds coverage for:

- Default `"never"` behavior.
- Persisted `"completed-and-active"` behavior.
- Legacy boolean migration.
- Invalid persisted value fallback.

## Core Grouping Logic

### `packages/app/src/agent-stream/collapse-thinking.ts`

This new module contains the pure stream grouping algorithm.

#### `ThinkingGroup`

Represents one collapsible thinking group:

- `id`: stable group id based on user message id, anchor item id, and active/completed state.
- `anchorItemId`: first item in the group; the view uses this item position to render the group header.
- `itemIds`: ids of all stream items in the group.
- `startedAt`: timestamp from the group's anchor item.
- `lastActivityAt`: timestamp from the group's final grouped item, falling back to `startedAt`.
- `defaultExpanded`: whether the group starts expanded.
- `status`: `"active"` or `"completed"`.
- `finalAssistantItemId`: id of the assistant message that closed a completed group, when present.

#### `ThinkingGroupIndex`

Returned index containing:

- `groups`: ordered group list.
- `groupByAnchorItemId`: map from the anchor item id to the group.
- `groupByItemId`: map from every grouped item id to its group.

The view uses both maps to know where to render a header and which individual rows should be hidden while collapsed.

#### `buildCollapseThinkingGroups({ items, behavior, agentStatus })`

Builds thinking groups from stream items.

Implementation details:

1. Finds each user-message turn boundary with `findNextUserMessageIndex`.
2. Treats items between one user message and the next as that turn.
3. Marks the final turn as the current running turn when `agentStatus === "running"` and the turn reaches the end of the stream.
4. Delegates each turn to `buildTurnGroups`, which walks the turn in order and accumulates collapsible work items.
5. Treats `thought`, `tool_call`, `todo_list`, and assistant messages marked `presentation: "progress"` as collapsible work, except agent tool calls whose detail type is `"plan"`. Plan cards stay visible in the stream.
6. Treats normal assistant response messages as visible output boundaries. When a response message is encountered, the current accumulated group is emitted as completed with that assistant message as `finalAssistantItemId`, and the assistant message itself is not added to the group.
7. Keeps assistant progress messages inside the current thinking group when more non-user-facing collapsible work follows, so progress narration between tool calls collapses with those tool calls.
8. Leaves assistant progress text visible before a `request_user_input` tool call by completing the previous group with that progress message as `finalAssistantItemId`, then grouping the user-facing tool separately.
9. Leaves a final assistant progress message visible after completion when it is the last item in a completed turn by using it as the completed group's `finalAssistantItemId` instead of hiding it.
10. In the current running turn only, keeps a trailing assistant message inside the active group when there is no later collapsible work. This preserves live assistant text in the active thinking preview until the turn completes.
11. Starts a new group after visible assistant output when later collapsible work appears, so a single turn can produce multiple completed thinking groups separated by visible assistant messages.
12. Flushes accumulated work as completed when a non-collapsible, non-assistant item interrupts the group.
13. Flushes any remaining accumulated work at the end of the turn as `"active"` for the current running turn or `"completed"` otherwise.
14. Copies the anchor timestamp into `startedAt` and the last grouped item's timestamp into `lastActivityAt`.
15. Uses the first grouped item as the anchor and builds a stable group id of `thinking:<userMessageId>:<anchorItemId>:active` or `thinking:<userMessageId>:<anchorItemId>:final`.
16. Sets `defaultExpanded` to true only for active groups when behavior is `"completed"`.
17. Populates both lookup maps after the group list is built.

The behavior parameter excludes `"never"` because callers skip grouping entirely for that mode.

#### `getThinkingGroupCounts(items)`

Counts visible group summary data.

Implementation details:

- Iterates grouped items.
- Increments `messageCount` for assistant messages and thought items.
- Increments `toolCallCount` for `tool_call` items.
- Ignores todo-list and other groupable non-message items for the count summary.

#### `resolveExpandedThinkingGroupIds({ groups, expandedByGroupId, behavior })`

Normalizes the per-group expansion-state map before rendering.

Implementation details:

- Returns the input map unchanged for every mode except `"completed-and-active"`.
- In `"completed-and-active"` mode, returns a lazily cloned `Map<string, boolean>` only when it needs to synthesize missing state.
- Walks groups in render order and preserves any existing explicit state for a group id.
- If a group is missing explicit state but its status peer exists, copies that peer's state. Status peers share the same stable id prefix and differ only by `:active` versus `:final`, so an active group becoming completed or a completed group becoming active preserves the user's expansion choice.
- If neither the group nor its status peer has explicit state, initializes the group from the previous group's resolved expansion state. If there is no previous group, falls back to `group.defaultExpanded`.
- Tracks the most recent resolved state while walking, so later thinking groups in the same active turn start consistently expanded or collapsed with the earlier active thinking group instead of snapping back to the default.

#### `getThinkingGroupPreviewMessages(items)`

Builds preview text records for thinking-message items.

Implementation details:

- Iterates grouped items.
- Adds `{ id, text }` for assistant messages and thought items.
- Ignores tool calls and todo lists.

#### `shouldShowThinkingGroupPreview({ expanded, groupStatus, messageCount })`

Determines whether the collapsed group should show inline preview text.

Implementation details:

- Returns true only when the group is collapsed.
- Requires the group to be active.
- Requires at least one thinking message.

This keeps completed groups compact while letting active hidden reasoning still show a hint.

#### Private Helpers

- `findNextUserMessageIndex(items, startIndex)` returns the next user-message index or `null`.
- `isCollapsibleWorkItem(item)` accepts `thought`, `tool_call`, `todo_list`, and assistant messages with `presentation: "progress"`, but excludes agent `"plan"` tool-call detail cards.
- `isUserFacingToolItem(item)` detects Codex `request_user_input` tool calls, which stay visible as user-facing question prompts instead of being prefaced by hidden progress text.
- `isNextCollapsibleWorkUserFacing(items, startIndex)` scans forward to the next collapsible work item and returns whether it is user-facing.
- `hasLaterCollapsibleWork(items, startIndex)` checks whether a running-turn assistant message should remain grouped because no later collapsible work follows.
- `isThinkingMessageItem(item)` narrows to `assistant_message` or `thought`.

## Assistant Message Presentation

The branch adds an optional assistant-message presentation marker so the app can distinguish final response text from progress narration that belongs with hidden work.

### Public Surface

`packages/protocol/src/agent-types.ts` and `packages/server/src/server/agent/agent-sdk-types.ts` extend assistant timeline items to:

```ts
{
  type: "assistant_message";
  text: string;
  messageId?: string;
  presentation?: "response" | "progress";
}
```

`packages/protocol/src/messages.ts` accepts the optional `presentation` field in `AgentTimelineItemPayloadSchema` with the same `"response" | "progress"` enum. Because the field is optional, older timeline messages and older daemons continue to parse as ordinary response-style assistant messages.

`packages/app/src/types/stream.ts` mirrors the field on `AssistantMessageItem`:

```ts
export interface AssistantMessageItem {
  kind: "assistant_message";
  id: string;
  messageId?: string;
  presentation?: "response" | "progress";
  text: string;
  timestamp: Date;
  blockGroupId?: string;
  blockIndex?: number;
}
```

### App Stream Behavior

`appendAssistantMessage` accepts an optional presentation argument and only coalesces assistant chunks when the previous assistant item has the same `messageId` compatibility and the same presentation. The same presentation check is applied to the "append around a live user-message interrupt" path, so progress and response text never merge into a single stream item.

`reduceTimelineEvent` passes `item.presentation` from timeline events into `appendAssistantMessage`.

`promoteCompletedAssistantBlocks` preserves `activeItem.presentation` when splitting a completed assistant block into block-grouped items, so long completed progress messages keep their progress classification after block promotion.

### Server Stream Behavior

`packages/server/src/server/agent/agent-stream-coalescer.ts` keeps text coalescing presentation-aware. Two text entries are combined only when type, provider, turn id, and assistant presentation all match.

`packages/server/src/server/agent/timeline-projection.ts` keeps assistant timeline projection presentation-aware. Adjacent assistant entries with different presentation values stay separate, and merged assistant entries preserve the previous assistant presentation.

## Stream View Integration

### `packages/app/src/agent-stream/view.tsx`

The stream view now:

- Reads `collapseThinking` from settings.
- Builds thinking groups when the setting is not `"never"`.
- Renders a group header at each group's anchor item.
- Suppresses grouped rows when their group is collapsed.
- Keeps final answer items visible outside the group.
- Maintains per-group expanded/collapsed state.
- Shows message/tool-call counts in group headers.
- Shows preview text for collapsed active groups when allowed by `shouldShowThinkingGroupPreview`.
- Adds an invisible accessible press target over the bottom half of a collapsed preview; pressing it expands the group without requiring the user to move back to the header.
- Shows active/completed duration text in collapsed group headers using `turnTiming.runningStartedAt` and `turnTiming.byAssistantId`.
- Resolves thinking-group expansion state through `resolveExpandedThinkingGroupIds` before rendering. A memoized resolved map is used for row props, and an effect writes synthesized expansion entries back into local state when groups or collapse behavior change.
- Handles scroll/anchor behavior when a group is expanded.
- Passes both `gapBelow` and `marginTop` into `StreamItemWrapper` for collapsed thinking groups. Expanded groups keep the existing spacing. Collapsed completed groups between a user message and assistant response call `getCollapsedThinkingGroupSpacing` so the visible gap above and below the collapsed pill is symmetrical.
- `StreamItemWrapper` accepts an optional `marginTop` prop and includes it with `marginBottom` in the wrapper style.

### `packages/app/src/agent-stream/spacing.ts`

Adds:

```ts
export interface CollapsedThinkingGroupSpacing {
  marginTop: number;
  gapBelow: number;
}

export function getCollapsedThinkingGroupSpacing(params: {
  aboveItem: StreamItem | null | undefined;
  firstItem: StreamItem;
  belowItem: StreamItem | null | undefined;
  defaultGapBelow: number;
}): CollapsedThinkingGroupSpacing;
```

Behavior:

- If the collapsed group is not directly between a `user_message` and an `assistant_message`, returns `{ marginTop: 0, gapBelow: defaultGapBelow }`.
- If it is between that prompt/answer pair, uses `SPACING[2]` as the symmetric visible gap around the collapsed group.
- Computes the existing gap above with `getGapBetweenStreamItems(aboveItem, firstItem)` and returns `marginTop: SPACING[2] - gapAbove`, reducing the inherited larger user-to-thinking gap without changing the surrounding layout algorithm.

### `packages/app/src/components/message.tsx`

Message rendering is adjusted so messages can be used both as normal stream rows and as content inside thinking group summaries without inheriting unwanted timestamp/boundary presentation.

## Bottom Anchor Controller

### `packages/app/src/agent-stream/bottom-anchor-controller.ts`

This branch extends the bottom-anchor controller to handle layout changes from expanding thinking groups.

New or changed behavior:

- Adds `pauseStickyContentAnchoringForNextLayoutChange()`.
- Tracks `isStickyContentAnchoringPausedForNextLayoutChange`.
- Tracks `shouldIgnoreNextPausedLayoutScrollAway`.
- When a sticky content layout change is paused and content height increases, it:
  - Clears the pause.
  - Marks the current sticky measurement as verified.
  - Cancels pending attempts.
  - Clears blocked reason.
  - Ignores the next scroll-away signal caused by that paused layout change.
- Existing sticky-bottom verification and route-anchor behavior remain intact.

This prevents expansion of a thinking group from being interpreted as user scroll-away or from immediately forcing the viewport back to the bottom.

### Tests

`packages/app/src/agent-stream/bottom-anchor-controller.test.ts` adds coverage for the pause behavior.

## Tool Call Display Changes

### `packages/protocol/src/tool-call-display.ts`

The display model now recognizes more canonical detail cases and unknown overrides so collapsed groups can present clearer summaries.

Important behavior:

- `buildCanonicalDetailDisplay` handles canonical detail types such as shell, read, edit, write, search, fetch, worktree setup, sub-agent, plain text, plan, and unknown.
- File path details use `stripCwdPrefix` so summaries are shorter inside the app.
- `buildUnknownDetailOverride` maps:
  - lower-name `"thinking"` to display name `"Thinking"`.
  - unknown `"task"` details to `"Task"` plus `metadata.subAgentActivity` when available.
  - lower-name `"terminal"` to `"Terminal"` plus plain-text label when available.
- `buildToolCallDisplayModel` prioritizes unknown overrides, then canonical detail display, then humanized tool name.
- Failed tool calls still include formatted error text.

### Tests

`packages/protocol/src/tool-call-display.test.ts` adds coverage for the updated display behavior.

## Codex App Server Agent Changes

`packages/server/src/server/agent/providers/codex-app-server-agent.ts` and its test update the generated stream/tool metadata so Codex thinking/task activity has the detail fields needed by the improved display model.

The provider also marks Codex assistant messages that represent progress narration rather than final answers with `presentation: "progress"`:

- Historical `threadItemToTimeline` assistant messages are emitted as progress messages.
- `CodexAppServerAgentSession` emits both full assistant-message items and assistant-message deltas from Codex stream events as progress messages.
- `emitAssistantSuffix` preserves the presentation marker when it emits a suffix for a pending assistant message.

Out-of-band status/error assistant messages and ordinary final response messages remain unmarked, so the app treats them as normal visible assistant output.

## Claude Progress Presentation

`packages/server/src/server/agent/providers/claude/agent.ts` now marks live assistant text emitted before a final response as `presentation: "progress"`. This includes transcript timeline deltas, text content blocks emitted through `contentBlockToTimelineItems`, and assistant text suffixes created by `flushAssistantText`. The marker lets the app collapse Claude progress narration with surrounding thinking/tool activity while keeping final answer text visible.

Tests in `packages/server/src/server/agent/providers/claude/agent.test.ts` cover progress presentation on incremental assistant messages.

## Appearance Settings

`packages/app/src/screens/settings/appearance/appearance-section.tsx` adds the setting control for collapse-thinking mode.

## Localization

Adds collapse-thinking setting copy in:

- `packages/app/src/i18n/resources/ar.ts`
- `packages/app/src/i18n/resources/en.ts`
- `packages/app/src/i18n/resources/es.ts`
- `packages/app/src/i18n/resources/fr.ts`
- `packages/app/src/i18n/resources/ru.ts`
- `packages/app/src/i18n/resources/zh-CN.ts`

## Tests

### `packages/app/src/agent-stream/collapse-thinking.test.ts`

Adds coverage for:

- Building groups per user-message turn.
- Keeping assistant output visible between thinking groups.
- Keeping assistant progress messages inside thinking groups between tools.
- Keeping assistant progress text visible before a user-facing `request_user_input` tool call.
- Leaving final progress text visible after a completed turn.
- Splitting completed and running-turn groups around visible assistant output.
- Excluding agent plan cards from collapsed thinking groups.
- Keeping trailing live assistant text inside the active running group until completion.
- Handling active running turns.
- Default-expanded behavior for active groups under `"completed"`.
- Resolving expansion state for `"completed-and-active"` groups by copying active/final peer state and carrying the previous group's resolved state into later active groups.
- Leaving the expansion map untouched for `"completed"` mode, where active groups still use `defaultExpanded` rather than copied sibling state.
- Count generation for messages and tool calls.
- Preview-message generation.
- Preview visibility rules.

### `packages/app/src/agent-stream/spacing.test.ts`

Adds coverage for symmetric collapsed thinking spacing between user prompt and assistant response, plus fallback behavior when there is no assistant response below the group.

### Strategy/View Tests

The stream view and strategy changes are covered by updated app tests around rendering and bottom anchoring.

## Verification

The branch commit was created with the repo pre-commit hook enabled.

The hook ran:

- `npm run lint` on changed files.
- `npm run format:check:files` on changed files.
- `npm run typecheck` across workspaces.

All passed for the implementation commit.
