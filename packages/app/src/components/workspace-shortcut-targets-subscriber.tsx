import { useEffect, useMemo } from "react";
import { useSidebarWorkspacesList } from "@/hooks/use-sidebar-workspaces-list";
import { useStatusModeWorkspacePlacements } from "@/hooks/use-status-mode-workspaces";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { useSidebarCollapsedSectionsStore } from "@/stores/sidebar-collapsed-sections-store";
import { useSidebarViewStore } from "@/stores/sidebar-view-store";
import {
  buildSidebarShortcutModel,
  buildStatusSidebarShortcutModel,
} from "@/utils/sidebar-shortcuts";

export function WorkspaceShortcutTargetsSubscriber({ enabled }: { enabled: boolean }) {
  const { workspacePlacements, projects } = useSidebarWorkspacesList({
    enabled,
  });
  const serverId = projects[0]?.serverId ?? null;
  const groupMode = useSidebarViewStore((state) => state.groupMode);
  const isStatusMode = enabled && groupMode === "status";
  const statusWorkspacePlacements = useStatusModeWorkspacePlacements({
    placements: workspacePlacements,
    enabled: isStatusMode,
  });
  const workspaceSortMode = useSidebarViewStore((state) =>
    enabled && serverId ? state.getWorkspaceSortMode(serverId) : "manual",
  );
  const collapsedProjectKeys = useSidebarCollapsedSectionsStore(
    (state) => state.collapsedProjectKeys,
  );
  const collapsedStatusGroupKeys = useSidebarCollapsedSectionsStore(
    (state) => state.collapsedStatusGroupKeys,
  );
  const setSidebarShortcutWorkspaceTargets = useKeyboardShortcutsStore(
    (state) => state.setSidebarShortcutWorkspaceTargets,
  );

  const shortcutModel = useMemo(() => {
    if (groupMode === "status") {
      return buildStatusSidebarShortcutModel({
        workspaces: statusWorkspacePlacements,
        workspaceSortMode,
        collapsedStatusGroupKeys,
      });
    }

    return buildSidebarShortcutModel({
      projects,
      collapsedProjectKeys,
    });
  }, [
    collapsedProjectKeys,
    collapsedStatusGroupKeys,
    groupMode,
    projects,
    statusWorkspacePlacements,
    workspaceSortMode,
  ]);

  useEffect(() => {
    if (!enabled) {
      setSidebarShortcutWorkspaceTargets([]);
      return;
    }

    setSidebarShortcutWorkspaceTargets(shortcutModel.shortcutTargets);
  }, [enabled, setSidebarShortcutWorkspaceTargets, shortcutModel.shortcutTargets]);

  useEffect(() => {
    return () => {
      setSidebarShortcutWorkspaceTargets([]);
    };
  }, [setSidebarShortcutWorkspaceTargets]);

  return null;
}
