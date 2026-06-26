import { describe, expect, it } from "vitest";
import { getWorkspaceRowRightVisibility } from "@/components/sidebar/sidebar-workspace-row-visibility";
import { createEmptySidebarTabStatusSummary } from "@/utils/sidebar-tab-status-summary";

function statusSummaryWithUnread() {
  const summary = createEmptySidebarTabStatusSummary();
  summary.entryCounts.unread = 1;
  return summary;
}

describe("workspace row right visibility", () => {
  it("keeps collapsed status badges visible when action controls would otherwise replace them", () => {
    const visibility = getWorkspaceRowRightVisibility({
      badgeMode: "status",
      expanded: false,
      hasArchiveAction: true,
      hasCreateTabAction: false,
      hasDiffStat: false,
      hasVcOperationBadges: true,
      isCompactLayout: false,
      isHovered: true,
      isTouchPlatform: false,
      showShortcutBadge: false,
      shortcutNumber: null,
      tabStatusSummary: statusSummaryWithUnread(),
    });

    expect(visibility.showStatusSummary).toBe(true);
    expect(visibility.showKebabInSlot).toBe(false);
    expect(visibility.showVcOperationBadges).toBe(false);
  });

  it("keeps collapsed rows actionable when there is no status badge to show", () => {
    const visibility = getWorkspaceRowRightVisibility({
      badgeMode: "status",
      expanded: false,
      hasArchiveAction: true,
      hasCreateTabAction: false,
      hasDiffStat: false,
      hasVcOperationBadges: false,
      isCompactLayout: false,
      isHovered: true,
      isTouchPlatform: false,
      showShortcutBadge: false,
      shortcutNumber: null,
      tabStatusSummary: createEmptySidebarTabStatusSummary(),
    });

    expect(visibility.showStatusSummary).toBe(false);
    expect(visibility.showKebabInSlot).toBe(true);
  });
});
