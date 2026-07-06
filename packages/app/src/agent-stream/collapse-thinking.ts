import type { StreamItem } from "@/types/stream";
import type { CollapseThinkingBehavior } from "@/hooks/use-settings";

export interface ThinkingGroup {
  id: string;
  anchorItemId: string;
  itemIds: string[];
  startedAt: Date;
  lastActivityAt: Date;
  defaultExpanded: boolean;
  status: "active" | "completed";
  finalAssistantItemId: string | null;
}

export interface ThinkingGroupIndex {
  groups: ThinkingGroup[];
  groupByAnchorItemId: Map<string, ThinkingGroup>;
  groupByItemId: Map<string, ThinkingGroup>;
  suppressedItemIds: Set<string>;
}

export interface ThinkingGroupCounts {
  messageCount: number;
  toolCallCount: number;
}

export interface ThinkingGroupPreviewMessage {
  id: string;
  text: string;
}

export function resolveExpandedThinkingGroupIds(input: {
  groups: readonly ThinkingGroup[];
  expandedByGroupId: Map<string, boolean>;
  behavior: CollapseThinkingBehavior;
}): Map<string, boolean> {
  if (input.behavior !== "completed-and-active") {
    return input.expandedByGroupId;
  }

  let next: Map<string, boolean> | null = null;
  let previousExpanded: boolean | null = null;

  const getState = (): Map<string, boolean> => next ?? input.expandedByGroupId;
  const getNext = (): Map<string, boolean> => {
    next ??= new Map(input.expandedByGroupId);
    return next;
  };

  for (const group of input.groups) {
    const state = getState();
    if (state.has(group.id)) {
      previousExpanded = state.get(group.id) ?? false;
      continue;
    }

    const statusPeerId = getThinkingGroupStatusPeerId(group);
    if (state.has(statusPeerId)) {
      const peerExpanded = state.get(statusPeerId) ?? false;
      getNext().set(group.id, peerExpanded);
      previousExpanded = peerExpanded;
      continue;
    }

    const initialExpanded: boolean = previousExpanded ?? group.defaultExpanded;
    getNext().set(group.id, initialExpanded);
    previousExpanded = initialExpanded;
  }

  return next ?? input.expandedByGroupId;
}

function getThinkingGroupStatusPeerId(group: ThinkingGroup): string {
  const suffix = group.status === "active" ? ":active" : ":final";
  const peerSuffix = group.status === "active" ? ":final" : ":active";
  return `${group.id.slice(0, -suffix.length)}${peerSuffix}`;
}

interface BuildTurnGroupsInput {
  userMessageId: string;
  turnItems: readonly StreamItem[];
  isCurrentRunningTurn: boolean;
  behavior: Exclude<CollapseThinkingBehavior, "never">;
  suppressedItemIds: Set<string>;
}

export function buildCollapseThinkingGroups(input: {
  items: readonly StreamItem[];
  behavior: Exclude<CollapseThinkingBehavior, "never">;
  agentStatus: string;
}): ThinkingGroupIndex {
  const { items, behavior, agentStatus } = input;
  const groups: ThinkingGroup[] = [];
  const suppressedItemIds = new Set<string>();
  let turnStartIndex = findNextUserMessageIndex(items, 0);

  while (turnStartIndex !== null) {
    const turnEndIndex = findNextUserMessageIndex(items, turnStartIndex + 1) ?? items.length;
    const turnItems = items.slice(turnStartIndex + 1, turnEndIndex);
    const isCurrentRunningTurn = agentStatus === "running" && turnEndIndex === items.length;
    const userMessage = items[turnStartIndex];

    if (userMessage) {
      groups.push(
        ...buildTurnGroups({
          userMessageId: userMessage.id,
          turnItems,
          isCurrentRunningTurn,
          behavior,
          suppressedItemIds,
        }),
      );
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
    suppressedItemIds,
  };
}

function buildTurnGroups(input: BuildTurnGroupsInput): ThinkingGroup[] {
  const groups: ThinkingGroup[] = [];
  let groupItems: StreamItem[] = [];

  const pushGroup = (
    status: ThinkingGroup["status"],
    finalAssistantItem: StreamItem | null,
  ): void => {
    const anchorItem = groupItems[0];
    if (!anchorItem) {
      return;
    }
    groups.push({
      id: `thinking:${input.userMessageId}:${anchorItem.id}:${
        status === "active" ? "active" : "final"
      }`,
      anchorItemId: anchorItem.id,
      itemIds: groupItems.map((item) => item.id),
      startedAt: anchorItem.timestamp,
      lastActivityAt: groupItems.at(-1)?.timestamp ?? anchorItem.timestamp,
      defaultExpanded: status === "active" && input.behavior === "completed",
      status,
      finalAssistantItemId: finalAssistantItem?.id ?? null,
    });
    groupItems = [];
  };

  for (let index = 0; index < input.turnItems.length; index += 1) {
    const item = input.turnItems[index];
    if (!item) {
      continue;
    }

    if (item.kind === "assistant_message") {
      const nextItem = input.turnItems[index + 1];
      if (isProgressAssistantSupersededByResponse(item, nextItem)) {
        input.suppressedItemIds.add(item.id);
        pushGroup("completed", nextItem);
        continue;
      }

      const hasLaterWork = hasLaterCollapsibleWork(input.turnItems, index + 1);
      if (
        item.presentation === "progress" &&
        !isNextCollapsibleWorkUserFacing(input.turnItems, index + 1)
      ) {
        if (!input.isCurrentRunningTurn && !hasLaterWork) {
          pushGroup("completed", item);
          continue;
        }
        groupItems.push(item);
        continue;
      }
      if (input.isCurrentRunningTurn && !hasLaterWork && item.presentation !== "response") {
        groupItems.push(item);
        continue;
      }
      pushGroup("completed", item);
      continue;
    }

    if (isCollapsibleWorkItem(item)) {
      groupItems.push(item);
      continue;
    }

    pushGroup("completed", null);
  }

  pushGroup(input.isCurrentRunningTurn ? "active" : "completed", null);

  return groups;
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

function isCollapsibleWorkItem(item: StreamItem): boolean {
  if (item.kind === "assistant_message") {
    return item.presentation === "progress";
  }

  if (
    item.kind === "tool_call" &&
    item.payload.source === "agent" &&
    item.payload.data.detail.type === "plan"
  ) {
    return false;
  }

  return item.kind === "thought" || item.kind === "tool_call" || item.kind === "todo_list";
}

function isProgressAssistantSupersededByResponse(
  item: StreamItem,
  nextItem: StreamItem | undefined,
): nextItem is Extract<StreamItem, { kind: "assistant_message" }> {
  if (
    item.kind !== "assistant_message" ||
    item.presentation !== "progress" ||
    nextItem?.kind !== "assistant_message" ||
    nextItem.presentation !== "response"
  ) {
    return false;
  }

  const progressText = item.text.trim();
  const responseText = nextItem.text.trim();
  if (!progressText || !responseText) {
    return false;
  }
  return progressText.startsWith(responseText) || responseText.startsWith(progressText);
}

function isUserFacingToolItem(item: StreamItem): boolean {
  return (
    item.kind === "tool_call" &&
    item.payload.source === "agent" &&
    item.payload.data.name === "request_user_input"
  );
}

function isNextCollapsibleWorkUserFacing(
  items: readonly StreamItem[],
  startIndex: number,
): boolean {
  for (let index = startIndex; index < items.length; index += 1) {
    const item = items[index];
    if (!item) {
      continue;
    }
    if (!isCollapsibleWorkItem(item)) {
      continue;
    }
    return isUserFacingToolItem(item);
  }
  return false;
}

function hasLaterCollapsibleWork(items: readonly StreamItem[], startIndex: number): boolean {
  for (let index = startIndex; index < items.length; index += 1) {
    const item = items[index];
    if (item && isCollapsibleWorkItem(item)) {
      return true;
    }
  }
  return false;
}

function isThinkingMessageItem(
  item: StreamItem,
): item is Extract<StreamItem, { kind: "assistant_message" | "thought" }> {
  return item.kind === "assistant_message" || item.kind === "thought";
}
