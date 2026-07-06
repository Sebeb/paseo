import { getIsElectronMac } from "@/constants/platform";

export function getIsSidebarGlassEnabled(): boolean {
  return getIsElectronMac();
}
