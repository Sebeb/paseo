import { describe, expect, it } from "vitest";
import { createPromptIndexRows } from "./timeline-prompt-index.js";
import type { TimelineProjectionEntry } from "./timeline-projection.js";

function entry(input: {
  item: TimelineProjectionEntry["item"];
  seqStart: number;
  seqEnd?: number;
}): TimelineProjectionEntry {
  return {
    item: input.item,
    timestamp: "2026-06-25T12:00:00.000Z",
    seqStart: input.seqStart,
    seqEnd: input.seqEnd ?? input.seqStart,
    sourceSeqRanges: [{ startSeq: input.seqStart, endSeq: input.seqEnd ?? input.seqStart }],
    collapsed: [],
  };
}

describe("createPromptIndexRows", () => {
  it("keeps user prompt previews but omits full assistant text", () => {
    const rows = createPromptIndexRows([
      entry({
        seqStart: 1,
        item: {
          type: "user_message",
          messageId: "user-id",
          text: "Summarize this thread",
        },
      }),
      entry({
        seqStart: 2,
        seqEnd: 3,
        item: {
          type: "assistant_message",
          messageId: "assistant-id",
          text: "Long assistant response that should not be sent in the prompt index",
        },
      }),
    ]);

    expect(rows).toEqual([
      {
        id: "user-id",
        kind: "user_message",
        seqStart: 1,
        seqEnd: 1,
        textPreview: "Summarize this thread",
        hasImages: false,
        hasAttachments: false,
        textLength: 21,
      },
      {
        id: "assistant-id",
        kind: "assistant_message",
        seqStart: 2,
        seqEnd: 3,
        textLength: 67,
      },
    ]);
  });
});
