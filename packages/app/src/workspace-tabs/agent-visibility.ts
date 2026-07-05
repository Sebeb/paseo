import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import type { WorkspaceTabSnapshot } from "@/stores/workspace-layout-actions";
import { shouldAutoOpenAgentTab } from "@/subagents/policies";
import { normalizeWorkspaceOpaqueId } from "@/utils/workspace-identity";

export interface WorkspaceAgentVisibility {
  activeAgentIds: Set<string>;
  autoOpenAgentIds: Set<string>;
  knownAgentIds: Set<string>;
  parentAgentIdByAgentId: Map<string, string>;
}

function trimComparable(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed.toLocaleLowerCase() : null;
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

function resolveAgentWorkspaceId(input: {
  agent: Agent;
  agentsById: ReadonlyMap<string, Agent>;
  workspaces?: ReadonlyMap<string, WorkspaceDescriptor> | undefined;
}): string | null {
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

function agentBelongsToWorkspace(input: {
  agent: Agent;
  agentsById: ReadonlyMap<string, Agent>;
  workspaces?: ReadonlyMap<string, WorkspaceDescriptor> | undefined;
  workspaceId: string;
}): boolean {
  return (
    resolveAgentWorkspaceId({
      agent: input.agent,
      agentsById: input.agentsById,
      workspaces: input.workspaces,
    }) === input.workspaceId
  );
}

function createEmptyWorkspaceAgentVisibility(): WorkspaceAgentVisibility {
  return {
    activeAgentIds: new Set<string>(),
    autoOpenAgentIds: new Set<string>(),
    knownAgentIds: new Set<string>(),
    parentAgentIdByAgentId: new Map<string, string>(),
  };
}

function buildAgentsById(input: {
  sessionAgents: Map<string, Agent> | undefined;
  agentDetails?: Map<string, Agent> | undefined;
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

function recordVisibleSessionAgent(input: {
  agent: Agent;
  sessionAgents: Map<string, Agent> | undefined;
  agentsById: ReadonlyMap<string, Agent>;
  workspaces?: ReadonlyMap<string, WorkspaceDescriptor> | undefined;
  workspaceId: string;
  visibility: WorkspaceAgentVisibility;
}) {
  const { agent, visibility } = input;
  if (
    !agentBelongsToWorkspace({
      agent,
      agentsById: input.agentsById,
      workspaces: input.workspaces,
      workspaceId: input.workspaceId,
    })
  ) {
    return;
  }

  visibility.knownAgentIds.add(agent.id);
  if (agent.archivedAt) {
    return;
  }

  visibility.activeAgentIds.add(agent.id);
  const parentAgent = agent.parentAgentId ? input.sessionAgents?.get(agent.parentAgentId) : null;
  const hasSameWorkspaceParent = parentAgent
    ? agentBelongsToWorkspace({
        agent: parentAgent,
        agentsById: input.agentsById,
        workspaces: input.workspaces,
        workspaceId: input.workspaceId,
      })
    : false;
  if (agent.parentAgentId && hasSameWorkspaceParent) {
    visibility.parentAgentIdByAgentId.set(agent.id, agent.parentAgentId);
    visibility.autoOpenAgentIds.add(agent.id);
    return;
  }
  if (shouldAutoOpenAgentTab(agent)) {
    visibility.autoOpenAgentIds.add(agent.id);
  }
}

function recordVisibleKnownAgent(input: {
  agent: Agent;
  agentsById: ReadonlyMap<string, Agent>;
  workspaces?: ReadonlyMap<string, WorkspaceDescriptor> | undefined;
  workspaceId: string;
  knownAgentIds: Set<string>;
}) {
  if (
    agentBelongsToWorkspace({
      agent: input.agent,
      agentsById: input.agentsById,
      workspaces: input.workspaces,
      workspaceId: input.workspaceId,
    })
  ) {
    input.knownAgentIds.add(input.agent.id);
  }
}

export function deriveWorkspaceAgentVisibility(input: {
  sessionAgents: Map<string, Agent> | undefined;
  agentDetails?: Map<string, Agent> | undefined;
  workspaces?: ReadonlyMap<string, WorkspaceDescriptor> | undefined;
  workspaceId: string | null | undefined;
}): WorkspaceAgentVisibility {
  const { sessionAgents, agentDetails } = input;
  const workspaceId = normalizeWorkspaceOpaqueId(input.workspaceId);
  if ((!sessionAgents && !agentDetails) || !workspaceId) {
    return createEmptyWorkspaceAgentVisibility();
  }

  const visibility = createEmptyWorkspaceAgentVisibility();
  const agentsById = buildAgentsById({ sessionAgents, agentDetails });
  for (const agent of sessionAgents?.values() ?? []) {
    recordVisibleSessionAgent({
      agent,
      sessionAgents,
      agentsById,
      workspaces: input.workspaces,
      workspaceId,
      visibility,
    });
  }
  for (const agent of agentDetails?.values() ?? []) {
    recordVisibleKnownAgent({
      agent,
      agentsById,
      workspaces: input.workspaces,
      workspaceId,
      knownAgentIds: visibility.knownAgentIds,
    });
  }

  return visibility;
}

export function buildWorkspaceTabSnapshot(input: {
  agentVisibility: WorkspaceAgentVisibility;
  agentsHydrated: boolean;
  terminalsHydrated: boolean;
  knownTerminalIds: Iterable<string>;
  standaloneTerminalIds: Iterable<string>;
  hasActivePendingDraftCreate: boolean;
}): WorkspaceTabSnapshot {
  return {
    agentsHydrated: input.agentsHydrated,
    terminalsHydrated: input.terminalsHydrated,
    activeAgentIds: input.agentVisibility.activeAgentIds,
    autoOpenAgentIds: input.agentVisibility.autoOpenAgentIds,
    knownAgentIds: input.agentVisibility.knownAgentIds,
    parentAgentIdByAgentId: input.agentVisibility.parentAgentIdByAgentId,
    knownTerminalIds: input.knownTerminalIds,
    standaloneTerminalIds: input.standaloneTerminalIds,
    hasActivePendingDraftCreate: input.hasActivePendingDraftCreate,
  };
}

export function workspaceAgentVisibilityEqual(
  a: WorkspaceAgentVisibility,
  b: WorkspaceAgentVisibility,
): boolean {
  return (
    setsEqual(a.activeAgentIds, b.activeAgentIds) &&
    setsEqual(a.autoOpenAgentIds, b.autoOpenAgentIds) &&
    setsEqual(a.knownAgentIds, b.knownAgentIds) &&
    mapsEqual(a.parentAgentIdByAgentId, b.parentAgentIdByAgentId)
  );
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const item of a) {
    if (!b.has(item)) {
      return false;
    }
  }
  return true;
}

function mapsEqual(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const [key, value] of a) {
    if (b.get(key) !== value) {
      return false;
    }
  }
  return true;
}

// Prune agent tabs that are no longer active once agents are hydrated.
// Archived agents get pruned so that archiving on one client closes the tab on all clients.
export function shouldPruneWorkspaceAgentTab(input: {
  agentId: string;
  agentsHydrated: boolean;
  activeAgentIds: Set<string>;
}): boolean {
  if (!input.agentId.trim()) {
    return false;
  }
  if (!input.agentsHydrated) {
    return false;
  }
  return !input.activeAgentIds.has(input.agentId);
}
