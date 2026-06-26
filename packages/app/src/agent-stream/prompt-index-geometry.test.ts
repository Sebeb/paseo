import { describe, expect, it } from "vitest";
import type { AgentTimelinePromptIndexRow } from "@getpaseo/protocol/messages";
import { buildPromptIndexGeometry } from "./prompt-index-geometry";

function row(
  id: string,
  kind: AgentTimelinePromptIndexRow["kind"],
  seqStart: number,
  options: Partial<AgentTimelinePromptIndexRow> = {},
): AgentTimelinePromptIndexRow {
  return {
    id,
    kind,
    seqStart,
    seqEnd: seqStart,
    ...options,
  };
}

describe("buildPromptIndexGeometry", () => {
  it("places unloaded prompt markers by estimated full-history offsets", () => {
    const geometry = buildPromptIndexGeometry({
      loadedStartSeq: 4,
      rows: [
        row("u1", "user_message", 1),
        row("a1", "assistant_message", 2),
        row("u2", "user_message", 3, { hasImages: true }),
        row("a2", "assistant_message", 4),
      ],
    });

    expect(geometry.unloadedSpacerHeight).toBe(96 + 220 + 220);
    expect(Array.from(geometry.unloadedPromptOffsetsById.entries())).toEqual([
      ["u1", 0],
      ["u2", 316],
    ]);
  });

  it("shrinks the unloaded spacer as older rows load", () => {
    const rows = [
      row("u1", "user_message", 1),
      row("a1", "assistant_message", 2),
      row("u2", "user_message", 3),
      row("a2", "assistant_message", 4),
    ];

    const first = buildPromptIndexGeometry({ rows, loadedStartSeq: 4 });
    const second = buildPromptIndexGeometry({ rows, loadedStartSeq: 2 });

    expect(first.unloadedSpacerHeight).toBe(96 + 220 + 96);
    expect(second.unloadedSpacerHeight).toBe(96);
    expect(Array.from(second.unloadedPromptOffsetsById.entries())).toEqual([["u1", 0]]);
  });
});
