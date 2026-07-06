# Patch Summary: Subagent Tabs Info

Branch: `feat/subagent-tabs-info`

Base: `main`

Anchor commit: dbd552ae4b052f1401a85733c320a7f63442c222 — fix(app): route same-branch subagent navigation to parent workspace

## Purpose

This branch changes subagent tab behavior so active subagents auto-open workspace tabs by default, while still treating the subagents track as their persistent home. It also makes same-branch delegated agents appear in the parent workspace instead of opening duplicate workspace rows, and enriches subagent track rows with workspace context so child agents are easier to identify.

## User-Facing Changes

- Active subagents open tabs automatically, matching root agent behavior.
- Subagents created in the same project, branch, and root as their delegation root are shown in the root agent's workspace, even when their runtime workspace descriptor or cwd differs.
- Subagents created in a distinct workspace, such as another branch/worktree, stay attached to that distinct workspace.
- Clicking or otherwise navigating to a same-branch subagent opens that subagent's tab in the resolved parent workspace, so manual navigation matches auto-open placement.
- Closing a subagent tab remains layout-only; archive and detach remain explicit subagent track actions.
- Subagent track rows can show the subagent workspace name as a subtitle.
- Subagent track row accessibility labels include the subtitle when present.

## Implementation Details

### `packages/app/src/subagents/auto-open-tab-policy.ts`

`shouldAutoOpenAgentTab` now returns `true` for every agent. The parameter remains typed as `Pick<Agent, "parentAgentId">` for compatibility with existing callers, but subagent parentage no longer suppresses auto-open.

### `packages/app/src/subagents/select.ts`

`SubagentRow` now includes:

```ts
workspaceId: Agent["workspaceId"] | null;
workspaceName: string | null;
```

`selectSubagentsForParent` reads the session once, filters out archived children, locally pending archive rows, and agents whose `parentAgentId` does not match the requested parent, then maps each child through `toSubagentRow(agent, session.workspaces)`. Rows are sorted oldest-first by `createdAt`, and the selector returns the stable empty array when no rows are available.

`toSubagentRow` preserves the agent title for the primary row label and resolves `workspaceName` from the session workspace map when the agent has a workspace id. It does not duplicate the title into subtitle state; placeholder titles are handled by presentation code.

### `packages/app/src/subagents/track-presentation.ts`

Adds `formatSubagentRowSubtitle(row)`, which returns the trimmed `workspaceName` when it is a string and returns an empty string otherwise.

`buildSubagentRowPresentationData` sets `subtitle` to that formatted value instead of the previous empty string.

### `packages/app/src/subagents/track.tsx`

`SubagentsTrackRow` renders the row label and optional subtitle in a `rowText` column. When a subtitle exists, the row accessibility label becomes `<label>, <subtitle>`.

Added styles:

- `rowText` owns flex/min-width for the text column.
- `rowSubtitle` uses muted foreground color and `xs` font size.

### `packages/app/src/workspace-tabs/agent-workspace-resolution.ts`

Adds a shared resolver for effective agent workspace membership so tab visibility and direct navigation use the same same-branch subagent policy.

Exports:

```ts
function buildAgentWorkspaceLookup(input: {
  sessionAgents?: ReadonlyMap<string, Agent> | undefined;
  agentDetails?: ReadonlyMap<string, Agent> | undefined;
}): Map<string, Agent>;

function resolveEffectiveAgentWorkspaceId(input: {
  agent: Agent | null | undefined;
  agentsById: ReadonlyMap<string, Agent>;
  workspaces?: ReadonlyMap<string, WorkspaceDescriptor> | undefined;
}): string | null;
```

`buildAgentWorkspaceLookup` creates an id-indexed map from `agentDetails` and `sessionAgents`, inserting details first and session agents second so live session rows win when both maps contain the same id.

`resolveEffectiveAgentWorkspaceId` returns `null` when no agent is available, returns the normalized own workspace id for root agents, and resolves subagents through their delegation root. It walks the `parentAgentId` chain, detects cycles, and returns `null` from the root walk when a parent is missing or cyclic. If either the subagent workspace id or root workspace id is absent, or if both ids are already equal, the resolver falls back to the available own/root id. When both ids exist and differ, it compares the two workspace descriptors by project id, trimmed lowercase workspace name, and trimmed lowercase project root path. Matching descriptors mean the subagent belongs to the root workspace; otherwise it stays in its own workspace.

The internal same-branch comparison intentionally returns false for identical descriptor ids, because identical ids are already handled by the id fallback path. Empty or non-string comparable values normalize to `null`, so two empty names/roots only compare equal when both normalize the same way and the project ids also match.

### `packages/app/src/workspace-tabs/agent-visibility.ts`

`deriveWorkspaceAgentVisibility` now accepts:

```ts
workspaces?: ReadonlyMap<string, WorkspaceDescriptor> | undefined;
```

The function builds an `agentsById` map from both `agentDetails` and `sessionAgents`, with session agents winning when an id appears in both maps. Workspace membership is resolved through `resolveEffectiveAgentWorkspaceId` rather than direct `agent.workspaceId` comparison.

`agentBelongsToWorkspace` delegates that membership decision to `resolveEffectiveAgentWorkspaceId`, so the active, auto-open, and known sets all share the same normalized root-workspace handling for same-branch subagents.

`activeAgentIds`, `autoOpenAgentIds`, and `knownAgentIds` all use this resolved workspace membership. Archived agents remain excluded from active and auto-open sets but stay known when present in `agentDetails` or `sessionAgents`.

### `packages/app/src/utils/navigate-to-agent/index.ts`

Manual agent navigation now resolves the target workspace through the same shared `resolveEffectiveAgentWorkspaceId` policy used by tab visibility. `navigateToAgent` reads the agent from `session.agents` first, falls back to `session.agentDetails`, builds the lookup from both maps with `buildAgentWorkspaceLookup`, and passes the session workspace map into the resolver.

When a subagent belongs to a duplicate same-branch workspace descriptor, the navigation dependency receives the delegation root workspace id. `navigateToPreparedWorkspaceTab` is then called with that parent workspace id and the original `{ kind: "agent", agentId: childId }` target, so the clicked subagent opens as a tab in the parent workspace rather than navigating to a duplicate workspace row. Distinct-branch/worktree subagents keep resolving to their own workspace ids.

### `packages/app/src/screens/workspace/workspace-screen.tsx`

The workspace screen passes the current session's `workspaces` map into `deriveWorkspaceAgentVisibility`, enabling same-branch subagent placement in the live tab snapshot.

### `packages/app/src/workspace/legacy-daemon-workspaces.ts`

Legacy daemon workspace synthesis now also collapses same-branch delegated agents into the delegation root workspace. `stampLegacyWorkspaceIds` and `buildLegacyWorkspaces` build an `entriesByAgentId` map and pass it into `resolveLegacyWorkspaceId`.

`resolveDelegationRootEntry` walks parent labels with `getParentAgentIdFromLabels`, detects parent cycles, and returns `null` when a parent entry is missing. `shouldUseDelegationRootLegacyWorkspace` returns true only when the entry is not already the root, both entries share the same project key, both have a non-empty identical trimmed branch name, and their normalized `mainRepoRoot` values match. In that case `resolveLegacyWorkspaceId` recursively uses the root entry's workspace id; otherwise it falls back to the entry checkout cwd, agent cwd, or raw agent cwd as before.

### `docs/agent-lifecycle.md`

Documents that active subagents auto-open workspace tabs by default, that same-branch subagents open in the parent workspace, that distinct-workspace subagents stay distinct, and that closing those tabs still follows the layout-only subagent policy.

## Tests

Updated coverage includes:

- `packages/app/src/stores/workspace-subagents-integration.test.ts`
- `packages/app/src/subagents/select.test.ts`
- `packages/app/src/subagents/track-presentation.test.ts`
- `packages/app/src/workspace-tabs/agent-visibility.test.ts`
- `packages/app/src/utils/navigate-to-agent/restore-archived-workspace.test.ts`
- `packages/app/src/workspace/legacy-daemon-workspaces.test.ts`

The tests cover child auto-open behavior, detached child tab retention, workspace context mapping, workspace-only subtitle formatting, same-branch subagent placement in modern visibility snapshots, direct same-branch subagent navigation into the parent workspace, distinct-branch preservation, legacy same-branch workspace collapse, legacy distinct-branch preservation, and updated visibility sets.
