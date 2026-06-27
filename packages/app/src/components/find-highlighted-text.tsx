import { memo, useMemo } from "react";
import { Text, type TextProps } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { FindHighlightRange } from "@/agent-stream/find-in-thread";
import type { ReactNode } from "react";

interface FindHighlightedTextProps extends TextProps {
  text: string;
  ranges?: readonly FindHighlightRange[];
}

interface FindHighlightedTextSegmentsProps {
  text: string;
  ranges?: readonly FindHighlightRange[];
}

interface FindHighlightedTextMatchProps {
  range: FindHighlightRange;
  text: string;
}

export function FindHighlightedText({
  text,
  ranges,
  children,
  ...props
}: FindHighlightedTextProps) {
  return (
    <Text {...props}>
      <FindHighlightedTextSegments text={text} ranges={ranges} />
      {children}
    </Text>
  );
}

export function FindHighlightedTextSegments({ text, ranges }: FindHighlightedTextSegmentsProps) {
  const normalizedRanges = normalizeRanges(text.length, ranges);
  if (normalizedRanges.length === 0) {
    return text;
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  normalizedRanges.forEach((range) => {
    if (range.start > cursor) {
      nodes.push(
        <Text key={`text-${cursor}-${range.start}`}>{text.slice(cursor, range.start)}</Text>,
      );
    }
    nodes.push(
      <FindHighlightedTextMatch
        key={`highlight-${range.start}-${range.end}`}
        range={range}
        text={text.slice(range.start, range.end)}
      />,
    );
    cursor = range.end;
  });
  if (cursor < text.length) {
    nodes.push(<Text key="text-tail">{text.slice(cursor)}</Text>);
  }
  return nodes;
}

const FindHighlightedTextMatch = memo(function FindHighlightedTextMatch({
  range,
  text,
}: FindHighlightedTextMatchProps) {
  const dataSet = useMemo(() => ({ findMatchId: range.id }), [range.id]);
  return (
    <Text
      dataSet={dataSet}
      style={
        range.active
          ? findHighlightedTextStylesheet.activeHighlight
          : findHighlightedTextStylesheet.highlight
      }
    >
      {text}
    </Text>
  );
});

function normalizeRanges(
  textLength: number,
  ranges: readonly FindHighlightRange[] | undefined,
): FindHighlightRange[] {
  if (!ranges || ranges.length === 0) {
    return [];
  }
  const normalized: FindHighlightRange[] = [];
  let previousEnd = 0;
  for (const range of [...ranges].sort((left, right) => left.start - right.start)) {
    const start = Math.max(previousEnd, Math.min(textLength, range.start));
    const end = Math.max(start, Math.min(textLength, range.end));
    if (end <= start) {
      continue;
    }
    normalized.push({ id: range.id, start, end, active: range.active });
    previousEnd = end;
  }
  return normalized;
}

const findHighlightedTextStylesheet = StyleSheet.create((theme) => ({
  highlight: {
    backgroundColor: theme.colors.surface4,
    color: theme.colors.foreground,
  },
  activeHighlight: {
    backgroundColor: theme.colors.accent,
    color: theme.colors.accentForeground,
  },
}));
