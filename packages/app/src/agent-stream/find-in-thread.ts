import MarkdownIt from "markdown-it";
import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { buildToolCallDisplayModel } from "@/utils/tool-call-display";
import type { StreamItem, ToolCallItem } from "@/types/stream";
import type { ThinkingGroupIndex } from "./collapse-thinking";

const markdownVisibleTextParser = MarkdownIt({ typographer: true, linkify: true });

interface MarkdownVisibleToken {
  type: string;
  content: string;
  children?: MarkdownVisibleToken[];
}

export function extractMarkdownVisibleText(message: string): string {
  if (!message) {
    return "";
  }
  const tokens = markdownVisibleTextParser.parse(message, {}) as MarkdownVisibleToken[];
  let result = "";
  const walk = (entries: MarkdownVisibleToken[]) => {
    for (const token of entries) {
      if (token.children && token.children.length > 0) {
        walk(token.children);
        continue;
      }
      if (token.type === "text" || token.type === "code_inline") {
        result += token.content;
      }
    }
  };
  walk(tokens);
  return result;
}

export const FIND_PART_MESSAGE = "message";
export const FIND_PART_TOOL_TITLE = "tool:title";
export const FIND_PART_TOOL_SUMMARY = "tool:summary";
export const FIND_PART_TOOL_DETAIL = "tool:detail";
export const FIND_PART_TOOL_ERROR = "tool:error";
export const FIND_PART_SPEAK_MESSAGE = "speak:message";

export interface FindInThreadOptions {
  includeThinking: boolean;
}

export interface FindRecord {
  id: string;
  itemId: string;
  part: string;
  text: string;
}

export interface FindInThreadMatch {
  id: string;
  recordId: string;
  itemId: string;
  part: string;
  start: number;
  end: number;
}

export interface FindHighlightRange {
  id: string;
  start: number;
  end: number;
  active: boolean;
}

export type FindHighlightsByItemId = Map<string, Map<string, FindHighlightRange[]>>;

export function buildFindRecords(input: {
  items: readonly StreamItem[];
  thinkingGroupIndex: ThinkingGroupIndex;
  options: FindInThreadOptions;
}): FindRecord[] {
  const records: FindRecord[] = [];
  for (const item of input.items) {
    appendFindRecordsForItem(records, item, input.thinkingGroupIndex, input.options);
  }
  return records;
}

export function findNextMatchInRecord(input: {
  record: FindRecord;
  normalizedQuery: string;
  fromOffset: number;
}): FindInThreadMatch | null {
  if (!input.normalizedQuery) {
    return null;
  }
  const normalizedText = input.record.text.toLocaleLowerCase();
  const start = normalizedText.indexOf(input.normalizedQuery, input.fromOffset);
  if (start < 0) {
    return null;
  }
  const end = start + input.normalizedQuery.length;
  return {
    id: `${input.record.id}:${start}`,
    recordId: input.record.id,
    itemId: input.record.itemId,
    part: input.record.part,
    start,
    end,
  };
}

export function findMatchesInRecords(input: {
  records: readonly FindRecord[];
  query: string;
}): FindInThreadMatch[] {
  const normalizedQuery = normalizeFindQuery(input.query);
  if (!normalizedQuery) {
    return [];
  }
  const matches: FindInThreadMatch[] = [];
  for (const record of input.records) {
    let offset = 0;
    while (offset <= record.text.length) {
      const match = findNextMatchInRecord({ record, normalizedQuery, fromOffset: offset });
      if (!match) {
        break;
      }
      matches.push(match);
      offset = match.end;
    }
  }
  return matches;
}

export function normalizeFindQuery(query: string): string {
  return query.length === 0 ? "" : query.toLocaleLowerCase();
}

export function buildFindHighlights(input: {
  matches: readonly FindInThreadMatch[];
  activeMatchId: string | null;
}): FindHighlightsByItemId {
  const highlights: FindHighlightsByItemId = new Map();
  for (const match of input.matches) {
    let parts = highlights.get(match.itemId);
    if (!parts) {
      parts = new Map();
      highlights.set(match.itemId, parts);
    }
    const ranges = parts.get(match.part) ?? [];
    ranges.push({
      id: match.id,
      start: match.start,
      end: match.end,
      active: match.id === input.activeMatchId,
    });
    parts.set(match.part, ranges);
  }
  return highlights;
}

export function getFindHighlightRanges(
  highlights: FindHighlightsByItemId | undefined,
  itemId: string,
  part: string,
): FindHighlightRange[] {
  return highlights?.get(itemId)?.get(part) ?? [];
}

function appendFindRecordsForItem(
  records: FindRecord[],
  item: StreamItem,
  thinkingGroupIndex: ThinkingGroupIndex,
  options: FindInThreadOptions,
): void {
  const isThinkingItem = thinkingGroupIndex.groupByItemId.has(item.id);
  if (item.kind === "user_message") {
    appendRecord(records, item.id, FIND_PART_MESSAGE, item.text);
    return;
  }
  if (item.kind === "assistant_message") {
    if (options.includeThinking || !isThinkingItem) {
      appendRecord(records, item.id, FIND_PART_MESSAGE, extractMarkdownVisibleText(item.text));
    }
    return;
  }
  if (!options.includeThinking || !isThinkingItem) {
    return;
  }
  if (item.kind === "thought") {
    appendRecord(records, item.id, FIND_PART_MESSAGE, item.text);
    return;
  }
  if (item.kind === "tool_call") {
    appendToolCallRecords(records, item);
    return;
  }
  if (item.kind === "todo_list") {
    item.items.forEach((todo, index) => {
      appendRecord(records, item.id, `todo:${index}`, todo.text);
    });
  }
}

function appendRecord(records: FindRecord[], itemId: string, part: string, text: string): void {
  if (!text.trim()) {
    return;
  }
  records.push({
    id: `${itemId}:${part}`,
    itemId,
    part,
    text,
  });
}

function appendToolCallRecords(records: FindRecord[], item: ToolCallItem): void {
  const detail = getToolCallDetail(item);
  const displayModel = buildToolCallDisplayModel({
    name: getToolCallName(item),
    status: getToolCallDisplayStatus(item),
    error: getToolCallError(item),
    detail: detail ?? { type: "unknown", input: null, output: null },
    metadata: getToolCallMetadata(item),
    cwd: undefined,
  });
  appendRecord(records, item.id, FIND_PART_TOOL_TITLE, displayModel.displayName);
  appendRecord(records, item.id, FIND_PART_TOOL_SUMMARY, displayModel.summary ?? "");
  const speakMessage = getSpeakMessage(item);
  if (speakMessage) {
    appendRecord(records, item.id, FIND_PART_SPEAK_MESSAGE, speakMessage);
  }
  appendRecord(records, item.id, FIND_PART_TOOL_DETAIL, stringifySearchableValue(detail));
  appendRecord(
    records,
    item.id,
    FIND_PART_TOOL_ERROR,
    stringifySearchableValue(getToolCallError(item)),
  );
}

function getToolCallName(item: ToolCallItem): string {
  if (item.payload.source === "agent") {
    return item.payload.data.name;
  }
  return item.payload.data.toolName;
}

function getToolCallDisplayStatus(
  item: ToolCallItem,
): "running" | "completed" | "failed" | "canceled" {
  const status = item.payload.data.status;
  if (status === "executing") {
    return "running";
  }
  return status;
}

function getToolCallError(item: ToolCallItem): unknown {
  if (item.payload.source === "agent") {
    return item.payload.data.error;
  }
  return item.payload.data.error;
}

function getToolCallDetail(item: ToolCallItem): ToolCallDetail | undefined {
  if (item.payload.source === "agent") {
    return item.payload.data.detail;
  }
  const data = item.payload.data;
  if (data.arguments !== undefined || data.result !== undefined) {
    return {
      type: "unknown",
      input: data.arguments ?? null,
      output: data.result ?? null,
    };
  }
  return undefined;
}

function getToolCallMetadata(item: ToolCallItem): Record<string, unknown> | undefined {
  return item.payload.source === "agent" ? item.payload.data.metadata : undefined;
}

function getSpeakMessage(item: ToolCallItem): string {
  if (item.payload.source !== "agent" || item.payload.data.name !== "speak") {
    return "";
  }
  const detail = item.payload.data.detail;
  if (detail.type !== "unknown" || typeof detail.input !== "string") {
    return "";
  }
  return detail.input;
}

function stringifySearchableValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
