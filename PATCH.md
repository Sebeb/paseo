# Patch Summary: Question Response Logs and Custom Answer Wrapping

Branch: `feat/user-question-custom-response-wrapping`

Base: `origin/main`

Anchor commit: cc4d9cb383064c62a9e22277e3fe9938bd899d36 - feat(app): log custom question responses

## Scope

This branch changes the app-side question form and tool-call detail UI. It does not change the WebSocket protocol, server schemas, daemon behavior, or persistence. The functional patch is the nine-file diff from merge base `08a0d0c28d1b977758ebcebe8ee0c93be791f663` to the anchor commit.

Changed files:

- `packages/app/src/components/question-form-card-core.ts`
- `packages/app/src/components/question-form-card-core.test.ts`
- `packages/app/src/components/question-form-card.tsx`
- `packages/app/src/components/question-answer-log.tsx`
- `packages/app/src/components/tool-call-details.tsx`
- `packages/app/src/components/tool-call-sheet.tsx`
- `packages/app/src/components/message.tsx`
- `packages/app/src/composer/input/input.tsx`
- `packages/app/src/composer/input/sizing.ts`

## Question Form Answer Log Model

Purpose: submitted custom question responses should remain visible after the user answers an agent question. The branch adds a pure model builder that reconstructs a stable read-only log from the question metadata and answer payload carried by the tool call.

Files:

- `packages/app/src/components/question-form-card-core.ts`
- `packages/app/src/components/question-form-card-core.test.ts`

Public surface:

- `QuestionFormQuestion` gains `id?: string`.
- New exported interfaces:
  - `QuestionAnswerLogAnswer { key: string; text: string; description?: string; isEmpty: boolean }`
  - `QuestionAnswerLogQuestion { key: string; question: string; answers: QuestionAnswerLogAnswer[] }`
  - `QuestionAnswerLogModel { questions: QuestionAnswerLogQuestion[] }`
- New exported function:

```ts
export function buildQuestionAnswerLogModel({
  metadata,
  input,
  output,
}: {
  metadata?: Record<string, unknown>;
  input?: unknown;
  output?: unknown;
}): QuestionAnswerLogModel | null;
```

Behavior:

- `parseQuestionFormQuestions()` now preserves an optional string `id` from each raw question object. Existing parsing rules remain unchanged: the input must contain a non-empty `questions` array; every item must be an object with string `question`, string `header`, and an array of option objects with string `label`; option `description`, `placeholder`, and `dismissLabel` are optional strings; `multiSelect`, `allowOther`, `isOther`, and `allowEmpty` are true only when their raw value is exactly `true`.
- `buildQuestionAnswerLogModel()` looks for questions in this order:
  - `metadata.questionForm.questions`
  - `metadata.questions`
  - `input.questions`
  - `output.questions`
- It looks for submitted answers in this order:
  - `metadata.questionForm.answers`
  - a bare object at `metadata.questionForm.answers`
  - a bare object at `metadata.answers`
  - `output.answers`
  - `input.answers`
  - a bare object in `output`
- If either questions or answers are missing or invalid, it returns `null` so the existing generic tool detail renderer can be used.
- For each parsed question, the rendered question key is `question.id ?? question.header`.
- An answer value is resolved by probing the answers object by `header`, then by `question`, then by `id`. The first present key wins.
- Single-select and free-text string answers are trimmed and rendered as one answer row when non-empty.
- Multi-select string answers are comma-split, trimmed, and empty entries are dropped. Array answers keep only string entries, trim each one, and drop empty entries.
- If the answer value is an object containing an `answers` property, `readAnswerValues()` recursively reads that nested `answers` value. This supports wrapped response payloads without special-casing a provider.
- If no non-empty answer values remain, the model emits one muted empty answer row: `{ key: `${header}:empty`, text: "No response", isEmpty: true }`.
- For non-empty answer rows, the key is `${header}:${value}`, `text` is the selected/custom value, and `isEmpty` is `false`.
- When an answer text exactly matches an option label, the option description is copied onto the log answer so submitted option rows can preserve the original explanatory text.

Tests:

- `question-form-card-core.test.ts` imports `buildQuestionAnswerLogModel`.
- Added coverage verifies option descriptions plus custom answers, multi-select arrays as one row per option, answer lookup by header/question/id, reconstruction from unknown tool detail input/output, empty answers rendering as `"No response"`, and `null` when only questions or only answers are present.

## Question Answer Log UI

Purpose: present submitted question answers as a readable detail section instead of raw JSON once a question-form tool call has enough metadata to reconstruct the form.

Files:

- `packages/app/src/components/question-answer-log.tsx`
- `packages/app/src/components/tool-call-details.tsx`
- `packages/app/src/components/tool-call-sheet.tsx`
- `packages/app/src/components/message.tsx`

Public surface:

- New component:

```tsx
export function QuestionAnswerLog({ model }: { model: QuestionAnswerLogModel }): JSX.Element;
```

- `ToolCallDetailsContentProps` gains `metadata?: Record<string, unknown>`.
- `ToolCallSheetData` gains `metadata?: Record<string, unknown>`.

Behavior:

- `QuestionAnswerLog` renders a root `View` with `testID="question-answer-log"`.
- It maps `model.questions` to sections keyed by `question.key`.
- Each section renders the original question text in a muted, selectable header on `surface2`.
- Non-first sections add a top border using the theme border color.
- Each answer row renders selectable answer text. Empty rows use muted text through `answer.isEmpty`.
- Answer descriptions render as secondary selectable text when present.
- The component uses existing theme tokens for `surface1`, `surface2`, foreground colors, spacing, border width, and font sizes. It has no data fetching or side effects.

Tool-call detail integration:

- `ToolCallDetailsContentInner` calls `buildQuestionAnswerLogModel({ metadata, input, output })`.
- It passes `detail.input` and `detail.output` only when `detail?.type === "unknown"`. Other detail types rely on `metadata`.
- When the builder returns a model, normal detail sections are replaced with a single `<QuestionAnswerLog key="question-answer-log" model={model} />`.
- When the builder returns `null`, existing `buildDetailSections(detail, diffLines, ds, t)` behavior is unchanged.
- `errorText` is still appended after the question answer log or after the generic detail sections. Loading skeleton and empty-state behavior remain unchanged.

Metadata plumbing:

- `ToolCall` in `message.tsx` already receives `metadata?: Record<string, unknown>`. This branch forwards it into:
  - the mobile bottom-sheet payload passed to `openToolCall()`
  - the desktop inline `<ToolCallDetailsContent />`
- The `useCallback`/`useMemo` dependency lists include `metadata` so a metadata change refreshes inline details and sheet payloads.
- `ToolCallSheetData` stores the metadata and `ToolCallSheetContent` forwards it to `ToolCallDetailsContent`.

Conflict-resolution note:

- Preserve metadata forwarding in both detail surfaces. If future work changes the tool-call sheet or inline details API, the important invariant is that `ToolCallDetailsContent` receives the same `metadata` object that the `ToolCall` received from the timeline item.

## Multiline Custom Question Responses

Purpose: custom/free-text question answers should wrap and grow like the composer input instead of behaving like a single-line field. This matters for long user responses to agent questions.

Files:

- `packages/app/src/components/question-form-card.tsx`
- `packages/app/src/composer/input/input.tsx`
- `packages/app/src/composer/input/sizing.ts`

Public surface:

- New shared helper:

```ts
export function resolveMaxInputHeight(windowHeight: number): number;
```

Behavior:

- `resolveMaxInputHeight()` moved from `packages/app/src/composer/input/input.tsx` into `packages/app/src/composer/input/sizing.ts`.
- The helper keeps the existing constants and behavior:
  - default maximum height: `160`
  - viewport ratio: `0.5`
  - non-finite or non-positive window heights return `160`
  - otherwise return `Math.max(160, Math.floor(windowHeight * 0.5))`
- `MessageInput` imports `resolveMaxInputHeight` from `./sizing`; its text-area height behavior is otherwise unchanged.

Question form behavior:

- `QuestionOtherInput` now uses multiline `TextInput` with `textAlignVertical="top"`.
- The minimum custom-answer input height is `46`.
- It reads `windowHeight` with `useWindowDimensions()` and caps growth using `resolveMaxInputHeight(windowHeight)`, matching the composer input's max-height policy.
- `setBoundedInputHeight(nextHeight)` clamps to `[46, maxInputHeight]`, ignores sub-pixel changes smaller than `1`, stores the last bounded height in a ref, and updates React state only when the bounded value changes.
- On web, `computeOtherInputHeightStyle()` sets `height`, `minHeight`, and `maxHeight`; scroll is enabled only once `inputHeight >= maxInputHeight`.
- On native, the style sets only `minHeight` and `maxHeight`; `onContentSizeChange` drives the bounded height and scroll remains enabled.
- The web path gets the underlying DOM textarea by checking `TextInput.getNativeRef()` when available, falling back to the `TextInput` ref, and accepting it only when it is an `HTMLElement`.
- `useComposerHeightMirror()` is reused for web measurement with the custom-answer value, DOM textarea ref, min height `46`, max height from `resolveMaxInputHeight()`, and `setBoundedInputHeight` as the height callback.
- A `useLayoutEffect` populates the web textarea ref only on web. A regular effect reclamps the stored height when `maxInputHeight` changes.
- Existing answer submission semantics remain the same: typing custom text still clears selected options for that question, `blurOnSubmit={false}` remains, and `onSubmitEditing` still routes through the question card's primary action.

Conflict-resolution note:

- Keep the composer max-height helper shared rather than duplicating the constants in `question-form-card.tsx`. If the composer sizing policy changes later, both composer input and question custom answer input should continue to agree.
