# Patch Summary: Composer Schedule Send

Branch: `feat/message-schedule-popup`

Base: `origin/main`

Anchor commit: de1ec3c039a5ebbf58d6a4e48d5df889b79bd654 — feat(message-schedule): show scheduled message status in sidebar

## Composer Schedule Send UI

**Purpose** - Adds a schedule-send control to the existing agent composer so a user can schedule the current composer message, including attachments, instead of sending it immediately. The feature is gated by the daemon capability flag `server_info.features.scheduledComposerMessages` and only appears when the composer has sendable content, the host client exists, and the daemon is connected.

**Files**

- `packages/app/src/composer/index.tsx`
- `packages/app/src/composer/input/input.tsx`
- `packages/app/src/composer/schedule-send.ts`
- `packages/app/src/composer/schedule-send.test.ts`

**Public surface**

- `MessageInputProps.afterSendContent?: React.ReactNode` in `packages/app/src/composer/input/input.tsx` renders extra content immediately after the primary send button.
- `ScheduleSendMode` in `packages/app/src/composer/schedule-send.ts` is a discriminated union:
  - `{ type: "at"; date: Date }`
  - `{ type: "in-hours"; hours: number }`
  - `{ type: "credit-refresh"; providerId: string | null }`
- `ScheduleCreditRefreshResolution` is `{ runAt: Date | null; disabledReason: string | null }`.
- `resolveCreditRefreshTime(view, activeProviderId, now = new Date())` returns the latest future reset for an exhausted usage window belonging to the active provider, or a disabled reason when usage is unavailable.
- `dateToOneShotCron(date)` returns `{ expression: string; timezone: string }`, using a five-field cron expression of `minute hour day-of-month month day-of-week` and the local `Intl.DateTimeFormat().resolvedOptions().timeZone` fallbacking to `UTC`.
- `createScheduledComposerMessage(input)` accepts `{ client, agentId, text, attachments, mode, providerUsageView, encodeImages }` and creates the daemon schedule.

**Behavior**

- `Composer` reads `serverInfo.features.scheduledComposerMessages` from `useSessionStore`; a `COMPAT(scheduledComposerMessages)` comment marks the v0.1.105 gate for removal after 2027-01-06.
- When the gate passes and the composer has trimmed text or selected attachments, `Composer` renders `ScheduleSendControl` through `MessageInput.afterSendContent`, visually attaching the small chevron trigger to the submit area.
- `ScheduleSendControl` manages local open state, selected mode, hours text, date/time text, and an inline error string. It defaults to `"in-hours"` with `3` hours, and initializes the absolute date/time input one hour in the future.
- On compact form factors or native, the control opens an `AdaptiveModalSheet` with snap points `["55%", "85%"]` and test id `schedule-send-sheet`. On desktop web, it opens a `DropdownMenuContent` above and aligned to the end with width `320` and test id `schedule-send-menu`.
- The trigger has accessibility role `button`, label `Schedule send`, test id `schedule-send-trigger`, and uses the `ChevronDown` icon.
- The menu offers three rows:
  - `At a set time`, backed by a text input storing a local datetime string. Invalid dates disable scheduling for this mode and display `Invalid time`.
  - `In hours`, backed by a number-pad input. Non-digits are stripped, and the resolved hours value is at least `1`.
  - `On credit refresh`, enabled only when `resolveCreditRefreshTime` can compute a future reset for the active provider.
- Credit refresh scheduling reads provider usage via `useProviderUsage(serverId, { enabled: canShowScheduleSend })`. The active provider comes from the current agent state selector.
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
  - `target: { type: "self", agentId }`
  - `maxRuns: 1`
  - `runOnCreate: false`
- `dateToOneShotCron` intentionally includes the target date's day-of-week as well as day-of-month/month, matching the server's existing cron shape for one-shot schedule creation.
- Tests cover choosing the latest future exhausted credit reset, creating a one-shot `agent-message` schedule with encoded images and uploaded-file attachments, and cron expression formatting.

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

- `getScheduledMessageCountsByWorkspace({ schedules, agentWorkspaceKeyById })` returns a `ReadonlyMap<string, number>` keyed by workspace key.
- `SidebarWorkspaceList` now receives `messageStatusCountsByWorkspaceKey: ReadonlyMap<string, number>`.
- `SidebarWorkspaceRowContent` receives `messageStatusCount` so row content can render the scheduled-message status affordance.

**Behavior**

- `Composer` refreshes schedule data after a scheduled message is created so sidebar state reflects the new pending send immediately.
- `left-sidebar.tsx` derives agent-to-workspace ownership from active session state, counts active scheduled `agent-message` schedules per workspace, and passes the map into both project and status sidebar modes.
- Workspace rows render the scheduled-message count alongside existing status metadata, and status grouping includes the scheduled-message signal when deciding row presentation.
- `scheduled-messages.test.ts` covers counting only active agent-message schedules and ignoring notification-style or completed schedules.

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
