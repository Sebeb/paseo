import type { SidebarBadgeMode } from "@/stores/sidebar-view-store";
import {
  getVisibleSidebarEntryStatusKinds,
  type SidebarTabStatusSummary,
} from "@/utils/sidebar-tab-status-summary";

export interface WorkspaceRowRightVisibility {
  showCreateTab: boolean;
  showKebabInSlot: boolean;
  showVcOperationBadges: boolean;
  showDiffStat: boolean;
  showStatusSummary: boolean;
  shouldRenderActionSlot: boolean;
}

export interface WorkspaceRowRightVisibilityInput {
  badgeMode: SidebarBadgeMode;
  expanded: boolean;
  hasArchiveAction: boolean;
  hasCreateTabAction: boolean;
  hasDiffStat: boolean;
  hasVcOperationBadges: boolean;
  isCompactLayout: boolean;
  isHovered: boolean;
  isTouchPlatform: boolean;
  showShortcutBadge: boolean;
  shortcutNumber: number | null;
  tabStatusSummary: SidebarTabStatusSummary;
}

export function getWorkspaceRowRightVisibility(
  input: WorkspaceRowRightVisibilityInput,
): WorkspaceRowRightVisibility {
  const showShortcut = input.showShortcutBadge && input.shortcutNumber !== null;
  const showActionControls = input.isHovered || input.isTouchPlatform || input.isCompactLayout;
  const showStatusSummary = shouldShowWorkspaceStatusSummary({
    ...input,
    showShortcut,
  });
  return {
    showCreateTab: false,
    showKebabInSlot:
      input.hasArchiveAction && showActionControls && !showShortcut && !showStatusSummary,
    showVcOperationBadges:
      input.hasVcOperationBadges && !showActionControls && !showShortcut && !showStatusSummary,
    showDiffStat: !showStatusSummary && shouldShowWorkspaceDiffStat({ ...input, showShortcut }),
    showStatusSummary,
    shouldRenderActionSlot: shouldRenderWorkspaceActionSlot(input),
  };
}

function shouldRenderWorkspaceActionSlot(input: {
  badgeMode: SidebarBadgeMode;
  expanded: boolean;
  hasArchiveAction: boolean;
  hasCreateTabAction: boolean;
  hasDiffStat: boolean;
  hasVcOperationBadges: boolean;
  tabStatusSummary: SidebarTabStatusSummary;
}): boolean {
  if (input.hasArchiveAction || input.hasCreateTabAction) {
    return true;
  }
  if (input.badgeMode === "diff") {
    return input.hasDiffStat || input.hasVcOperationBadges;
  }
  if (input.hasVcOperationBadges) {
    return true;
  }
  return (
    input.badgeMode === "status" &&
    !input.expanded &&
    getVisibleSidebarEntryStatusKinds(input.tabStatusSummary).length > 0
  );
}

function shouldShowWorkspaceDiffStat(input: {
  badgeMode: SidebarBadgeMode;
  hasDiffStat: boolean;
  isHovered: boolean;
  showShortcut: boolean;
}): boolean {
  return input.badgeMode === "diff" && input.hasDiffStat && !input.isHovered && !input.showShortcut;
}

function shouldShowWorkspaceStatusSummary(input: {
  badgeMode: SidebarBadgeMode;
  expanded: boolean;
  showShortcut: boolean;
  tabStatusSummary: SidebarTabStatusSummary;
}): boolean {
  return (
    input.badgeMode === "status" &&
    !input.expanded &&
    !input.showShortcut &&
    getVisibleSidebarEntryStatusKinds(input.tabStatusSummary).length > 0
  );
}
