import type { StreamItem } from "@/types/stream";
import type { CollapseThinkingBehavior } from "@/hooks/use-settings";

export interface ThinkingGroup {
  id: string;
  anchorItemId: string;
  itemIds: string[];
  defaultExpanded: boolean;
  status: "active" | "completed";
  finalAssistantItemId: string | null;
}

export interface ThinkingGroupIndex {
  groups: ThinkingGroup[];
  groupByAnchorItemId: Map<string, ThinkingGroup>;
  groupByItemId: Map<string, ThinkingGroup>;
}

export interface ThinkingGroupCounts {
  messageCount: number;
  toolCallCount: number;
}

export interface ThinkingGroupPreviewMessage {
  id: string;
  text: string;
}

export function buildCollapseThinkingGroups(input: {
  items: readonly StreamItem[];
  behavior: Exclude<CollapseThinkingBehavior, "never">;
  agentStatus: string;
}): ThinkingGroupIndex {
  const { items, behavior, agentStatus } = input;
  const groups: ThinkingGroup[] = [];
  let turnStartIndex = findNextUserMessageIndex(items, 0);

  while (turnStartIndex !== null) {
    const turnEndIndex = findNextUserMessageIndex(items, turnStartIndex + 1) ?? items.length;
    const turnItems = items.slice(turnStartIndex + 1, turnEndIndex);
    const isCurrentRunningTurn = agentStatus === "running" && turnEndIndex === items.length;
    const finalAssistantIndex = isCurrentRunningTurn
      ? null
      : findLastAssistantMessageIndex(turnItems);
    const finalAssistantStartIndex =
      finalAssistantIndex === null || isCurrentRunningTurn
        ? turnItems.length
        : findAssistantSuffixStartIndex(turnItems);
    const status = isCurrentRunningTurn ? "active" : "completed";
    const defaultExpanded = status === "active" && behavior === "completed";
    const groupItems = turnItems.filter(
      (item, index) => index < finalAssistantStartIndex && isThinkingGroupItem(item),
    );
    const finalAssistantItem =
      finalAssistantIndex === null ? null : (turnItems[finalAssistantIndex] ?? null);

    if (groupItems.length > 0) {
      const userMessage = items[turnStartIndex];
      const anchorItem = groupItems[0];
      if (userMessage && anchorItem) {
        groups.push({
          id: `thinking:${userMessage.id}:${status === "active" ? "active" : "final"}`,
          anchorItemId: anchorItem.id,
          itemIds: groupItems.map((item) => item.id),
          defaultExpanded,
          status,
          finalAssistantItemId: finalAssistantItem?.id ?? null,
        });
      }
    }

    turnStartIndex = findNextUserMessageIndex(items, turnEndIndex);
  }

  const groupByAnchorItemId = new Map<string, ThinkingGroup>();
  const groupByItemId = new Map<string, ThinkingGroup>();
  for (const group of groups) {
    groupByAnchorItemId.set(group.anchorItemId, group);
    for (const itemId of group.itemIds) {
      groupByItemId.set(itemId, group);
    }
  }

  return {
    groups,
    groupByAnchorItemId,
    groupByItemId,
  };
}

export function getThinkingGroupCounts(items: readonly StreamItem[]): ThinkingGroupCounts {
  let messageCount = 0;
  let toolCallCount = 0;
  for (const item of items) {
    if (isThinkingMessageItem(item)) {
      messageCount += 1;
    } else if (item.kind === "tool_call") {
      toolCallCount += 1;
    }
  }
  return { messageCount, toolCallCount };
}

export function getThinkingGroupPreviewMessages(
  items: readonly StreamItem[],
): ThinkingGroupPreviewMessage[] {
  const messages: ThinkingGroupPreviewMessage[] = [];
  for (const item of items) {
    if (isThinkingMessageItem(item)) {
      messages.push({ id: item.id, text: item.text });
    }
  }
  return messages;
}

export function shouldShowThinkingGroupPreview(input: {
  expanded: boolean;
  groupStatus: ThinkingGroup["status"];
  messageCount: number;
}): boolean {
  return !input.expanded && input.groupStatus === "active" && input.messageCount > 0;
}

function findNextUserMessageIndex(items: readonly StreamItem[], startIndex: number): number | null {
  for (let index = startIndex; index < items.length; index += 1) {
    if (items[index]?.kind === "user_message") {
      return index;
    }
  }
  return null;
}

function isThinkingGroupItem(item: StreamItem): boolean {
  return (
    item.kind === "assistant_message" ||
    item.kind === "thought" ||
    item.kind === "tool_call" ||
    item.kind === "todo_list"
  );
}

function isThinkingMessageItem(
  item: StreamItem,
): item is Extract<StreamItem, { kind: "assistant_message" | "thought" }> {
  return item.kind === "assistant_message" || item.kind === "thought";
}

function findLastAssistantMessageIndex(items: readonly StreamItem[]): number | null {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index]?.kind === "assistant_message") {
      return index;
    }
  }
  return null;
}

function findAssistantSuffixStartIndex(items: readonly StreamItem[]): number {
  let index = items.length;
  while (index > 0 && items[index - 1]?.kind === "assistant_message") {
    index -= 1;
  }
  return index;
}
