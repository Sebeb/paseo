import { isWeb } from "@/constants/platform";
import { getIsSidebarGlassEnabled } from "@/utils/sidebar-glass";

export function syncSidebarGlassRootBackground(): () => void {
  if (!isWeb || !getIsSidebarGlassEnabled() || typeof document === "undefined") {
    return () => {};
  }

  const root = document.getElementById("root");
  const previousHtmlBackground = document.documentElement.style.backgroundColor;
  const previousBodyBackground = document.body.style.backgroundColor;
  const previousRootBackground = root?.style.backgroundColor ?? "";

  document.documentElement.style.backgroundColor = "transparent";
  document.body.style.backgroundColor = "transparent";
  if (root) {
    root.style.backgroundColor = "transparent";
  }

  return () => {
    document.documentElement.style.backgroundColor = previousHtmlBackground;
    document.body.style.backgroundColor = previousBodyBackground;
    if (root) {
      root.style.backgroundColor = previousRootBackground;
    }
  };
}
