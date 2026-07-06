import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import { normalizeWorkspaceOpaqueId } from "@/utils/workspace-identity";

export function buildAgentWorkspaceLookup(input: {
  sessionAgents?: ReadonlyMap<string, Agent> | undefined;
  agentDetails?: ReadonlyMap<string, Agent> | undefined;
}): Map<string, Agent> {
  const agentsById = new Map<string, Agent>();
  for (const agent of input.agentDetails?.values() ?? []) {
    agentsById.set(agent.id, agent);
  }
  for (const agent of input.sessionAgents?.values() ?? []) {
    agentsById.set(agent.id, agent);
  }
  return agentsById;
}

export function resolveEffectiveAgentWorkspaceId(input: {
  agent: Agent | null | undefined;
  agentsById: ReadonlyMap<string, Agent>;
  workspaces?: ReadonlyMap<string, WorkspaceDescriptor> | undefined;
}): string | null {
  if (!input.agent) {
    return null;
  }

  const ownWorkspaceId = normalizeWorkspaceOpaqueId(input.agent.workspaceId);
  if (!input.agent.parentAgentId) {
    return ownWorkspaceId;
  }

  const rootAgent = resolveDelegationRootAgent(input.agent, input.agentsById);
  const rootWorkspaceId = normalizeWorkspaceOpaqueId(rootAgent?.workspaceId);
  if (!rootWorkspaceId || !ownWorkspaceId || rootWorkspaceId === ownWorkspaceId) {
    return ownWorkspaceId ?? rootWorkspaceId;
  }

  if (
    workspacesRepresentSameBranch(
      input.workspaces?.get(ownWorkspaceId),
      input.workspaces?.get(rootWorkspaceId),
    )
  ) {
    return rootWorkspaceId;
  }

  return ownWorkspaceId;
}

function resolveDelegationRootAgent(
  agent: Agent,
  agentsById: ReadonlyMap<string, Agent>,
): Agent | null {
  const seen = new Set<string>([agent.id]);
  let current = agent;

  while (true) {
    const parentAgentId = current.parentAgentId;
    if (!parentAgentId) {
      return current;
    }
    if (seen.has(parentAgentId)) {
      return null;
    }
    const parent = agentsById.get(parentAgentId);
    if (!parent) {
      return null;
    }
    seen.add(parentAgentId);
    current = parent;
  }
}

function workspacesRepresentSameBranch(
  left: WorkspaceDescriptor | null | undefined,
  right: WorkspaceDescriptor | null | undefined,
): boolean {
  if (!left || !right || left.id === right.id) {
    return false;
  }
  return (
    left.projectId === right.projectId &&
    trimComparable(left.name) === trimComparable(right.name) &&
    trimComparable(left.projectRootPath) === trimComparable(right.projectRootPath)
  );
}

function trimComparable(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.toLocaleLowerCase() : null;
}
