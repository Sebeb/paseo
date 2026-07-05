import { describe, expect, test } from "vitest";
import type { Query } from "@anthropic-ai/claude-agent-sdk";

import { isLocalCommandUserEntry, resolveClaudeConversationForkTarget } from "./agent.js";
import {
  revertClaudeConversation,
  revertClaudeConversationAndFiles,
  revertClaudeFiles,
} from "./rewind.js";
import { FakeClaudeSdk } from "./test-rewind-claude-sdk.js";

describe("Claude rewind", () => {
  test("forks the conversation up to the user message", async () => {
    const claude = new FakeClaudeSdk();
    let sessionId = "original-session";

    await revertClaudeConversation({
      sdk: claude,
      sessionId,
      messageId: "user-message-1",
      setSessionId: (nextSessionId) => {
        sessionId = nextSessionId;
      },
    });

    expect(claude.recordedForks).toEqual([{ upToMessageId: "user-message-1" }]);
    expect(sessionId).toBe("forked-session-1");
  });

  test("translates Paseo timeline message ids before forking", async () => {
    const claude = new FakeClaudeSdk();
    let sessionId = "original-session";

    await revertClaudeConversation({
      sdk: claude,
      sessionId,
      messageId: "timeline-message-1",
      resolveMessageId: () => "claude-jsonl-message-1",
      setSessionId: (nextSessionId) => {
        sessionId = nextSessionId;
      },
    });

    expect(claude.recordedForks).toEqual([{ upToMessageId: "claude-jsonl-message-1" }]);
    expect(sessionId).toBe("forked-session-1");
  });

  test("rewinds tracked files to the user message", async () => {
    const claude = new FakeClaudeSdk();

    await revertClaudeFiles({
      query: claude.createQuery() as Query,
      messageId: "user-message-1",
    });

    expect(claude.recordedFileRewinds).toEqual([{ userMessageId: "user-message-1" }]);
  });

  test("translates Paseo timeline message ids before rewinding files", async () => {
    const claude = new FakeClaudeSdk();

    await revertClaudeFiles({
      query: claude.createQuery() as Query,
      messageId: "timeline-message-1",
      resolveMessageId: () => "claude-jsonl-message-1",
    });

    expect(claude.recordedFileRewinds).toEqual([{ userMessageId: "claude-jsonl-message-1" }]);
  });

  test("rebinds the Claude session before composed rewind returns for rehydrate", async () => {
    const claude = new FakeClaudeSdk();
    claude.setNextSessionId("forked-before-rehydrate");
    let sessionId = "original-session";

    await revertClaudeConversationAndFiles({
      sdk: claude,
      query: claude.createQuery() as Query,
      sessionId,
      messageId: "user-message-1",
      setSessionId: (nextSessionId) => {
        sessionId = nextSessionId;
      },
    });

    expect(claude.recordedFileRewinds).toEqual([{ userMessageId: "user-message-1" }]);
    expect(claude.recordedForks).toEqual([{ upToMessageId: "user-message-1" }]);
    expect(sessionId).toBe("forked-before-rehydrate");
  });
});

describe("resolveClaudeConversationForkTarget", () => {
  test("forks at the previous turn's assistant message", () => {
    const target = resolveClaudeConversationForkTarget(
      [
        { userMessageId: "user-1", assistantMessageId: "assistant-1" },
        { userMessageId: "user-2", assistantMessageId: "assistant-2" },
      ],
      "user-2",
    );

    expect(target).toEqual({ kind: "fork", messageId: "assistant-1" });
  });

  test("walks back past turns without an observed assistant response", () => {
    // A turn interrupted before any assistant output leaves a null anchor;
    // the fork point is the last assistant message before the target.
    const target = resolveClaudeConversationForkTarget(
      [
        { userMessageId: "user-1", assistantMessageId: "assistant-1" },
        { userMessageId: "user-interrupted", assistantMessageId: null },
        { userMessageId: "user-3", assistantMessageId: "assistant-3" },
      ],
      "user-3",
    );

    expect(target).toEqual({ kind: "fork", messageId: "assistant-1" });
  });

  test("returns fresh-session when no assistant message precedes the target", () => {
    expect(
      resolveClaudeConversationForkTarget(
        [{ userMessageId: "user-1", assistantMessageId: "assistant-1" }],
        "user-1",
      ),
    ).toEqual({ kind: "fresh-session" });

    expect(
      resolveClaudeConversationForkTarget(
        [
          { userMessageId: "user-interrupted", assistantMessageId: null },
          { userMessageId: "user-2", assistantMessageId: "assistant-2" },
        ],
        "user-2",
      ),
    ).toEqual({ kind: "fresh-session" });
  });

  test("throws when the target user message was never tracked", () => {
    expect(() => resolveClaudeConversationForkTarget([], "missing")).toThrow(
      "Claude rewind target missing is not in the tracked conversation",
    );
  });
});

describe("isLocalCommandUserEntry", () => {
  function userEntry(content: unknown): Record<string, unknown> {
    return { type: "user", message: { role: "user", content } };
  }

  test("detects local command transcript records", () => {
    expect(
      isLocalCommandUserEntry(
        userEntry("<command-name>/model</command-name>\n<command-message>model</command-message>"),
      ),
    ).toBe(true);
    expect(
      isLocalCommandUserEntry(
        userEntry(
          "<command-message>diagnose</command-message>\n<command-name>/diagnose</command-name>",
        ),
      ),
    ).toBe(true);
    expect(
      isLocalCommandUserEntry(
        userEntry("<local-command-stdout>Set model to haiku</local-command-stdout>"),
      ),
    ).toBe(true);
    expect(
      isLocalCommandUserEntry(
        userEntry("<local-command-caveat>Caveat text</local-command-caveat>"),
      ),
    ).toBe(true);
  });

  test("detects command records stored as text blocks", () => {
    expect(
      isLocalCommandUserEntry(
        userEntry([{ type: "text", text: "<command-name>/model</command-name>" }]),
      ),
    ).toBe(true);
  });

  test("keeps real user messages", () => {
    expect(isLocalCommandUserEntry(userEntry("Fix the login bug"))).toBe(false);
    expect(
      isLocalCommandUserEntry(userEntry([{ type: "text", text: "What does <command-name> do?" }])),
    ).toBe(false);
    expect(isLocalCommandUserEntry(userEntry([{ type: "image", source: "x.png" }]))).toBe(false);
    expect(isLocalCommandUserEntry(null)).toBe(false);
  });
});
