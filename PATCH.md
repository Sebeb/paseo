# Patch Summary: Pinned User Input Overlay

Branch: `split/pin-user-inputs`

Base: `origin/main`

Primary commit before this writeup: `db9c96b9d feat(app): add pinned user input overlay`

## Purpose

This branch adds an optional chat-stream overlay that keeps the relevant user prompt visible while the assistant response for that prompt is on screen. The feature is off by default and can be enabled from Appearance settings.

The implementation covers web and native stream strategies, persistent app settings, localized labels, message rendering changes, and focused tests for the geometry/selection logic.

## User-Facing Changes

- Adds a `pinUserInputs` app setting.
- Defaults `pinUserInputs` to `false`.
- Adds an Appearance setting that lets users enable or disable pinned user inputs.
- When enabled, the stream can render a pinned copy of the current user message while its response is visible and the original user message has scrolled offscreen.
- The pinned overlay tracks the source message location so it can animate and clear correctly as the original prompt returns to view or as the associated response leaves the viewport.
- The overlay uses theme-aware gradient/mask styling so the pinned prompt reads as part of the stream instead of a detached modal.

## New Core Module

### `packages/app/src/agent-stream/pinned-user-input.ts`

This file isolates the feature's selection model from React and platform rendering.

#### `PinnedUserInputGeometry`

Represents one stream item with measured or estimated vertical bounds:

- `item`: the `StreamItem`.
- `top`: top offset in stream coordinates.
- `bottom`: bottom offset in stream coordinates.

The stream strategies feed this shape from actual DOM/native measurements when available and estimated row heights when virtualization keeps older rows unmounted.

#### `PinnedUserInputCandidate`

Groups one user message with the response items that follow it until the next user message:

- `input`: the user-message geometry.
- `responseItems`: assistant/tool/thought/etc. geometries belonging to that prompt turn.

This grouping is what lets the selector answer "which prompt owns the response currently visible?" without hard-coding item kinds beyond user-message boundaries.

#### `PinnedUserInputState`

The renderable selected state:

- `item`: the selected user message.
- `sourceTop`: top coordinate of the real user message.
- `sourceBottom`: bottom coordinate of the real user message.

The source coordinates let renderers calculate overlay placement and animation relative to the real message.

#### `isVisible(...)`

Private helper used by the selector. It returns true when a geometry intersects the viewport:

- visible if `bottom > viewportTop`
- visible if `top < viewportBottom`

This handles partially visible items at either edge.

#### `getVisibleResponseDistanceFromViewportBottom(...)`

Private helper that scans a candidate's response items and returns the nearest visible response distance from the viewport bottom.

Implementation details:

- Ignores response items that do not intersect the viewport.
- For visible response items, clamps the visible bottom to `Math.min(responseItem.bottom, viewportBottom)`.
- Computes `viewportBottom - visibleBottom`.
- Keeps the smallest distance, which means the selected candidate is the response turn closest to the bottom of the current viewport.
- Returns `null` if none of the candidate's response items are visible.

This makes the pinned prompt follow the response that is most contextually relevant to the user's current reading position.

#### `collectEstimatedPinnedUserInputCandidates(...)`

Builds candidates from stream items using estimated heights.

Implementation details:

- Starts from `initialTop ?? 0`.
- Iterates the `items` in stream order.
- Calls `estimateHeight(item)` for each item.
- Creates a geometry with `top` and `bottom: top + height`.
- Advances `top` by the estimated height.
- Delegates the grouped geometry list to `collectPinnedUserInputCandidatesFromGeometries`.

This is used when exact measurements are unavailable, especially for virtualized history rows.

#### `collectPinnedUserInputCandidatesFromGeometries(...)`

Groups measured or estimated geometries into prompt-response turns.

Implementation details:

- Maintains `activeCandidate`.
- When it sees a `user_message`, it starts a new candidate and pushes it to the result list.
- For every non-user item, it appends the geometry to the active candidate's `responseItems`, if there is one.
- Non-user items before the first user message are ignored because they cannot be assigned to a prompt turn.

The function is deliberately item-kind agnostic after identifying the user prompt boundary.

#### `findEstimatedStreamItemTop(...)`

Finds an estimated top coordinate for a specific item id.

Implementation details:

- Starts from `initialTop ?? 0`.
- Iterates items in order.
- Returns the current accumulated `top` when `item.id === itemId`.
- Otherwise adds `estimateHeight(item)` and continues.
- Returns `null` if the item is not present.

Stream strategies use this to bridge between virtualized rows and overlay positioning when a source item is not mounted.

#### `selectPinnedUserInput(...)`

Selects the user prompt that should be pinned, or returns `null`.

Selection rules:

1. Return `null` when the feature is disabled.
2. Return `null` when the viewport is invalid (`viewportBottom <= viewportTop`).
3. Return `null` when any real user input candidate is visible. The overlay only appears when the original prompt has left the viewport.
4. For each candidate, compute the visible response distance from the viewport bottom.
5. Pick the candidate with the smallest non-null distance.
6. Return that candidate's user message plus source coordinates.
7. Return `null` when no candidate has a visible response.

This prevents duplicated prompts while the original is visible and chooses the prompt tied to the response nearest the reader's current scroll position.

## Stream Strategy Integration

### Web Strategy

`packages/app/src/agent-stream/strategy-web.tsx` now computes pinned-input state from DOM/virtualizer geometry.

Key behavior:

- Tracks stream item elements by id so mounted rows can provide real `offsetTop`/height data.
- Combines measured geometries for mounted items with estimated geometries for virtualized history.
- Calls `collectPinnedUserInputCandidatesFromGeometries` and `selectPinnedUserInput`.
- Uses scroll position and viewport height to determine `viewportTop` and `viewportBottom`.
- Updates the pinned state on scroll, layout, measurement changes, and stream updates.
- Provides source coordinates back to the shared stream view.

The web path also accounts for virtualized history by using estimated stream item tops when the source prompt is not mounted.

### Native Strategy

`packages/app/src/agent-stream/strategy-native.tsx` now participates in the same shared pinned-input contract.

Key behavior:

- Tracks item layout information as React Native reports it.
- Recomputes candidates from measured native item bounds.
- Uses the same pure selection rules from `pinned-user-input.ts`.
- Keeps behavior consistent with web while avoiding direct DOM assumptions.

### Shared Strategy Contract

`packages/app/src/agent-stream/strategy.ts` adds the pinned user input fields/events needed by both strategies and the stream view.

The strategy layer is responsible for determining whether a prompt should be pinned; the view layer is responsible for rendering the selected state.

## Rendering Changes

### `packages/app/src/agent-stream/view.tsx`

The stream view renders the pinned prompt overlay based on strategy state.

Implementation details:

- Receives the selected `PinnedUserInputState`.
- Renders a visual duplicate of the prompt with overlay-specific styling.
- Keeps the original stream items unchanged; the pinned version is an additional visual affordance.
- Clears the overlay when selection returns `null`.
- Integrates with existing stream layout so the overlay does not alter list item order.

### `packages/app/src/components/message.tsx`

Message rendering was adjusted to support the pinned prompt presentation without changing the normal message layout.

The changes allow the same user-message content to be rendered in a pinned context with styling appropriate for the overlay.

## Settings And Persistence

### `packages/app/src/hooks/use-settings/storage.ts`

Adds `pinUserInputs: boolean` to `AppSettings`.

Implementation details:

- Default value is `false`.
- Persisted values are accepted only when the stored value is a boolean.
- Invalid persisted values fall back to the default.
- `pickAppSettings` copies `pinUserInputs` only after type checking.

### `packages/app/src/hooks/use-settings/index.ts`

Adds `pinUserInputs` to the settings update path so `useSettings().updateSettings(...)` and `useAppSettings().updateSettings(...)` can persist the preference.

### `packages/app/src/hooks/use-settings/storage.test.ts`

Adds coverage for:

- Default disabled state.
- Loading a persisted `true` preference.
- Ignoring invalid non-boolean values.

## Appearance Settings

`packages/app/src/screens/settings/appearance/appearance-section.tsx` adds a control for pinned user inputs in the Appearance section.

The control reads `settings.pinUserInputs` and writes changes through the settings update API.

## Localization

The branch adds localized strings in:

- `packages/app/src/i18n/resources/ar.ts`
- `packages/app/src/i18n/resources/en.ts`
- `packages/app/src/i18n/resources/es.ts`
- `packages/app/src/i18n/resources/fr.ts`
- `packages/app/src/i18n/resources/ru.ts`
- `packages/app/src/i18n/resources/zh-CN.ts`

These strings cover the Appearance setting label/help text.

## Tests

### `packages/app/src/agent-stream/pinned-user-input.test.ts`

Adds focused unit tests for pure selection behavior:

- Disabled feature returns `null`.
- A prompt is selected when its response is visible and the original input is offscreen.
- Selection returns `null` when any real user prompt is visible.
- The visible response closest to the viewport bottom wins.
- No visible response returns `null`.
- Estimated candidates group assistant responses under the preceding user message.
- Estimated top lookup returns the accumulated stream offset for a target item.

### Web Strategy Tests

`packages/app/src/agent-stream/strategy-web.test.tsx` adds coverage around the web strategy integration, including scroll and measurement-driven pinned state.

## Verification

The branch commit was created with the repo pre-commit hook enabled.

The hook ran:

- `npm run lint` on changed files.
- `npm run format:check:files` on changed files.
- `npm run typecheck` across workspaces.

All passed for the implementation commit.
