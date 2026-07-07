import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type PressableStateCallbackType,
} from "react-native";
import { memo, useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  ChevronRight,
  Clock3,
  FileText,
  Folder,
  Globe,
  Home,
  Monitor,
  Plus,
  Save,
  Settings,
  Terminal,
} from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useCommandCenter, type CommandCenterItem } from "@/hooks/use-command-center";
import { formatTimeAgo } from "@/utils/time";
import { AgentStatusDot } from "@/components/agent-status-dot";
import { Shortcut } from "@/components/ui/shortcut";
import { isNative, isWeb } from "@/constants/platform";
import { useIsCompactFormFactor } from "@/constants/layout";
import {
  IsolatedBottomSheetModal,
  useIsolatedBottomSheetVisibility,
} from "@/components/ui/isolated-bottom-sheet-modal";
import {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";

const ThemedBottomSheetTextInput = withUnistyles(BottomSheetTextInput, (theme) => ({
  placeholderTextColor: theme.colors.foregroundMuted,
}));
const ThemedTextInput = withUnistyles(TextInput, (theme) => ({
  placeholderTextColor: theme.colors.foregroundMuted,
}));
const ThemedPlus = withUnistyles(Plus, (theme) => ({ color: theme.colors.foregroundMuted }));
const ThemedSettings = withUnistyles(Settings, (theme) => ({
  color: theme.colors.foregroundMuted,
}));
const ThemedHome = withUnistyles(Home, (theme) => ({ color: theme.colors.foregroundMuted }));
const ThemedArrowLeft = withUnistyles(ArrowLeft, (theme) => ({
  color: theme.colors.foregroundMuted,
}));
const ThemedArrowRight = withUnistyles(ArrowRight, (theme) => ({
  color: theme.colors.foregroundMuted,
}));
const ThemedSave = withUnistyles(Save, (theme) => ({ color: theme.colors.foregroundMuted }));
const ThemedFolder = withUnistyles(Folder, (theme) => ({ color: theme.colors.foregroundMuted }));
const ThemedMonitor = withUnistyles(Monitor, (theme) => ({ color: theme.colors.foregroundMuted }));
const ThemedTerminal = withUnistyles(Terminal, (theme) => ({
  color: theme.colors.foregroundMuted,
}));
const ThemedGlobe = withUnistyles(Globe, (theme) => ({ color: theme.colors.foregroundMuted }));
const ThemedFileText = withUnistyles(FileText, (theme) => ({
  color: theme.colors.foregroundMuted,
}));
const ThemedBot = withUnistyles(Bot, (theme) => ({ color: theme.colors.foregroundMuted }));
const ThemedChevronRight = withUnistyles(ChevronRight, (theme) => ({
  color: theme.colors.foregroundMuted,
}));
const ThemedClock = withUnistyles(Clock3, (theme) => ({ color: theme.colors.foregroundMuted }));

interface CommandCenterRowProps {
  active: boolean;
  children: ReactNode;
  onPress: () => void;
  registerRow: (el: View | null) => void;
  onLayout?: (event: { nativeEvent: { layout: { y: number; height: number } } }) => void;
}

const CommandCenterRow = memo(function CommandCenterRow({
  active,
  children,
  onPress,
  registerRow,
  onLayout,
}: CommandCenterRowProps) {
  const pressableStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.row,
      (Boolean(hovered) || pressed || active) && styles.rowActive,
    ],
    [active],
  );

  return (
    <Pressable ref={registerRow} style={pressableStyle} onPress={onPress} onLayout={onLayout}>
      {children}
    </Pressable>
  );
});

function rowKey(item: CommandCenterItem): string {
  return item.id;
}

function hasAlternateAction(item: CommandCenterItem): boolean {
  return (
    item.kind === "workspace" ||
    item.kind === "project" ||
    (item.kind === "action" && Boolean(item.historyDirection) && !item.disabled)
  );
}

function renderItemIcon(item: CommandCenterItem): ReactNode {
  if (item.kind === "agent") {
    return (
      <AgentStatusDot
        status={item.agent.status}
        requiresAttention={item.agent.requiresAttention}
        showInactive
      />
    );
  }
  if (item.kind === "window") {
    if (item.windowKind === "terminal") return <ThemedTerminal size={16} strokeWidth={2.2} />;
    if (item.windowKind === "browser") return <ThemedGlobe size={16} strokeWidth={2.2} />;
    if (item.windowKind === "file") return <ThemedFileText size={16} strokeWidth={2.2} />;
    return <ThemedMonitor size={16} strokeWidth={2.2} />;
  }
  if (item.kind === "workspace" || item.kind === "project") {
    return <ThemedFolder size={16} strokeWidth={2.2} />;
  }
  if (item.kind === "history") {
    return <ThemedMonitor size={16} strokeWidth={2.2} />;
  }
  if (item.kind === "show-all") {
    return <ThemedChevronRight size={16} strokeWidth={2.2} />;
  }
  switch (item.icon) {
    case "plus":
      return <ThemedPlus size={16} strokeWidth={2.4} />;
    case "settings":
      return <ThemedSettings size={16} strokeWidth={2.2} />;
    case "home":
      return <ThemedHome size={16} strokeWidth={2.2} />;
    case "arrow-left":
      return <ThemedArrowLeft size={16} strokeWidth={2.2} />;
    case "arrow-right":
      return <ThemedArrowRight size={16} strokeWidth={2.2} />;
    case "save":
      return <ThemedSave size={16} strokeWidth={2.2} />;
    default:
      return <ThemedBot size={16} strokeWidth={2.2} />;
  }
}

function updatedAtForItem(item: CommandCenterItem): number | null {
  return typeof item.updatedAt === "number" && item.updatedAt > 0 ? item.updatedAt : null;
}

function detailForItem(item: CommandCenterItem): string | null {
  if ("detail" in item && item.detail) {
    return item.detail;
  }
  return null;
}

interface RowContentProps {
  item: CommandCenterItem;
  active: boolean;
  onAlternate: (item: CommandCenterItem) => void;
}

function RowContent({ item, active, onAlternate }: RowContentProps) {
  const detail = detailForItem(item);
  const updatedAt = updatedAtForItem(item);
  const canAlternate = hasAlternateAction(item);
  const handleAlternatePress = useCallback(() => {
    onAlternate(item);
  }, [item, onAlternate]);

  return (
    <View
      style={
        item.kind === "action" && item.disabled ? styles.rowContentDisabled : styles.rowContent
      }
    >
      <View style={styles.rowMain}>
        <View style={styles.iconSlot}>{renderItemIcon(item)}</View>
        <View style={styles.textContent}>
          <Text style={styles.title} numberOfLines={1}>
            {item.title}
          </Text>
          {detail || updatedAt ? (
            <View style={styles.detailLine}>
              {detail ? (
                <Text style={styles.subtitle} numberOfLines={1}>
                  {detail}
                </Text>
              ) : null}
              {updatedAt ? (
                <View style={styles.timeDetail}>
                  <ThemedClock size={12} strokeWidth={2} />
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {formatTimeAgo(new Date(updatedAt))}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
      {item.kind === "action" && item.shortcutKeys ? (
        <Shortcut chord={item.shortcutKeys} style={styles.rowShortcut} />
      ) : null}
      {canAlternate ? (
        <Pressable
          testID={`command-center-alt-${item.id}`}
          onPress={handleAlternatePress}
          style={active ? styles.arrowKey : styles.arrowBare}
          hitSlop={8}
        >
          <Text style={active ? styles.arrowKeyText : styles.arrowBareText}>→</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

interface ResultRowProps {
  item: CommandCenterItem;
  rowIndex: number;
  active: boolean;
  registerRow: (rowIndex: number) => (el: View | null) => void;
  onRowLayout: (
    rowIndex: number,
  ) => (event: { nativeEvent: { layout: { y: number; height: number } } }) => void;
  onSelect: (item: CommandCenterItem) => void;
  onAlternate: (item: CommandCenterItem) => void;
}

function ResultRow({
  item,
  rowIndex,
  active,
  registerRow,
  onRowLayout,
  onSelect,
  onAlternate,
}: ResultRowProps) {
  const handlePress = useCallback(() => onSelect(item), [item, onSelect]);
  return (
    <CommandCenterRow
      active={active}
      registerRow={registerRow(rowIndex)}
      onPress={handlePress}
      onLayout={onRowLayout(rowIndex)}
    >
      <RowContent item={item} active={active} onAlternate={onAlternate} />
    </CommandCenterRow>
  );
}

interface PillProps<Id extends string> {
  id: Id;
  label: string;
  selected: boolean;
  onSelect: (id: Id) => void;
}

function FilterPill<Id extends string>({ id, label, selected, onSelect }: PillProps<Id>) {
  const handlePress = useCallback(() => onSelect(id), [id, onSelect]);
  return (
    <Pressable
      style={selected ? styles.filterPillSelectedCombined : styles.filterPill}
      onPress={handlePress}
    >
      <Text style={selected ? styles.filterPillTextSelectedCombined : styles.filterPillText}>
        {label}
      </Text>
    </Pressable>
  );
}

function KeyHint({ label }: { label: string }) {
  return (
    <View style={styles.keyHint}>
      <Text style={styles.keyHintText}>{label}</Text>
    </View>
  );
}

export function CommandCenter() {
  const { t } = useTranslation();
  const {
    open,
    inputRef,
    query,
    setQuery,
    activeIndex,
    groups,
    filterPills,
    scopePills,
    activeSubmenu,
    placeholder,
    handleClose,
    handleSelectItem,
    handleAlternateItem,
    handleKeyEvent,
    setGroupFilter,
    setScope,
  } = useCommandCenter();

  const isCompact = useIsCompactFormFactor();
  const showBottomSheet = isCompact && isNative;
  const rowRefs = useRef<Map<number, View>>(new Map());
  const rowLayouts = useRef<Map<number, { y: number; height: number }>>(new Map());
  const resultsRef = useRef<ScrollView>(null);
  const nativeScrollY = useRef(0);
  const nativeViewHeight = useRef(0);
  // BottomSheetTextInput wraps a different TextInput type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bottomSheetInputRef = useRef<any>(null);

  const { sheetRef, handleSheetChange, handleSheetDismiss } = useIsolatedBottomSheetVisibility({
    visible: open,
    isEnabled: showBottomSheet,
    onClose: handleClose,
  });

  useEffect(() => {
    if (showBottomSheet && open) {
      const id = setTimeout(() => bottomSheetInputRef.current?.focus(), 300);
      return () => clearTimeout(id);
    }
  }, [showBottomSheet, open]);

  const renderBackdrop = useCallback(
    (props: React.ComponentProps<typeof BottomSheetBackdrop>) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.45} />
    ),
    [],
  );

  useEffect(() => {
    if (!open) return;
    if (isWeb) {
      const row = rowRefs.current.get(activeIndex);
      if (!row || typeof document === "undefined") return;
      const scrollNode =
        (
          resultsRef.current as
            | (ScrollView & {
                getScrollableNode?: () => HTMLElement | null;
              })
            | null
        )?.getScrollableNode?.() ?? null;
      const rowEl = row as unknown as HTMLElement;

      if (!scrollNode) {
        rowEl.scrollIntoView?.({ block: "nearest" });
        return;
      }

      const rowTop = rowEl.offsetTop;
      const rowBottom = rowTop + rowEl.offsetHeight;
      const visibleTop = scrollNode.scrollTop;
      const visibleBottom = visibleTop + scrollNode.clientHeight;

      if (rowTop < visibleTop) {
        scrollNode.scrollTop = rowTop;
      } else if (rowBottom > visibleBottom) {
        scrollNode.scrollTop = rowBottom - scrollNode.clientHeight;
      }
      return;
    }

    const layout = rowLayouts.current.get(activeIndex);
    if (!layout || !resultsRef.current) return;
    const rowTop = layout.y;
    const rowBottom = rowTop + layout.height;
    const visibleTop = nativeScrollY.current;
    const visibleBottom = visibleTop + nativeViewHeight.current;
    if (rowTop < visibleTop) {
      resultsRef.current.scrollTo?.({ y: rowTop, animated: true });
    } else if (rowBottom > visibleBottom) {
      resultsRef.current.scrollTo?.({
        y: rowBottom - nativeViewHeight.current,
        animated: true,
      });
    }
  }, [activeIndex, open]);

  const handleRowLayout = useCallback(
    (rowIndex: number) => (event: { nativeEvent: { layout: { y: number; height: number } } }) => {
      rowLayouts.current.set(rowIndex, {
        y: event.nativeEvent.layout.y,
        height: event.nativeEvent.layout.height,
      });
    },
    [],
  );

  const registerRow = useCallback(
    (rowIndex: number) => (el: View | null) => {
      if (el) rowRefs.current.set(rowIndex, el);
      else rowRefs.current.delete(rowIndex);
    },
    [],
  );

  const handleKeyPress = useCallback(
    ({ nativeEvent: { key } }: { nativeEvent: { key: string } }) => {
      handleKeyEvent(key);
    },
    [handleKeyEvent],
  );

  const handleSubmitEditing = useCallback(() => {
    handleKeyEvent("Enter");
  }, [handleKeyEvent]);

  const handleSelectScopePill = useCallback(
    (mode: (typeof scopePills)[number]["id"]) => {
      setScope({ mode });
    },
    [setScope],
  );

  const handleResultsScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { y: number } } }) => {
      nativeScrollY.current = event.nativeEvent.contentOffset.y;
    },
    [],
  );

  const handleResultsLayout = useCallback(
    (event: { nativeEvent: { layout: { height: number } } }) => {
      nativeViewHeight.current = event.nativeEvent.layout.height;
    },
    [],
  );

  const snapPoints = useMemo(() => ["60%", "90%"], []);

  let rowIndex = 0;
  const resultList =
    groups.length === 0 ? (
      <Text style={styles.emptyText}>{t("shell.commandCenter.noMatches")}</Text>
    ) : (
      groups.map((group, groupIndex) => (
        <View key={group.group}>
          {groupIndex > 0 ? <View style={styles.sectionDivider} /> : null}
          <Text style={styles.sectionLabel}>{group.title}</Text>
          {group.items.map((item) => {
            const index = rowIndex++;
            return (
              <ResultRow
                key={rowKey(item)}
                item={item}
                rowIndex={index}
                active={index === activeIndex}
                registerRow={registerRow}
                onRowLayout={handleRowLayout}
                onSelect={handleSelectItem}
                onAlternate={handleAlternateItem}
              />
            );
          })}
        </View>
      ))
    );

  const filters = activeSubmenu ? null : (
    <View style={styles.filterBar}>
      <KeyHint label="Tab" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroller}>
        <View style={styles.filterPills}>
          {filterPills.map((pill) => (
            <FilterPill
              key={pill.id}
              id={pill.id}
              label={pill.label}
              selected={pill.selected}
              onSelect={setGroupFilter}
            />
          ))}
        </View>
      </ScrollView>
      <View style={styles.scopePills}>
        {scopePills.map((pill) => (
          <FilterPill
            key={pill.id}
            id={pill.id}
            label={pill.label}
            selected={pill.selected}
            onSelect={handleSelectScopePill}
          />
        ))}
      </View>
      <View style={styles.shiftTabHint}>
        <KeyHint label="Shift" />
        <KeyHint label="Tab" />
      </View>
    </View>
  );

  const inputContent = (
    <View style={styles.inputRow}>
      {activeSubmenu ? (
        <View style={styles.submenuPill}>
          {activeSubmenu.icon === "arrow-left" ? (
            <ThemedArrowLeft size={13} strokeWidth={2.2} />
          ) : (
            <ThemedArrowRight size={13} strokeWidth={2.2} />
          )}
          <Text style={styles.submenuPillText}>{activeSubmenu.title}</Text>
        </View>
      ) : null}
      {showBottomSheet ? (
        <ThemedBottomSheetTextInput
          testID="command-center-input"
          ref={bottomSheetInputRef as unknown as React.Ref<never>}
          value={query}
          onChangeText={setQuery}
          onKeyPress={handleKeyPress}
          onSubmitEditing={handleSubmitEditing}
          placeholder={placeholder}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
      ) : (
        <ThemedTextInput
          testID="command-center-input"
          ref={inputRef}
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
      )}
    </View>
  );

  if (showBottomSheet) {
    return (
      <IsolatedBottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        index={0}
        enableDynamicSizing={false}
        onChange={handleSheetChange}
        onDismiss={handleSheetDismiss}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        keyboardBehavior="extend"
        keyboardBlurBehavior="restore"
        accessible={false}
      >
        <View style={styles.header}>
          {inputContent}
          {filters}
        </View>
        <BottomSheetScrollView
          contentContainerStyle={styles.resultsContent}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
        >
          {resultList}
        </BottomSheetScrollView>
      </IsolatedBottomSheetModal>
    );
  }

  if (!open) return null;

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View testID="command-center-panel" style={styles.panel}>
          <View style={styles.header}>
            {inputContent}
            {filters}
          </View>
          <ScrollView
            ref={resultsRef}
            style={styles.results}
            contentContainerStyle={styles.resultsContent}
            keyboardShouldPersistTaps="always"
            showsVerticalScrollIndicator={false}
            onScroll={handleResultsScroll}
            onLayout={handleResultsLayout}
          >
            {resultList}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create((theme) => ({
  overlay: {
    flex: 1,
    justifyContent: "flex-start",
    alignItems: "center",
    paddingTop: theme.spacing[12],
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  panel: {
    width: 720,
    maxWidth: "92%",
    maxHeight: "82%",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface0,
    overflow: "hidden",
    ...theme.shadow.lg,
  },
  header: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  inputRow: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.fontSize.lg,
    color: theme.colors.foreground,
    paddingVertical: theme.spacing[1],
    outlineStyle: "none",
  } as object,
  submenuPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface1,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 4,
    maxWidth: 180,
  },
  submenuPillText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  filterScroller: {
    flexShrink: 1,
  },
  filterPills: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  scopePills: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flexShrink: 1,
  },
  filterPill: {
    minHeight: 26,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 3,
  },
  filterPillSelected: {
    backgroundColor: theme.colors.surface1,
    borderColor: theme.colors.foregroundMuted,
  },
  filterPillSelectedCombined: {
    minHeight: 26,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 3,
    backgroundColor: theme.colors.surface1,
    borderColor: theme.colors.foregroundMuted,
  },
  filterPillText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  filterPillTextSelected: {
    color: theme.colors.foreground,
  },
  filterPillTextSelectedCombined: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
  },
  keyHint: {
    minWidth: 28,
    minHeight: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderBottomWidth: 2,
    borderRadius: theme.borderRadius.sm,
    paddingHorizontal: theme.spacing[1],
    backgroundColor: theme.colors.surface1,
  },
  keyHintText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  shiftTabHint: {
    gap: 2,
    alignItems: "stretch",
  },
  results: {
    flexGrow: 0,
  },
  resultsContent: {
    paddingVertical: theme.spacing[2],
  },
  sectionLabel: {
    paddingHorizontal: theme.spacing[4],
    paddingBottom: theme.spacing[2],
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
  sectionDivider: {
    height: 1,
    marginTop: theme.spacing[2],
    marginBottom: theme.spacing[2],
    backgroundColor: theme.colors.border,
  },
  row: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
  },
  rowActive: {
    backgroundColor: theme.colors.surface1,
  },
  rowContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  rowContentDisabled: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    opacity: 0.48,
  },
  disabled: {
    opacity: 0.48,
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[3],
  },
  iconSlot: {
    width: 18,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  textContent: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  rowShortcut: {
    marginLeft: theme.spacing[2],
    flexShrink: 0,
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: "400",
    lineHeight: 20,
  },
  detailLine: {
    minHeight: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    minWidth: 0,
  },
  subtitle: {
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
  },
  timeDetail: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexShrink: 0,
  },
  arrowBare: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowBareText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
  arrowKey: {
    minWidth: 28,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderBottomWidth: 2,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surface2,
  },
  arrowKeyText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    lineHeight: 18,
  },
  emptyText: {
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[4],
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
}));
