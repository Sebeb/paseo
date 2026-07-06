import {
  SIDEBAR_ENTRY_STATUS_DEFINITIONS,
  type SidebarEntryStatusKind,
  type SidebarTabStatusSummary,
} from "@/utils/sidebar-tab-status-summary";

export interface SidebarRecentVisibilityRow {
  item: {
    tab: {
      tabId: string;
    };
    forceShown: boolean;
  };
  statusSummary: SidebarTabStatusSummary;
}

export function applyRecentTreeRowCount<Row extends SidebarRecentVisibilityRow>(input: {
  rows: readonly Row[];
  recentCount: number | "all";
}): Row[] {
  if (input.recentCount === "all") {
    return input.rows.slice();
  }

  const visible = input.rows.slice(0, input.recentCount);
  const visibleIds = new Set(visible.map((row) => row.item.tab.tabId));
  for (const row of input.rows) {
    if (
      (!row.item.forceShown && !hasFlashableStatusKind(row.statusSummary)) ||
      visibleIds.has(row.item.tab.tabId)
    ) {
      continue;
    }
    visible.push(row);
    visibleIds.add(row.item.tab.tabId);
  }
  return visible;
}

function hasFlashableStatusKind(summary: SidebarTabStatusSummary): boolean {
  return (Object.keys(SIDEBAR_ENTRY_STATUS_DEFINITIONS) as SidebarEntryStatusKind[]).some(
    (kind) =>
      SIDEBAR_ENTRY_STATUS_DEFINITIONS[kind].flashOnIncrease && summary.entryCounts[kind] > 0,
  );
}
