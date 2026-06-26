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
  translateY: number;
}

export interface SelectPinnedUserInputInput {
  enabled: boolean;
  candidates: PinnedUserInputCandidate[];
  viewportTop: number;
  viewportBottom: number;
  pinnedBottom: number;
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

function isCandidateResponseZoneRelevant(input: {
  candidate: PinnedUserInputCandidate;
  next: PinnedUserInputCandidate | undefined;
  viewportTop: number;
  viewportBottom: number;
}): boolean {
  for (const responseItem of input.candidate.responseItems) {
    if (
      isVisible({
        top: responseItem.top,
        bottom: responseItem.bottom,
        viewportTop: input.viewportTop,
        viewportBottom: input.viewportBottom,
      })
    ) {
      return true;
    }
  }
  if (
    input.next &&
    isVisible({
      top: input.next.input.top,
      bottom: input.next.input.bottom,
      viewportTop: input.viewportTop,
      viewportBottom: input.viewportBottom,
    })
  ) {
    return true;
  }
  return false;
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

  // The active candidate is the latest user_message whose real bottom has scrolled
  // above the pinned overlay's bottom (in viewport coordinates). Equivalently:
  // candidate.bottom < viewportTop + pinnedBottom.
  const pinnedThresholdInContent = input.viewportTop + input.pinnedBottom;
  let activeIndex: number | null = null;
  for (let i = 0; i < input.candidates.length; i += 1) {
    if (input.candidates[i].input.bottom < pinnedThresholdInContent) {
      activeIndex = i;
    } else {
      break;
    }
  }

  if (activeIndex === null) {
    return null;
  }

  const active = input.candidates[activeIndex];
  const next = input.candidates[activeIndex + 1];

  if (
    !isCandidateResponseZoneRelevant({
      candidate: active,
      next,
      viewportTop: input.viewportTop,
      viewportBottom: input.viewportBottom,
    })
  ) {
    return null;
  }

  if (active.input.item.kind !== "user_message") {
    return null;
  }

  // The next candidate physically pushes the pinned overlay up once its top crosses
  // the pinned's bottom in viewport. translateY tracks the next message's top so the
  // overlay's bottom stays glued to it.
  let translateY = 0;
  if (next) {
    const nextTopInViewport = next.input.top - input.viewportTop;
    if (nextTopInViewport < input.pinnedBottom) {
      translateY = nextTopInViewport - input.pinnedBottom;
    }
  }

  return {
    item: active.input.item,
    sourceTop: active.input.top,
    sourceBottom: active.input.bottom,
    translateY,
  };
}
