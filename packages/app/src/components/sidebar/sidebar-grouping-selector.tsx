import { useCallback } from "react";
import { Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Check, Settings2 } from "lucide-react-native";
import type { Theme } from "@/styles/theme";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useSidebarViewStore, type SidebarGroupMode } from "@/stores/sidebar-view-store";
import { useHosts, useHostRuntimeSnapshot } from "@/runtime/host-runtime";
import { formatConnectionStatus } from "@/utils/daemons";
import { isWeb as platformIsWeb } from "@/constants/platform";

const ThemedSettings2 = withUnistyles(Settings2);
const filterColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const GROUP_MODE_ITEMS: Array<{ value: SidebarGroupMode; label: string }> = [
  { value: "project", label: "Project" },
  { value: "status", label: "Status" },
];

export function SidebarGroupingSelector() {
  const groupMode = useSidebarViewStore((state) => state.groupMode);
  const hostFilter = useSidebarViewStore((state) => state.hostFilter);
  const setGroupMode = useSidebarViewStore((state) => state.setGroupMode);
  const setHostFilter = useSidebarViewStore((state) => state.setHostFilter);
  const hosts = useHosts();

  const handleSelectMode = useCallback(
    (mode: SidebarGroupMode) => {
      setGroupMode(mode);
    },
    [setGroupMode],
  );

  const handleSelectHost = useCallback(
    (serverId: string | null) => {
      setHostFilter(serverId);
    },
    [setHostFilter],
  );

  const triggerStyle = useCallback(
    ({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.trigger,
      hovered && styles.triggerHovered,
    ],
    [],
  );

  const showHostFilter = hosts.length > 1;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        style={triggerStyle}
        accessibilityRole={platformIsWeb ? undefined : "button"}
        accessibilityLabel="Sidebar grouping"
        testID="sidebar-grouping-selector"
      >
        <ThemedSettings2 size={14} uniProps={filterColorMapping} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" width={200} testID="sidebar-grouping-menu">
        <View style={styles.menuHeader}>
          <Text style={styles.menuHeaderLabel}>Group by</Text>
        </View>
        {GROUP_MODE_ITEMS.map((item) => (
          <GroupModeMenuItem
            key={item.value}
            item={item}
            isSelected={groupMode === item.value}
            onSelect={handleSelectMode}
          />
        ))}
        {showHostFilter && (
          <>
            <View style={styles.separator} />
            <View style={styles.menuHeader}>
              <Text style={styles.menuHeaderLabel}>Filter</Text>
            </View>
            <HostFilterItem
              label="All hosts"
              value={null}
              hostFilter={hostFilter}
              onSelect={handleSelectHost}
            />
            {hosts.map((host) => (
              <HostFilterItem
                key={host.serverId}
                label={host.label?.trim() || host.serverId}
                serverId={host.serverId}
                value={host.serverId}
                hostFilter={hostFilter}
                onSelect={handleSelectHost}
              />
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GroupModeMenuItem({
  item,
  isSelected,
  onSelect,
}: {
  item: { value: SidebarGroupMode; label: string };
  isSelected: boolean;
  onSelect: (mode: SidebarGroupMode) => void;
}) {
  const handleSelect = useCallback(() => onSelect(item.value), [item.value, onSelect]);
  return (
    <DropdownMenuItem
      testID={`sidebar-grouping-${item.value}`}
      selected={isSelected}
      onSelect={handleSelect}
    >
      {item.label}
    </DropdownMenuItem>
  );
}

function HostFilterItem({
  label,
  serverId,
  value,
  hostFilter,
  onSelect,
}: {
  label: string;
  serverId?: string;
  value: string | null;
  hostFilter: string | null;
  onSelect: (serverId: string | null) => void;
}) {
  const isSelected = hostFilter === value;
  const handleSelect = useCallback(() => onSelect(value), [value, onSelect]);
  const status = useHostRuntimeSnapshot(serverId ?? "");
  const subtitle = serverId
    ? formatConnectionStatus(status?.connectionStatus ?? "idle")
    : undefined;

  return (
    <DropdownMenuItem selected={isSelected} onSelect={handleSelect}>
      <View style={styles.filterItem}>
        <View style={styles.filterItemText}>
          <Text style={styles.filterItemLabel}>{label}</Text>
          {subtitle && <Text style={styles.filterItemSubtitle}>{subtitle}</Text>}
        </View>
        {isSelected && <Check size={14} color={"#3b82f6"} />}
      </View>
    </DropdownMenuItem>
  );
}

const styles = StyleSheet.create((theme) => ({
  trigger: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  triggerHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  menuHeader: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
  menuHeaderLabel: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foregroundMuted,
  },
  separator: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing[1],
    marginHorizontal: theme.spacing[2],
  },
  filterItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flex: 1,
  },
  filterItemText: {
    flex: 1,
  },
  filterItemLabel: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  filterItemSubtitle: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
}));
