import type { Agent, WorkspaceDescriptor } from "@/stores/session-store";
import type { WorkspaceTabSnapshot } from "@/stores/workspace-layout-actions";
import { shouldAutoOpenAgentTab } from "@/subagents/policies";
import { normalizeWorkspaceOpaqueId } from "@/utils/workspace-identity";
import {
  buildAgentWorkspaceLookup,
  resolveEffectiveAgentWorkspaceId,
} from "@/workspace-tabs/agent-workspace-resolution";

export interface WorkspaceAgentVisibility {
  activeAgentIds: Set<string>;
  autoOpenAgentIds: Set<string>;
  knownAgentIds: Set<string>;
  parentAgentIdByAgentId: Map<string, string>;
  branchGroupIdsByAgentId: Map<string, readonly string[]>;
}

function agentBelongsToWorkspace(input: {
  agent: Agent;
  agentsById: ReadonlyMap<string, Agent>;
  workspaces?: ReadonlyMap<string, WorkspaceDescriptor> | undefined;
  workspaceId: string;
}): boolean {
  return (
    resolveEffectiveAgentWorkspaceId({
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
    branchGroupIdsByAgentId: new Map<string, readonly string[]>(),
  };
}

function hasKnownSeparateWorkspaceParent(input: {
  agent: Agent;
  agentsById: ReadonlyMap<string, Agent>;
  workspaces?: ReadonlyMap<string, WorkspaceDescriptor> | undefined;
  workspaceId: string;
}): boolean {
  const parentAgentId = input.agent.parentAgentId;
  if (!parentAgentId) {
    return false;
  }
  const ownWorkspaceId = normalizeWorkspaceOpaqueId(input.agent.workspaceId);
  if (ownWorkspaceId !== input.workspaceId) {
    return false;
  }
  const parentWorkspaceId = normalizeWorkspaceOpaqueId(
    input.agentsById.get(parentAgentId)?.workspaceId,
  );
  if (!parentWorkspaceId || parentWorkspaceId === input.workspaceId) {
    return false;
  }
  return Boolean(
    input.workspaces?.has(input.workspaceId) && input.workspaces.has(parentWorkspaceId),
  );
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
  const branchGroupIds = [
    ...new Set((agent.branching?.memberships ?? []).map((membership) => membership.groupId)),
  ].sort();
  if (branchGroupIds.length > 0) {
    visibility.branchGroupIdsByAgentId.set(agent.id, branchGroupIds);
  }
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
  if (
    agent.parentAgentId &&
    parentAgent &&
    !hasKnownSeparateWorkspaceParent({
      agent,
      agentsById: input.agentsById,
      workspaces: input.workspaces,
      workspaceId: input.workspaceId,
    })
  ) {
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
  const agentsById = buildAgentWorkspaceLookup({ sessionAgents, agentDetails });
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
    branchGroupIdsByAgentId: input.agentVisibility.branchGroupIdsByAgentId,
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
    mapsEqual(a.parentAgentIdByAgentId, b.parentAgentIdByAgentId) &&
    stringArrayMapsEqual(a.branchGroupIdsByAgentId, b.branchGroupIdsByAgentId)
  );
}

function stringArrayMapsEqual(
  a: Map<string, readonly string[]>,
  b: Map<string, readonly string[]>,
): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const [key, valuesA] of a) {
    const valuesB = b.get(key);
    if (!valuesB || valuesA.length !== valuesB.length) {
      return false;
    }
    for (let index = 0; index < valuesA.length; index += 1) {
      if (valuesA[index] !== valuesB[index]) {
        return false;
      }
    }
  }
  return true;
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
