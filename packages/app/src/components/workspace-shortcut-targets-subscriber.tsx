import { useEffect, useMemo } from "react";
import { useSidebarWorkspacesList } from "@/hooks/use-sidebar-workspaces-list";
import { useStatusModeWorkspacePlacements } from "@/hooks/use-status-mode-workspaces";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
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
  const activeWorkspaceSelection = useActiveWorkspaceSelection();
  const setSidebarShortcutWorkspaceTargets = useKeyboardShortcutsStore(
    (state) => state.setSidebarShortcutWorkspaceTargets,
  );
  const selectedProjectKey = useMemo(() => {
    if (!activeWorkspaceSelection) {
      return null;
    }
    const selectedWorkspaceId = activeWorkspaceSelection.workspaceId;
    const selectedServerId = activeWorkspaceSelection.serverId;
    return (
      projects.find((project) =>
        project.workspaces.some(
          (workspace) =>
            workspace.serverId === selectedServerId &&
            workspace.workspaceId === selectedWorkspaceId,
        ),
      )?.projectKey ?? null
    );
  }, [activeWorkspaceSelection, projects]);
  const visibleStatusWorkspaces = useMemo(() => {
    if (groupMode !== "status") {
      return statusWorkspacePlacements;
    }
    if (!selectedProjectKey) {
      return [];
    }
    return statusWorkspacePlacements.filter(
      (workspace) => workspace.projectKey === selectedProjectKey,
    );
  }, [groupMode, selectedProjectKey, statusWorkspacePlacements]);

  const shortcutModel = useMemo(() => {
    if (groupMode === "status") {
      return buildStatusSidebarShortcutModel({
        workspaces: visibleStatusWorkspaces,
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
    visibleStatusWorkspaces,
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
