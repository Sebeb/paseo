import type { SidebarBadgeMode } from "@/stores/sidebar-view-store";
import {
  getVisibleSidebarEntryStatusKinds,
  type SidebarTabStatusSummary,
} from "@/utils/sidebar-tab-status-summary";

export interface WorkspaceRowRightVisibility {
  showCreateTab: boolean;
  showKebabInSlot: boolean;
  showDiffStat: boolean;
  showStatusSummary: boolean;
  shouldRenderActionSlot: boolean;
}

export function getWorkspaceRowRightVisibility(input: {
  badgeMode: SidebarBadgeMode;
  expanded: boolean;
  selected: boolean;
  hasArchiveAction: boolean;
  hasCreateTabAction: boolean;
  hasDiffStat: boolean;
  isCompactLayout: boolean;
  isHovered: boolean;
  isTouchPlatform: boolean;
  showShortcutBadge: boolean;
  shortcutNumber: number | null;
  tabStatusSummary: SidebarTabStatusSummary;
}): WorkspaceRowRightVisibility {
  const showShortcut = input.showShortcutBadge && input.shortcutNumber !== null;
  const showActionControls = input.isHovered || input.isTouchPlatform || input.isCompactLayout;
  return {
    showCreateTab: input.hasCreateTabAction && showActionControls && !showShortcut,
    showKebabInSlot: input.hasArchiveAction && showActionControls && !showShortcut,
    showDiffStat: shouldShowWorkspaceDiffStat({ ...input, showShortcut }),
    showStatusSummary: shouldShowWorkspaceStatusSummary({
      ...input,
      showActionControls,
      showShortcut,
    }),
    shouldRenderActionSlot: shouldRenderWorkspaceActionSlot(input),
  };
}

function shouldRenderWorkspaceActionSlot(input: {
  badgeMode: SidebarBadgeMode;
  expanded: boolean;
  selected: boolean;
  hasArchiveAction: boolean;
  hasCreateTabAction: boolean;
  hasDiffStat: boolean;
  tabStatusSummary: SidebarTabStatusSummary;
}): boolean {
  if (input.hasArchiveAction || input.hasCreateTabAction) {
    return true;
  }
  if (input.badgeMode === "diff") {
    return input.hasDiffStat;
  }
  return (
    input.badgeMode === "status" &&
    !shouldSuppressWorkspaceStatusSummary(input) &&
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
  selected: boolean;
  showActionControls: boolean;
  showShortcut: boolean;
  tabStatusSummary: SidebarTabStatusSummary;
}): boolean {
  return (
    input.badgeMode === "status" &&
    !shouldSuppressWorkspaceStatusSummary(input) &&
    !input.showActionControls &&
    !input.showShortcut &&
    getVisibleSidebarEntryStatusKinds(input.tabStatusSummary).length > 0
  );
}

function shouldSuppressWorkspaceStatusSummary(input: {
  expanded: boolean;
  selected: boolean;
}): boolean {
  return input.expanded || input.selected;
}
