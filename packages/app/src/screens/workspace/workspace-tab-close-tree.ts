import type { WorkspaceTab } from "@/stores/workspace-tabs-store";

export function collectDescendantTabIdsByParentTabId(input: {
  tabs: readonly WorkspaceTab[];
  parentTabIdByTabId?: Readonly<Record<string, string>> | null;
}): Map<string, string[]> {
  const childrenByParent = new Map<string, string[]>();
  for (const [childTabId, parentTabId] of Object.entries(input.parentTabIdByTabId ?? {})) {
    const children = childrenByParent.get(parentTabId) ?? [];
    children.push(childTabId);
    childrenByParent.set(parentTabId, children);
  }
  const descendants = new Map<string, string[]>();

  function collect(parentTabId: string, ancestors = new Set<string>()): string[] {
    const existing = descendants.get(parentTabId);
    if (existing) {
      return existing;
    }
    if (ancestors.has(parentTabId)) {
      return [];
    }
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(parentTabId);
    const result: string[] = [];
    for (const childTabId of childrenByParent.get(parentTabId) ?? []) {
      result.push(...collect(childTabId, nextAncestors), childTabId);
    }
    descendants.set(parentTabId, result);
    return result;
  }

  for (const tab of input.tabs) {
    collect(tab.tabId);
  }
  return descendants;
}

export async function closeDescendantTabsBeforeParent(input: {
  parentTabId: string;
  descendantTabIdsByParentTabId: ReadonlyMap<string, readonly string[]>;
  closeSingleTabById: (tabId: string) => Promise<boolean>;
}): Promise<boolean> {
  for (const descendantTabId of input.descendantTabIdsByParentTabId.get(input.parentTabId) ?? []) {
    const closed = await input.closeSingleTabById(descendantTabId);
    if (!closed) {
      return false;
    }
  }
  return true;
}
