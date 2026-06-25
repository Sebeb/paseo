import { useCallback, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { getDesktopHost } from "@/desktop/host";
import { useArchiveAgent } from "@/hooks/use-archive-agent";
import { useHostRuntimeClient } from "@/runtime/host-runtime";
import { useBrowserStore } from "@/stores/browser-store";
import { useSessionStore } from "@/stores/session-store";
import {
  buildWorkspaceTabPersistenceKey,
  useWorkspaceLayoutStore,
} from "@/stores/workspace-layout-store";
import type { WorkspaceTab, WorkspaceTabTarget } from "@/stores/workspace-tabs-store";
import { resolveCloseAgentTabPolicy } from "@/subagents";
import { confirmDialog } from "@/utils/confirm-dialog";
import {
  buildTerminalsQueryKey,
  removeTerminalFromPayload,
  type ListTerminalsPayload,
} from "./terminals/state";

const EMPTY_SET = new Set<string>();

interface UseCloseTabsResult {
  closingTabIds: Set<string>;
  closeTab: (tabId: string, action: () => Promise<void>) => Promise<void>;
}

function useCloseTabs(): UseCloseTabsResult {
  const pendingRef = useRef(new Set<string>());
  const [closingTabIds, setClosingTabIds] = useState<Set<string>>(EMPTY_SET);

  const closeTab = useCallback(async (tabId: string, action: () => Promise<void>) => {
    const normalized = tabId.trim();
    if (!normalized || pendingRef.current.has(normalized)) {
      return;
    }
    pendingRef.current.add(normalized);
    setClosingTabIds(new Set(pendingRef.current));
    try {
      await action();
    } finally {
      pendingRef.current.delete(normalized);
      setClosingTabIds(new Set(pendingRef.current));
    }
  }, []);

  return { closingTabIds, closeTab };
}

function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export interface CloseWorkspaceTabWithCleanupInput {
  tabId: string;
  target?: WorkspaceTabTarget | null;
}

interface UseWorkspaceTabCloseInput {
  serverId: string;
  workspaceId: string;
  workspaceDirectory?: string | null;
  tabs: readonly WorkspaceTab[];
  orderedTabIds?: readonly string[] | null;
  onTabClosed?: (tabId: string) => void;
}

export function useWorkspaceTabClose(input: UseWorkspaceTabCloseInput) {
  const { serverId, workspaceId, workspaceDirectory, tabs, orderedTabIds, onTabClosed } = input;
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const client = useHostRuntimeClient(serverId);
  const { archiveAgent } = useArchiveAgent();
  const { closingTabIds, closeTab } = useCloseTabs();
  const closeWorkspaceTab = useWorkspaceLayoutStore((state) => state.closeTab);
  const unpinWorkspaceAgent = useWorkspaceLayoutStore((state) => state.unpinAgent);
  const hideWorkspaceAgent = useWorkspaceLayoutStore((state) => state.hideAgent);
  const persistenceKey = useMemo(
    () => buildWorkspaceTabPersistenceKey({ serverId, workspaceId }),
    [serverId, workspaceId],
  );
  const terminalsQueryKey = useMemo(
    () => buildTerminalsQueryKey(serverId, workspaceDirectory ?? null, workspaceId || null),
    [serverId, workspaceDirectory, workspaceId],
  );
  const tabTargetById = useMemo(() => new Map(tabs.map((tab) => [tab.tabId, tab.target])), [tabs]);

  const closeWorkspaceTabWithCleanup = useCallback(
    function closeWorkspaceTabWithCleanup(closeInput: CloseWorkspaceTabWithCleanupInput) {
      const normalizedTabId = trimNonEmpty(closeInput.tabId);
      if (!normalizedTabId || !persistenceKey) {
        return;
      }

      if (closeInput.target?.kind === "agent") {
        unpinWorkspaceAgent(persistenceKey, closeInput.target.agentId);
        hideWorkspaceAgent(persistenceKey, closeInput.target.agentId);
      }
      if (closeInput.target?.kind === "browser") {
        const { browserId } = closeInput.target;
        useBrowserStore.getState().removeBrowser(browserId);
        void getDesktopHost()?.browser?.clearPartition?.(browserId);
      }
      closeWorkspaceTab(persistenceKey, normalizedTabId, orderedTabIds);
      onTabClosed?.(normalizedTabId);
    },
    [
      closeWorkspaceTab,
      hideWorkspaceAgent,
      onTabClosed,
      orderedTabIds,
      persistenceKey,
      unpinWorkspaceAgent,
    ],
  );

  const invalidateTerminals = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: terminalsQueryKey });
  }, [queryClient, terminalsQueryKey]);

  const removeTerminalFromCache = useCallback(
    (terminalId: string) => {
      queryClient.setQueryData<ListTerminalsPayload>(
        terminalsQueryKey,
        removeTerminalFromPayload(terminalId),
      );
    },
    [queryClient, terminalsQueryKey],
  );

  const killTerminal = useCallback(
    async (terminalId: string) => {
      if (!client) {
        throw new Error(t("workspace.terminal.hostDisconnected"));
      }
      const payload = await client.killTerminal(terminalId);
      if (!payload.success) {
        throw new Error("Unable to close terminal");
      }
    },
    [client, t],
  );

  const handleCloseTerminalTab = useCallback(
    async (closeInput: { tabId: string; terminalId: string }) => {
      const { tabId, terminalId } = closeInput;
      await closeTab(tabId, async () => {
        const confirmed = await confirmDialog({
          title: t("workspace.tabs.confirmations.closeTerminalTitle"),
          message: t("workspace.tabs.confirmations.closeTerminalMessage"),
          confirmLabel: t("workspace.tabs.confirmations.close"),
          cancelLabel: t("workspace.tabs.confirmations.cancel"),
          destructive: true,
        });
        if (!confirmed) {
          return;
        }

        removeTerminalFromCache(terminalId);
        closeWorkspaceTabWithCleanup({
          tabId,
          target: { kind: "terminal", terminalId },
        });

        void killTerminal(terminalId).catch(invalidateTerminals);
      });
    },
    [
      closeTab,
      closeWorkspaceTabWithCleanup,
      invalidateTerminals,
      killTerminal,
      removeTerminalFromCache,
      t,
    ],
  );

  const handleCloseAgentTab = useCallback(
    async (closeInput: { tabId: string; agentId: string }) => {
      const { tabId, agentId } = closeInput;
      await closeTab(tabId, async () => {
        if (!serverId) {
          return;
        }

        const agent = useSessionStore.getState().sessions[serverId]?.agents?.get(agentId) ?? null;
        const closePolicy = resolveCloseAgentTabPolicy(agent);
        const isRunning = agent?.status === "running";

        if (isRunning && closePolicy.kind === "archive-on-close") {
          const confirmed = await confirmDialog({
            title: t("workspace.tabs.confirmations.archiveRunningAgentTitle"),
            message: t("workspace.tabs.confirmations.archiveRunningAgentMessage"),
            confirmLabel: t("workspace.tabs.confirmations.archive"),
            cancelLabel: t("workspace.tabs.confirmations.cancel"),
            destructive: true,
          });
          if (!confirmed) {
            return;
          }
        }

        closeWorkspaceTabWithCleanup({
          tabId,
          target: { kind: "agent", agentId },
        });

        if (closePolicy.kind === "layout-only") {
          return;
        }

        // Errors (e.g. timeout) are handled by the mutation's onSettled callback.
        void archiveAgent({ serverId, agentId }).catch(() => {});
      });
    },
    [archiveAgent, closeTab, closeWorkspaceTabWithCleanup, serverId, t],
  );

  const handleClosePassiveTab = useCallback(
    function handleClosePassiveTab(closeInput: {
      tabId: string;
      target?: WorkspaceTabTarget | null;
    }) {
      closeWorkspaceTabWithCleanup({ tabId: closeInput.tabId, target: closeInput.target });
    },
    [closeWorkspaceTabWithCleanup],
  );

  const handleCloseTabById = useCallback(
    async (tabId: string) => {
      const target = tabTargetById.get(tabId);
      if (!target) {
        return;
      }
      if (target.kind === "terminal") {
        await handleCloseTerminalTab({ tabId, terminalId: target.terminalId });
        return;
      }
      if (target.kind === "agent") {
        await handleCloseAgentTab({ tabId, agentId: target.agentId });
        return;
      }
      handleClosePassiveTab({ tabId, target });
    },
    [handleCloseAgentTab, handleClosePassiveTab, handleCloseTerminalTab, tabTargetById],
  );

  return {
    closingTabIds,
    closeTab,
    closeWorkspaceTabWithCleanup,
    handleCloseTabById,
  };
}
