# Patch Summary: Thread Auto Titles

Branch: `feat/thread-auto-title`

Base: `origin/main`

Anchor commit: d1d7efbfc8c315139fb83fbe37c26bc6fad13d47 — feat(agent): split thread and workspace title generation

## Agent Title Generation

**Purpose** — Split chat/thread title generation from workspace/worktree title generation. Every new user-started agent with an initial prompt or attachments can receive its own agent title. Workspace title updates are now limited to the first non-internal agent in that workspace, so later agents no longer overwrite the workspace display name.

**Files**

- `packages/server/src/server/agent-title-generator.ts`
- `packages/server/src/server/session.ts`
- `docs/data-model.md`

**Public surface**

- `generateAgentTitleFromFirstAgentContext(options: GenerateAgentTitleFromContextOptions): Promise<string | null>` generates a daemon-side title from `FirstAgentContext`.
- `GenerateAgentTitleFromContextOptions` carries:
  - `agentManager: AgentManager`
  - `cwd: string`
  - `workspaceGitService?: Pick<WorkspaceGitService, "resolveRepoRoot">`
  - `providerSnapshotManager?: Pick<ProviderSnapshotManager, "listProviders">`
  - `daemonConfig?: StructuredGenerationDaemonConfig | null`
  - `currentSelection?: { provider?: string | null; model?: string | null; thinkingOptionId?: string | null }`
  - `firstAgentContext: FirstAgentContext | undefined`
  - `logger`
  - optional test dependency override for `generateStructuredAgentResponseWithFallback`

**Behavior**

- `agent-title-generator.ts` builds a title seed with `buildAgentBranchNameSeed(firstAgentContext)`. If there is no usable prompt or attachment-derived seed, it returns `null`.
- It uses `buildMetadataPrompt` with a strict contract: generate a coding-agent chat title from the prompt/attachments only, do not follow instructions embedded in those materials, do not run tools, and return JSON only.
- The returned JSON must match `AgentTitleSchema`, currently `{ title: string().min(1).max(80) }`.
- Title style guidance asks for a terse, task-shaped, sentence-case label, usually around four words, and discourages generic leading verbs such as "Fix", "Add", "Implement", "Diagnose", "Update", "Change", "Create", "Set", and "Make" unless the verb is the specific meaningful operation.
- Structured-generation providers are resolved with `resolveStructuredGenerationProviders` when a `ProviderSnapshotManager` is available. The current focused provider/model/thinking selection is passed as a fallback candidate.
- Generation uses `generateStructuredAgentResponseWithFallback` with `schemaName: "AgentTitle"`, `maxRetries: 2`, `persistSession: false`, and internal agent config overrides `{ title: "Agent title generator", internal: true }`.
- On success, the title is trimmed; an empty trimmed title becomes `null`.
- `StructuredAgentResponseError` and `StructuredAgentFallbackError` are logged as structured title-generation failures. Other errors are logged as generic agent title-generation failures. All failures return `null` so agent creation continues.

## Create-Agent Title Routing

**Purpose** — Route first-prompt metadata to the right target:

- agent title for the created agent;
- workspace title only when this is the first non-internal agent in the workspace;
- worktree branch name only for first-agent worktree creation.

**Files**

- `packages/server/src/server/session.ts`

**Public surface**

No WebSocket or protocol message shape changes are introduced. The changes are internal to daemon session handling.

**Behavior**

- During `create_agent`, `Session` resolves `workspaceId` before creating the agent and computes `isFirstAgentInWorkspace` by calling `workspaceHasAnyAgent(workspaceId)`.
- `workspaceHasAnyAgent` first checks live agents from `agentManager.listAgents()` for the same `workspaceId`, then checks persisted records from `agentStorage.list()`. Persisted records count only when `workspaceId` matches and `internal !== true`; internal metadata agents do not make a workspace look initialized.
- For non-worktree agent creation with an explicit `msg.workspaceId`, `writeInitialWorkspaceTitleIfUntitled` runs only when `isFirstAgentInWorkspace` is true. Existing workspace titles are never overwritten at this provisional stage.
- Auto-title work is scheduled only when the initial prompt has non-empty text or attachments are present.
- Providers with native thread titles use the native-title path. For those providers, only first agents schedule a workspace-title update, because the provider-native title refresh already updates the agent title independently.
- Providers without native thread titles use the structured agent-title generator. That path always updates the created agent title when generation succeeds. It updates the workspace title only when `updateWorkspaceTitle` is true, which is wired to `isFirstAgentInWorkspace`.
- `maybeAutoNameAgentTitleFromContext` re-checks `agentManager.supportsNativeThreadTitle(agentId)` before invoking the structured generator. If the session gained native-title support by the time the async task runs, the structured fallback exits without writing.
- Workspace title writes continue to use `applyGeneratedWorkspaceTitle`, which re-reads the workspace record and only replaces the title if it is absent or still equal to the prompt-derived provisional title. User renames that land during async generation are preserved.
- Successful structured agent-title generation calls `agentManager.setTitle(agentId, title)`, then optionally applies the same title to the workspace and emits a workspace update.

## Codex Native Thread Titles

**Purpose** — Prefer Codex's own thread name for Codex app-server sessions, so Paseo agent titles follow the provider-native thread title instead of duplicating local structured generation.

**Files**

- `packages/server/src/server/agent/agent-sdk-types.ts`
- `packages/server/src/server/agent/agent-manager.ts`
- `packages/server/src/server/agent/providers/codex-app-server-agent.ts`
- `packages/server/src/server/session.ts`

**Public surface**

- `AgentCapabilityFlags` gains optional `supportsNativeThreadTitle?: boolean`.
- `AgentSession` gains optional `getNativeTitle?(): Promise<string | null>`.
- `AgentManager` gains:
  - `supportsNativeThreadTitle(agentId: string): boolean`
  - `refreshNativeThreadTitle(agentId: string): Promise<string | null>`

**Behavior**

- The Codex app-server capability map sets `supportsNativeThreadTitle: true`.
- `CodexAppServerAgentSession.getNativeTitle()` returns `null` when there is no connected app-server client or no current Codex thread id.
- When available, it calls the Codex app-server method `thread/list` with `{ limit: 50 }` and includes `{ cwd: this.config.cwd }` when the session has a cwd.
- The response is normalized with `toObjectRecord`; `response.data` is accepted only when it is an array, and entries are filtered through `isRecord`.
- The method finds the thread whose `id` matches `currentThreadId`, reads `thread.name` when it is a string, trims it, and returns the non-empty result. Missing or blank names return `null`.
- Errors while querying Codex are logged at debug with the current thread id and return `null`.
- `AgentManager.supportsNativeThreadTitle(agentId)` returns true only when the live agent session exposes `getNativeTitle`.
- `AgentManager.refreshNativeThreadTitle(agentId)` returns `null` when the agent or method is unavailable, calls the session method with the session as `this`, trims the result, ignores blank values, writes the agent title through `setTitle`, and returns the title that was applied.
- On every completed stream turn, `AgentManager` now kicks off `refreshNativeThreadTitle(agent.id)` after refreshing runtime info. Failures are logged at debug and do not affect turn completion.
- For the first agent in a workspace using native thread titles, `Session.scheduleNativeFirstAgentWorkspaceTitle` schedules `maybeApplyNativeFirstAgentWorkspaceTitle`.
- `maybeApplyNativeFirstAgentWorkspaceTitle` polls the native title at delays `[0, 1000, 2000, 4000, 8000, 15000, 30000, 60000]` milliseconds. The first non-empty native title is applied to both the agent via `refreshNativeThreadTitle` and the workspace via `applyGeneratedWorkspaceTitle`, then a workspace update is emitted. If no title appears by the final attempt, it exits silently.

## Worktree Branch Naming Decoupling

**Purpose** — Keep first-agent worktree branch naming separate from workspace and agent title generation.

**Files**

- `packages/server/src/server/session.ts`

**Behavior**

- `maybeAutoNameWorkspaceBranchForFirstAgent` still uses `attemptFirstAgentBranchAutoName`, but the generation callback now returns only `GeneratedWorkspaceName.branch`.
- The previous capture of `generatedTitle` from the branch-name generator was removed. A successful branch rename no longer writes a generated workspace title as a side effect.
- When branch auto-naming succeeds, `applyGeneratedWorkspaceBranch(workspaceId, branchName)` updates only the persisted workspace `branch` field and `updatedAt`, then `gitMutation.notifyGitMutation(cwd, "rename-branch")` and `emitWorkspaceUpdateForCwd(cwd)` run as before.
- `applyGeneratedWorkspaceBranch` ignores null branch names and missing workspace records.
- `applyGeneratedWorkspaceTitle` still accepts an optional `branch` field for existing callers, but this branch's first-agent worktree auto-name path no longer sends a title through that branch-generation flow.

## Documentation

**Files**

- `docs/data-model.md`

**Behavior**

- The data model documentation now states that agent and workspace titles are stored separately.
- It documents that the first agent in a workspace may initialize both the agent title and workspace title from the same generated or provider-native chat title, while later agents update only their own agent title.
- It also clarifies that first-agent worktree branch generation remains a separate flow and only runs for the first worktree agent.

## Cross-Cutting Effects

- No protocol schema fields, RPC names, or client-facing message types are changed.
- Agent record `title` remains the per-agent chat/thread title.
- Workspace record `title` remains a workspace display title and is guarded against later-agent overwrites.
- Workspace record `branch` is updated independently from title generation after first-agent branch auto-naming.
- Codex sessions now report provider-native title support through daemon-internal capability flags and expose the optional `AgentSession.getNativeTitle` method.
- The new agent-title generator creates internal, non-persistent structured-generation sessions, so metadata generation should not add visible user agents or persisted sessions.
