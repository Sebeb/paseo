import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import { selectPinnedUserInput, type PinnedUserInputCandidate } from "./pinned-user-input";

function userMessage(id: string): Extract<StreamItem, { kind: "user_message" }> {
  return {
    kind: "user_message",
    id,
    text: id,
    timestamp: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function candidate(id: string, top: number, bottom: number): PinnedUserInputCandidate {
  return {
    item: userMessage(id),
    top,
    bottom,
  };
}

describe("selectPinnedUserInput", () => {
  it("returns null when disabled", () => {
    expect(
      selectPinnedUserInput({
        enabled: false,
        candidates: [candidate("u1", 0, 80)],
        viewportTop: 120,
        viewportBottom: 520,
      }),
    ).toBeNull();
  });

  it("selects the latest user input at or above the viewport bottom", () => {
    expect(
      selectPinnedUserInput({
        enabled: true,
        candidates: [candidate("u1", 0, 80), candidate("u2", 500, 580)],
        viewportTop: 620,
        viewportBottom: 1000,
      })?.item.id,
    ).toBe("u2");
  });

  it("hides the relevant user input while it is visible in the viewport", () => {
    expect(
      selectPinnedUserInput({
        enabled: true,
        candidates: [candidate("u1", 0, 80), candidate("u2", 500, 580)],
        viewportTop: 520,
        viewportBottom: 920,
      }),
    ).toBeNull();
  });

  it("switches to the next user input when the viewport bottom enters the next turn", () => {
    expect(
      selectPinnedUserInput({
        enabled: true,
        candidates: [candidate("u1", 0, 80), candidate("u2", 700, 780)],
        viewportTop: 820,
        viewportBottom: 1100,
      })?.item.id,
    ).toBe("u2");
  });

  it("returns null when no user inputs are above the viewport bottom", () => {
    expect(
      selectPinnedUserInput({
        enabled: true,
        candidates: [candidate("u1", 500, 580)],
        viewportTop: 0,
        viewportBottom: 300,
      }),
    ).toBeNull();
  });
});
