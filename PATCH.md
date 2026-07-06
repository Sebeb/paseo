# Patch Summary: Conversation Branching Controls

Branch: `feat/conversation-branching`

Base: `origin/main`

Anchor commit: d75d31885f5f79dafdc14be58b3fc60dca823083 — fix(server): fork conversation branches on the source agent

## Conversation Branching Protocol

### Purpose

Adds a daemon/app contract for creating alternate continuations from a prior user message and for listing sibling branches that belong to the same branch group. The feature is gated independently from protocol parsing so old clients can still parse snapshots and server info while new clients can hide the UI until the daemon advertises support.

### Files

- `packages/protocol/src/agent-types.ts`
- `packages/protocol/src/messages.ts`
- `packages/protocol/src/agent-feature-schemas.test.ts`

### Public Surface

- `AgentCapabilityFlags.supportsBranchConversation?: boolean`
  - Optional provider capability, defaulted to `false` in Zod parsing.
  - Tagged with `COMPAT(agentBranching)` for future cleanup.
- `AgentBranchMembership`
  - `{ groupId: string; ordinal: number; messageId: string | null; createdAt: string }`
  - Records one agent's membership in a branch group. `messageId` is the branch-point message for the source branch and is `null` for a newly created branch until its first user message is sent.
- `AgentBranchingMetadata`
  - `{ memberships: AgentBranchMembership[]; pendingGroupId?: string | null }`
  - Stored on agent snapshots and persisted records. `pendingGroupId` marks a branch whose next user message should become the visible branch message for that group.
- `AgentBranchGroupMember`
  - `{ agentId: string; ordinal: number; messageId: string | null; createdAt: string; archivedAt?: string | null; title?: string | null }`
  - Returned to clients when listing sibling branches.
- `AgentBranchGroup`
  - `{ groupId: string; members: AgentBranchGroupMember[] }`
- `AgentSnapshotPayload.branching?: AgentBranchingMetadata`
- `ServerInfoStatusPayload.features.agentBranching?: boolean`
- `agent.branch.create.request`
  - `{ type: "agent.branch.create.request"; agentId: string; messageId: string; requestId: string }`
- `agent.branch.create.response`
  - `{ type: "agent.branch.create.response"; payload: { requestId: string; agentId: string; branchAgentId: string | null; group: AgentBranchGroup | null; ok: boolean; error: string | null } }`
- `agent.branch.groups.request`
  - `{ type: "agent.branch.groups.request"; agentId: string; requestId: string; groupId?: string }`
- `agent.branch.groups.response`
  - `{ type: "agent.branch.groups.response"; payload: { requestId: string; agentId: string; groups: AgentBranchGroup[]; error: string | null } }`

### Behavior

`AgentCapabilityFlagsSchema` accepts missing `supportsBranchConversation` and defaults it to `false`. `AgentBranchMembershipSchema` enforces positive integer ordinals and nullable message IDs. `AgentBranchingMetadataSchema` defaults missing memberships to an empty array and preserves an optional nullable `pendingGroupId`.

The branch create and group list RPCs use dotted namespace request/response names. They are added to the session inbound/outbound unions and exported message types. The branch create response always carries `ok` and nullable `error`; failed responses keep `branchAgentId` and `group` nullable so the client can parse partial failure states.

Schema tests cover capability defaults, snapshot parsing with branch metadata, branch create request/response parsing, and branch group request/response parsing.

## Server Branch Creation

### Purpose

Implements durable conversation branching for persisted Claude and Codex sessions. A user picks a prior user message; the daemon forks the conversation **on the live source agent** into a brand-new provider session, then creates the branch agent from that forked session. The fork happens on the source because only the source can resolve the branch-point message: Claude turn anchors and Codex user-message item ids are in-memory state that a fresh clone cannot reconstruct (Codex thread reads return id-less user items). The branch never shares a native session with the source, so archiving one cannot archive the other's provider session.

### Files

- `packages/server/src/server/session.ts`
- `packages/server/src/server/agent/agent-storage.ts`
- `packages/server/src/server/agent/agent-projections.ts`
- `packages/server/src/server/agent/agent-manager.ts`
- `packages/server/src/server/agent/agent-sdk-types.ts`
- `packages/server/src/server/agent/rewind/rewind.ts`
- `packages/server/src/server/agent/providers/claude/agent.ts`
- `packages/server/src/server/agent/providers/claude/rewind.test.ts`
- `packages/server/src/server/agent/providers/claude/rewind.ts`
- `packages/server/src/server/agent/providers/codex/rewind.test.ts`
- `packages/server/src/server/agent/providers/codex/rewind.ts`
- `packages/server/src/server/agent/providers/codex-app-server-agent.ts`
- `packages/server/src/server/websocket-server.ts`

### Public Surface

- Claude and Codex provider capability maps now set `supportsBranchConversation: true`.
- `AgentSession.forkConversation?(input: AgentConversationTargetInput): Promise<AgentPersistenceHandle | null>` — fork the conversation at a prior user message into a new provider session without mutating the source session. Returns `null` when the branch point has no preceding assistant message (the branch starts as a fresh conversation).
- `AgentConversationTargetInput` — `{ messageId: string; userTurnOrdinal?: number | null }`. The ordinal is the 1-based position of the target among the durable timeline's user messages; providers with unstable message ids (Codex) use it as a positional fallback.
- `AgentManager.forkConversation(agentId, messageId)` — resolves the user-turn ordinal from the durable timeline and invokes the provider fork.
- `AgentManager.rewind` now also resolves and passes `userTurnOrdinal` for conversation rewinds, so plain rewind works on Codex agents resumed after a daemon restart (whose live item ids died with the previous process).
- Claude exports `resolveClaudeConversationForkTarget(anchors, targetUserMessageId)` and `isLocalCommandUserEntry(entry)` for testability.
- Stored agent records accept and persist `branching?: AgentBranchingMetadata`.
- Stored-agent snapshots include `branching` when present and default stored-agent capabilities include `supportsBranchConversation: false`.
- Live-agent snapshots copy persisted `branching` onto the emitted `AgentSnapshotPayload`.
- Server info advertises `features.agentBranching: true`.

### Behavior

The session routes `agent.branch.create.request` to `handleAgentBranchCreateRequest` and `agent.branch.groups.request` to `handleAgentBranchGroupsRequest`.

`resolveAgentBranchSource(agentIdOrIdentifier)` resolves aliases through the normal agent identifier path, then rejects branching when:

- The agent cannot be resolved or is not live in `AgentManager`.
- The agent is `running` or `initializing`.
- `supportsBranchConversation` is not exactly `true`.
- The agent has no persistence handle.
- The stored record is missing or archived.

`handleAgentBranchCreateRequest` creates or extends a branch group:

- If the source record already has a membership for the selected `messageId`, that membership's `groupId` is reused and the new branch ordinal is one greater than the current maximum member ordinal.
- If no membership exists for the selected `messageId`, a new UUID group is created, the source branch is recorded as ordinal `1`, and the new branch starts at ordinal `2`.
- The conversation is forked on the source with `agentManager.forkConversation(sourceAgent.id, messageId)`, which returns a persistence handle for a brand-new provider session (Claude: SDK `forkSession` up to the previous turn's last assistant message; Codex: `thread/fork` + `thread/rollback`, leaving the source thread untouched).
- With a handle, the branch agent is created via `agentManager.resumeAgentFromPersistence(forkedHandle, sourceAgent.config, undefined, { labels, workspaceId })` and its timeline is hydrated from the forked provider history (`hydrateTimelineFromProvider` with `force` + `broadcast`). With a `null` handle (branch point has no preceding assistant response), the branch is created as a fresh agent with the source config.
- Because the fork runs before any agent is created, a fork failure produces no orphaned half-initialized branch agent.

Provider fork/rewind resolution details:

- **Claude** tracks rewind turn anchors (user message uuid → last assistant message id before the next user turn). Local command transcript records (`<command-name>`, `<command-message>`, `<local-command-stdout>`, `<local-command-caveat>`) are excluded from anchors and user-message id tracking in both JSONL history ingest and live transcript observation — they are not conversation turns and previously poisoned turn-boundary resolution (built-in commands like `/model` never get an assistant response). Fork-target resolution walks back past turns with no observed assistant response and falls back to a fresh session when none precedes the target. Claude ignores `userTurnOrdinal` (transcript uuids are stable; durable-timeline user rows include slash-command records so positions would not line up).
- **Codex** keys its user-turn index by app-server item id, which only exists inside the process that minted it; `thread/read` returns id-less user items. History loading now records a deterministic positional placeholder (`codex-history-user-turn-N`) for id-less user items so every user turn occupies an index slot, and `forkCodexConversation`/`revertCodexConversation` fall back to `userTurnOrdinal` when the message id cannot be resolved.
- The source record is updated only when it did not already have the selected branch-point membership.
- The new branch record gets a membership with `messageId: null`, `pendingGroupId` set to the group ID, and its title copied from the source record when available.
- Updated branch metadata is persisted through `AgentStorage.upsert` and immediately emitted through `agentUpdates.emitStoredRecord`.
- The success response includes the branch agent ID and the freshly listed group for the group ID.

`markPendingBranchMessage(agentId, messageId)` runs when a user message is accepted. If the target agent has `branching.pendingGroupId`, it finds memberships in that group with `messageId: null`, replaces them with the accepted message ID, clears `pendingGroupId`, persists the record, and emits the updated snapshot. If the send request has no message ID, the agent has no pending group, or no matching membership changed, it does nothing.

`listBranchGroupsForAgent(agentId, groupId?)` scans all stored agents. Without an explicit group ID, it first collects all group IDs present on the requested agent. With an explicit group ID, it includes that group even if the requested agent no longer has a local membership. It then scans all records again, gathers matching memberships into groups, includes `archivedAt` and `title` from each stored agent record, sorts each group's members by ordinal, and returns the groups.

Agent storage preserves existing `branching` across live-agent snapshot flushes, matching the existing archive preservation behavior. This prevents normal persistence writes from dropping branch metadata that lives only in stored records.

## Duplicate Chat

### Purpose

Duplicates an agent's full conversation into a new, independent agent — exposed as a "Duplicate chat" entry in the tab context menu. Uses the same fork-on-source machinery as branching but with no rollback and no branch-group linkage: the copy is a standalone sibling with the same config, labels, workspace, and title.

### Public Surface

- `agent.duplicate.request` — `{ type: "agent.duplicate.request"; agentId: string; requestId: string }`
- `agent.duplicate.response` — `{ payload: { requestId; agentId; duplicateAgentId: string | null; ok; error } }`
- `AgentSession.duplicateConversation?(): Promise<AgentPersistenceHandle | null>` — fork the full conversation into a new provider session (Claude: SDK `forkSession` up to the last observed assistant message; Codex: `thread/fork` with no rollback). Returns null when there is no conversation history yet.
- `AgentManager.duplicateConversation(agentId)`
- `DaemonClient.duplicateAgent(agentId, options?): Promise<AgentDuplicatePayload>` — 30s timeout, throws on `ok: false`.

### Behavior

`handleAgentDuplicateRequest` reuses `resolveAgentBranchSource` (live agent, not running, `supportsBranchConversation`, persisted, not archived), duplicates on the source, then creates the copy via `resumeAgentFromPersistence` (or `createAgent` for a null handle) and hydrates its timeline with `force` + `broadcast`. The source title is copied onto the duplicate record when present. No branching metadata is written — duplicates do not join a branch group.

The feature is gated in the app by the same `serverInfo.features.agentBranching` flag as branching (both capabilities ship in the same daemon version).

## Daemon Client API

### Purpose

Exposes typed client helpers for app code to create a branch and fetch branch groups without duplicating request/response wiring.

### Files

- `packages/client/src/daemon-client.ts`

### Public Surface

- `export type AgentBranchCreatePayload = AgentBranchCreateResponseMessage["payload"]`
- `export type AgentBranchGroupsPayload = AgentBranchGroupsResponseMessage["payload"]`
- `DaemonClient.createAgentBranch(agentId: string, messageId: string, options?: { requestId?: string }): Promise<AgentBranchCreatePayload>`
- `DaemonClient.duplicateAgent(agentId: string, options?: { requestId?: string }): Promise<AgentDuplicatePayload>`
- `DaemonClient.fetchAgentBranchGroups(agentId: string, options?: { requestId?: string; groupId?: string }): Promise<AgentBranchGroupsPayload>`

### Behavior

`createAgentBranch` sends `agent.branch.create.request` through `sendNamespacedCorrelatedSessionRequest`, uses a 30 second timeout, and throws `payload.error ?? "Agent branch failed"` when the daemon response has `ok: false`. Successful calls return the full payload so callers can use both the branch agent ID and updated group.

`fetchAgentBranchGroups` sends `agent.branch.groups.request`, includes `groupId` only when supplied, throws when the response has a non-null `error`, and otherwise returns the payload.

## App Branching UI

### Purpose

Adds controls to user-message rows for creating a branch from that message and for navigating between sibling branches in the same group. Also adds a "Duplicate chat" entry to agent tab context menus (desktop right-click and mobile tab switcher): shown only when the daemon advertises `features.agentBranching` and a handler is supplied, it calls `DaemonClient.duplicateAgent`, opens the duplicate agent in a focused tab, and fetches its timeline. The entry uses the `copy-plus` icon and is plumbed as an optional `onDuplicateChat` handler through `workspace-tab-menu.ts`, `workspace-desktop-tabs-row.tsx`, `split-container.tsx`, and `workspace-screen.tsx`.

### Files

- `packages/app/src/components/branching/branch-button.tsx`
- `packages/app/src/components/branching/branch-counter.tsx`
- `packages/app/src/components/branching/navigation-store.ts`
- `packages/app/src/components/branching/query-keys.ts`
- `packages/app/src/components/branching/use-agent-branch-mutation.ts`
- `packages/app/src/components/message.tsx`
- `packages/app/src/agent-stream/view.tsx`
- `packages/app/src/agent-stream/strategy.ts`
- `packages/app/src/agent-stream/strategy-web.tsx`
- `packages/app/src/agent-stream/strategy-native.tsx`
- `packages/app/src/hooks/use-agent-screen-state-machine.ts`
- `packages/app/src/panels/agent-panel.tsx`
- `packages/app/src/stores/session-store.ts`
- `packages/app/src/stores/workspace-layout-store.ts`
- `packages/app/src/utils/agent-snapshots.ts`

### Public Surface

- `BranchButton`
  - Props: `{ isPending?: boolean; rewoundText: string; onBranch(input: { rewoundText: string }): Promise<void> | void }`
  - Renders a `GitBranch` icon button with `testID="branch-button"` and a desktop tooltip labeled `branch.tooltip` with default text `"Branch from here"`.
- `MessageBranchInfo`
  - `{ groupId: string; current: AgentBranchGroupMember; members: AgentBranchGroupMember[] }`
- `BranchCounter`
  - Props: `{ branchInfo: MessageBranchInfo; onNavigate(member: AgentBranchGroupMember, viewportY: number | null): void }`
  - Renders previous/next controls and an ordinal counter with `testID="branch-counter"`.
- `agentBranchGroupsQueryKey(serverId, agentId)`
  - Returns `[serverId, "agent-branch-groups", agentId]`.
- `useBranchNavigationStore`
  - State: `pendingByKey: Record<string, BranchNavigationRequest>`.
  - `setPending(request)` stores a per-`serverId:agentId` navigation request with a generated `requestId`.
  - `consumePending(serverId, agentId, requestId)` removes only the matching pending request.
  - `branchNavigationKey(serverId, agentId)` exposes the shared key format.
- `useAgentBranchMutation`
  - Input: `{ serverId?: string; workspaceId?: string; agentId?: string; messageId?: string; client?: DaemonClient | null }`
  - Returns `{ branchAgent(input: { rewoundText: string }): Promise<void>; isPending: boolean }`.
- `StreamViewportHandle.scrollToMessage(messageId: string, viewportY?: number | null): boolean`
  - The optional `viewportY` is used by the web viewport to preserve a target screen Y. Native keeps its existing centered-row scroll behavior.
- App-side `Agent`, `AgentScreenAgent`, and chat panel state now carry `branching?: AgentBranchingMetadata`.

### Behavior

`AgentStreamView` reads `serverInfo.features.agentBranching` and `agent.capabilities.supportsBranchConversation`. It fetches branch groups only when a daemon client is connected, the daemon feature flag is true, and the agent snapshot has at least one branching membership. Fetched groups are cached by server and agent.

`branchInfoByMessageId` is derived from branch groups by finding the current agent's member in each group. Only groups with at least two members and a non-null current `messageId` are shown. The map key is the current branch's message ID, so the counter appears beside the user message that represents that branch.

A user message can branch only when all of these are true:

- The agent belongs to a workspace.
- The daemon advertises `features.agentBranching`.
- The agent status is neither `running` nor `initializing`.
- The provider capability has `supportsBranchConversation === true`.

`UserMessage` shows its trailing action row when the message has text and either branch info is present, the layout is compact, the platform is native, or the row is hovered. The row can contain, in order, the branch counter, timestamp, branch button, rewind menu, and copy button.

`BranchButton` ignores presses while pending, disables the pressable while pending, and passes the original user message text as `rewoundText`. It uses a tooltip on desktop and no mobile tooltip.

`useAgentBranchMutation` performs the full app workflow after the daemon creates a branch:

- Validates that the client, server ID, workspace ID, source agent ID, and message ID are all present.
- Calls `client.createAgentBranch`.
- Throws if the response lacks `branchAgentId`.
- Opens the branch agent tab focused in the current workspace.
- Opens the source agent tab in the background if needed.
- Attaches the source tab as a child of the branch tab in workspace layout metadata.
- Clears optimistic user messages from the branch agent stream head and tail in session state.
- Fetches the branch agent timeline with `{ direction: "tail", projection: "projected" }`.
- Invalidates branch group queries for both the source and branch agents.
- Restores the selected user message into the composer only if the composer is empty.
- Shows a toast error if the mutation fails.

`BranchCounter` hides the previous/next buttons until hover on web desktop, while keeping them visible on native and compact layouts. It renders nothing for single-member groups or when the current agent is not in the member list. Previous and next navigation use sibling ordinals from the sorted member list.

Branch navigation stores a pending request for the destination agent before navigating to that agent tab with `pin: true`. Once the destination `AgentStreamView` has authoritative history, it tries to scroll to the target message. If the target member's message ID is null or the message cannot be found, it scrolls to the bottom. The pending request is consumed after the attempt.

The web stream viewport marks rendered history and live rows with `data-stream-message-id`, implements DOM lookup by escaped message ID, scrolls so the target row aligns near `viewportY` or `containerTop + 96`, disables follow-output after manual branch navigation, and can fall back to virtualizer `scrollToIndex` for virtualized history. The native viewport implements the same handle signature but ignores `viewportY` and scrolls the matching FlatList row to `viewPosition: 0.65`.

Render profiling now treats `agent.branching` as a reason for agent stream re-rendering, ensuring branch counters update when snapshot metadata changes.

## Cross-Cutting Effects

### Persistence

Branch metadata is stored inside each persisted agent record rather than in a separate table or file. There is no migration; records without `branching` parse normally. Branch metadata is copied into snapshots when present and is preserved during agent storage flushes.

### Compatibility

Protocol additions are optional or nullable where needed. Missing `supportsBranchConversation` and missing `serverInfo.features.agentBranching` parse cleanly as unsupported. The app gates the UI at the daemon feature level and the provider capability level rather than trying to synthesize branching behavior against old daemons.

### Tests

`packages/protocol/src/agent-feature-schemas.test.ts` adds coverage for:

- Defaulting missing rewind and branch capabilities to `false`.
- Parsing branch metadata on agent snapshots.
- Parsing the branch create RPC request and response.
- Parsing the branch group RPC request and response.

`packages/server/src/server/agent/providers/claude/rewind.test.ts` adds coverage for resolving fork targets from Claude rewind anchors, including normal previous-assistant forks, interrupted turns with null assistant anchors, fresh-session fallbacks when no assistant message precedes the target, missing-target errors, and detection of local command transcript records stored as strings or text blocks.

`packages/server/src/server/agent/providers/codex/rewind.test.ts` adds coverage for ordinal fallback when Codex message IDs cannot be resolved after a resumed thread read, rejection of out-of-range ordinal fallbacks, and fork-without-source-mutation behavior for Codex branch creation.
