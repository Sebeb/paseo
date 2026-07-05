import {
  sortSidebarWorkspaces,
  type SidebarStatusWorkspacePlacement,
} from "@/hooks/sidebar-workspaces-view-model";
import type { SidebarWorkspaceSortMode } from "@/stores/sidebar-view-store";

export type StatusBucket = SidebarStatusWorkspacePlacement["statusBucket"];

export const STATUS_BUCKET_ORDER: readonly StatusBucket[] = [
  "needs_input",
  "failed",
  "attention",
  "running",
  "done",
] as const;

export const STATUS_BUCKET_LABELS: Record<StatusBucket, string> = {
  needs_input: "Needs input",
  failed: "Failed",
  attention: "Ready to review",
  running: "Working",
  done: "Done",
};

export interface StatusGroup {
  bucket: StatusBucket;
  label: string;
  rows: SidebarStatusWorkspacePlacement[];
}

export function buildStatusGroups(
  workspaces: SidebarStatusWorkspacePlacement[],
  sortMode: SidebarWorkspaceSortMode,
): StatusGroup[] {
  const bucketRows = new Map<StatusBucket, SidebarStatusWorkspacePlacement[]>();

  for (const ws of workspaces) {
    const bucket: StatusBucket = ws.statusBucket;
    let rows = bucketRows.get(bucket);
    if (!rows) {
      rows = [];
      bucketRows.set(bucket, rows);
    }
    rows.push(ws);
  }

  const groups: StatusGroup[] = [];

  for (const bucket of STATUS_BUCKET_ORDER) {
    const rows = bucketRows.get(bucket);
    if (!rows || rows.length === 0) continue;

    groups.push({
      bucket,
      label: STATUS_BUCKET_LABELS[bucket],
      rows: sortSidebarWorkspaces({ workspaces: rows, sortMode }),
    });
  }

  return groups;
}

export function buildStatusShortcutIndex(groups: StatusGroup[]): Map<string, number> {
  const index = new Map<string, number>();
  let shortcutNumber = 1;
  for (const group of groups) {
    for (const row of group.rows) {
      if (shortcutNumber > 9) return index;
      index.set(row.workspaceKey, shortcutNumber);
      shortcutNumber += 1;
    }
  }
  return index;
}
