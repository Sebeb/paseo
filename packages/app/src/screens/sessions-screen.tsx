import { useMemo, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { Pressable, type PressableStateCallbackType, View, Text } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { ChevronDown, ChevronLeft, Server } from "lucide-react-native";
import { MenuHeader } from "@/components/headers/menu-header";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { AgentList } from "@/components/agent-list";
import { HostStatusDotSlot } from "@/components/hosts/host-picker-options";
import { Combobox, ComboboxItem, type ComboboxOption } from "@/components/ui/combobox";
import { useAgentHistory } from "@/hooks/use-agent-history";
import { useLocalDaemonServerId } from "@/hooks/use-is-local-daemon";
import { useHosts } from "@/runtime/host-runtime";
import { orderHostsLocalFirst, type HostProfile } from "@/types/host-connection";
import { buildOpenProjectRoute } from "@/utils/host-routes";

const ALL_HOSTS_FILTER_VALUE = "__all_hosts__";

export function SessionsScreen() {
  const isFocused = useIsFocused();

  if (!isFocused) {
    return <View style={styles.container} />;
  }

  return <SessionsScreenContent />;
}

function SessionsHostFilter({
  hosts,
  selectedHost,
  onSelectHost,
}: {
  hosts: HostProfile[];
  selectedHost: string;
  onSelectHost: (serverId: string) => void;
}) {
  const { theme } = useUnistyles();
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterAnchorRef = useRef<View>(null);

  const filterComboboxOptions = useMemo<ComboboxOption[]>(
    () => [
      { id: ALL_HOSTS_FILTER_VALUE, label: "All hosts" },
      ...hosts.map((host) => ({ id: host.serverId, label: host.label })),
    ],
    [hosts],
  );

  const selectedHostLabel = useMemo(
    () => filterComboboxOptions.find((option) => option.id === selectedHost)?.label ?? "All hosts",
    [filterComboboxOptions, selectedHost],
  );

  const handleFilterOpen = useCallback(() => setIsFilterOpen(true), []);

  const filterTriggerStyle = useCallback(
    ({ pressed, hovered = false }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.filterTrigger,
      Boolean(hovered) && styles.filterTriggerHovered,
      pressed && styles.filterTriggerPressed,
    ],
    [],
  );

  const handleFilterSelect = useCallback(
    (id: string) => {
      onSelectHost(id);
      setIsFilterOpen(false);
    },
    [onSelectHost],
  );

  const filterOptionIcons = useMemo(() => {
    const map = new Map<string, ReactNode>();
    map.set(ALL_HOSTS_FILTER_VALUE, <Server size={14} color={theme.colors.foregroundMuted} />);
    for (const host of hosts) {
      map.set(host.serverId, <HostStatusDotSlot serverId={host.serverId} />);
    }
    return map;
  }, [hosts, theme.colors.foregroundMuted]);

  const renderFilterOption = useCallback(
    ({
      option,
      selected,
      active,
      onPress,
    }: {
      option: ComboboxOption;
      selected: boolean;
      active: boolean;
      onPress: () => void;
    }) => (
      <ComboboxItem
        label={option.label}
        selected={selected}
        active={active}
        onPress={onPress}
        leadingSlot={filterOptionIcons.get(option.id)}
      />
    ),
    [filterOptionIcons],
  );

  return (
    <View ref={filterAnchorRef} collapsable={false} style={styles.filterTriggerWrap}>
      <Pressable
        onPress={handleFilterOpen}
        style={filterTriggerStyle}
        testID="sessions-host-filter-trigger"
        accessibilityRole="button"
        accessibilityLabel={`Filter: ${selectedHostLabel}`}
      >
        {selectedHost === ALL_HOSTS_FILTER_VALUE ? (
          <Server size={14} color={theme.colors.foregroundMuted} />
        ) : (
          <HostStatusDotSlot serverId={selectedHost} />
        )}
        <Text style={styles.filterTriggerText} numberOfLines={1}>
          {selectedHostLabel}
        </Text>
        <ChevronDown size={14} color={theme.colors.foregroundMuted} />
      </Pressable>
      <Combobox
        options={filterComboboxOptions}
        value={selectedHost}
        onSelect={handleFilterSelect}
        renderOption={renderFilterOption}
        searchable={false}
        title="Filter by host"
        open={isFilterOpen}
        onOpenChange={setIsFilterOpen}
        anchorRef={filterAnchorRef}
        desktopPlacement="bottom-start"
        desktopPreventInitialFlash
      />
    </View>
  );
}

function SessionsScreenContent() {
  const { theme } = useUnistyles();
  const hosts = useHosts();
  const localServerId = useLocalDaemonServerId();
  const orderedHosts = useMemo(
    () => orderHostsLocalFirst(hosts, localServerId),
    [hosts, localServerId],
  );
  const [selectedHost, setSelectedHost] = useState(ALL_HOSTS_FILTER_VALUE);
  const { agents, hasMore, isInitialLoad, isLoadingMore, isRevalidating, loadMore, refreshAll } =
    useAgentHistory({});

  useEffect(() => {
    if (
      selectedHost !== ALL_HOSTS_FILTER_VALUE &&
      !orderedHosts.some((host) => host.serverId === selectedHost)
    ) {
      setSelectedHost(ALL_HOSTS_FILTER_VALUE);
    }
  }, [orderedHosts, selectedHost]);

  const [isManualRefresh, setIsManualRefresh] = useState(false);

  const handleRefresh = useCallback(() => {
    setIsManualRefresh(true);
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (!isRevalidating && isManualRefresh) {
      setIsManualRefresh(false);
    }
  }, [isRevalidating, isManualRefresh]);

  const sortedAgents = useMemo(() => {
    return [...agents].sort((a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime());
  }, [agents]);

  const visibleAgents = useMemo(() => {
    if (selectedHost === ALL_HOSTS_FILTER_VALUE) {
      return sortedAgents;
    }
    return sortedAgents.filter((agent) => agent.serverId === selectedHost);
  }, [selectedHost, sortedAgents]);

  const emptyText =
    selectedHost === ALL_HOSTS_FILTER_VALUE ? "No sessions yet" : "No sessions for this host";
  const showHostFilter = orderedHosts.length > 1;

  const handleBack = useCallback(() => {
    router.navigate(buildOpenProjectRoute());
  }, []);

  const listFooterComponent = useMemo(
    () =>
      hasMore ? (
        <View style={styles.footer}>
          <Button variant="ghost" onPress={loadMore} disabled={isLoadingMore}>
            {isLoadingMore ? "Loading..." : "Load more"}
          </Button>
        </View>
      ) : null,
    [hasMore, loadMore, isLoadingMore],
  );

  return (
    <View style={styles.container}>
      <MenuHeader title="Sessions" />
      {showHostFilter ? (
        <View style={styles.filterContainer}>
          <SessionsHostFilter
            hosts={orderedHosts}
            selectedHost={selectedHost}
            onSelectHost={setSelectedHost}
          />
        </View>
      ) : null}
      {isInitialLoad ? (
        <View style={styles.loadingContainer}>
          <LoadingSpinner size="large" color={theme.colors.foregroundMuted} />
        </View>
      ) : null}
      {!isInitialLoad && visibleAgents.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{emptyText}</Text>
          <Button variant="ghost" leftIcon={ChevronLeft} onPress={handleBack}>
            Back
          </Button>
        </View>
      ) : null}
      {!isInitialLoad && visibleAgents.length > 0 ? (
        <AgentList
          agents={visibleAgents}
          showCheckoutInfo={false}
          isRefreshing={isManualRefresh && isRevalidating}
          onRefresh={handleRefresh}
          listFooterComponent={listFooterComponent}
          showAttentionIndicator={false}
          showHostColumn
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface0,
  },
  filterContainer: {
    paddingHorizontal: {
      xs: theme.spacing[3],
      md: theme.spacing[6],
    },
    paddingTop: theme.spacing[4],
  },
  filterTriggerWrap: {
    alignSelf: "flex-start",
  },
  filterTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    alignSelf: "flex-start",
    paddingVertical: theme.spacing[1.5],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface1,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
  filterTriggerHovered: {
    backgroundColor: theme.colors.surface2,
  },
  filterTriggerPressed: {
    backgroundColor: theme.colors.surface3,
  },
  filterTriggerText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: theme.spacing[6],
    padding: theme.spacing[6],
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.lg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  footer: {
    alignItems: "center",
    paddingVertical: theme.spacing[4],
  },
}));
