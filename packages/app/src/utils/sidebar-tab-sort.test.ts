import { describe, expect, it } from "vitest";
import type { Agent } from "@/stores/session-store";
import type { WorkspaceTab } from "@/stores/workspace-tabs-store";
import {
  createEmptySidebarTabStatusSummary,
  type SidebarTabStatusSummary,
} from "@/utils/sidebar-tab-status-summary";
import { sortSidebarWorkspaceTabs } from "@/utils/sidebar-tab-sort";

function tab(tabId: string, createdAt: number): WorkspaceTab {
  return {
    tabId,
    createdAt,
    target: { kind: "agent", agentId: tabId },
  };
}

function agent(agentId: string, lastUserMessageAt: number): Agent {
  return {
    id: agentId,
    serverId: "server-1",
    provider: "codex",
    status: "idle",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    lastUserMessageAt: new Date(lastUserMessageAt),
    lastActivityAt: new Date(0),
    capabilities: {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: false,
      supportsMcpServers: false,
      supportsReasoningStream: false,
      supportsToolInvocations: false,
    },
    currentModeId: null,
    availableModes: [],
    pendingPermissions: [],
    persistence: null,
    title: null,
    cwd: "/repo",
    model: null,
    parentAgentId: null,
    labels: {},
  };
}

function statusSummary(kind: "input_required" | "failed"): SidebarTabStatusSummary {
  const summary = createEmptySidebarTabStatusSummary();
  summary.entryCounts[kind] = 1;
  return summary;
}

describe("sortSidebarWorkspaceTabs", () => {
  it("keeps manual order", () => {
    expect(
      sortSidebarWorkspaceTabs({
        tabs: [tab("old", 1), tab("new", 2)],
        sortMode: "manual",
        agents: null,
      }).map((item) => item.tabId),
    ).toEqual(["old", "new"]);
  });

  it("sorts by last updated agent activity", () => {
    expect(
      sortSidebarWorkspaceTabs({
        tabs: [tab("old", 1), tab("new", 2)],
        sortMode: "lastUpdated",
        agents: new Map([
          ["old", agent("old", 20)],
          ["new", agent("new", 10)],
        ]),
      }).map((item) => item.tabId),
    ).toEqual(["old", "new"]);
  });

  it("sorts by created time", () => {
    expect(
      sortSidebarWorkspaceTabs({
        tabs: [tab("old", 1), tab("new", 2)],
        sortMode: "created",
        agents: null,
      }).map((item) => item.tabId),
    ).toEqual(["new", "old"]);
  });

  it("sorts status rank before activity", () => {
    expect(
      sortSidebarWorkspaceTabs({
        tabs: [tab("failed", 1), tab("input", 2)],
        sortMode: "status",
        agents: null,
        statusSummariesByTabId: new Map([
          ["failed", statusSummary("failed")],
          ["input", statusSummary("input_required")],
        ]),
      }).map((item) => item.tabId),
    ).toEqual(["input", "failed"]);
  });
});
