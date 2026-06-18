import type { StreamItem } from "@/types/stream";

export interface PinnedUserInputCandidate {
  item: Extract<StreamItem, { kind: "user_message" }>;
  top: number;
  bottom: number;
}

export interface PinnedUserInputState {
  item: Extract<StreamItem, { kind: "user_message" }>;
}

export interface SelectPinnedUserInputInput {
  enabled: boolean;
  candidates: PinnedUserInputCandidate[];
  viewportTop: number;
  viewportBottom: number;
}

function isCandidateVisible(input: {
  candidate: PinnedUserInputCandidate;
  viewportTop: number;
  viewportBottom: number;
}): boolean {
  return input.candidate.bottom > input.viewportTop && input.candidate.top < input.viewportBottom;
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

  let relevant: PinnedUserInputCandidate | null = null;
  for (const candidate of input.candidates) {
    if (candidate.top <= input.viewportBottom) {
      relevant = candidate;
    } else {
      break;
    }
  }

  if (!relevant) {
    return null;
  }
  if (
    isCandidateVisible({
      candidate: relevant,
      viewportTop: input.viewportTop,
      viewportBottom: input.viewportBottom,
    })
  ) {
    return null;
  }

  return { item: relevant.item };
}
