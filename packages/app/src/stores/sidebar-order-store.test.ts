import { describe, expect, it } from "vitest";
import { migrateSidebarOrderState } from "./sidebar-order-store";

describe("migrateSidebarOrderState", () => {
  it("prefixes legacy per-server workspace order with the source server id", () => {
    const migrated = migrateSidebarOrderState({
      projectOrderByServerId: {
        "host-a": ["project-a"],
        "host-b": ["project-a"],
      },
      workspaceOrderByServerAndProject: {
        "host-a::project-a": ["main", "feature"],
        "host-b::project-a": ["main"],
      },
    });

    expect(migrated).toEqual({
      projectOrderByServerId: {
        "host-a": ["project-a"],
        "host-b": ["project-a"],
      },
      workspaceOrderByServerAndProject: {
        "host-a::project-a": ["host-a:main", "host-a:feature"],
        "host-b::project-a": ["host-b:main"],
      },
    });
  });

  it("maps legacy global project and workspace orders to discovered servers", () => {
    const migrated = migrateSidebarOrderState({
      projectOrder: ["project-a", "project-b"],
      workspaceOrderByProject: {
        "project-a": ["host-a:main", "host-a:feature", "host-b:main"],
      },
    });

    expect(migrated).toEqual({
      projectOrderByServerId: {
        "host-a": ["project-a", "project-b"],
        "host-b": ["project-a", "project-b"],
      },
      workspaceOrderByServerAndProject: {
        "host-a::project-a": ["host-a:main", "host-a:feature"],
        "host-b::project-a": ["host-b:main"],
      },
    });
  });
});
