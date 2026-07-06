import type {
  SidebarProjectEntry,
  SidebarWorkspaceEntry,
} from "@/hooks/use-sidebar-workspaces-list";
import type { WorkspaceTitleSource } from "@/hooks/use-settings";
import { resolveSidebarWorkspacePrimaryLabel } from "@/components/sidebar/sidebar-workspace-title";

export interface SidebarStatusTabLine {
  projectKey: string;
  projectName: string;
  iconDataUri: string | null;
  kind?: "project" | "workspace";
  workspaceKind?: SidebarWorkspaceEntry["workspaceKind"];
}

export function buildStatusTabLine(input: {
  lineKind: "project" | "workspace";
  project: Pick<SidebarProjectEntry, "projectKey" | "projectName">;
  workspace: Pick<
    SidebarWorkspaceEntry,
    "workspaceKey" | "workspaceKind" | "name" | "currentBranch"
  >;
  iconDataUri: string | null;
  workspaceTitleSource: WorkspaceTitleSource;
}): SidebarStatusTabLine {
  if (input.lineKind === "workspace") {
    return {
      projectKey: input.workspace.workspaceKey,
      projectName: resolveSidebarWorkspacePrimaryLabel({
        workspace: input.workspace,
        workspaceTitleSource: input.workspaceTitleSource,
      }),
      iconDataUri: null,
      kind: "workspace",
      workspaceKind: input.workspace.workspaceKind,
    };
  }

  return {
    projectKey: input.project.projectKey,
    projectName: input.project.projectName,
    iconDataUri: input.iconDataUri,
    kind: "project",
  };
}
