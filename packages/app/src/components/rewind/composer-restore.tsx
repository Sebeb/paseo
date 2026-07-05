import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import type { AttachmentMetadata, UserComposerAttachment } from "@/attachments/types";

interface RewindComposerInput {
  text: string;
  attachments: UserComposerAttachment[];
}

interface RewindComposerRestoreContextValue {
  restoreTextIfComposerEmpty: (text: string) => void;
  restoreInputIfComposerEmpty: (input: RewindComposerInput) => void;
}

interface RewindComposerRestoreProviderProps {
  text: string;
  setText: (text: string) => void;
  attachments: UserComposerAttachment[];
  setAttachments: (attachments: UserComposerAttachment[]) => void;
  children: ReactNode;
}

const RewindComposerRestoreContext = createContext<RewindComposerRestoreContextValue | null>(null);

export function restoreComposerTextIfEmpty(input: {
  currentText: string;
  rewoundText: string;
}): string {
  if (input.currentText.length > 0) {
    return input.currentText;
  }
  return input.rewoundText;
}

export function restoreComposerInputIfEmpty(input: {
  currentInput: RewindComposerInput;
  rewoundInput: RewindComposerInput;
}): RewindComposerInput {
  const hasCurrentDraft =
    input.currentInput.text.length > 0 || input.currentInput.attachments.length > 0;
  if (hasCurrentDraft) {
    return input.currentInput;
  }
  return input.rewoundInput;
}

export function buildRewindComposerImageAttachments(
  images: readonly AttachmentMetadata[],
): UserComposerAttachment[] {
  return images.map((metadata) => ({ kind: "image", metadata }));
}

export function RewindComposerRestoreProvider({
  text,
  setText,
  attachments,
  setAttachments,
  children,
}: RewindComposerRestoreProviderProps) {
  const textRef = useRef(text);
  const attachmentsRef = useRef(attachments);

  useEffect(() => {
    textRef.current = text;
  }, [text]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  const restoreInputIfComposerEmpty = useCallback(
    (rewoundInput: RewindComposerInput) => {
      const currentInput = {
        text: textRef.current,
        attachments: attachmentsRef.current,
      };
      const nextInput = restoreComposerInputIfEmpty({
        currentInput,
        rewoundInput,
      });
      if (nextInput === currentInput) {
        return;
      }
      setText(nextInput.text);
      setAttachments(nextInput.attachments);
    },
    [setAttachments, setText],
  );

  const restoreTextIfComposerEmpty = useCallback(
    (rewoundText: string) => {
      restoreInputIfComposerEmpty({ text: rewoundText, attachments: [] });
    },
    [restoreInputIfComposerEmpty],
  );

  const value = useMemo(
    () => ({ restoreTextIfComposerEmpty, restoreInputIfComposerEmpty }),
    [restoreInputIfComposerEmpty, restoreTextIfComposerEmpty],
  );

  return (
    <RewindComposerRestoreContext.Provider value={value}>
      {children}
    </RewindComposerRestoreContext.Provider>
  );
}

export function useRewindComposerRestore(): RewindComposerRestoreContextValue | null {
  return useContext(RewindComposerRestoreContext);
}
