import { describe, expect, it } from "vitest";

import {
  AgentFeatureSchema,
  AgentSnapshotPayloadSchema,
  AgentBranchCreateRequestMessageSchema,
  AgentBranchCreateResponseMessageSchema,
  AgentBranchGroupsRequestMessageSchema,
  AgentBranchGroupsResponseMessageSchema,
  SetAgentFeatureRequestMessageSchema,
  SetAgentFeatureResponseMessageSchema,
} from "./messages.js";

describe("agent feature schemas", () => {
  it("parses valid toggle features", () => {
    const parsed = AgentFeatureSchema.parse({
      type: "toggle",
      id: "fast_mode",
      label: "Fast mode",
      description: "Uses lower latency service tier",
      tooltip: "Toggle fast mode",
      icon: "bolt",
      value: true,
    });

    expect(parsed.type).toBe("toggle");
    if (parsed.type !== "toggle") {
      throw new Error("Expected toggle feature");
    }
    expect(parsed.value).toBe(true);
  });

  it("parses valid select features", () => {
    const parsed = AgentFeatureSchema.parse({
      type: "select",
      id: "service_tier",
      label: "Service tier",
      description: "Choose a processing tier",
      tooltip: "Select service tier",
      icon: "gauge",
      value: "flex",
      options: [
        { id: "default", label: "Default", isDefault: true },
        { id: "flex", label: "Flex" },
      ],
    });

    expect(parsed.type).toBe("select");
    if (parsed.type !== "select") {
      throw new Error("Expected select feature");
    }
    expect(parsed.options).toHaveLength(2);
    expect(parsed.value).toBe("flex");
  });

  it("rejects invalid features", () => {
    const invalidDiscriminator = AgentFeatureSchema.safeParse({
      type: "slider",
      id: "fast_mode",
      label: "Fast mode",
      value: true,
    });

    const missingToggleValue = AgentFeatureSchema.safeParse({
      type: "toggle",
      id: "fast_mode",
      label: "Fast mode",
    });

    const missingSelectOptions = AgentFeatureSchema.safeParse({
      type: "select",
      id: "service_tier",
      label: "Service tier",
      value: null,
    });

    expect(invalidDiscriminator.success).toBe(false);
    expect(missingToggleValue.success).toBe(false);
    expect(missingSelectOptions.success).toBe(false);
  });

  it("parses valid requests", () => {
    const parsed = SetAgentFeatureRequestMessageSchema.parse({
      type: "set_agent_feature_request",
      agentId: "agent-123",
      featureId: "fast_mode",
      value: true,
      requestId: "req-123",
    });

    expect(parsed.featureId).toBe("fast_mode");
    expect(parsed.value).toBe(true);
  });

  it("parses valid responses", () => {
    const parsed = SetAgentFeatureResponseMessageSchema.parse({
      type: "set_agent_feature_response",
      payload: {
        requestId: "req-123",
        agentId: "agent-123",
        accepted: true,
        error: null,
      },
    });

    expect(parsed.payload.accepted).toBe(true);
    expect(parsed.payload.error).toBeNull();
  });

  it("accepts features on agent snapshot payloads", () => {
    const parsed = AgentSnapshotPayloadSchema.parse({
      id: "agent-123",
      provider: "codex",
      cwd: "/tmp/project",
      model: "gpt-5",
      features: [
        {
          type: "toggle",
          id: "fast_mode",
          label: "Fast mode",
          tooltip: "Toggle fast mode",
          value: false,
        },
      ],
      thinkingOptionId: null,
      effectiveThinkingOptionId: null,
      createdAt: "2026-04-03T12:00:00.000Z",
      updatedAt: "2026-04-03T12:00:00.000Z",
      lastUserMessageAt: null,
      status: "idle",
      capabilities: {
        supportsStreaming: true,
        supportsSessionPersistence: true,
        supportsDynamicModes: true,
        supportsMcpServers: true,
        supportsReasoningStream: true,
        supportsToolInvocations: true,
      },
      currentModeId: null,
      availableModes: [],
      pendingPermissions: [],
      persistence: null,
      title: null,
      labels: {},
    });

    expect(parsed.features).toHaveLength(1);
    expect(parsed.features?.[0]?.id).toBe("fast_mode");
  });

  it("defaults missing rewind capabilities to false", () => {
    const parsed = AgentSnapshotPayloadSchema.parse({
      id: "agent-123",
      provider: "codex",
      cwd: "/tmp/project",
      model: "gpt-5",
      thinkingOptionId: null,
      effectiveThinkingOptionId: null,
      createdAt: "2026-04-03T12:00:00.000Z",
      updatedAt: "2026-04-03T12:00:00.000Z",
      lastUserMessageAt: null,
      status: "idle",
      capabilities: {
        supportsStreaming: true,
        supportsSessionPersistence: true,
        supportsDynamicModes: true,
        supportsMcpServers: true,
        supportsReasoningStream: true,
        supportsToolInvocations: true,
      },
      currentModeId: null,
      availableModes: [],
      pendingPermissions: [],
      persistence: null,
      title: null,
      labels: {},
    });

    expect(parsed.capabilities.supportsRewindConversation).toBe(false);
    expect(parsed.capabilities.supportsRewindFiles).toBe(false);
    expect(parsed.capabilities.supportsRewindBoth).toBe(false);
    expect(parsed.capabilities.supportsBranchConversation).toBe(false);
  });

  it("accepts branch metadata on agent snapshot payloads", () => {
    const parsed = AgentSnapshotPayloadSchema.parse({
      id: "agent-123",
      provider: "codex",
      cwd: "/tmp/project",
      model: "gpt-5",
      thinkingOptionId: null,
      effectiveThinkingOptionId: null,
      createdAt: "2026-04-03T12:00:00.000Z",
      updatedAt: "2026-04-03T12:00:00.000Z",
      lastUserMessageAt: null,
      status: "idle",
      capabilities: {
        supportsStreaming: true,
        supportsSessionPersistence: true,
        supportsDynamicModes: true,
        supportsMcpServers: true,
        supportsReasoningStream: true,
        supportsToolInvocations: true,
        supportsBranchConversation: true,
      },
      currentModeId: null,
      availableModes: [],
      pendingPermissions: [],
      persistence: null,
      title: null,
      labels: {},
      branching: {
        memberships: [
          {
            groupId: "branch-group-1",
            ordinal: 2,
            messageId: null,
            createdAt: "2026-04-03T12:00:00.000Z",
          },
        ],
        pendingGroupId: "branch-group-1",
      },
    });

    expect(parsed.branching?.memberships[0]?.ordinal).toBe(2);
    expect(parsed.branching?.pendingGroupId).toBe("branch-group-1");
  });

  it("parses branch create and group RPCs", () => {
    expect(
      AgentBranchCreateRequestMessageSchema.parse({
        type: "agent.branch.create.request",
        agentId: "agent-123",
        messageId: "msg-123",
        requestId: "req-123",
      }).messageId,
    ).toBe("msg-123");

    const createResponse = AgentBranchCreateResponseMessageSchema.parse({
      type: "agent.branch.create.response",
      payload: {
        requestId: "req-123",
        agentId: "agent-123",
        branchAgentId: "agent-branch",
        group: {
          groupId: "branch-group-1",
          members: [
            {
              agentId: "agent-123",
              ordinal: 1,
              messageId: "msg-123",
              createdAt: "2026-04-03T12:00:00.000Z",
              archivedAt: null,
              title: "Original",
            },
            {
              agentId: "agent-branch",
              ordinal: 2,
              messageId: null,
              createdAt: "2026-04-03T12:00:00.000Z",
            },
          ],
        },
        ok: true,
        error: null,
      },
    });

    const group = createResponse.payload.group;
    if (!group) {
      throw new Error("Expected branch group");
    }
    expect(group.members).toHaveLength(2);
    expect(
      AgentBranchGroupsRequestMessageSchema.parse({
        type: "agent.branch.groups.request",
        agentId: "agent-123",
        requestId: "req-124",
        groupId: "branch-group-1",
      }).groupId,
    ).toBe("branch-group-1");
    expect(
      AgentBranchGroupsResponseMessageSchema.parse({
        type: "agent.branch.groups.response",
        payload: {
          requestId: "req-124",
          agentId: "agent-123",
          groups: [group],
          error: null,
        },
      }).payload.groups[0]?.groupId,
    ).toBe("branch-group-1");
  });
});
