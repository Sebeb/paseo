import { describe, expect, it } from "vitest";
import { getMessageTableLayoutMetrics } from "./message-layout-context";

describe("getMessageTableLayoutMetrics", () => {
  it("expands tables by the available side breakout on wide panes", () => {
    expect(
      getMessageTableLayoutMetrics({
        breakoutOffset: 140,
        contentWidth: 788,
      }),
    ).toEqual({
      tableBreakoutOffset: 140,
      tableWidth: 1068,
    });
  });

  it("clamps negative layout input to zero", () => {
    expect(
      getMessageTableLayoutMetrics({
        breakoutOffset: -12,
        contentWidth: -24,
      }),
    ).toEqual({
      tableBreakoutOffset: 0,
      tableWidth: 0,
    });
  });
});
