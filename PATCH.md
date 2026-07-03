# Patch Summary: Subagent Tabs Info

Branch: `feat/subagent-tabs-info`

Base: `origin/main`

Anchor commit: 3d0277877aebcf25749aadc6c0d43f8042877bcc — feat(app): auto-open subagent tabs with context

## Purpose

This branch changes subagent tab behavior so active subagents auto-open workspace tabs by default, while still treating the subagents track as their persistent home. It also enriches subagent track rows with workspace and chat context so child agents are easier to identify.

## User-Facing Changes

- Active subagents open tabs automatically, matching root agent behavior.
- Closing a subagent tab remains layout-only; archive and detach remain explicit subagent track actions.
- Subagent track rows can show a subtitle combining workspace name and chat title.
- Subagent track row accessibility labels include the subtitle when present.

## Implementation Details

### `packages/app/src/subagents/auto-open-tab-policy.ts`

`shouldAutoOpenAgentTab` now returns `true` for every agent. The parameter remains typed as `Pick<Agent, "parentAgentId">` for compatibility with existing callers, but subagent parentage no longer suppresses auto-open.

### `packages/app/src/subagents/select.ts`

`SubagentRow` now includes:

```ts
workspaceId: Agent["workspaceId"] | null;
workspaceName: string | null;
chatTitle: string | null;
```

`selectSubagentsForParent` reads the session once, uses `session.workspaces` to resolve `workspaceName`, and maps each child through `toSubagentRow(agent, workspaceNameById)`.

`resolveSubagentChatTitle(title)` trims string titles and returns `null` for empty titles or the placeholder `"new agent"`, so loading rows do not expose placeholder text as meaningful chat context.

### `packages/app/src/subagents/track-presentation.ts`

Adds `formatSubagentRowSubtitle(row)`, which joins non-empty `workspaceName` and `chatTitle` with `·`.

`buildSubagentRowPresentationData` sets `subtitle` to that formatted value instead of the previous empty string.

### `packages/app/src/subagents/track.tsx`

`SubagentsTrackRow` renders the row label and optional subtitle in a `rowText` column. When a subtitle exists, the row accessibility label becomes `<label>, <subtitle>`.

Added styles:

- `rowText` owns flex/min-width for the text column.
- `rowSubtitle` uses muted foreground color and `xs` font size.

### `docs/agent-lifecycle.md`

Documents that active subagents auto-open workspace tabs by default and that closing those tabs still follows the layout-only subagent policy.

## Tests

Updated coverage includes:

- `packages/app/src/stores/workspace-subagents-integration.test.ts`
- `packages/app/src/subagents/select.test.ts`
- `packages/app/src/subagents/track-presentation.test.ts`
- `packages/app/src/workspace-tabs/agent-visibility.test.ts`

The tests cover child auto-open behavior, detached child tab retention, workspace/chat context mapping, subtitle formatting, and updated visibility sets.
