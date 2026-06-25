import { createContext, useContext } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";

interface SidebarScrollContextValue {
  isScrolled: boolean;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
}

const NOOP_CONTEXT: SidebarScrollContextValue = {
  isScrolled: false,
  onScroll: () => undefined,
};

export const SidebarScrollContext = createContext<SidebarScrollContextValue>(NOOP_CONTEXT);

export function useSidebarScroll(): SidebarScrollContextValue {
  return useContext(SidebarScrollContext);
}
