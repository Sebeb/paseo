import { describe, expect, it } from "vitest";
import { resolveSidebarStatusFlashes } from "@/utils/sidebar-status-flash";

describe("sidebar status flash routing", () => {
  it("routes a new visible child tab status to the tab row", () => {
    const resolution = resolveSidebarStatusFlashes({
      seenSourceKeys: new Set(),
      candidates: [
        {
          sourceKey: "workspace-a:tab-a:unread",
          kind: "unread",
          recipientIds: ["tab:workspace-a:tab-a", "workspace:workspace-a", "project:project-a"],
        },
      ],
    });

    expect(resolution.triggeredKindByRecipientId).toEqual(
      new Map([["tab:workspace-a:tab-a", "unread"]]),
    );
  });

  it("routes a hidden child tab status to the collapsed parent row before the workspace", () => {
    const resolution = resolveSidebarStatusFlashes({
      seenSourceKeys: new Set(),
      candidates: [
        {
          sourceKey: "workspace-a:child:failed",
          kind: "failed",
          recipientIds: ["tab:workspace-a:parent", "workspace:workspace-a", "project:project-a"],
        },
      ],
    });

    expect(resolution.triggeredKindByRecipientId).toEqual(
      new Map([["tab:workspace-a:parent", "failed"]]),
    );
  });

  it("routes to workspace and project only when closer recipients are unavailable", () => {
    const workspaceResolution = resolveSidebarStatusFlashes({
      seenSourceKeys: new Set(),
      candidates: [
        {
          sourceKey: "workspace-a:hidden:input_required",
          kind: "input_required",
          recipientIds: ["workspace:workspace-a", "project:project-a"],
        },
      ],
    });
    const projectResolution = resolveSidebarStatusFlashes({
      seenSourceKeys: new Set(),
      candidates: [
        {
          sourceKey: "workspace-b:hidden:input_required",
          kind: "input_required",
          recipientIds: ["project:project-b"],
        },
      ],
    });

    expect(workspaceResolution.triggeredKindByRecipientId).toEqual(
      new Map([["workspace:workspace-a", "input_required"]]),
    );
    expect(projectResolution.triggeredKindByRecipientId).toEqual(
      new Map([["project:project-b", "input_required"]]),
    );
  });

  it("does not re-trigger a parent flash when an already-seen child becomes hidden", () => {
    const first = resolveSidebarStatusFlashes({
      seenSourceKeys: new Set(),
      candidates: [
        {
          sourceKey: "workspace-a:child:unread",
          kind: "unread",
          recipientIds: ["tab:workspace-a:child", "workspace:workspace-a"],
        },
      ],
    });
    const second = resolveSidebarStatusFlashes({
      seenSourceKeys: first.nextSeenSourceKeys,
      candidates: [
        {
          sourceKey: "workspace-a:child:unread",
          kind: "unread",
          recipientIds: ["tab:workspace-a:parent", "workspace:workspace-a"],
        },
      ],
    });

    expect(first.triggeredKindByRecipientId).toEqual(
      new Map([["tab:workspace-a:child", "unread"]]),
    );
    expect(second.triggeredKindByRecipientId).toEqual(new Map());
  });

  it("re-triggers when a source status clears and appears again", () => {
    const first = resolveSidebarStatusFlashes({
      seenSourceKeys: new Set(),
      candidates: [
        {
          sourceKey: "workspace-a:child:unread",
          kind: "unread",
          recipientIds: ["tab:workspace-a:child"],
        },
      ],
    });
    const cleared = resolveSidebarStatusFlashes({
      seenSourceKeys: first.nextSeenSourceKeys,
      candidates: [],
    });
    const returned = resolveSidebarStatusFlashes({
      seenSourceKeys: cleared.nextSeenSourceKeys,
      candidates: [
        {
          sourceKey: "workspace-a:child:unread",
          kind: "unread",
          recipientIds: ["tab:workspace-a:child"],
        },
      ],
    });

    expect(first.triggeredKindByRecipientId).toEqual(
      new Map([["tab:workspace-a:child", "unread"]]),
    );
    expect(cleared.nextSeenSourceKeys).toEqual(new Set());
    expect(returned.triggeredKindByRecipientId).toEqual(
      new Map([["tab:workspace-a:child", "unread"]]),
    );
  });

  it("lets non-selected project selector capsules flash while selected ones do not", () => {
    const resolution = resolveSidebarStatusFlashes({
      seenSourceKeys: new Set(),
      candidates: [
        {
          sourceKey: "workspace-a:hidden:failed",
          kind: "failed",
          recipientIds: ["selector:project-a"],
        },
        {
          sourceKey: "workspace-b:hidden:failed",
          kind: "failed",
          recipientIds: [],
        },
      ],
    });

    expect(resolution.triggeredKindByRecipientId).toEqual(
      new Map([["selector:project-a", "failed"]]),
    );
  });
});
