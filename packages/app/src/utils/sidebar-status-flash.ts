import {
  SIDEBAR_ENTRY_STATUS_DEFINITIONS,
  type SidebarEntryStatusKind,
} from "@/utils/sidebar-tab-status-summary";

export interface SidebarStatusFlashCandidate {
  sourceKey: string;
  kind: SidebarEntryStatusKind;
  recipientIds: readonly string[];
}

export interface SidebarStatusFlashResolution {
  nextSeenSourceKeys: Set<string>;
  triggeredKindByRecipientId: Map<string, SidebarEntryStatusKind>;
}

const FLASH_KIND_PRIORITY: Record<SidebarEntryStatusKind, number> = {
  input_required: 0,
  failed: 1,
  unread: 2,
  in_progress: 3,
  queued_messages: 4,
  draft: 5,
};

export function resolveSidebarStatusFlashes(input: {
  candidates: readonly SidebarStatusFlashCandidate[];
  seenSourceKeys: ReadonlySet<string>;
}): SidebarStatusFlashResolution {
  const nextSeenSourceKeys = new Set<string>();
  const triggeredKindByRecipientId = new Map<string, SidebarEntryStatusKind>();

  for (const candidate of input.candidates) {
    nextSeenSourceKeys.add(candidate.sourceKey);
    if (!SIDEBAR_ENTRY_STATUS_DEFINITIONS[candidate.kind].flashOnIncrease) {
      continue;
    }
    if (input.seenSourceKeys.has(candidate.sourceKey)) {
      continue;
    }
    const recipientId = candidate.recipientIds.find((value) => value.length > 0);
    if (!recipientId) {
      continue;
    }
    const previousKind = triggeredKindByRecipientId.get(recipientId);
    if (!previousKind || FLASH_KIND_PRIORITY[candidate.kind] < FLASH_KIND_PRIORITY[previousKind]) {
      triggeredKindByRecipientId.set(recipientId, candidate.kind);
    }
  }

  return {
    nextSeenSourceKeys,
    triggeredKindByRecipientId,
  };
}
