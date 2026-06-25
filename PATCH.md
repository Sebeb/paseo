# Patch Summary: Collapsible Thinking Groups

Branch: `split/collapse-thinking`

Base: `origin/main`

Primary commit before this writeup: `f9a1fba72 feat(app): add collapsible thinking groups`

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
- Keeps final assistant messages outside the collapsed thinking group so the actual answer remains visible.
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

- `id`: stable group id based on user message id and active/completed state.
- `anchorItemId`: first item in the group; the view uses this item position to render the group header.
- `itemIds`: ids of all stream items in the group.
- `defaultExpanded`: whether the group starts expanded.
- `status`: `"active"` or `"completed"`.
- `finalAssistantItemId`: id of the final answer item, when present.

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
3. Marks the final turn as active when `agentStatus === "running"` and the turn reaches the end of the stream.
4. For completed turns, finds the last assistant message with `findLastAssistantMessageIndex`.
5. Finds the start of the trailing assistant-message suffix with `findAssistantSuffixStartIndex`.
6. Excludes that trailing assistant suffix from the collapsed thinking group so the final visible answer stays outside the group.
7. Selects group items before the final assistant suffix where `isThinkingGroupItem` is true.
8. Uses the first grouped item as the anchor.
9. Builds a stable group id of `thinking:<userMessageId>:active` for active groups or `thinking:<userMessageId>:final` for completed groups.
10. Sets `defaultExpanded` to true only for active groups when behavior is `"completed"`.
11. Populates both lookup maps after the group list is built.

The behavior parameter excludes `"never"` because callers skip grouping entirely for that mode.

#### `getThinkingGroupCounts(items)`

Counts visible group summary data.

Implementation details:

- Iterates grouped items.
- Increments `messageCount` for assistant messages and thought items.
- Increments `toolCallCount` for `tool_call` items.
- Ignores todo-list and other groupable non-message items for the count summary.

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
- `isThinkingGroupItem(item)` accepts `assistant_message`, `thought`, `tool_call`, and `todo_list`.
- `isThinkingMessageItem(item)` narrows to `assistant_message` or `thought`.
- `findLastAssistantMessageIndex(items)` scans backward for the final assistant message.
- `findAssistantSuffixStartIndex(items)` scans backward over contiguous assistant messages to keep the final answer suffix outside the group.

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
- Shows active/completed duration text in collapsed group headers using `turnTiming.runningStartedAt` and `turnTiming.byAssistantId`.
- Handles scroll/anchor behavior when a group is expanded.

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
- Excluding final assistant answer suffixes.
- Handling active running turns.
- Default-expanded behavior for active groups under `"completed"`.
- Count generation for messages and tool calls.
- Preview-message generation.
- Preview visibility rules.

### Strategy/View Tests

The stream view and strategy changes are covered by updated app tests around rendering and bottom anchoring.

## Verification

The branch commit was created with the repo pre-commit hook enabled.

The hook ran:

- `npm run lint` on changed files.
- `npm run format:check:files` on changed files.
- `npm run typecheck` across workspaces.

All passed for the implementation commit.
