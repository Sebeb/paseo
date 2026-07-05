# Patch Summary: Subagent Tabs Info

Branch: `feat/subagent-tabs-info`

Base: `origin/main`

Anchor commit: 30ef3bad0640662b56ad28d0864b4a364b3ae3f2 — fix(app): place same-branch subagents with parent workspace

## Purpose

This branch changes subagent tab behavior so active subagents auto-open workspace tabs by default, while still treating the subagents track as their persistent home. It also makes same-branch delegated agents appear in the parent workspace instead of opening duplicate workspace rows, and enriches subagent track rows with workspace context so child agents are easier to identify.

## User-Facing Changes

- Active subagents open tabs automatically, matching root agent behavior.
- Subagents created in the same project, branch, and root as their delegation root are shown in the root agent's workspace, even when their runtime workspace descriptor or cwd differs.
- Subagents created in a distinct workspace, such as another branch/worktree, stay attached to that distinct workspace.
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

### `packages/app/src/workspace-tabs/agent-visibility.ts`

`deriveWorkspaceAgentVisibility` now accepts:

```ts
workspaces?: ReadonlyMap<string, WorkspaceDescriptor> | undefined;
```

The function builds an `agentsById` map from both `agentDetails` and `sessionAgents`, with session agents winning when an id appears in both maps. Workspace membership is resolved through `resolveAgentWorkspaceId` rather than direct `agent.workspaceId` comparison.

`resolveAgentWorkspaceId` keeps root agents in their own normalized workspace id. For subagents, it walks the `parentAgentId` chain with `resolveDelegationRootAgent` to find the delegation root, returning `null` on missing parents or cycles. If the subagent and root already share a workspace id, or either id is missing, it falls back to the available own/root id. When both ids exist and differ, `workspacesRepresentSameBranch` compares the two workspace descriptors by project id, trimmed lowercase workspace name, and trimmed lowercase project root path. Matching descriptors mean the subagent belongs to the root workspace; otherwise it stays in its own workspace.

`activeAgentIds`, `autoOpenAgentIds`, and `knownAgentIds` all use this resolved workspace membership. Archived agents remain excluded from active and auto-open sets but stay known when present in `agentDetails` or `sessionAgents`.

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
- `packages/app/src/workspace/legacy-daemon-workspaces.test.ts`

The tests cover child auto-open behavior, detached child tab retention, workspace context mapping, workspace-only subtitle formatting, same-branch subagent placement in modern visibility snapshots, distinct-branch preservation, legacy same-branch workspace collapse, legacy distinct-branch preservation, and updated visibility sets.
