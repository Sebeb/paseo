# Patch Summary: Rewind Restores Image Attachments to the Composer

Branch: `feat/rewind-image-attachment`

Base: `merging`

Anchor commit: 59e31b52bc699dc105c6140d2e385d63b33f8ace — feat(rewind): restore image attachments to composer on rewind

## Rewind composer restore: images

### Purpose

Before this branch, rewinding an agent conversation to a user message restored only the message _text_ into the composer (when the composer was empty). If the rewound user message carried image attachments, those were lost — the user had to re-attach them manually before resending. This branch extends the rewind composer-restore path so image attachments are restored alongside the text, and generalizes the "don't clobber a draft" rule to consider attachments part of the draft.

This is a client-only change in `packages/app`; no protocol, server, or persistence changes.

### Files

- `packages/app/src/components/rewind/composer-restore.tsx` — core restore logic and provider
- `packages/app/src/components/rewind/use-rewind-agent-mutation.ts` — rewind mutation threads attachments through
- `packages/app/src/components/message.tsx` — `UserMessage` passes its images into the rewind call
- `packages/app/src/panels/agent-panel.tsx` — provider wired to the composer draft's attachment state
- `packages/app/src/components/rewind/composer-restore.test.ts` — unit tests for the new helpers

### Public surface

New/changed exports in `packages/app/src/components/rewind/composer-restore.tsx`:

```ts
interface RewindComposerInput {
  text: string;
  attachments: UserComposerAttachment[];
}

// NEW — pure helper. Returns currentInput unchanged (same reference) if the
// composer already has a draft (non-empty text OR ≥1 attachment); otherwise
// returns rewoundInput.
export function restoreComposerInputIfEmpty(input: {
  currentInput: RewindComposerInput;
  rewoundInput: RewindComposerInput;
}): RewindComposerInput;

// NEW — maps user-message image metadata to composer attachments:
// images.map((metadata) => ({ kind: "image", metadata }))
export function buildRewindComposerImageAttachments(
  images: readonly AttachmentMetadata[],
): UserComposerAttachment[];

// UNCHANGED signature (text-only helper, still exported and tested):
export function restoreComposerTextIfEmpty(input: {
  currentText: string;
  rewoundText: string;
}): string;
```

Context value gains a second method (the old one is kept):

```ts
interface RewindComposerRestoreContextValue {
  restoreTextIfComposerEmpty: (text: string) => void;
  restoreInputIfComposerEmpty: (input: RewindComposerInput) => void; // NEW
}
```

Provider props gain attachment state:

```ts
interface RewindComposerRestoreProviderProps {
  text: string;
  setText: (text: string) => void;
  attachments: UserComposerAttachment[]; // NEW
  setAttachments: (attachments: UserComposerAttachment[]) => void; // NEW
  children: ReactNode;
}
```

Rewind mutation input in `use-rewind-agent-mutation.ts` gains a required field:

```ts
interface RewindAgentInput {
  mode: RewindMode;
  rewoundText: string;
  rewoundAttachments: UserComposerAttachment[]; // NEW
}
```

Types come from `@/attachments/types`: `AttachmentMetadata` (id, mimeType, storageType, storageKey, createdAt, …) and `UserComposerAttachment` (a tagged union whose image branch is `{ kind: "image"; metadata: AttachmentMetadata }`). Note `UserMessageImageAttachment` in `@/types/stream` is an alias of `AttachmentMetadata`, which is why message images feed `buildRewindComposerImageAttachments` directly.

### Behavior

**`RewindComposerRestoreProvider`** (`composer-restore.tsx`) mirrors the existing `textRef` pattern for attachments: an `attachmentsRef` is kept current via a `useEffect` on the `attachments` prop, so the restore callback reads the latest composer state without re-creating on every keystroke.

`restoreInputIfComposerEmpty` (the context callback) snapshots `{ text: textRef.current, attachments: attachmentsRef.current }` as `currentInput`, runs the pure `restoreComposerInputIfEmpty` helper, and:

- If the helper returned `currentInput` by reference (composer had a draft), it does nothing.
- Otherwise it calls both `setText(nextInput.text)` and `setAttachments(nextInput.attachments)`.

The draft-presence check is: `currentInput.text.length > 0 || currentInput.attachments.length > 0`. This means an _attachment-only_ draft (empty text but images attached) now blocks restoration entirely — neither text nor attachments are overwritten. Previously only non-empty text blocked restore.

`restoreTextIfComposerEmpty` (context method) is retained for compatibility but reimplemented as a thin wrapper: `restoreInputIfComposerEmpty({ text: rewoundText, attachments: [] })`. The context value is memoized over both callbacks.

**`useRewindAgentMutation`** (`use-rewind-agent-mutation.ts`): on mutation success, when `shouldRestoreComposerForRewindMode(variables.mode)` is true (conversation-mutating modes only — unchanged logic from `rewind-mode.ts`), it now calls `composerRestore?.restoreInputIfComposerEmpty({ text: variables.rewoundText, attachments: variables.rewoundAttachments })` instead of the text-only method.

**`UserMessage`** (`message.tsx`): the `handleRewind` callback now builds the attachments from the message's own `images` prop (default `EMPTY_USER_MESSAGE_IMAGES`) and spreads them into the mutation input:

```ts
const handleRewind = useCallback(
  (input: { mode: RewindMode; rewoundText: string }) => {
    return rewindMutation.rewindAgent({
      ...input,
      rewoundAttachments: buildRewindComposerImageAttachments(images),
    });
  },
  [images, rewindMutation],
);
```

`images` was added to the dependency array. The branch flow (`handleBranch`) is untouched — branching does not restore the composer.

**`agent-panel.tsx`**: `ChatAgentReadyContent` passes the existing composer draft's attachment state into the provider — `attachments={agentInputDraft.attachments}` and `setAttachments={agentInputDraft.setAttachments}` — alongside the previously wired `text`/`setText`. `agentInputDraft` already carried these fields; they just weren't given to the provider before.

### Cross-cutting effects

Tests (`composer-restore.test.ts`) gained a `restoreComposerInputIfEmpty` describe block with two cases, using an `imageMetadata(id)` factory (`mimeType: "image/png"`, `storageType: "web-indexeddb"`, `storageKey: "attachments/<id>"`, `createdAt: 1`):

1. Empty composer (`{ text: "", attachments: [] }`) → returns the rewound text and image attachments (attachments built via `buildRewindComposerImageAttachments`, asserted equal to `[{ kind: "image", metadata }]`).
2. Attachment-only draft (`{ text: "", attachments: [currentAttachment] }`) → returns the current draft unchanged; the rewound text and attachment are discarded.

Existing `restoreComposerTextIfEmpty` and `shouldRestoreComposerForRewindMode` tests are unchanged. No store keys, persistence, localization, settings, or docs changes.
