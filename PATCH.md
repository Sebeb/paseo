# Patch Summary: Composer Schedule Send

Branch: `feat/message-schedule-popup`

Base: `origin/main`

Anchor commit: cbfeb1e27231aa610d33f11f6cca53714c49a71c — feat(app): schedule draft composer messages

## Composer Schedule Send UI

**Purpose** - Adds a schedule-send control to the existing agent composer so a user can schedule the current composer message, including attachments, instead of sending it immediately. The feature is gated by the daemon capability flag `server_info.features.scheduledComposerMessages` and only appears when the composer has sendable content, the host client exists, and the daemon is connected.

**Files**

- `packages/app/src/composer/index.tsx`
- `packages/app/src/composer/draft/workspace-tab.tsx`
- `packages/app/src/composer/input/input.tsx`
- `packages/app/src/composer/schedule-send.ts`
- `packages/app/src/composer/schedule-send.test.ts`
- `packages/client/src/daemon-client.ts`

**Public surface**

- `MessageInputProps.afterSendContent?: React.ReactNode` in `packages/app/src/composer/input/input.tsx` renders extra content immediately after the primary send button.
- `ScheduleSendMode` in `packages/app/src/composer/schedule-send.ts` is a discriminated union:
  - `{ type: "at"; date: Date }`
  - `{ type: "in-hours"; hours: number }`
  - `{ type: "credit-refresh"; providerId: string | null }`
- `ScheduleSendTarget` aliases `CreateScheduleOptions["target"]`, so the composer can schedule either into an existing agent (`self`/`agent`) or a `new-agent` target.
- `ScheduleCreditRefreshResolution` is `{ runAt: Date | null; disabledReason: string | null }`.
- `resolveCreditRefreshTime(view, activeProviderId, now = new Date())` returns the latest future reset for an exhausted usage window belonging to the active provider, or a disabled reason when usage is unavailable.
- `dateToOneShotCron(date)` returns `{ expression: string; timezone: string }`, using a five-field cron expression of `minute hour day-of-month month day-of-week` and the local `Intl.DateTimeFormat().resolvedOptions().timeZone` fallbacking to `UTC`.
- `createScheduledComposerMessage(input)` accepts `{ client, target, text, attachments, mode, providerUsageView, encodeImages }` and creates the daemon schedule.
- `ComposerProps.scheduleSendTarget?: ScheduleSendTarget | null` lets non-agent composer surfaces provide an explicit schedule destination. When omitted, existing agent composers default to `{ type: "self", agentId }`.
- `CreateScheduleOptions.target.new-agent.config.featureValues?: AgentSessionConfig["featureValues"]` allows scheduled draft-agent creation to preserve selected feature toggles.

**Behavior**

- `Composer` reads `serverInfo.features.scheduledComposerMessages` from `useSessionStore`; a `COMPAT(scheduledComposerMessages)` comment marks the v0.1.105 gate for removal after 2027-01-06.
- `Composer` resolves a schedule target by preferring an explicit `scheduleSendTarget` prop, defaulting to `{ type: "self", agentId }` when an existing agent is loaded, and otherwise disabling schedule send.
- When the gate passes, the composer has trimmed text or selected attachments, the daemon client exists, the daemon is connected, and a schedule target is available, `Composer` renders `ScheduleSendControl` through `MessageInput.afterSendContent`, visually attaching the small chevron trigger to the submit area.
- `WorkspaceDraftAgentTab` builds a `new-agent` schedule target for draft-agent composers when both a selected provider and working directory are available. The config is produced with `buildWorkspaceDraftAgentConfig` and preserves the draft provider, cwd, selected or auto-submit mode override, effective model, effective thinking option, and feature values before passing the target into `Composer`.
- `ScheduleSendControl` manages local open state, selected mode, hours text, date/time text, and an inline error string. It defaults to `"in-hours"` with `3` hours, and initializes the absolute date/time input one hour in the future.
- On compact form factors or native, the control opens an `AdaptiveModalSheet` with snap points `["55%", "85%"]` and test id `schedule-send-sheet`. On desktop web, it opens a `DropdownMenuContent` above and aligned to the end with width `320` and test id `schedule-send-menu`.
- The trigger has accessibility role `button`, label `Schedule send`, test id `schedule-send-trigger`, and uses the `ChevronDown` icon.
- The menu offers three rows:
  - `At a set time`, backed by a text input storing a local datetime string. Invalid dates disable scheduling for this mode and display `Invalid time`.
  - `In hours`, backed by a number-pad input. Non-digits are stripped, and the resolved hours value is at least `1`.
  - `On credit refresh`, enabled only when `resolveCreditRefreshTime` can compute a future reset for the active provider.
- Credit refresh scheduling reads provider usage via `useProviderUsage(serverId, { enabled: canShowScheduleSend })`. The active provider is the new-agent target provider for draft-agent scheduling and the current agent provider for existing-agent scheduling.
- `resolveCreditRefreshTime` returns disabled reasons for no active provider, loading usage, usage errors, missing provider entries, or a provider with no exhausted window that has a future reset. It treats a usage window as exhausted when `remainingPct === 0` or `usedPct === 100`, ignores missing/invalid/past `resetsAt` values, and chooses the latest future reset time among exhausted windows.
- Submitting a schedule validates the selected mode, sets `isSchedulingMessage`, clears any send error, and calls `createScheduledComposerMessage`. On success it clears the composer text, clears selected attachments, resets GitHub auto-attach suppression, deletes sent attachment blobs through the existing attachment cleanup path, and calls `clearDraft("sent")`. The schedule popup closes only after the promise resolves.
- Scheduling errors are caught by `ScheduleSendControl` and shown inline. Empty messages and attachmentless messages throw `Enter a message to schedule`; past resolved run times throw `Choose a future time`; unavailable credit refresh scheduling throws the disabled reason.
- `createScheduledComposerMessage` trims the text, prepares composer attachments with `splitComposerAttachmentsForSubmit`, encodes image metadata with the supplied `encodeImages`, and sends `client.scheduleCreate` with:
  - `name: "Scheduled message"`
  - `prompt: <trimmed text>`
  - `delivery: "agent-message"`
  - `images: <encoded images>`
  - `attachments: <non-image AgentAttachment[]>`
  - `cadence: { type: "cron", expression, timezone }`
  - `target: <input target>`
  - `maxRuns: 1`
  - `runOnCreate: false`
- `dateToOneShotCron` intentionally includes the target date's day-of-week as well as day-of-month/month, matching the server's existing cron shape for one-shot schedule creation.
- Tests cover choosing the latest future exhausted credit reset, creating a one-shot `agent-message` schedule with encoded images and uploaded-file attachments, scheduling a message that creates a new agent, and cron expression formatting.

## Scheduled Composer Message Editing

**Purpose** - Lets a user pull a pending scheduled composer message back into the composer as an editable draft, including stored images, uploaded files, and GitHub issue/PR attachments. Editing deletes the old schedule after the draft has been restored so there is only one source of truth for the message being edited.

**Files**

- `packages/app/src/composer/index.tsx`
- `packages/app/src/composer/scheduled-messages.ts`
- `packages/app/src/composer/scheduled-messages.test.ts`
- `packages/app/src/i18n/resources/ar.ts`
- `packages/app/src/i18n/resources/en.ts`
- `packages/app/src/i18n/resources/es.ts`
- `packages/app/src/i18n/resources/fr.ts`
- `packages/app/src/i18n/resources/ja.ts`
- `packages/app/src/i18n/resources/pt-BR.ts`
- `packages/app/src/i18n/resources/ru.ts`
- `packages/app/src/i18n/resources/zh-CN.ts`

**Public surface**

- `ScheduledComposerMessage` now carries `images: ImageAttachmentPayload[]` and `attachments: AgentAttachment[]` in addition to `id`, `text`, and `dueAt`.
- `selectScheduledComposerMessages({ schedules, serverId, agentId })` copies stored `images` and `attachments` from each matching schedule, defaulting both to empty arrays when omitted.
- `restoreScheduledComposerMessageDraft({ message, persistImage })` returns `{ text, attachments }`, where `attachments` is a `UserComposerAttachment[]` that can be passed directly to composer state.
- The i18n resources add `composer.attachments.editScheduledMessage` for the scheduled-message edit button's accessibility label.

**Behavior**

- `renderQueueTrack` passes `handleEditScheduledMessage` and the localized edit label to every `ScheduledMessageRow`.
- `ScheduledMessageRow` now has test id `composer-scheduled-message-row`, an accessibility label of `Scheduled message sends in <countdown>`, the existing two-line prompt preview, the countdown text, and a pencil `Pressable` that invokes `onEdit(item.id)`.
- `handleEditScheduledMessage` finds the selected scheduled message in the current `scheduledMessages` array. Missing ids are ignored. If the daemon client is unavailable, the composer shows `composer.errors.daemonClientDisconnected`.
- When editing starts, the composer sets `isSchedulingMessage`, clears any send error, restores the draft through `restoreScheduledComposerMessageDraft`, deletes the schedule with `client.scheduleDelete({ id })`, writes the restored text and attachments into composer state, resets GitHub auto-attach suppression, focuses the message input with the existing keyboard-action focus path, and refreshes schedules. Errors are logged and surfaced as the error message or `composer.errors.failedToSend`; the busy flag is cleared in `finally`.
- Stored schedule images are rehydrated by calling the supplied `persistImage` with `data:<mimeType>;base64,<data>`, the original MIME type, and deterministic file names of `scheduled-image-<n>.<extension>`. Known extensions are `png`, `gif`, `webp`, and `jpg`; unknown MIME types use `img`.
- Stored `uploaded_file` attachments restore as `{ kind: "file", attachment }`. Stored GitHub issues and PRs restore as picker-compatible search items with `kind`, `number`, `title`, `url`, empty `state`, `body ?? null`, empty `labels`, and optional PR base/head refs. Other attachment types are ignored for draft restore.
- Tests cover schedule selection preserving stored images and attachments, merging scheduled counts with queued counts, countdown formatting, and draft restoration for stored images, uploaded files, and GitHub attachments.

## Scheduled Message Sidebar Status

**Purpose** - Surfaces scheduled composer messages in the sidebar so users can see which workspaces have pending scheduled sends without opening each agent.

**Files**

- `packages/app/src/components/left-sidebar.tsx`
- `packages/app/src/components/sidebar-workspace-list.tsx`
- `packages/app/src/components/sidebar/sidebar-status-list.tsx`
- `packages/app/src/components/sidebar/sidebar-workspace-row-content.tsx`
- `packages/app/src/composer/index.tsx`
- `packages/app/src/composer/scheduled-messages.ts`
- `packages/app/src/composer/scheduled-messages.test.ts`

**Public surface**

- `ScheduledComposerMessageWorkspaceCount` is `{ workspaceKey: string; count: number }`.
- `buildAgentWorkspaceLookupKey(serverId, agentId)` returns the lookup key `${serverId}:${agentId}` used to connect schedules and queued messages back to workspace rows.
- `countScheduledComposerMessagesByWorkspace({ schedules, agentWorkspaceKeys })` returns `ScheduledComposerMessageWorkspaceCount[]` for active one-shot `agent-message` schedules whose agent target can be mapped to a workspace key.
- `mergeScheduledComposerMessageCountsByWorkspace({ queuedCounts, schedules, agentWorkspaceKeys })` returns a `ReadonlyMap<string, number>` that starts from existing queued-message counts and increments them by active scheduled composer messages for the same workspace.
- `formatScheduledCountdown(dueAt, now)` returns plain countdown labels in seconds, minutes, one-decimal hours, or days.
- `SidebarWorkspaceList` now receives `messageStatusCountsByWorkspaceKey: ReadonlyMap<string, number>`.
- `SidebarWorkspaceRowContent` receives `messageStatusCount` so row content can render the scheduled-message status affordance.

**Behavior**

- `Composer` refreshes schedule data after a scheduled message is created so sidebar state reflects the new pending send immediately.
- `left-sidebar.tsx` derives agent-to-workspace ownership from active session state and also counts queued composer messages by workspace. The selector uses `useStoreWithEqualityFn` plus explicit map equality so equivalent count/key maps do not force sidebar recomputation or churn.
- The sidebar count path merges queued-message counts and scheduled-message counts before passing the map into both project and status sidebar modes. Scheduled messages add to the same workspace status number as queued messages instead of replacing it.
- Scheduled-message counting only includes schedules with `delivery === "agent-message"`, `maxRuns === 1`, `status === "active"`, a non-empty `nextRunAt`, and an agent target whose `serverId:agentId` lookup exists in `agentWorkspaceKeys`.
- Workspace rows render the scheduled-message count alongside existing status metadata, and status grouping includes the scheduled-message signal when deciding row presentation.
- `scheduled-messages.test.ts` covers selecting only active one-shot agent-message schedules for the current host/agent, counting through agent workspace ownership, merging scheduled counts into queued counts, countdown formatting, and preserving media/attachments for scheduled-message editing.

## Schedule Protocol and Client Payloads

**Purpose** - Extends schedule creation and stored schedule data so a schedule can either send the legacy system notification or deliver the scheduled prompt as a normal agent message with images and attachments.

**Files**

- `packages/protocol/src/agent-attachments.ts`
- `packages/protocol/src/messages.ts`
- `packages/protocol/src/schedule/types.ts`
- `packages/protocol/src/schedule/rpc-schemas.ts`
- `packages/client/src/daemon-client.ts`
- `packages/server/src/server/websocket-server.ts`
- `packages/server/src/server/session/chat/chat-schedule-loop-session.ts`

**Public surface**

- New shared protocol module `packages/protocol/src/agent-attachments.ts` exports:
  - `GitHubPrAttachmentSchema`
  - `GitHubIssueAttachmentSchema`
  - `TextAttachmentSchema`
  - `ReviewAttachmentContextLineSchema`
  - `ReviewAttachmentCommentSchema`
  - `ReviewAttachmentSchema`
  - `UploadedFileAttachmentSchema`
  - `AgentAttachmentSchema`
  - `AgentAttachmentsSchema`
  - `ImageAttachmentSchema`
  - `type AgentAttachment`
  - `type ImageAttachmentPayload`
  - `normalizeAgentAttachments(input: unknown): AgentAttachment[]`
- `messages.ts` re-exports the attachment schemas that historically lived there, preserving existing imports while allowing schedule schemas and the client package to import them directly.
- `ScheduleDeliverySchema` is `z.enum(["schedule-notification", "agent-message"])`, with `type ScheduleDelivery`.
- `StoredScheduleSchema` now optionally includes:
  - `delivery?: ScheduleDelivery`
  - `images?: ImageAttachmentPayload[]`
  - `attachments?: AgentAttachment[]`
- `CreateScheduleInput` now accepts nullable/optional `delivery`, `images`, and `attachments`.
- `ScheduleCreateRequestSchema` now accepts optional `delivery`, `images`, and `attachments`.
- `CreateScheduleOptions` in `DaemonClient` mirrors those fields:
  - `delivery?: "schedule-notification" | "agent-message"`
  - `images?: ImageAttachmentPayload[]`
  - `attachments?: AgentAttachment[]`
- `server_info.features.scheduledComposerMessages?: boolean` is added to the protocol schema and emitted by the WebSocket server as `true`.

**Behavior**

- Attachment schemas are structurally unchanged from their previous message-level definitions, but are now reusable outside `messages.ts`.
- `AgentAttachmentsSchema` still accepts unknown input, returns `undefined` when omitted/non-array, and filters array items through `AgentAttachmentSchema.safeParse`, keeping only valid attachments.
- `TextAttachmentSchema` preserves only `contextKind: "chat_history"` and strips other `contextKind` values during transform.
- `ScheduleCreateRequestSchema` validates `images` through `ImageAttachmentSchema` and `attachments` through `AgentAttachmentSchema`.
- `DaemonClient.scheduleCreate` conditionally includes `delivery`, `images`, and `attachments` in the outbound `schedule/create` message when provided.
- `ChatScheduleLoopSession.handleScheduleCreateRequest` forwards `delivery`, `images`, and `attachments` into `ScheduleService.create`; it still maps target `{ type: "self", agentId }` to stored target `{ type: "agent", agentId }`.
- The feature flag is a single capability gate for the composer UI; the branch does not add fallback behavior for older daemons.

## Schedule Storage and Execution

**Purpose** - Teaches the server-side schedule service how to persist schedule delivery metadata, preserve intentionally delayed one-shot schedules across daemon restarts, and deliver scheduled composer messages into an existing agent as normal user-message content.

**Files**

- `packages/server/src/server/schedule/service.ts`
- `packages/server/src/server/schedule/service.test.ts`

**Public surface**

- `ScheduleService.create(input: CreateScheduleInput)` persists optional `delivery`, `images`, and `attachments` on stored schedules.
- `ScheduleService.createOrReplace(input: CreateScheduleInput)` replaces those same fields when refreshing an existing non-completed schedule with the same normalized name and target.
- `ScheduleExecutionResult` remains `{ agentId: string | null; output: string | null }`; delivery behavior is selected from the stored schedule.

**Behavior**

- Schedules without `delivery` continue to behave as legacy `"schedule-notification"` schedules.
- `resolveScheduleDelivery(schedule)` returns `schedule.delivery ?? "schedule-notification"`.
- For existing-agent schedules:
  - `"schedule-notification"` delivery wraps the schedule fire body with `formatSystemNotificationPrompt(buildScheduleFireBody(schedule, runId))`, preserving the previous system-notification behavior.
  - `"agent-message"` delivery calls `buildScheduledAgentMessagePrompt(schedule)` and sends the result directly through `agentManager.runAgent(agent.id, prompt)`.
- `buildScheduledAgentMessagePrompt` trims the stored prompt and returns a plain string when there are no images or attachments. When media or attachments exist, it builds `AgentPromptContentBlock[]` in order: optional trimmed text block, each image as `{ type: "image", data, mimeType }`, then each stored agent attachment.
- Existing-agent execution still checks that the target agent record exists, is not archived, can be loaded, and has no active run before calling `runAgent`.
- `ScheduleService.create` stores `runOnCreate` as before, but when `runOnCreate` is false it computes `nextRunAt` from the cadence instead of firing immediately. Composer-created schedules set `maxRuns: 1` and `runOnCreate: false`.
- Startup recovery now preserves stale, unfired one-shot schedules. During `recoverInterruptedRuns`, if an active schedule's `nextRunAt` is in the past and `maxRuns === 1` with zero completed runs, the service leaves the stale `nextRunAt` intact so the next `tick()` fires it once and then completes it. Other stale schedules continue advancing to the next future cadence time.
- `createOrReplace` writes `delivery: input.delivery ?? undefined`, `images: input.images ?? undefined`, and `attachments: input.attachments ?? undefined`, so omitted replacement fields clear previous values.
- Tests cover stale unfired one-shot recovery, max-run completion, existing schedule execution, schedule-created agent title behavior, normal user-turn rendering for scheduled new-agent prompts, archiving temporary new-agent sessions, unattended default mode resolution, `runOnCreate` behavior, and related schedule service invariants.

## Out-of-Credit Turn Failure Handling

**Purpose** - Treats provider turns that end with an assistant "out of credit" response as failed turns, even when the provider adapter emits `turn_completed`. This keeps lifecycle state, foreground waiters, system error messages, and provider-runner promises aligned with the user-visible failure.

**Files**

- `packages/server/src/server/agent/agent-manager.ts`
- `packages/server/src/server/agent/agent-manager.test.ts`
- `packages/server/src/server/agent/out-of-credit.ts`
- `packages/server/src/server/agent/providers/provider-runner.ts`
- `packages/server/src/server/agent/providers/provider-runner.test.ts`

**Public surface**

- `isOutOfCreditMessage(text: string): boolean` normalizes whitespace, returns `false` for empty text, and matches common credit/quota/balance exhaustion phrasing plus provider error codes such as `resource_exhausted`, `insufficient_quota`, `insufficient_balance`, and `billing_hard_limit_reached`.
- `AgentManager.handleStreamEvent` now returns `HandleStreamEventResult` as `{ event: AgentStreamEvent; shouldNotifyWaiters: boolean }` so callers notify foreground waiters with the effective event after any conversion.

**Behavior**

- `AgentManager` keeps `lastLiveAssistantMessageByAgent`, clearing it on `turn_started` and updating it from live `timeline` events whose item is an assistant message. History replay does not update the live cache.
- When a `turn_completed` event is handled, `maybeConvertOutOfCreditCompletion` checks the cached live assistant text first, then falls back to the last assistant message in the timeline store. Matching text is converted to `{ type: "turn_failed", provider, error: <message>, code: "out_of_credit", turnId? }`.
- The converted event is used for stream-event dispatch, lifecycle/finalization decisions, outbound stream dispatch, tracing, and foreground waiter notification. This prevents the original completion from resolving a foreground run when the final assistant content is actually an out-of-credit failure.
- `runProviderTurn` continues reducing final assistant text from timeline events. On `turn_completed`, it rejects the completion promise with `new Error(finalText)` when `isOutOfCreditMessage(finalText)` matches; otherwise it resolves as before and preserves usage. Existing `turn_failed` and `turn_canceled` behavior is unchanged.
- Tests cover an agent manager run that emits an assistant out-of-credit message followed by `turn_completed`, expecting `runAgent` to reject, lifecycle `error`, `lastError` set to the assistant message, and a system error containing `code: out_of_credit`. Provider-runner tests cover rejecting a completed turn whose final assistant text says credits are exhausted.

## Schedule List Presentation

**Purpose** - Makes one-shot scheduled composer messages read naturally in the schedules list instead of exposing their generated cron expression.

**Files**

- `packages/app/src/utils/schedule-format.ts`
- `packages/app/src/components/schedules/schedule-row.tsx`

**Public surface**

- `formatScheduleCadence(schedule: ScheduleSummary): string` returns a display string for a whole schedule, rather than for cadence alone.

**Behavior**

- When `schedule.delivery === "agent-message"`, `schedule.maxRuns === 1`, and `schedule.nextRunAt` parses as a valid date, `formatScheduleCadence` returns `Once at <localized month/day hour:minute>`.
- All other schedules continue to display `formatCadence(schedule.cadence)`.
- `ScheduleRow` now calls `formatScheduleCadence(schedule)` in its metadata line, keeping the rest of the row metadata order unchanged: cadence, created time, last-run state, optional next-run text for active schedules, and optional server name prefix.
