import { describe, expect, it } from "vitest";
import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import {
  buildWorkspaceTabSnapshot,
  deriveWorkspaceAgentVisibility,
  shouldPruneWorkspaceAgentTab,
  workspaceAgentVisibilityEqual,
} from "@/workspace-tabs/agent-visibility";

function makeAgent(input: {
  id: string;
  cwd: string;
  workspaceId?: string;
  parentAgentId?: string | null;
  archivedAt?: Date | null;
  createdAt?: Date;
  lastActivityAt?: Date;
}): Agent {
  const createdAt = input.createdAt ?? new Date("2026-03-04T00:00:00.000Z");
  const lastActivityAt = input.lastActivityAt ?? createdAt;
  return {
    serverId: "srv",
    id: input.id,
    provider: "codex",
    status: "idle",
    createdAt,
    updatedAt: createdAt,
    lastUserMessageAt: null,
    lastActivityAt,
    capabilities: {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: true,
      supportsMcpServers: true,
      supportsReasoningStream: true,
      supportsToolInvocations: true,
    },
    currentModeId: null,
    availableModes: [],
    pendingPermissions: [],
    persistence: null,
    runtimeInfo: {
      provider: "codex",
      sessionId: null,
    },
    title: null,
    cwd: input.cwd,
    workspaceId: input.workspaceId,
    model: null,
    thinkingOptionId: null,
    parentAgentId: input.parentAgentId ?? null,
    labels: {},
    requiresAttention: false,
    attentionReason: null,
    attentionTimestamp: null,
    archivedAt: input.archivedAt ?? null,
  };
}

const WORKSPACE_ID = "ws-1";

function makeWorkspace(input: {
  id: string;
  projectId?: string;
  projectRootPath?: string;
  name?: string;
}): WorkspaceDescriptor {
  return {
    id: input.id,
    projectId: input.projectId ?? "project-1",
    projectDisplayName: "Project",
    projectCustomName: null,
    projectRootPath: input.projectRootPath ?? "/repo",
    workspaceDirectory: `/repo/${input.id}`,
    projectKind: "git",
    workspaceKind: "checkout",
    name: input.name ?? "main",
    title: null,
    status: "done",
    statusEnteredAt: null,
    createdAt: new Date("2026-07-05T00:00:00.000Z"),
    activityAt: null,
    archivingAt: null,
    diffStat: null,
    scripts: [],
  };
}

describe("workspace agent visibility", () => {
  it("auto-opens same-workspace subagents under their parent", () => {
    const parent = makeAgent({
      id: "parent-agent",
      cwd: "/repo/worktree",
      workspaceId: WORKSPACE_ID,
    });
    const child = makeAgent({
      id: "child-agent",
      cwd: "/repo/worktree",
      workspaceId: WORKSPACE_ID,
      parentAgentId: "parent-agent",
    });

    const result = deriveWorkspaceAgentVisibility({
      sessionAgents: new Map<string, Agent>([
        [parent.id, parent],
        [child.id, child],
      ]),
      workspaceId: WORKSPACE_ID,
    });

    expect(result.activeAgentIds).toEqual(new Set(["parent-agent", "child-agent"]));
    expect(result.autoOpenAgentIds).toEqual(new Set(["parent-agent", "child-agent"]));
    expect(result.knownAgentIds).toEqual(new Set(["parent-agent", "child-agent"]));
    expect(result.parentAgentIdByAgentId).toEqual(new Map([["child-agent", "parent-agent"]]));
  });

  it("keeps archived subagents known but excludes them from active and auto-open", () => {
    const archivedChild = makeAgent({
      id: "archived-child",
      cwd: "/repo/worktree",
      workspaceId: WORKSPACE_ID,
      parentAgentId: "parent-agent",
      archivedAt: new Date("2026-03-04T00:01:00.000Z"),
    });

    const result = deriveWorkspaceAgentVisibility({
      sessionAgents: new Map<string, Agent>([[archivedChild.id, archivedChild]]),
      workspaceId: WORKSPACE_ID,
    });

    expect(result.activeAgentIds).toEqual(new Set<string>());
    expect(result.autoOpenAgentIds).toEqual(new Set<string>());
    expect(result.knownAgentIds).toEqual(new Set(["archived-child"]));
    expect(result.parentAgentIdByAgentId).toEqual(new Map());
  });

  it("auto-opens a same-workspace child even when its snapshot arrives before the parent", () => {
    const child = makeAgent({
      id: "child-agent",
      cwd: "/repo/worktree",
      workspaceId: WORKSPACE_ID,
      parentAgentId: "parent-agent",
    });
    const parent = makeAgent({
      id: "parent-agent",
      cwd: "/repo/worktree",
      workspaceId: WORKSPACE_ID,
    });

    const result = deriveWorkspaceAgentVisibility({
      sessionAgents: new Map<string, Agent>([
        [child.id, child],
        [parent.id, parent],
      ]),
      workspaceId: WORKSPACE_ID,
    });

    expect(result.activeAgentIds).toEqual(new Set(["child-agent", "parent-agent"]));
    expect(result.autoOpenAgentIds).toEqual(new Set(["child-agent", "parent-agent"]));
    expect(result.knownAgentIds).toEqual(new Set(["child-agent", "parent-agent"]));
    expect(result.parentAgentIdByAgentId).toEqual(new Map([["child-agent", "parent-agent"]]));
  });

  it("leaves cross-workspace subagents out of auto-open", () => {
    const parent = makeAgent({
      id: "parent-agent",
      cwd: "/repo/main",
      workspaceId: "parent-workspace",
    });
    const child = makeAgent({
      id: "child-agent",
      cwd: "/repo/worktree",
      workspaceId: WORKSPACE_ID,
      parentAgentId: "parent-agent",
    });

    const result = deriveWorkspaceAgentVisibility({
      sessionAgents: new Map<string, Agent>([
        [parent.id, parent],
        [child.id, child],
      ]),
      workspaceId: WORKSPACE_ID,
    });

    expect(result.activeAgentIds).toEqual(new Set(["child-agent"]));
    expect(result.autoOpenAgentIds).toEqual(new Set<string>());
    expect(result.knownAgentIds).toEqual(new Set(["child-agent"]));
    expect(result.parentAgentIdByAgentId).toEqual(new Map());
  });

  it("treats a same-branch subagent workspace as belonging to the parent workspace", () => {
    const parent = makeAgent({
      id: "parent-agent",
      cwd: "/repo",
      workspaceId: "ws-parent",
    });
    const child = makeAgent({
      id: "child-agent",
      cwd: "/repo",
      workspaceId: "ws-child-duplicate",
      parentAgentId: "parent-agent",
    });
    const workspaces = new Map<string, WorkspaceDescriptor>([
      ["ws-parent", makeWorkspace({ id: "ws-parent", name: "main" })],
      ["ws-child-duplicate", makeWorkspace({ id: "ws-child-duplicate", name: "main" })],
    ]);

    const parentResult = deriveWorkspaceAgentVisibility({
      sessionAgents: new Map<string, Agent>([
        [parent.id, parent],
        [child.id, child],
      ]),
      workspaces,
      workspaceId: "ws-parent",
    });
    const duplicateResult = deriveWorkspaceAgentVisibility({
      sessionAgents: new Map<string, Agent>([
        [parent.id, parent],
        [child.id, child],
      ]),
      workspaces,
      workspaceId: "ws-child-duplicate",
    });

    expect(parentResult.activeAgentIds).toEqual(new Set(["parent-agent", "child-agent"]));
    expect(parentResult.autoOpenAgentIds).toEqual(new Set(["parent-agent", "child-agent"]));
    expect(duplicateResult.activeAgentIds).toEqual(new Set<string>());
    expect(duplicateResult.autoOpenAgentIds).toEqual(new Set<string>());
  });

  it("keeps a subagent in its own workspace when that workspace represents a different branch", () => {
    const parent = makeAgent({
      id: "parent-agent",
      cwd: "/repo",
      workspaceId: "ws-parent",
    });
    const child = makeAgent({
      id: "child-agent",
      cwd: "/repo/.paseo/worktrees/feature",
      workspaceId: "ws-child-feature",
      parentAgentId: "parent-agent",
    });
    const workspaces = new Map<string, WorkspaceDescriptor>([
      ["ws-parent", makeWorkspace({ id: "ws-parent", name: "main" })],
      ["ws-child-feature", makeWorkspace({ id: "ws-child-feature", name: "feature" })],
    ]);

    const parentResult = deriveWorkspaceAgentVisibility({
      sessionAgents: new Map<string, Agent>([
        [parent.id, parent],
        [child.id, child],
      ]),
      workspaces,
      workspaceId: "ws-parent",
    });
    const childResult = deriveWorkspaceAgentVisibility({
      sessionAgents: new Map<string, Agent>([
        [parent.id, parent],
        [child.id, child],
      ]),
      workspaces,
      workspaceId: "ws-child-feature",
    });

    expect(parentResult.activeAgentIds).toEqual(new Set(["parent-agent"]));
    expect(parentResult.autoOpenAgentIds).toEqual(new Set(["parent-agent"]));
    expect(childResult.activeAgentIds).toEqual(new Set(["child-agent"]));
    expect(childResult.autoOpenAgentIds).toEqual(new Set(["child-agent"]));
  });

  it("keeps archived agents out of activeAgentIds but present in knownAgentIds", () => {
    const visible = makeAgent({
      id: "visible-agent",
      cwd: "/repo/worktree",
      workspaceId: WORKSPACE_ID,
      createdAt: new Date("2026-03-04T00:00:00.000Z"),
    });
    const archived = makeAgent({
      id: "archived-agent",
      cwd: "/repo/worktree",
      workspaceId: WORKSPACE_ID,
      archivedAt: new Date("2026-03-04T00:01:00.000Z"),
      createdAt: new Date("2026-03-04T00:01:00.000Z"),
    });
    const otherWorkspace = makeAgent({
      id: "other-workspace-agent",
      cwd: "/repo/other",
      workspaceId: "ws-other",
    });

    const sessionAgents = new Map<string, Agent>([
      [visible.id, visible],
      [archived.id, archived],
      [otherWorkspace.id, otherWorkspace],
    ]);

    const result = deriveWorkspaceAgentVisibility({
      sessionAgents,
      workspaceId: WORKSPACE_ID,
    });

    expect(result.activeAgentIds).toEqual(new Set(["visible-agent"]));
    expect(result.autoOpenAgentIds).toEqual(new Set(["visible-agent"]));
    expect(result.parentAgentIdByAgentId).toEqual(new Map());
    expect(result.knownAgentIds.has("visible-agent")).toBe(true);
    expect(result.knownAgentIds.has("archived-agent")).toBe(true);
    expect(result.knownAgentIds.has("other-workspace-agent")).toBe(false);
  });

  it("treats lazy historical details as known without making them active", () => {
    const active = makeAgent({
      id: "active-agent",
      cwd: "/repo/worktree",
      workspaceId: WORKSPACE_ID,
    });
    const historicalDetail = makeAgent({
      id: "historical-agent",
      cwd: "/repo/worktree",
      workspaceId: WORKSPACE_ID,
      archivedAt: new Date("2026-03-04T00:01:00.000Z"),
    });

    const result = deriveWorkspaceAgentVisibility({
      sessionAgents: new Map([[active.id, active]]),
      agentDetails: new Map([[historicalDetail.id, historicalDetail]]),
      workspaceId: WORKSPACE_ID,
    });

    expect(result.activeAgentIds).toEqual(new Set(["active-agent"]));
    expect(result.knownAgentIds).toEqual(new Set(["active-agent", "historical-agent"]));
  });

  it("prunes archived agent tabs so archiving on one client closes tabs on all clients", () => {
    const activeAgentIds = new Set<string>();

    expect(
      shouldPruneWorkspaceAgentTab({
        agentId: "archived-agent",
        agentsHydrated: true,
        activeAgentIds,
      }),
    ).toBe(true);
  });

  it("prunes pinned archived agent tabs because archive state is authoritative", () => {
    expect(
      shouldPruneWorkspaceAgentTab({
        agentId: "archived-agent",
        agentsHydrated: true,
        activeAgentIds: new Set<string>(),
      }),
    ).toBe(true);
  });

  it("does not prune active agent tabs", () => {
    const activeAgentIds = new Set(["active-agent"]);

    expect(
      shouldPruneWorkspaceAgentTab({
        agentId: "active-agent",
        agentsHydrated: true,
        activeAgentIds,
      }),
    ).toBe(false);
  });

  it("prunes agent tabs once agents are hydrated and the agent is missing from activeAgentIds", () => {
    expect(
      shouldPruneWorkspaceAgentTab({
        agentId: "missing-agent",
        agentsHydrated: true,
        activeAgentIds: new Set<string>(),
      }),
    ).toBe(true);
  });

  it("matches agents by workspaceId regardless of cwd", () => {
    const sessionAgents = new Map<string, Agent>([
      [
        "stamped-agent",
        makeAgent({
          id: "stamped-agent",
          cwd: "/repo/subdir",
          workspaceId: "ws-1",
        }),
      ],
    ]);

    const result = deriveWorkspaceAgentVisibility({
      sessionAgents,
      workspaceId: "ws-1",
    });

    expect(result.activeAgentIds).toEqual(new Set(["stamped-agent"]));
    expect(result.knownAgentIds).toEqual(new Set(["stamped-agent"]));
  });

  it("excludes a stamped agent whose workspaceId belongs to another workspace sharing the cwd", () => {
    const sessionAgents = new Map<string, Agent>([
      [
        "other-ws-agent",
        makeAgent({
          id: "other-ws-agent",
          cwd: "/repo/worktree",
          workspaceId: "ws-2",
        }),
      ],
    ]);

    const result = deriveWorkspaceAgentVisibility({
      sessionAgents,
      workspaceId: "ws-1",
    });

    expect(result.activeAgentIds).toEqual(new Set<string>());
    expect(result.knownAgentIds).toEqual(new Set<string>());
  });

  it("excludes agents without a workspaceId", () => {
    const sessionAgents = new Map<string, Agent>([
      ["ownerless-agent", makeAgent({ id: "ownerless-agent", cwd: "/repo/worktree" })],
    ]);

    const result = deriveWorkspaceAgentVisibility({
      sessionAgents,
      workspaceId: "ws-1",
    });

    expect(result.activeAgentIds).toEqual(new Set<string>());
    expect(result.knownAgentIds).toEqual(new Set<string>());
  });

  it("builds the tab reconciliation snapshot without callers unpacking agent visibility", () => {
    const agentVisibility = {
      activeAgentIds: new Set(["active-agent"]),
      autoOpenAgentIds: new Set(["root-agent"]),
      knownAgentIds: new Set(["active-agent", "archived-agent"]),
      parentAgentIdByAgentId: new Map([["child-agent", "root-agent"]]),
      branchGroupIdsByAgentId: new Map<string, readonly string[]>(),
    };

    expect(
      buildWorkspaceTabSnapshot({
        agentVisibility,
        agentsHydrated: true,
        terminalsHydrated: true,
        knownTerminalIds: ["terminal-1", "script-terminal"],
        standaloneTerminalIds: ["terminal-1"],
        hasActivePendingDraftCreate: false,
      }),
    ).toEqual({
      agentsHydrated: true,
      terminalsHydrated: true,
      activeAgentIds: agentVisibility.activeAgentIds,
      autoOpenAgentIds: agentVisibility.autoOpenAgentIds,
      knownAgentIds: agentVisibility.knownAgentIds,
      parentAgentIdByAgentId: agentVisibility.parentAgentIdByAgentId,
      branchGroupIdsByAgentId: agentVisibility.branchGroupIdsByAgentId,
      knownTerminalIds: ["terminal-1", "script-terminal"],
      standaloneTerminalIds: ["terminal-1"],
      hasActivePendingDraftCreate: false,
    });
  });

  describe("workspaceAgentVisibilityEqual", () => {
    it("returns true for identical sets", () => {
      const a = {
        activeAgentIds: new Set(["a", "b"]),
        autoOpenAgentIds: new Set(["a"]),
        knownAgentIds: new Set(["a", "b", "c"]),
        parentAgentIdByAgentId: new Map([["b", "a"]]),
        branchGroupIdsByAgentId: new Map<string, readonly string[]>(),
      };
      const b = {
        activeAgentIds: new Set(["a", "b"]),
        autoOpenAgentIds: new Set(["a"]),
        knownAgentIds: new Set(["a", "b", "c"]),
        parentAgentIdByAgentId: new Map([["b", "a"]]),
        branchGroupIdsByAgentId: new Map<string, readonly string[]>(),
      };
      expect(workspaceAgentVisibilityEqual(a, b)).toBe(true);
    });

    it("returns false when activeAgentIds differ", () => {
      const a = {
        activeAgentIds: new Set(["a"]),
        autoOpenAgentIds: new Set(["a"]),
        knownAgentIds: new Set(["a"]),
        parentAgentIdByAgentId: new Map(),
        branchGroupIdsByAgentId: new Map<string, readonly string[]>(),
      };
      const b = {
        activeAgentIds: new Set(["b"]),
        autoOpenAgentIds: new Set(["a"]),
        knownAgentIds: new Set(["a"]),
        parentAgentIdByAgentId: new Map(),
        branchGroupIdsByAgentId: new Map<string, readonly string[]>(),
      };
      expect(workspaceAgentVisibilityEqual(a, b)).toBe(false);
    });

    it("returns false when autoOpenAgentIds differ", () => {
      const a = {
        activeAgentIds: new Set(["a", "b"]),
        autoOpenAgentIds: new Set(["a"]),
        knownAgentIds: new Set(["a", "b"]),
        parentAgentIdByAgentId: new Map(),
        branchGroupIdsByAgentId: new Map<string, readonly string[]>(),
      };
      const b = {
        activeAgentIds: new Set(["a", "b"]),
        autoOpenAgentIds: new Set(["b"]),
        knownAgentIds: new Set(["a", "b"]),
        parentAgentIdByAgentId: new Map(),
        branchGroupIdsByAgentId: new Map<string, readonly string[]>(),
      };
      expect(workspaceAgentVisibilityEqual(a, b)).toBe(false);
    });

    it("returns false when knownAgentIds differ", () => {
      const a = {
        activeAgentIds: new Set(["a"]),
        autoOpenAgentIds: new Set(["a"]),
        knownAgentIds: new Set(["a"]),
        parentAgentIdByAgentId: new Map(),
        branchGroupIdsByAgentId: new Map<string, readonly string[]>(),
      };
      const b = {
        activeAgentIds: new Set(["a"]),
        autoOpenAgentIds: new Set(["a"]),
        knownAgentIds: new Set(["a", "b"]),
        parentAgentIdByAgentId: new Map(),
        branchGroupIdsByAgentId: new Map<string, readonly string[]>(),
      };
      expect(workspaceAgentVisibilityEqual(a, b)).toBe(false);
    });

    it("returns false when parent mappings differ", () => {
      const a = {
        activeAgentIds: new Set(["a", "b"]),
        autoOpenAgentIds: new Set(["a", "b"]),
        knownAgentIds: new Set(["a", "b"]),
        parentAgentIdByAgentId: new Map([["b", "a"]]),
        branchGroupIdsByAgentId: new Map<string, readonly string[]>(),
      };
      const b = {
        activeAgentIds: new Set(["a", "b"]),
        autoOpenAgentIds: new Set(["a", "b"]),
        knownAgentIds: new Set(["a", "b"]),
        parentAgentIdByAgentId: new Map([["b", "other"]]),
        branchGroupIdsByAgentId: new Map<string, readonly string[]>(),
      };
      expect(workspaceAgentVisibilityEqual(a, b)).toBe(false);
    });

    it("returns true for empty sets", () => {
      const a = {
        activeAgentIds: new Set<string>(),
        autoOpenAgentIds: new Set<string>(),
        knownAgentIds: new Set<string>(),
        parentAgentIdByAgentId: new Map<string, string>(),
        branchGroupIdsByAgentId: new Map<string, readonly string[]>(),
      };
      const b = {
        activeAgentIds: new Set<string>(),
        autoOpenAgentIds: new Set<string>(),
        knownAgentIds: new Set<string>(),
        parentAgentIdByAgentId: new Map<string, string>(),
        branchGroupIdsByAgentId: new Map<string, readonly string[]>(),
      };
      expect(workspaceAgentVisibilityEqual(a, b)).toBe(true);
    });
  });
});
