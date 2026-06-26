import type { AgentTimelinePromptIndexRow } from "@getpaseo/protocol/messages";
import type { AgentTimelineItem } from "./agent-sdk-types.js";
import type { TimelineProjectionEntry } from "./timeline-projection.js";

function simpleTimelineHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    const char = value.charCodeAt(index);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function createTimelinePromptIndexId(prefix: string, text: string, timestamp: string): string {
  return `${prefix}_${new Date(timestamp).getTime()}_${simpleTimelineHash(text)}`;
}

function previewText(text: string): string {
  const trimmed = text.trim();
  return trimmed.length <= 180 ? trimmed : `${trimmed.slice(0, 177).trimEnd()}...`;
}

export function createPromptIndexRow(input: {
  item: AgentTimelineItem;
  timestamp: string;
  seqStart: number;
  seqEnd: number;
}): AgentTimelinePromptIndexRow {
  const { item, timestamp, seqStart, seqEnd } = input;
  const id = createTimelinePromptIndexId(item.type, JSON.stringify(item), timestamp);

  switch (item.type) {
    case "user_message":
      return {
        id: item.messageId ?? id,
        kind: "user_message",
        seqStart,
        seqEnd,
        textPreview: previewText(item.text),
        hasImages: false,
        hasAttachments: false,
        textLength: item.text.length,
      };
    case "assistant_message":
      return {
        id: item.messageId ?? id,
        kind: "assistant_message",
        seqStart,
        seqEnd,
        textLength: item.text.length,
      };
    case "reasoning":
      return {
        id,
        kind: "thought",
        seqStart,
        seqEnd,
        textLength: item.text.length,
      };
    case "tool_call":
      return {
        id,
        kind: "tool_call",
        seqStart,
        seqEnd,
      };
    case "todo":
      return {
        id,
        kind: "todo_list",
        seqStart,
        seqEnd,
      };
    case "error":
      return {
        id,
        kind: "activity_log",
        seqStart,
        seqEnd,
        textLength: item.message.length,
      };
    case "compaction":
      return {
        id,
        kind: "compaction",
        seqStart,
        seqEnd,
      };
  }
}

export function createPromptIndexRows(
  entries: readonly TimelineProjectionEntry[],
): AgentTimelinePromptIndexRow[] {
  return entries.map((entry) =>
    createPromptIndexRow({
      item: entry.item,
      timestamp: entry.timestamp,
      seqStart: entry.seqStart,
      seqEnd: entry.seqEnd,
    }),
  );
}
