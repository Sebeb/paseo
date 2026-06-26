# Patch Summary: Pinned User Input Overlay

Branch: `feat/pin-user-inputs`

Base: `origin/main`

Anchor commit: ba85bd0382a6cb7db42b6656419aec614562a232 — feat(app): gate pinned prompts around tall composer

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
- Pinning is automatically suppressed while the composer occupies more than one quarter of the chat pane height, so a tall input box never competes with the pinned prompt for screen real estate.
- When the next user message reaches the pinned area, the current pinned prompt is translated upward instead of overlapping the next prompt.

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
- `translateY`: vertical offset applied to the overlay when the next user message pushes into the pinned region.

The source coordinates let renderers calculate overlay placement and animation relative to the real message.

#### `isVisible(...)`

Private helper used by the selector. It returns true when a geometry intersects the viewport:

- visible if `bottom > viewportTop`
- visible if `top < viewportBottom`

This handles partially visible items at either edge.

#### `isCandidateResponseZoneRelevant(...)`

Private helper that decides whether a candidate still owns visible context.

Implementation details:

- Returns true when any response item for the candidate intersects the viewport.
- Also returns true when the next candidate's original user message is visible, so the current pinned prompt can slide away as the next prompt enters the pinned area.
- Returns false once neither the response zone nor the next prompt is relevant.

This keeps the overlay active long enough to hand off cleanly between adjacent prompt turns.

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
3. Compute `pinnedThresholdInContent = viewportTop + pinnedBottom`.
4. Select the latest user-message candidate whose real bottom is above that pinned threshold.
5. Return `null` if no candidate has crossed the pinned threshold.
6. Return `null` if the selected candidate's response zone is no longer relevant.
7. Compute `translateY` from the next candidate's top edge when that next prompt enters the pinned region.
8. Return the selected user message, source coordinates, and `translateY`.

This prevents duplicated prompts while the original is near the overlay, keeps the pinned prompt tied to its response zone, and lets the next prompt physically push it out of the way.

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

### Composer-Size Gating

`packages/app/src/panels/agent-panel.tsx` owns the resolved `pinUserInputsEnabled` boolean and threads it into the stream:

- Tracks the latest composer height via the existing `onComposerHeightChange` callback.
- Adds an `onLayout` on the chat pane container to track its measured height.
- Stores both values in refs and recomputes a `composerFitsForPin` flag — true when the composer is at most one quarter of the pane height.
- Combines the user's `pinUserInputs` setting with `composerFitsForPin` and passes the resulting `pinUserInputsEnabled` prop to `AgentStreamView`.
- `AgentStreamView` is now the only consumer of that flag and forwards it directly to the strategy layer, which means a tall composer hides the overlay until the input shrinks back below the threshold.

## Rendering Changes

### `packages/app/src/agent-stream/view.tsx`

The stream view renders the pinned prompt overlay based on strategy state.

Implementation details:

- Receives the selected `PinnedUserInputState`.
- Renders a visual duplicate of the prompt with overlay-specific styling.
- Keeps the original stream items unchanged; the pinned version is an additional visual affordance.
- Clears the overlay when selection returns `null`.
- Applies `translateY` through a Reanimated shared value so scroll-time push-away updates stay off the React render path.
- Uses a compact overlay max height on compact form factors and a taller default on larger screens.
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
