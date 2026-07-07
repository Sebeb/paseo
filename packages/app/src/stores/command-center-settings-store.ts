import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  CommandCenterDefaults,
  CommandCenterRootGroup,
  CommandCenterScopeMode,
} from "@/command-center/model";

const DEFAULT_COMMAND_CENTER_SETTINGS: CommandCenterDefaults = {
  group: "all",
  scopeMode: "allProjects",
};

const GROUPS = new Set<CommandCenterRootGroup>([
  "all",
  "actions",
  "agents",
  "windows",
  "workspaces",
  "projects",
]);

const SCOPES = new Set<CommandCenterScopeMode>(["workspace", "project", "allProjects"]);

function normalizeGroup(value: unknown): CommandCenterRootGroup {
  return typeof value === "string" && GROUPS.has(value as CommandCenterRootGroup)
    ? (value as CommandCenterRootGroup)
    : DEFAULT_COMMAND_CENTER_SETTINGS.group;
}

function normalizeScopeMode(value: unknown): CommandCenterScopeMode {
  return typeof value === "string" && SCOPES.has(value as CommandCenterScopeMode)
    ? (value as CommandCenterScopeMode)
    : DEFAULT_COMMAND_CENTER_SETTINGS.scopeMode;
}

function normalizeDefaults(value: unknown): CommandCenterDefaults {
  if (!value || typeof value !== "object") {
    return DEFAULT_COMMAND_CENTER_SETTINGS;
  }
  const raw = value as Partial<CommandCenterDefaults>;
  return {
    group: normalizeGroup(raw.group),
    scopeMode: normalizeScopeMode(raw.scopeMode),
  };
}

interface CommandCenterSettingsState {
  defaults: CommandCenterDefaults;
  setDefaults: (defaults: CommandCenterDefaults) => void;
}

export const useCommandCenterSettingsStore = create<CommandCenterSettingsState>()(
  persist(
    (set) => ({
      defaults: DEFAULT_COMMAND_CENTER_SETTINGS,
      setDefaults: (defaults) => set({ defaults: normalizeDefaults(defaults) }),
    }),
    {
      name: "command-center-settings-state",
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ defaults: state.defaults }),
      migrate: (persistedState) => ({
        defaults: normalizeDefaults(
          (persistedState as Partial<CommandCenterSettingsState>)?.defaults,
        ),
      }),
    },
  ),
);
