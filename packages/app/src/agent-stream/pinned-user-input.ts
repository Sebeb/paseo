import type { StreamItem } from "@/types/stream";

export interface PinnedUserInputCandidate {
  input: PinnedUserInputGeometry;
  responseItems: PinnedUserInputGeometry[];
}

export interface PinnedUserInputGeometry {
  item: StreamItem;
  top: number;
  bottom: number;
}

export interface PinnedUserInputState {
  item: Extract<StreamItem, { kind: "user_message" }>;
  sourceTop: number;
  sourceBottom: number;
}

export interface SelectPinnedUserInputInput {
  enabled: boolean;
  candidates: PinnedUserInputCandidate[];
  viewportTop: number;
  viewportBottom: number;
}

export interface CollectEstimatedPinnedUserInputCandidatesInput {
  items: StreamItem[];
  estimateHeight: (item: StreamItem) => number;
  initialTop?: number;
}

function isVisible(input: {
  top: number;
  bottom: number;
  viewportTop: number;
  viewportBottom: number;
}): boolean {
  return input.bottom > input.viewportTop && input.top < input.viewportBottom;
}

function getVisibleResponseDistanceFromViewportBottom(input: {
  responseItems: PinnedUserInputGeometry[];
  viewportTop: number;
  viewportBottom: number;
}): number | null {
  let nearestDistance: number | null = null;
  for (const responseItem of input.responseItems) {
    if (
      !isVisible({
        top: responseItem.top,
        bottom: responseItem.bottom,
        viewportTop: input.viewportTop,
        viewportBottom: input.viewportBottom,
      })
    ) {
      continue;
    }
    const visibleBottom = Math.min(responseItem.bottom, input.viewportBottom);
    const distance = input.viewportBottom - visibleBottom;
    nearestDistance = nearestDistance === null ? distance : Math.min(nearestDistance, distance);
  }
  return nearestDistance;
}

export function collectEstimatedPinnedUserInputCandidates(
  input: CollectEstimatedPinnedUserInputCandidatesInput,
): PinnedUserInputCandidate[] {
  const geometries: PinnedUserInputGeometry[] = [];
  let top = input.initialTop ?? 0;

  for (const item of input.items) {
    const height = input.estimateHeight(item);
    geometries.push({
      item,
      top,
      bottom: top + height,
    });
    top += height;
  }

  return collectPinnedUserInputCandidatesFromGeometries(geometries);
}

export function collectPinnedUserInputCandidatesFromGeometries(
  geometries: PinnedUserInputGeometry[],
): PinnedUserInputCandidate[] {
  const candidates: PinnedUserInputCandidate[] = [];
  let activeCandidate: PinnedUserInputCandidate | null = null;

  for (const geometry of geometries) {
    const item = geometry.item;
    if (item.kind === "user_message") {
      activeCandidate = {
        input: {
          item,
          top: geometry.top,
          bottom: geometry.bottom,
        },
        responseItems: [],
      };
      candidates.push(activeCandidate);
    } else {
      activeCandidate?.responseItems.push(geometry);
    }
  }

  return candidates;
}

export function findEstimatedStreamItemTop(input: {
  items: StreamItem[];
  itemId: string;
  estimateHeight: (item: StreamItem) => number;
  initialTop?: number;
}): number | null {
  let top = input.initialTop ?? 0;
  for (const item of input.items) {
    if (item.id === input.itemId) {
      return top;
    }
    top += input.estimateHeight(item);
  }
  return null;
}

export function selectPinnedUserInput(
  input: SelectPinnedUserInputInput,
): PinnedUserInputState | null {
  if (!input.enabled) {
    return null;
  }
  if (input.viewportBottom <= input.viewportTop) {
    return null;
  }

  for (const candidate of input.candidates) {
    if (
      isVisible({
        top: candidate.input.top,
        bottom: candidate.input.bottom,
        viewportTop: input.viewportTop,
        viewportBottom: input.viewportBottom,
      })
    ) {
      return null;
    }
  }

  let selected: PinnedUserInputCandidate | null = null;
  let selectedDistance: number | null = null;
  for (const candidate of input.candidates) {
    const distance = getVisibleResponseDistanceFromViewportBottom({
      responseItems: candidate.responseItems,
      viewportTop: input.viewportTop,
      viewportBottom: input.viewportBottom,
    });
    if (distance === null) {
      continue;
    }
    if (selectedDistance === null || distance < selectedDistance) {
      selected = candidate;
      selectedDistance = distance;
    }
  }

  if (!selected || selected.input.item.kind !== "user_message") {
    return null;
  }

  return {
    item: selected.input.item,
    sourceTop: selected.input.top,
    sourceBottom: selected.input.bottom,
  };
}
