import { describe, expect, it } from "vitest";
import { applyRecentTreeRowCount } from "@/utils/sidebar-embedded-tab-visibility";
import { createEmptySidebarTabStatusSummary } from "@/utils/sidebar-tab-status-summary";

function makeSummary(kind?: "unread" | "failed" | "input_required") {
  const summary = createEmptySidebarTabStatusSummary();
  if (kind) {
    summary.entryCounts[kind] = 1;
  }
  return summary;
}

function row(
  tabId: string,
  input?: { forceShown?: boolean; statusKind?: "unread" | "failed" | "input_required" },
) {
  return {
    item: {
      tab: { tabId },
      forceShown: input?.forceShown ?? false,
    },
    statusSummary: makeSummary(input?.statusKind),
  };
}

describe("sidebar embedded tab visibility", () => {
  it("keeps flashable status-bearing tabs visible even when they fall past the recent-count limit", () => {
    const visible = applyRecentTreeRowCount({
      recentCount: 1,
      rows: [row("recent"), row("status-hidden", { statusKind: "unread" }), row("plain-hidden")],
    });

    expect(visible.map((entry) => entry.item.tab.tabId)).toEqual(["recent", "status-hidden"]);
  });

  it("still keeps force-shown tabs visible alongside status-bearing tabs", () => {
    const visible = applyRecentTreeRowCount({
      recentCount: 1,
      rows: [
        row("recent"),
        row("forced", { forceShown: true }),
        row("status-hidden", { statusKind: "failed" }),
      ],
    });

    expect(visible.map((entry) => entry.item.tab.tabId)).toEqual([
      "recent",
      "forced",
      "status-hidden",
    ]);
  });
});
