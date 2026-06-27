import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import { buildCollapseThinkingGroups } from "./collapse-thinking";
import {
  buildFindHighlights,
  buildFindRecords,
  FIND_PART_MESSAGE,
  FIND_PART_TOOL_DETAIL,
  FIND_PART_TOOL_TITLE,
  findMatchesInRecords,
  getFindHighlightRanges,
} from "./find-in-thread";

function timestamp(seed: number): Date {
  return new Date(`2026-01-01T00:00:${seed.toString().padStart(2, "0")}.000Z`);
}

function userMessage(id: string, text: string, seed: number): StreamItem {
  return { kind: "user_message", id, text, timestamp: timestamp(seed) };
}

function assistantMessage(id: string, text: string, seed: number): StreamItem {
  return { kind: "assistant_message", id, text, timestamp: timestamp(seed) };
}

function thought(id: string, text: string, seed: number): StreamItem {
  return { kind: "thought", id, text, timestamp: timestamp(seed), status: "ready" };
}

function todoList(id: string, seed: number): StreamItem {
  return {
    kind: "todo_list",
    id,
    provider: "codex",
    timestamp: timestamp(seed),
    items: [
      { text: "Find the worker bug", completed: false },
      { text: "Ship final answer", completed: true },
    ],
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
        arguments: "npm run worker-check",
        result: "worker check passed",
        status: "completed",
      },
    },
  };
}

function recordsFor(items: StreamItem[], includeThinking: boolean) {
  return buildFindRecords({
    items,
    thinkingGroupIndex: buildCollapseThinkingGroups({
      items,
      behavior: "completed",
      agentStatus: "idle",
    }),
    options: { includeThinking },
  });
}

describe("find in thread policy", () => {
  it("searches user inputs and final assistant messages by default", () => {
    const items = [
      userMessage("u1", "Find worker", 1),
      thought("t1", "hidden worker thought", 2),
      assistantMessage("a1", "Final worker answer", 3),
    ];

    const records = recordsFor(items, false);

    expect(records.map((record) => [record.itemId, record.part, record.text])).toEqual([
      ["u1", FIND_PART_MESSAGE, "Find worker"],
      ["a1", FIND_PART_MESSAGE, "Final worker answer"],
    ]);
    expect(findMatchesInRecords({ records, query: "WORKER" }).map((match) => match.itemId)).toEqual(
      ["u1", "a1"],
    );
  });

  it("includes collapse-thinking grouped items when requested", () => {
    const items = [
      userMessage("u1", "start", 1),
      assistantMessage("progress", "intermediate worker note", 2),
      thought("t1", "worker reasoning", 3),
      toolCall("tool1", 4),
      todoList("todo1", 5),
      assistantMessage("final", "final answer", 6),
    ];

    const records = recordsFor(items, true);

    expect(records.map((record) => [record.itemId, record.part])).toContainEqual([
      "progress",
      FIND_PART_MESSAGE,
    ]);
    expect(records.map((record) => [record.itemId, record.part])).toContainEqual([
      "t1",
      FIND_PART_MESSAGE,
    ]);
    expect(records.map((record) => [record.itemId, record.part])).toContainEqual([
      "tool1",
      FIND_PART_TOOL_TITLE,
    ]);
    expect(records.map((record) => [record.itemId, record.part])).toContainEqual([
      "tool1",
      FIND_PART_TOOL_DETAIL,
    ]);
    expect(records.map((record) => [record.itemId, record.part])).toContainEqual([
      "todo1",
      "todo:0",
    ]);
    expect(findMatchesInRecords({ records, query: "worker" }).map((match) => match.itemId)).toEqual(
      ["progress", "t1", "tool1", "tool1", "todo1"],
    );
  });

  it("orders non-overlapping case-insensitive matches by record and offset", () => {
    const records = recordsFor(
      [userMessage("u1", "aaaa", 1), assistantMessage("a1", "Aa worker aa", 2)],
      false,
    );

    const matches = findMatchesInRecords({ records, query: "aa" });

    expect(matches.map((match) => [match.itemId, match.start, match.end])).toEqual([
      ["u1", 0, 2],
      ["u1", 2, 4],
      ["a1", 0, 2],
      ["a1", 10, 12],
    ]);
  });

  it("builds active and inactive highlight ranges by item and part", () => {
    const records = recordsFor([userMessage("u1", "find find", 1)], false);
    const matches = findMatchesInRecords({ records, query: "find" });

    const highlights = buildFindHighlights({ matches, activeMatchId: matches[1]?.id ?? null });

    expect(getFindHighlightRanges(highlights, "u1", FIND_PART_MESSAGE)).toEqual([
      { id: matches[0]?.id, start: 0, end: 4, active: false },
      { id: matches[1]?.id, start: 5, end: 9, active: true },
    ]);
  });
});
