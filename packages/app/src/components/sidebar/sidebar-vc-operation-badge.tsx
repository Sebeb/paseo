import { memo } from "react";
import { View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  ArrowDownUp,
  Download,
  GitCommitHorizontal,
  GitMerge,
  RefreshCcw,
  Upload,
} from "lucide-react-native";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { GitHubIcon } from "@/components/icons/github-icon";
import { SyncedLoader } from "@/components/synced-loader";
import { type CheckoutGitAsyncActionId, useCheckoutGitActionsStore } from "@/git/actions-store";
import type { Theme } from "@/styles/theme";

const ThemedSyncedLoader = withUnistyles(SyncedLoader);
const ThemedGitCommitHorizontal = withUnistyles(GitCommitHorizontal);
const ThemedDownload = withUnistyles(Download);
const ThemedUpload = withUnistyles(Upload);
const ThemedArrowDownUp = withUnistyles(ArrowDownUp);
const ThemedGitHubIcon = withUnistyles(GitHubIcon);
const ThemedGitMerge = withUnistyles(GitMerge);
const ThemedRefreshCcw = withUnistyles(RefreshCcw);

const whiteColorMapping = () => ({ color: "#ffffff" });

function equalActionIds(
  previous: readonly CheckoutGitAsyncActionId[],
  next: readonly CheckoutGitAsyncActionId[],
): boolean {
  if (previous.length !== next.length) {
    return false;
  }
  return previous.every((actionId, index) => actionId === next[index]);
}

export function usePendingCheckoutBranchActionIds({
  serverId,
  cwd,
}: {
  serverId: string;
  cwd: string | null;
}): CheckoutGitAsyncActionId[] {
  return useStoreWithEqualityFn(
    useCheckoutGitActionsStore,
    (state) => (cwd ? state.getPendingBranchActionIds({ serverId, cwd }) : []),
    equalActionIds,
  );
}

export const SidebarVcOperationBadges = memo(function SidebarVcOperationBadges({
  actionIds,
}: {
  actionIds: readonly CheckoutGitAsyncActionId[];
}) {
  if (actionIds.length === 0) {
    return null;
  }
  return (
    <View style={styles.row}>
      {actionIds.map((actionId) => (
        <SidebarVcOperationBadge key={actionId} actionId={actionId} />
      ))}
    </View>
  );
});

function SidebarVcOperationBadge({ actionId }: { actionId: CheckoutGitAsyncActionId }) {
  return (
    <View style={styles.badge} testID={`sidebar-vc-operation-badge-${actionId}`}>
      <ThemedSyncedLoader size={12} uniProps={whiteColorMapping} />
      <View style={styles.iconOverlay}>
        <VcOperationIcon actionId={actionId} />
      </View>
    </View>
  );
}

function VcOperationIcon({ actionId }: { actionId: CheckoutGitAsyncActionId }) {
  switch (actionId) {
    case "commit":
      return <ThemedGitCommitHorizontal size={8} uniProps={whiteColorMapping} />;
    case "pull":
      return <ThemedDownload size={8} uniProps={whiteColorMapping} />;
    case "push":
      return <ThemedUpload size={8} uniProps={whiteColorMapping} />;
    case "pull-and-push":
      return <ThemedArrowDownUp size={8} uniProps={whiteColorMapping} />;
    case "merge-branch":
      return <ThemedGitMerge size={8} uniProps={whiteColorMapping} />;
    case "merge-from-base":
      return <ThemedRefreshCcw size={8} uniProps={whiteColorMapping} />;
    case "create-pr":
    case "merge-pr-squash":
    case "merge-pr-merge":
    case "merge-pr-rebase":
    case "enable-pr-auto-merge-squash":
    case "enable-pr-auto-merge-merge":
    case "enable-pr-auto-merge-rebase":
    case "disable-pr-auto-merge":
      return <ThemedGitHubIcon size={8} uniProps={whiteColorMapping} />;
    case "refresh":
    case "archive-worktree":
      return null;
  }
}

const styles = StyleSheet.create((theme: Theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexShrink: 0,
  },
  badge: {
    position: "relative",
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  iconOverlay: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.full,
  },
}));
