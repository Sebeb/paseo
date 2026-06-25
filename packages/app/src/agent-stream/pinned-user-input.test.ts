import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import {
  collectEstimatedPinnedUserInputCandidates,
  findEstimatedStreamItemTop,
  selectPinnedUserInput,
  type PinnedUserInputCandidate,
} from "./pinned-user-input";

function userMessage(id: string): Extract<StreamItem, { kind: "user_message" }> {
  return {
    kind: "user_message",
    id,
    text: id,
    timestamp: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function assistantMessage(id: string): Extract<StreamItem, { kind: "assistant_message" }> {
  return {
    kind: "assistant_message",
    id,
    text: id,
    timestamp: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function candidate(input: {
  id: string;
  top: number;
  bottom: number;
  responseRanges: Array<{ id: string; top: number; bottom: number }>;
}): PinnedUserInputCandidate {
  return {
    input: {
      item: userMessage(input.id),
      top: input.top,
      bottom: input.bottom,
    },
    responseItems: input.responseRanges.map((response) => ({
      item: assistantMessage(response.id),
      top: response.top,
      bottom: response.bottom,
    })),
  };
}

describe("selectPinnedUserInput", () => {
  it("returns null when disabled", () => {
    expect(
      selectPinnedUserInput({
        enabled: false,
        candidates: [
          candidate({
            id: "u1",
            top: 0,
            bottom: 80,
            responseRanges: [{ id: "a1", top: 120, bottom: 420 }],
          }),
        ],
        viewportTop: 120,
        viewportBottom: 520,
      }),
    ).toBeNull();
  });

  it("selects an input when its response is visible and the real input is off-screen", () => {
    expect(
      selectPinnedUserInput({
        enabled: true,
        candidates: [
          candidate({
            id: "u1",
            top: 0,
            bottom: 80,
            responseRanges: [{ id: "a1", top: 120, bottom: 420 }],
          }),
        ],
        viewportTop: 120,
        viewportBottom: 360,
      }),
    ).toEqual({
      item: expect.objectContaining({ id: "u1" }),
      sourceTop: 0,
      sourceBottom: 80,
    });
  });

  it("returns null when any real input is visible", () => {
    expect(
      selectPinnedUserInput({
        enabled: true,
        candidates: [
          candidate({
            id: "u1",
            top: 0,
            bottom: 80,
            responseRanges: [{ id: "a1", top: 120, bottom: 420 }],
          }),
          candidate({
            id: "u2",
            top: 500,
            bottom: 580,
            responseRanges: [{ id: "a2", top: 610, bottom: 900 }],
          }),
        ],
        viewportTop: 540,
        viewportBottom: 820,
      }),
    ).toBeNull();
  });

  it("selects the visible response turn nearest the viewport bottom", () => {
    expect(
      selectPinnedUserInput({
        enabled: true,
        candidates: [
          candidate({
            id: "u1",
            top: 0,
            bottom: 80,
            responseRanges: [{ id: "a1", top: 120, bottom: 700 }],
          }),
          candidate({
            id: "u2",
            top: 480,
            bottom: 550,
            responseRanges: [{ id: "a2", top: 560, bottom: 900 }],
          }),
        ],
        viewportTop: 555,
        viewportBottom: 760,
      })?.item.id,
    ).toBe("u2");
  });

  it("returns null when no response item is visible", () => {
    expect(
      selectPinnedUserInput({
        enabled: true,
        candidates: [
          candidate({
            id: "u1",
            top: 0,
            bottom: 80,
            responseRanges: [{ id: "a1", top: 120, bottom: 420 }],
          }),
        ],
        viewportTop: 500,
        viewportBottom: 900,
      }),
    ).toBeNull();
  });
});

describe("collectEstimatedPinnedUserInputCandidates", () => {
  it("groups response items under the preceding input", () => {
    const items: StreamItem[] = [
      userMessage("u1"),
      assistantMessage("a1"),
      assistantMessage("a2"),
      userMessage("u2"),
      assistantMessage("a3"),
    ];
    const heightById = new Map<string, number>([
      ["u1", 80],
      ["a1", 220],
      ["a2", 180],
      ["u2", 90],
      ["a3", 240],
    ]);

    expect(
      collectEstimatedPinnedUserInputCandidates({
        items,
        estimateHeight: (item) => heightById.get(item.id) ?? 0,
      }),
    ).toEqual([
      {
        input: { item: expect.objectContaining({ id: "u1" }), top: 0, bottom: 80 },
        responseItems: [
          { item: expect.objectContaining({ id: "a1" }), top: 80, bottom: 300 },
          { item: expect.objectContaining({ id: "a2" }), top: 300, bottom: 480 },
        ],
      },
      {
        input: { item: expect.objectContaining({ id: "u2" }), top: 480, bottom: 570 },
        responseItems: [{ item: expect.objectContaining({ id: "a3" }), top: 570, bottom: 810 }],
      },
    ]);
  });
});

describe("findEstimatedStreamItemTop", () => {
  it("returns the estimated top in stream order", () => {
    const items: StreamItem[] = [userMessage("u1"), assistantMessage("a1"), userMessage("u2")];
    const heightById = new Map<string, number>([
      ["u1", 80],
      ["a1", 320],
      ["u2", 90],
    ]);

    expect(
      findEstimatedStreamItemTop({
        items,
        itemId: "u2",
        estimateHeight: (item) => heightById.get(item.id) ?? 0,
      }),
    ).toBe(400);
  });
});
