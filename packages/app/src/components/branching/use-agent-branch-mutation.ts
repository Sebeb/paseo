import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { useToast } from "@/contexts/toast-context";
import { buildWorkspaceTabPersistenceKey } from "@/stores/workspace-tabs-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { buildDeterministicWorkspaceTabId } from "@/workspace-tabs/identity";
import { useRewindComposerRestore } from "@/components/rewind/composer-restore";
import { useSessionStore } from "@/stores/session-store";
import { clearOptimisticUserMessages } from "@/types/stream";
import { agentBranchGroupsQueryKey } from "./query-keys";

interface UseAgentBranchMutationInput {
  serverId?: string;
  workspaceId?: string;
  agentId?: string;
  messageId?: string;
  client?: DaemonClient | null;
}

interface BranchAgentInput {
  rewoundText: string;
}

export function useAgentBranchMutation(input: UseAgentBranchMutationInput): {
  branchAgent: (input: BranchAgentInput) => Promise<void>;
  isPending: boolean;
} {
  const toast = useToast();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const composerRestore = useRewindComposerRestore();
  const { isPending, mutateAsync } = useMutation({
    mutationFn: async ({ rewoundText }: BranchAgentInput) => {
      if (
        !input.client ||
        !input.serverId ||
        !input.workspaceId ||
        !input.agentId ||
        !input.messageId
      ) {
        throw new Error(t("common.errors.daemonClientUnavailable"));
      }

      const result = await input.client.createAgentBranch(input.agentId, input.messageId);
      if (!result.branchAgentId) {
        throw new Error(result.error ?? "Agent branch failed");
      }

      const workspaceKey =
        buildWorkspaceTabPersistenceKey({
          serverId: input.serverId,
          workspaceId: input.workspaceId,
        }) ?? "";
      const layoutStore = useWorkspaceLayoutStore.getState();
      const branchTabId =
        layoutStore.openTabFocused(workspaceKey, {
          kind: "agent",
          agentId: result.branchAgentId,
        }) ??
        buildDeterministicWorkspaceTabId({
          kind: "agent",
          agentId: result.branchAgentId,
        });
      const sourceTabId =
        layoutStore.openTabInBackground(workspaceKey, {
          kind: "agent",
          agentId: input.agentId,
        }) ??
        buildDeterministicWorkspaceTabId({
          kind: "agent",
          agentId: input.agentId,
        });
      layoutStore.attachChildTab(workspaceKey, sourceTabId, branchTabId);

      const session = useSessionStore.getState().sessions[input.serverId];
      useSessionStore.getState().setAgentStreamState(input.serverId, result.branchAgentId, {
        tail: clearOptimisticUserMessages(session?.agentStreamTail.get(result.branchAgentId) ?? []),
        head: clearOptimisticUserMessages(session?.agentStreamHead.get(result.branchAgentId) ?? []),
      });
      await input.client.fetchAgentTimeline(result.branchAgentId, {
        direction: "tail",
        projection: "projected",
      });
      await queryClient.invalidateQueries({
        queryKey: agentBranchGroupsQueryKey(input.serverId, input.agentId),
      });
      await queryClient.invalidateQueries({
        queryKey: agentBranchGroupsQueryKey(input.serverId, result.branchAgentId),
      });
      composerRestore?.restoreTextIfComposerEmpty(rewoundText);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to branch agent");
    },
  });

  const branchAgent = useCallback(
    async (branchInput: BranchAgentInput) => {
      if (isPending) {
        return;
      }
      await mutateAsync(branchInput);
    },
    [isPending, mutateAsync],
  );

  return { branchAgent, isPending };
}
