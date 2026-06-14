import { useCallback } from "react";
import { router } from "expo-router";
import { useHostChooser } from "@/hosts/host-chooser";
import { useProjectPickerStore } from "@/stores/project-picker-store";
import { buildSettingsAddHostRoute } from "@/utils/host-routes";

export function useOpenProjectPicker(): () => void {
  const chooseHost = useHostChooser();
  const openProjectPicker = useProjectPickerStore((state) => state.open);

  return useCallback(() => {
    chooseHost({
      title: "Choose host",
      onChooseHost: openProjectPicker,
      onNoHosts: () => {
        router.push(buildSettingsAddHostRoute(Date.now()));
      },
    });
  }, [chooseHost, openProjectPicker]);
}
