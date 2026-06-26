import { describe, expect, it } from "vitest";
import { getWorkspaceRowRightVisibility } from "@/components/sidebar/workspace-row-right-visibility";
import {
  createEmptySidebarTabStatusSummary,
  type SidebarTabStatusSummary,
} from "@/utils/sidebar-tab-status-summary";

function createStatusSummary(): SidebarTabStatusSummary {
  const summary = createEmptySidebarTabStatusSummary();
  summary.total = 1;
  summary.counts.needs_input = 1;
  summary.entryCounts.input_required = 1;
  summary.propagatedEntryCounts.input_required = 1;
  return summary;
}

function getVisibility(overrides: Partial<Parameters<typeof getWorkspaceRowRightVisibility>[0]>) {
  return getWorkspaceRowRightVisibility({
    badgeMode: "status",
    expanded: false,
    selected: false,
    hasArchiveAction: false,
    hasCreateTabAction: false,
    hasDiffStat: false,
    hasVcOperationBadges: false,
    isCompactLayout: false,
    isHovered: false,
    isTouchPlatform: false,
    showShortcutBadge: false,
    shortcutNumber: null,
    tabStatusSummary: createStatusSummary(),
    ...overrides,
  });
}

describe("getWorkspaceRowRightVisibility", () => {
  it("shows status badges for a collapsed unselected workspace", () => {
    const visibility = getVisibility({});

    expect(visibility.showStatusSummary).toBe(true);
    expect(visibility.shouldRenderActionSlot).toBe(true);
  });

  it("hides status badges for an expanded workspace", () => {
    const visibility = getVisibility({ expanded: true });

    expect(visibility.showStatusSummary).toBe(false);
    expect(visibility.shouldRenderActionSlot).toBe(false);
  });

  it("hides status badges for a selected workspace", () => {
    const visibility = getVisibility({ selected: true });

    expect(visibility.showStatusSummary).toBe(false);
    expect(visibility.shouldRenderActionSlot).toBe(false);
  });

  it("keeps diff badges independent of selected workspace status suppression", () => {
    const visibility = getVisibility({
      badgeMode: "diff",
      selected: true,
      hasDiffStat: true,
    });

    expect(visibility.showDiffStat).toBe(true);
    expect(visibility.shouldRenderActionSlot).toBe(true);
  });

  it("keeps the action slot available for selected workspaces with row actions", () => {
    const visibility = getVisibility({
      selected: true,
      hasArchiveAction: true,
      isHovered: true,
    });

    expect(visibility.showStatusSummary).toBe(false);
    expect(visibility.showKebabInSlot).toBe(true);
    expect(visibility.shouldRenderActionSlot).toBe(true);
  });

  it("shows create-tab controls for sidebar tabs on hover", () => {
    const visibility = getVisibility({
      hasCreateTabAction: true,
      isHovered: true,
    });

    expect(visibility.showCreateTab).toBe(true);
    expect(visibility.showStatusSummary).toBe(false);
    expect(visibility.shouldRenderActionSlot).toBe(true);
  });
});
