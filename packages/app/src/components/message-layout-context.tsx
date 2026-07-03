import { createContext, useContext, type ReactNode } from "react";

export interface MessageLayoutMetrics {
  tableBreakoutOffset: number;
  tableWidth: number;
}

export interface MessageTableLayoutInput {
  breakoutOffset: number;
  contentWidth: number;
}

const DEFAULT_MESSAGE_LAYOUT_METRICS: MessageLayoutMetrics = {
  tableBreakoutOffset: 0,
  tableWidth: 0,
};

const MessageLayoutContext = createContext<MessageLayoutMetrics>(DEFAULT_MESSAGE_LAYOUT_METRICS);

export function MessageLayoutProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: MessageLayoutMetrics;
}) {
  return <MessageLayoutContext.Provider value={value}>{children}</MessageLayoutContext.Provider>;
}

export function useMessageLayoutMetrics(): MessageLayoutMetrics {
  return useContext(MessageLayoutContext);
}

export function getMessageTableLayoutMetrics(input: MessageTableLayoutInput): MessageLayoutMetrics {
  const tableBreakoutOffset = Math.max(0, input.breakoutOffset);
  const contentWidth = Math.max(0, input.contentWidth);
  return {
    tableBreakoutOffset,
    tableWidth: contentWidth + tableBreakoutOffset * 2,
  };
}
