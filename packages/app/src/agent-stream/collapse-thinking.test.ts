import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import {
  buildCollapseThinkingGroups,
  getThinkingGroupCounts,
  getThinkingGroupPreviewMessages,
  shouldShowThinkingGroupPreview,
} from "./collapse-thinking";
import {
  createStreamStrategy,
  orderHeadForStreamRenderStrategy,
  orderTailForStreamRenderStrategy,
} from "./strategy";

function buildCompletedThinkingGroups(items: readonly StreamItem[]) {
  return buildCollapseThinkingGroups({ items, behavior: "completed", agentStatus: "idle" });
}

function buildRunningThinkingGroups(items: readonly StreamItem[]) {
  return buildCollapseThinkingGroups({ items, behavior: "completed", agentStatus: "running" });
}

function timestamp(seed: number): Date {
  return new Date(`2026-01-01T00:00:${seed.toString().padStart(2, "0")}.000Z`);
}

function userMessage(id: string, seed: number): StreamItem {
  return {
    kind: "user_message",
    id,
    text: id,
    timestamp: timestamp(seed),
  };
}

function assistantMessage(
  id: string,
  seed: number,
  options: {
    blockGroupId?: string;
    blockIndex?: number;
    presentation?: "response" | "progress";
  } = {},
): StreamItem {
  return {
    kind: "assistant_message",
    id,
    text: id,
    timestamp: timestamp(seed),
    ...(options.blockGroupId ? { blockGroupId: options.blockGroupId } : {}),
    ...(options.blockIndex !== undefined ? { blockIndex: options.blockIndex } : {}),
    ...(options.presentation ? { presentation: options.presentation } : {}),
  };
}

function thought(id: string, seed: number): StreamItem {
  return {
    kind: "thought",
    id,
    text: id,
    timestamp: timestamp(seed),
    status: "ready",
  };
}

function toolCall(id: string, seed: number): StreamItem {
  return {
    kind: "tool_call",
    id,
    timestamp: timestamp(seed),
    payload: {
      source: "orchestrator",
      data: {
        toolCallId: id,
        toolName: "Shell",
        arguments: "echo hi",
        result: null,
        status: "completed",
      },
    },
  };
}

function planToolCall(id: string, seed: number): StreamItem {
  return {
    kind: "tool_call",
    id,
    timestamp: timestamp(seed),
    payload: {
      source: "agent",
      data: {
        provider: "codex",
        callId: id,
        name: "plan",
        status: "completed",
        error: null,
        detail: {
          type: "plan",
          text: "- Inspect\n- Implement\n- Verify",
        },
      },
    },
  };
}

function questionToolCall(id: string, seed: number): StreamItem {
  return {
    kind: "tool_call",
    id,
    timestamp: timestamp(seed),
    payload: {
      source: "agent",
      data: {
        provider: "codex",
        callId: id,
        name: "request_user_input",
        status: "completed",
        error: null,
        detail: {
          type: "unknown",
          input: { questions: [] },
          output: null,
        },
      },
    },
  };
}

function groupItemIds(items: StreamItem[]): string[][] {
  return buildCompletedThinkingGroups(items).groups.map((group) => group.itemIds);
}

function createOrderingStrategy(input: { orderTailReverse: boolean; orderHeadReverse: boolean }) {
  return createStreamStrategy({
    render: () => null,
    orderTailReverse: input.orderTailReverse,
    orderHeadReverse: input.orderHeadReverse,
    assistantTurnTraversalStep: 1,
    edgeSlot: "footer",
    historyLiveBoundaryEdge: "last",
    liveHeadHistoryBoundaryEdge: "last",
    frameChildOrder: "content-then-footer",
    flatListInverted: false,
    overlayScrollbarInverted: false,
    bottomAnchorTransportBehavior: {
      verificationDelayFrames: 0,
      verificationRetryMode: "recheck",
    },
    disableParentScrollOnInlineDetailsExpansion: false,
    anchorBottomOnContentSizeChange: false,
    animateManualScrollToBottom: false,
    useVirtualizedList: false,
    isNearBottom: () => true,
    getBottomOffset: () => 0,
  });
}

describe("buildCollapseThinkingGroups", () => {
  it("groups reasoning and tool calls while leaving the final assistant outside", () => {
    const index = buildCompletedThinkingGroups([
      userMessage("u1", 1),
      thought("t1", 2),
      toolCall("tool-1", 3),
      assistantMessage("a1", 4),
    ]);

    expect(index.groups).toHaveLength(1);
    expect(index.groups[0]).toMatchObject({
      anchorItemId: "t1",
      itemIds: ["t1", "tool-1"],
      defaultExpanded: false,
      status: "completed",
      finalAssistantItemId: "a1",
    });
    expect(index.groupByItemId.has("a1")).toBe(false);
  });

  it("leaves intermediate assistant output visible when more work follows", () => {
    const index = buildCompletedThinkingGroups([
      userMessage("u1", 1),
      assistantMessage("a1", 2),
      thought("t1", 3),
      assistantMessage("a2", 4),
    ]);

    expect(index.groups[0]?.itemIds).toEqual(["t1"]);
    expect(index.groupByItemId.has("a1")).toBe(false);
    expect(index.groupByItemId.has("a2")).toBe(false);
  });

  it("splits completed thinking groups around visible assistant output", () => {
    const index = buildCompletedThinkingGroups([
      userMessage("u1", 1),
      toolCall("tool-1", 2),
      assistantMessage("progress", 3),
      toolCall("tool-2", 4),
      assistantMessage("final", 5),
    ]);

    expect(index.groups).toHaveLength(2);
    expect(index.groups.map((group) => group.itemIds)).toEqual([["tool-1"], ["tool-2"]]);
    expect(index.groups.map((group) => group.status)).toEqual(["completed", "completed"]);
    expect(index.groups.map((group) => group.finalAssistantItemId)).toEqual(["progress", "final"]);
    expect(index.groupByItemId.has("progress")).toBe(false);
    expect(index.groupByItemId.has("final")).toBe(false);
  });

  it("records completed group timing from that group's own first and last work item", () => {
    const index = buildCompletedThinkingGroups([
      userMessage("u1", 1),
      thought("t1", 2),
      toolCall("tool-1", 5),
      assistantMessage("visible-output", 9),
      toolCall("tool-2", 11),
      assistantMessage("final", 20),
    ]);

    expect(
      index.groups.map((group) => ({
        itemIds: group.itemIds,
        startedAt: group.startedAt,
        lastActivityAt: group.lastActivityAt,
      })),
    ).toEqual([
      {
        itemIds: ["t1", "tool-1"],
        startedAt: timestamp(2),
        lastActivityAt: timestamp(5),
      },
      {
        itemIds: ["tool-2"],
        startedAt: timestamp(11),
        lastActivityAt: timestamp(11),
      },
    ]);
  });

  it("keeps progress assistant text inside thinking groups between tools", () => {
    const index = buildCompletedThinkingGroups([
      userMessage("u1", 1),
      toolCall("tool-1", 2),
      assistantMessage("progress", 3, { presentation: "progress" }),
      toolCall("tool-2", 4),
      assistantMessage("final", 5),
    ]);

    expect(index.groups).toHaveLength(1);
    expect(index.groups[0]?.itemIds).toEqual(["tool-1", "progress", "tool-2"]);
    expect(index.groupByItemId.has("progress")).toBe(true);
    expect(index.groupByItemId.has("final")).toBe(false);
  });

  it("keeps progress assistant text visible before a user-facing question tool", () => {
    const index = buildRunningThinkingGroups([
      userMessage("u1", 1),
      thought("t1", 2),
      assistantMessage("question-intro", 3, { presentation: "progress" }),
      questionToolCall("question-1", 4),
    ]);

    expect(index.groups.map((group) => group.itemIds)).toEqual([["t1"], ["question-1"]]);
    expect(index.groups.map((group) => group.status)).toEqual(["completed", "active"]);
    expect(index.groups[0]?.finalAssistantItemId).toBe("question-intro");
    expect(index.groupByItemId.has("question-intro")).toBe(false);
  });

  it("leaves final progress assistant text visible after completion", () => {
    const index = buildCompletedThinkingGroups([
      userMessage("u1", 1),
      toolCall("tool-1", 2),
      assistantMessage("final", 3, { presentation: "progress" }),
    ]);

    expect(index.groups[0]?.itemIds).toEqual(["tool-1"]);
    expect(index.groups[0]?.finalAssistantItemId).toBe("final");
    expect(index.groupByItemId.has("final")).toBe(false);
  });

  it("leaves response-presented assistant text outside thinking groups", () => {
    const index = buildCompletedThinkingGroups([
      userMessage("u1", 1),
      toolCall("tool-1", 2),
      assistantMessage("final-response", 3, { presentation: "response" }),
    ]);

    expect(index.groups[0]?.itemIds).toEqual(["tool-1"]);
    expect(index.groupByItemId.has("final-response")).toBe(false);
  });

  it("keeps plan cards outside collapsed thinking", () => {
    const index = buildCompletedThinkingGroups([
      userMessage("u1", 1),
      thought("t1", 2),
      planToolCall("plan-1", 3),
      assistantMessage("final", 4),
    ]);

    expect(index.groups[0]?.itemIds).toEqual(["t1"]);
    expect(index.groupByItemId.has("plan-1")).toBe(false);
  });

  it("does not group split assistant response blocks", () => {
    const index = buildCompletedThinkingGroups([
      userMessage("u1", 1),
      assistantMessage("answer:block:0", 2, { blockGroupId: "answer", blockIndex: 0 }),
      assistantMessage("answer:block:1", 3, { blockGroupId: "answer", blockIndex: 1 }),
      assistantMessage("answer:head", 4, { blockGroupId: "answer", blockIndex: 2 }),
    ]);

    expect(index.groups).toHaveLength(0);
    expect(index.groupByItemId.has("answer:block:0")).toBe(false);
    expect(index.groupByItemId.has("answer:block:1")).toBe(false);
    expect(index.groupByItemId.has("answer:head")).toBe(false);
  });

  it("keeps an active turn with no assistant candidate expanded", () => {
    const index = buildRunningThinkingGroups([
      userMessage("u1", 1),
      thought("t1", 2),
      toolCall("tool-1", 3),
    ]);

    expect(index.groups[0]).toMatchObject({
      itemIds: ["t1", "tool-1"],
      defaultExpanded: true,
      status: "active",
      finalAssistantItemId: null,
    });
  });

  it("collapses an active turn by default in completed-and-active mode", () => {
    const index = buildCollapseThinkingGroups({
      behavior: "completed-and-active",
      agentStatus: "running",
      items: [userMessage("u1", 1), thought("t1", 2), toolCall("tool-1", 3)],
    });

    expect(index.groups[0]).toMatchObject({
      itemIds: ["t1", "tool-1"],
      defaultExpanded: false,
      status: "active",
    });
  });

  it("keeps assistant text inside the current running turn until completion", () => {
    const beforeAssistant = buildRunningThinkingGroups([userMessage("u1", 1), thought("t1", 2)]);
    const duringAssistant = buildRunningThinkingGroups([
      userMessage("u1", 1),
      thought("t1", 2),
      assistantMessage("a1", 3),
    ]);
    const afterAssistant = buildCompletedThinkingGroups([
      userMessage("u1", 1),
      thought("t1", 2),
      assistantMessage("a1", 3),
    ]);

    expect(beforeAssistant.groups[0]?.defaultExpanded).toBe(true);
    expect(beforeAssistant.groups[0]?.id).toBe("thinking:u1:t1:active");
    expect(duringAssistant.groups[0]?.defaultExpanded).toBe(true);
    expect(duringAssistant.groups[0]?.id).toBe("thinking:u1:t1:active");
    expect(duringAssistant.groups[0]?.itemIds).toEqual(["t1", "a1"]);
    expect(duringAssistant.groupByItemId.has("a1")).toBe(true);
    expect(afterAssistant.groups[0]?.defaultExpanded).toBe(false);
    expect(afterAssistant.groups[0]?.id).toBe("thinking:u1:t1:final");
    expect(afterAssistant.groups[0]?.itemIds).toEqual(["t1"]);
    expect(afterAssistant.groupByItemId.has("a1")).toBe(false);
  });

  it("starts a new live thinking group after visible assistant output in a running turn", () => {
    const index = buildRunningThinkingGroups([
      userMessage("u1", 1),
      assistantMessage("progress-1", 2),
      toolCall("tool-1", 3),
      assistantMessage("progress-2", 4),
    ]);

    expect(index.groups[0]).toMatchObject({
      itemIds: ["tool-1", "progress-2"],
      status: "active",
      finalAssistantItemId: null,
    });
    expect(index.groupByItemId.has("progress-1")).toBe(false);
    expect(index.groupByItemId.has("progress-2")).toBe(true);
  });

  it("records active group timing from the active group's own first and latest work item", () => {
    const index = buildRunningThinkingGroups([
      userMessage("u1", 1),
      thought("t1", 2),
      assistantMessage("visible-output", 8),
      toolCall("tool-1", 13),
      assistantMessage("progress-2", 17),
    ]);

    expect(index.groups.map((group) => group.status)).toEqual(["completed", "active"]);
    expect(index.groups[1]).toMatchObject({
      itemIds: ["tool-1", "progress-2"],
      startedAt: timestamp(13),
      lastActivityAt: timestamp(17),
    });
  });

  it("converts earlier running work to completed when later work follows assistant output", () => {
    const index = buildRunningThinkingGroups([
      userMessage("u1", 1),
      thought("t1", 2),
      assistantMessage("visible-output", 3),
      toolCall("tool-1", 4),
    ]);

    expect(index.groups.map((group) => group.id)).toEqual([
      "thinking:u1:t1:final",
      "thinking:u1:tool-1:active",
    ]);
    expect(index.groups.map((group) => group.itemIds)).toEqual([["t1"], ["tool-1"]]);
    expect(index.groups.map((group) => group.status)).toEqual(["completed", "active"]);
    expect(index.groups.map((group) => group.finalAssistantItemId)).toEqual([
      "visible-output",
      null,
    ]);
    expect(index.groupByItemId.has("visible-output")).toBe(false);
  });

  it("keeps multiple completed assistant outputs visible between thinking groups", () => {
    const index = buildCompletedThinkingGroups([
      userMessage("u1", 1),
      thought("t1", 2),
      assistantMessage("visible-output-1", 3),
      toolCall("tool-1", 4),
      assistantMessage("visible-output-2", 5),
      thought("t2", 6),
      assistantMessage("final", 7),
    ]);

    expect(index.groups.map((group) => group.itemIds)).toEqual([["t1"], ["tool-1"], ["t2"]]);
    expect(index.groups.map((group) => group.finalAssistantItemId)).toEqual([
      "visible-output-1",
      "visible-output-2",
      "final",
    ]);
    expect(index.groupByItemId.has("visible-output-1")).toBe(false);
    expect(index.groupByItemId.has("visible-output-2")).toBe(false);
    expect(index.groupByItemId.has("final")).toBe(false);
  });

  it("leaves the final assistant suffix outside after the running turn completes", () => {
    const index = buildCompletedThinkingGroups([
      userMessage("u1", 1),
      toolCall("tool-1", 2),
      assistantMessage("progress", 3),
      assistantMessage("final", 4),
    ]);

    expect(index.groups[0]?.itemIds).toEqual(["tool-1"]);
    expect(index.groupByItemId.has("progress")).toBe(false);
    expect(index.groupByItemId.has("final")).toBe(false);
  });

  it("keeps previous turns completed while the latest turn is running", () => {
    const index = buildRunningThinkingGroups([
      userMessage("u1", 1),
      thought("t1", 2),
      assistantMessage("final-1", 3),
      userMessage("u2", 4),
      assistantMessage("progress-2", 5),
    ]);

    expect(index.groups.map((group) => group.id)).toEqual([
      "thinking:u1:t1:final",
      "thinking:u2:progress-2:active",
    ]);
    expect(index.groups.map((group) => group.itemIds)).toEqual([["t1"], ["progress-2"]]);
  });

  it("handles multiple turns independently", () => {
    const index = buildCompletedThinkingGroups([
      userMessage("u1", 1),
      thought("t1", 2),
      assistantMessage("a1", 3),
      userMessage("u2", 4),
      toolCall("tool-1", 5),
      assistantMessage("a2", 6),
    ]);

    expect(index.groups.map((group) => group.id)).toEqual([
      "thinking:u1:t1:final",
      "thinking:u2:tool-1:final",
    ]);
    expect(index.groups.map((group) => group.itemIds)).toEqual([["t1"], ["tool-1"]]);
  });

  it("produces the same groups before web and native render ordering", () => {
    const tail = [userMessage("u1", 1), toolCall("tool-1", 2)];
    const head = [thought("t1", 3), assistantMessage("a1", 4)];
    const chronological = [...tail, ...head];
    const web = createOrderingStrategy({ orderTailReverse: false, orderHeadReverse: false });
    const native = createOrderingStrategy({ orderTailReverse: true, orderHeadReverse: true });

    expect(groupItemIds(chronological)).toEqual([["tool-1", "t1"]]);
    expect(
      orderTailForStreamRenderStrategy({ strategy: web, streamItems: tail }).map((item) => item.id),
    ).toEqual(["u1", "tool-1"]);
    expect(
      orderTailForStreamRenderStrategy({ strategy: native, streamItems: tail }).map(
        (item) => item.id,
      ),
    ).toEqual(["tool-1", "u1"]);
    expect(
      orderHeadForStreamRenderStrategy({ strategy: native, streamHead: head }).map(
        (item) => item.id,
      ),
    ).toEqual(["a1", "t1"]);
  });
});

describe("thinking group preview helpers", () => {
  it("counts message-like items and tool calls separately", () => {
    expect(
      getThinkingGroupCounts([assistantMessage("a1", 1), thought("t1", 2), toolCall("tool-1", 3)]),
    ).toEqual({ messageCount: 2, toolCallCount: 1 });
  });

  it("extracts only message-like preview text", () => {
    expect(
      getThinkingGroupPreviewMessages([
        toolCall("tool-1", 1),
        assistantMessage("a1", 2),
        thought("t1", 3),
      ]),
    ).toEqual([
      { id: "a1", text: "a1" },
      { id: "t1", text: "t1" },
    ]);
  });

  it("shows previews only for active collapsed groups with message text", () => {
    expect(
      shouldShowThinkingGroupPreview({
        expanded: false,
        groupStatus: "active",
        messageCount: 1,
      }),
    ).toBe(true);
    expect(
      shouldShowThinkingGroupPreview({
        expanded: true,
        groupStatus: "active",
        messageCount: 1,
      }),
    ).toBe(false);
    expect(
      shouldShowThinkingGroupPreview({
        expanded: false,
        groupStatus: "completed",
        messageCount: 1,
      }),
    ).toBe(false);
    expect(
      shouldShowThinkingGroupPreview({
        expanded: false,
        groupStatus: "active",
        messageCount: 0,
      }),
    ).toBe(false);
  });
});
