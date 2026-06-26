# Patch Summary: Find in Chat Thread

Branch: `feat/find-in-chat-thread`

Base: `origin/main`

Anchor commit: 4912da8b4ee261726a7ce2031c35d8ab6291a75f — feat(app): refine find-in-thread matching and toolbar

## Summary

This branch adds browser-style find functionality to agent chat threads. It is based on
`split/collapse-thinking` and depends on that branch's collapse-thinking model to define which
stream items count as "thinking".

The feature is client-only. It does not add server, daemon, protocol, storage, or migration changes.

## User-Facing Behavior

- `Cmd+F` on macOS-style keyboards and `Ctrl+F` elsewhere opens find for the focused agent pane.
- A small top overlay appears inside the agent stream with:
  - Search input.
  - Previous and next match buttons.
  - Live match count.
  - A `Search thinking` checkbox.
  - Close button.
- The find controls render as a full-width top toolbar above the stream content when open and do not render a floating open button when closed.
- `Enter` in the find input navigates to the next match.
- `Shift+Enter` navigates to the previous match.
- `Esc` closes find and clears highlights.
- By default, search covers:
  - User inputs.
  - Final assistant messages.
- With `Search thinking` enabled, search also covers items grouped by collapse-thinking:
  - Intermediate assistant messages.
  - Thoughts.
  - Tool-call display text and serialized details.
  - Todo text.
- Match navigation scrolls to the matched stream item.
- If the active match is inside a collapsed thinking group, that group is expanded before scrolling.

## Implementation Details

### Search Policy

`packages/app/src/agent-stream/find-in-thread.ts` contains the pure search policy:

- Builds ordered search records from loaded `StreamItem`s.
- Uses `buildCollapseThinkingGroups` output to distinguish final assistant messages from grouped
  thinking items.
- Performs case-insensitive, literal substring matching.
- Extracts visible text from assistant markdown before indexing final assistant messages, so search matches rendered text and inline code instead of markdown syntax.
- Produces non-overlapping matches ordered by stream item and text offset.
- Builds per-item highlight maps keyed by item id and part id.

### Progressive Runner

`packages/app/src/agent-stream/find-runner-core.ts` implements cancellable progressive search:

- Slices work across frames with a small frame budget.
- Emits partial batches while scanning so highlights and counts can appear incrementally.
- Cancels stale jobs when query, scope, or loaded stream items change.
- Keeps old generations from emitting into new searches.

`packages/app/src/agent-stream/find-runner.web.ts` uses a Web Worker for larger corpora and falls
back to the frame-sliced runner when worker startup is unnecessary or unavailable.

`packages/app/src/agent-stream/find-worker.ts` runs the same progressive runner inside the worker.

Native uses the frame-sliced JavaScript runner without adding a native threading dependency.

### Stream UI Integration

`packages/app/src/agent-stream/view.tsx` owns the find UI and runtime state:

- Builds search records from loaded tail plus live head stream items.
- Restarts scanning when loaded history changes.
- Tracks active match, progressive count, and scanning state.
- Opens/closes/navigates through keyboard actions.
- Mounts the open find toolbar before the stream content so it participates in top-of-pane layout instead of floating over messages.
- Returns `null` for the closed find controls state; find is opened through keyboard actions instead of an always-visible stream button.
- Expands collapse-thinking groups before navigating to a match inside them.
- Passes highlight ranges into visible row renderers.

`packages/app/src/agent-stream/strategy.ts`, `strategy-web.tsx`, and `strategy-native.tsx` expose
`scrollToStreamItemTop(itemId)` through the stream viewport handle so find navigation can jump to
matches across mounted, virtualized, and native list rows.

`packages/app/src/components/find-highlighted-text.tsx` provides a reusable plain text highlighter. Highlights use a translucent accent background so search hits read as search matches instead of neutral surface blocks.

`packages/app/src/components/message.tsx` applies highlights to:

- User message text.
- Assistant markdown leaf text and inline code text.
- Speak message text.
- Todo rows.
- Visible tool-call title and summary text.

### Keyboard Routing

The keyboard system now includes find actions:

- `agent.find.open`
- `agent.find.next`
- `agent.find.previous`
- `agent.find.close`

`packages/app/src/keyboard/focus-scope.ts` recognizes the find overlay as `find-in-thread`, so
Enter and Esc route to find while the find input is focused instead of conflicting with composer or
agent-interrupt shortcuts.

### Localization

Find UI labels and shortcut help text were added to all app resource files:

- `en`
- `ar`
- `es`
- `fr`
- `ru`
- `zh-CN`

## Dependency: Collapse Thinking

This feature intentionally depends on collapse-thinking from `split/collapse-thinking`.

The dependency matters because find needs a stable definition of "thinking" that matches the UI.
Rather than inventing a separate search-specific policy, `Search thinking` uses the same grouped
item set as collapse-thinking:

- Final assistant messages remain searchable by default.
- Assistant/thought/tool/todo items grouped into thinking are excluded by default.
- Enabling `Search thinking` adds those grouped items back into the searchable corpus.

This keeps search behavior aligned with the chat UI and prevents a separate, divergent definition
of thinking content.

## Tests

Added or updated tests cover:

- Default search scope.
- Thinking scope derived from collapse-thinking groups.
- Match ordering and non-overlap.
- Highlight map generation.
- Progressive runner batching, yielding, and cancellation.
- Keyboard shortcut resolution and routing for find actions.
- Locale key parity.
