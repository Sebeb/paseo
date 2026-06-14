import { useMemo, type ReactElement, type ReactNode } from "react";
import { Text, View } from "react-native";
import { Plus } from "lucide-react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { HostStatusDot } from "@/components/host-status-dot";
import { ComboboxItem } from "@/components/ui/combobox";

export const ADD_HOST_OPTION_ID = "__add_host__";

export function HostStatusDotSlot({ serverId }: { serverId: string }): ReactElement {
  return (
    <View style={styles.statusDotSlot}>
      <HostStatusDot serverId={serverId} />
    </View>
  );
}

export interface HostPickerOptionProps {
  serverId: string;
  label: string;
  isLocal: boolean;
  selected?: boolean;
  active: boolean;
  interactiveFeedback?: boolean;
  onPress: () => void;
  trailingAction?: ReactNode;
  localMarkerTestID?: string;
  testID?: string;
}

export function HostPickerOption({
  serverId,
  label,
  isLocal,
  selected,
  active,
  interactiveFeedback,
  onPress,
  trailingAction,
  localMarkerTestID,
  testID,
}: HostPickerOptionProps): ReactElement {
  const leadingSlot = useMemo(() => <HostStatusDotSlot serverId={serverId} />, [serverId]);
  const trailingSlot = useMemo(() => {
    if (!isLocal && !trailingAction) {
      return undefined;
    }
    return (
      <>
        {isLocal ? (
          <Text style={styles.localMarker} testID={localMarkerTestID}>
            Local
          </Text>
        ) : null}
        {trailingAction}
      </>
    );
  }, [isLocal, localMarkerTestID, trailingAction]);

  return (
    <ComboboxItem
      label={label}
      leadingSlot={leadingSlot}
      trailingSlot={trailingSlot}
      selected={selected}
      active={active}
      interactiveFeedback={interactiveFeedback}
      onPress={onPress}
      testID={testID}
    />
  );
}

export function AddHostPickerOption({
  active,
  onPress,
  testID,
  interactiveFeedback,
}: {
  active: boolean;
  onPress: () => void;
  testID?: string;
  interactiveFeedback?: boolean;
}): ReactElement {
  const { theme } = useUnistyles();
  const leadingSlot = useMemo(
    () => <Plus size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />,
    [theme.iconSize.sm, theme.colors.foregroundMuted],
  );

  return (
    <ComboboxItem
      label="Add host"
      leadingSlot={leadingSlot}
      active={active}
      interactiveFeedback={interactiveFeedback}
      onPress={onPress}
      testID={testID}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  statusDotSlot: {
    width: theme.iconSize.sm,
    height: theme.iconSize.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  localMarker: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
    marginLeft: theme.spacing[1],
  },
}));
