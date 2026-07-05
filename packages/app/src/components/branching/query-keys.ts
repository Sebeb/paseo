export function agentBranchGroupsQueryKey(serverId: string, agentId: string) {
  return [serverId, "agent-branch-groups", agentId] as const;
}
