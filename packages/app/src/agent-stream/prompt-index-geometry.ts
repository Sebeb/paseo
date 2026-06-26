import type { AgentTimelinePromptIndexRow } from "@getpaseo/protocol/messages";

const TOOL_ROW_HEIGHT_ESTIMATE = 40;

export interface PromptIndexGeometry {
  unloadedSpacerHeight: number;
  unloadedPromptOffsetsById: Map<string, number>;
}

export function estimatePromptIndexRowHeight(row: AgentTimelinePromptIndexRow): number {
  switch (row.kind) {
    case "user_message":
      return row.hasImages ? 220 : 96;
    case "assistant_message":
      if (typeof row.textLength === "number" && row.textLength > 1200) {
        return 360;
      }
      return 220;
    case "tool_call":
    case "thought":
      return TOOL_ROW_HEIGHT_ESTIMATE;
    case "todo_list":
      return 144;
    case "activity_log":
      return 88;
    case "compaction":
      return 72;
  }
}

export function buildPromptIndexGeometry(input: {
  rows: readonly AgentTimelinePromptIndexRow[];
  loadedStartSeq: number | null;
}): PromptIndexGeometry {
  const unloadedPromptOffsetsById = new Map<string, number>();
  if (input.loadedStartSeq === null) {
    return {
      unloadedSpacerHeight: 0,
      unloadedPromptOffsetsById,
    };
  }

  let offset = 0;
  for (const row of input.rows) {
    if (row.seqEnd >= input.loadedStartSeq) {
      break;
    }
    if (row.kind === "user_message") {
      unloadedPromptOffsetsById.set(row.id, offset);
    }
    offset += estimatePromptIndexRowHeight(row);
  }

  return {
    unloadedSpacerHeight: offset,
    unloadedPromptOffsetsById,
  };
}
