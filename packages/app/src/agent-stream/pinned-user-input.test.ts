import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import {
  collectEstimatedPinnedUserInputCandidates,
  findEstimatedStreamItemTop,
  selectPinnedUserInput,
  type PinnedUserInputCandidate,
} from "./pinned-user-input";

const DEFAULT_PINNED_BOTTOM = 133;

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
        pinnedBottom: DEFAULT_PINNED_BOTTOM,
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
        pinnedBottom: DEFAULT_PINNED_BOTTOM,
      }),
    ).toEqual({
      item: expect.objectContaining({ id: "u1" }),
      sourceTop: 0,
      sourceBottom: 80,
      translateY: 0,
    });
  });

  it("selects an input when it is the only user input visible in the top half", () => {
    const result = selectPinnedUserInput({
      enabled: true,
      candidates: [
        candidate({
          id: "u1",
          top: 0,
          bottom: 80,
          responseRanges: [{ id: "a1", top: 120, bottom: 420 }],
        }),
      ],
      viewportTop: 0,
      viewportBottom: 300,
      pinnedBottom: DEFAULT_PINNED_BOTTOM,
    });
    expect(result?.item.id).toBe("u1");
  });

  it("hides when the active candidate's bottom is at or below the pinned bottom in viewport", () => {
    // u1.bottom = 200, viewportTop = 0, pinnedBottom = 133.
    // u1 has not cleared the pinned overlay's bottom, so the real bubble remains.
    expect(
      selectPinnedUserInput({
        enabled: true,
        candidates: [
          candidate({
            id: "u1",
            top: 0,
            bottom: 200,
            responseRanges: [{ id: "a1", top: 200, bottom: 600 }],
          }),
        ],
        viewportTop: 0,
        viewportBottom: 400,
        pinnedBottom: DEFAULT_PINNED_BOTTOM,
      }),
    ).toBeNull();
  });

  it("selects the next user_message once its real bottom rises above the pinned bottom", () => {
    // u1.bottom = 80, u2.bottom = 580, pinnedBottom = 133.
    // At viewportTop = 460: u2.bottom_in_viewport = 120 < 133, so u2 is now the active.
    const result = selectPinnedUserInput({
      enabled: true,
      candidates: [
        candidate({
          id: "u1",
          top: 0,
          bottom: 80,
          responseRanges: [{ id: "a1", top: 80, bottom: 480 }],
        }),
        candidate({
          id: "u2",
          top: 480,
          bottom: 580,
          responseRanges: [{ id: "a2", top: 580, bottom: 900 }],
        }),
      ],
      viewportTop: 460,
      viewportBottom: 760,
      pinnedBottom: DEFAULT_PINNED_BOTTOM,
    });
    expect(result?.item.id).toBe("u2");
    expect(result?.translateY).toBe(0);
  });

  it("hides when a different user input is visible in the top half", () => {
    // u2 is visible between viewport y=80..150 while u1 would otherwise pin.
    const result = selectPinnedUserInput({
      enabled: true,
      candidates: [
        candidate({
          id: "u1",
          top: 0,
          bottom: 80,
          responseRanges: [{ id: "a1", top: 80, bottom: 480 }],
        }),
        candidate({
          id: "u2",
          top: 480,
          bottom: 580,
          responseRanges: [{ id: "a2", top: 580, bottom: 900 }],
        }),
      ],
      viewportTop: 400,
      viewportBottom: 700,
      pinnedBottom: DEFAULT_PINNED_BOTTOM,
    });
    expect(result).toBeNull();
  });

  it("hides when the active input and another user input are both visible in the top half", () => {
    const result = selectPinnedUserInput({
      enabled: true,
      candidates: [
        candidate({
          id: "u1",
          top: 0,
          bottom: 80,
          responseRanges: [{ id: "a1", top: 80, bottom: 120 }],
        }),
        candidate({
          id: "u2",
          top: 120,
          bottom: 220,
          responseRanges: [{ id: "a2", top: 220, bottom: 520 }],
        }),
      ],
      viewportTop: 0,
      viewportBottom: 300,
      pinnedBottom: DEFAULT_PINNED_BOTTOM,
    });
    expect(result).toBeNull();
  });

  it("applies a negative translateY push when the next user_message enters the pinned zone", () => {
    // u1.bottom = 80, u2.top = 480, pinnedBottom = 133.
    // At viewportTop = 400: u2.top_in_viewport = 80 < 133 → push.
    // translateY = 80 - 133 = -53.
    const result = selectPinnedUserInput({
      enabled: true,
      candidates: [
        candidate({
          id: "u1",
          top: 0,
          bottom: 80,
          responseRanges: [{ id: "a1", top: 80, bottom: 480 }],
        }),
        candidate({
          id: "u2",
          top: 480,
          bottom: 580,
          responseRanges: [{ id: "a2", top: 580, bottom: 900 }],
        }),
      ],
      viewportTop: 400,
      viewportBottom: 560,
      pinnedBottom: DEFAULT_PINNED_BOTTOM,
    });
    expect(result?.item.id).toBe("u1");
    expect(result?.translateY).toBe(-53);
  });

  it("does not push when the next user_message has not yet reached the pinned bottom", () => {
    // At viewportTop = 200: u2.top_in_viewport = 280 ≥ 133. No push.
    const result = selectPinnedUserInput({
      enabled: true,
      candidates: [
        candidate({
          id: "u1",
          top: 0,
          bottom: 80,
          responseRanges: [{ id: "a1", top: 80, bottom: 480 }],
        }),
        candidate({
          id: "u2",
          top: 480,
          bottom: 580,
          responseRanges: [{ id: "a2", top: 580, bottom: 900 }],
        }),
      ],
      viewportTop: 200,
      viewportBottom: 500,
      pinnedBottom: DEFAULT_PINNED_BOTTOM,
    });
    expect(result?.item.id).toBe("u1");
    expect(result?.translateY).toBe(0);
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
        pinnedBottom: DEFAULT_PINNED_BOTTOM,
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
        pinnedBottom: DEFAULT_PINNED_BOTTOM,
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
