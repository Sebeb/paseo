import { describe, expect, it } from "vitest";
import type { WorkspaceTab } from "@/stores/workspace-tabs-store";
import type { Agent } from "@/stores/session-store";
import type { BrowserRecord } from "@/stores/browser-store/state";
import type { PendingCreateAttempt } from "@/stores/create-flow-store";
import type { DraftInput } from "@/stores/draft-store";
import {
  combineSidebarTabStatusSummaries,
  createEmptySidebarTabStatusSummary,
  SIDEBAR_TAB_STATUS_BADGE_BUCKETS,
  summarizeSidebarTabs,
  type SidebarTerminalStatusRecord,
} from "./sidebar-tab-status-summary";

function tab(input: { tabId: string; target: WorkspaceTab["target"] }): WorkspaceTab {
  return {
    tabId: input.tabId,
    target: input.target,
    createdAt: 1,
  };
}

function agent(input: Pick<Agent, "id" | "status"> & Partial<Omit<Agent, "id" | "status">>): Agent {
  const now = new Date("2026-06-19T12:00:00.000Z");
  const { id, status, ...overrides } = input;
  return {
    serverId: "srv",
    id,
    provider: "codex",
    status,
    createdAt: now,
    updatedAt: now,
    lastUserMessageAt: null,
    lastActivityAt: now,
    capabilities: {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: false,
      supportsMcpServers: false,
      supportsReasoningStream: false,
      supportsToolInvocations: true,
    },
    currentModeId: null,
    availableModes: [],
    pendingPermissions: [],
    persistence: null,
    lastUsage: undefined,
    lastError: null,
    title: null,
    cwd: "/repo",
    workspaceId: "ws",
    model: null,
    features: [],
    thinkingOptionId: null,
    requiresAttention: false,
    attentionReason: null,
    attentionTimestamp: null,
    archivedAt: null,
    parentAgentId: null,
    labels: {},
    projectPlacement: null,
    ...overrides,
  };
}

function browser(input: Pick<BrowserRecord, "browserId" | "isLoading">): BrowserRecord {
  return {
    browserId: input.browserId,
    url: "https://example.com",
    title: "",
    isLoading: input.isLoading,
    canGoBack: false,
    canGoForward: false,
    faviconUrl: null,
    lastError: null,
    createdAt: 1,
  };
}

function pendingCreate(
  input: Pick<PendingCreateAttempt, "draftId" | "lifecycle">,
): PendingCreateAttempt {
  return {
    draftId: input.draftId,
    lifecycle: input.lifecycle,
    serverId: "srv",
    workspaceId: "ws",
    agentId: null,
    clientMessageId: "message-1",
    text: "Build",
    timestamp: 1,
  };
}

function summarize(input: {
  tabs: WorkspaceTab[];
  agents?: Agent[];
  pendingCreatesByDraftId?: Record<string, PendingCreateAttempt>;
  browsers?: BrowserRecord[];
  terminals?: SidebarTerminalStatusRecord[];
  draftInputsByKey?: Record<string, DraftInput>;
}) {
  return summarizeSidebarTabs({
    tabs: input.tabs,
    serverId: "srv",
    workspaceId: "ws",
    agents: new Map((input.agents ?? []).map((entry) => [entry.id, entry])),
    pendingCreatesByDraftId: input.pendingCreatesByDraftId ?? {},
    setupSnapshots: {},
    browsersById: Object.fromEntries(
      (input.browsers ?? []).map((entry) => [entry.browserId, entry]),
    ),
    terminalsById: new Map((input.terminals ?? []).map((entry) => [entry.id, entry])),
    draftInputsByKey: input.draftInputsByKey,
  });
}

describe("sidebar tab status summary", () => {
  it("returns empty counts for a workspace without tabs", () => {
    expect(summarize({ tabs: [] })).toEqual(createEmptySidebarTabStatusSummary());
  });

  it("counts mixed tab status buckets", () => {
    const result = summarize({
      tabs: [
        tab({ tabId: "agent-needs-input", target: { kind: "agent", agentId: "needs-input" } }),
        tab({ tabId: "agent-failed", target: { kind: "agent", agentId: "failed" } }),
        tab({ tabId: "draft-running", target: { kind: "draft", draftId: "draft-1" } }),
        tab({ tabId: "terminal-attention", target: { kind: "terminal", terminalId: "term-1" } }),
        tab({ tabId: "browser-done", target: { kind: "browser", browserId: "browser-1" } }),
      ],
      agents: [
        agent({
          id: "needs-input",
          status: "idle",
          pendingPermissions: [
            { id: "permission-1", provider: "codex", name: "edit", kind: "tool" },
          ],
        }),
        agent({ id: "failed", status: "error" }),
      ],
      pendingCreatesByDraftId: {
        "draft-1": pendingCreate({ draftId: "draft-1", lifecycle: "active" }),
      },
      browsers: [browser({ browserId: "browser-1", isLoading: false })],
      terminals: [
        {
          id: "term-1",
          activity: { state: "attention", attentionReason: "finished", changedAt: 1 },
        },
      ],
    });

    expect(result).toEqual({
      total: 5,
      counts: {
        needs_input: 1,
        failed: 1,
        running: 1,
        attention: 1,
        done: 1,
      },
      draft: 1,
    });
  });

  it("counts no-status tabs as done", () => {
    const result = summarize({
      tabs: [
        tab({ tabId: "file-1", target: { kind: "file", path: "/repo/a.ts" } }),
        tab({ tabId: "browser-1", target: { kind: "browser", browserId: "browser-1" } }),
      ],
      browsers: [browser({ browserId: "browser-1", isLoading: false })],
    });

    expect(result).toEqual({
      total: 2,
      counts: {
        needs_input: 0,
        failed: 0,
        running: 0,
        attention: 0,
        done: 2,
      },
      draft: 0,
    });
  });

  it("excludes done from rendered status badge buckets", () => {
    expect(SIDEBAR_TAB_STATUS_BADGE_BUCKETS).toEqual([
      "needs_input",
      "failed",
      "running",
      "attention",
    ]);
  });

  it("combines workspace summaries for a collapsed project", () => {
    const first = summarize({
      tabs: [tab({ tabId: "agent-running", target: { kind: "agent", agentId: "running" } })],
      agents: [agent({ id: "running", status: "running" })],
    });
    const second = summarize({
      tabs: [
        tab({ tabId: "file-1", target: { kind: "file", path: "/repo/a.ts" } }),
        tab({ tabId: "browser-loading", target: { kind: "browser", browserId: "browser-1" } }),
      ],
      browsers: [browser({ browserId: "browser-1", isLoading: true })],
    });

    expect(combineSidebarTabStatusSummaries([first, second])).toEqual({
      total: 3,
      counts: {
        needs_input: 0,
        failed: 0,
        running: 2,
        attention: 0,
        done: 1,
      },
      draft: 0,
    });
  });

  it("counts agent tabs with composer drafts toward the draft count", () => {
    const result = summarize({
      tabs: [
        tab({ tabId: "agent-with-draft", target: { kind: "agent", agentId: "drafting" } }),
        tab({ tabId: "agent-without-draft", target: { kind: "agent", agentId: "clean" } }),
      ],
      agents: [agent({ id: "drafting", status: "idle" }), agent({ id: "clean", status: "idle" })],
      draftInputsByKey: {
        "agent:srv:drafting": { text: "hello", attachments: [] },
        "agent:srv:clean": { text: "", attachments: [] },
      },
    });

    expect(result.draft).toBe(1);
  });
});
