import type { ReactNode } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import type { ImageAttachment } from "@/composer/types";
import { FileDropZone as FileDropZoneBase } from "@/components/file-drop/file-drop-zone";
import { useFileDrop } from "@/components/file-drop/use-file-drop";
import type { DroppedItem } from "@/components/file-drop/types";

interface FileDropZoneProps {
  children: ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  onFilesDropped: (files: ImageAttachment[]) => void;
  onGenericFilesDropped?: (items: DroppedItem[]) => void;
}

function FileDropSink({
  disabled,
  onFilesDropped,
  onGenericFilesDropped,
}: Pick<FileDropZoneProps, "disabled" | "onFilesDropped" | "onGenericFilesDropped">) {
  useFileDrop(
    {
      onFiles: onFilesDropped,
      onGenericFiles: onGenericFilesDropped,
    },
    { disabled },
  );
  return null;
}

export function FileDropZone({
  children,
  disabled = false,
  style,
  onFilesDropped,
  onGenericFilesDropped,
}: FileDropZoneProps) {
  return (
    <FileDropZoneBase disabled={disabled} style={style}>
      <FileDropSink
        disabled={disabled}
        onFilesDropped={onFilesDropped}
        onGenericFilesDropped={onGenericFilesDropped}
      />
      {children}
    </FileDropZoneBase>
  );
}
