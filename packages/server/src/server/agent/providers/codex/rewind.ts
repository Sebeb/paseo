import type {
  CodexThreadForkParams,
  CodexThreadForkResponse,
  CodexThreadRollbackParams,
  CodexThreadRollbackResponse,
} from "./app-server-transport.js";
import {
  parseCodexThreadForkResponse,
  parseCodexThreadRollbackResponse,
} from "./app-server-transport.js";

export interface CodexRewindClient {
  forkThread?(params: CodexThreadForkParams): Promise<CodexThreadForkResponse>;
  rollbackThread?(params: CodexThreadRollbackParams): Promise<CodexThreadRollbackResponse>;
  request(method: string, params?: unknown, timeoutMs?: number): Promise<unknown>;
}

export interface CodexUserMessageTurnIndex {
  resolve(messageId: string): number | null;
  count(): number;
}

async function forkCodexThread(
  client: CodexRewindClient,
  params: CodexThreadForkParams,
): Promise<CodexThreadForkResponse> {
  if (client.forkThread) {
    return client.forkThread(params);
  }
  return parseCodexThreadForkResponse(await client.request("thread/fork", params));
}

async function rollbackCodexThread(
  client: CodexRewindClient,
  params: CodexThreadRollbackParams,
): Promise<CodexThreadRollbackResponse> {
  if (client.rollbackThread) {
    return client.rollbackThread(params);
  }
  return parseCodexThreadRollbackResponse(await client.request("thread/rollback", params));
}

function resolveCodexTargetTurnIndex(input: {
  messageId: string;
  userTurnOrdinal?: number | null;
  userMessageTurns: CodexUserMessageTurnIndex;
}): number {
  const resolved = input.userMessageTurns.resolve(input.messageId);
  if (resolved !== null) {
    return resolved;
  }
  // Codex item ids only live inside the app-server process that minted them;
  // thread reads return id-less user items. Fall back to the durable
  // timeline's 1-based user-turn position when the id cannot be resolved.
  const ordinal = input.userTurnOrdinal;
  const count = input.userMessageTurns.count();
  if (
    typeof ordinal === "number" &&
    Number.isInteger(ordinal) &&
    ordinal >= 1 &&
    ordinal <= count
  ) {
    return ordinal - 1;
  }
  throw new Error(`Codex could not find user message ${input.messageId} in the current thread`);
}

export interface ForkCodexConversationInput {
  client: CodexRewindClient;
  threadId: string | null;
  messageId: string;
  userTurnOrdinal?: number | null;
  cwd?: string | null;
  model?: string | null;
  serviceTier?: string | null;
  userMessageTurns: CodexUserMessageTurnIndex;
}

/**
 * Fork the thread and roll the fork back to just before the target user
 * message. The source thread is untouched; the caller decides whether to
 * adopt the returned thread id (rewind) or hand it to a new agent (branch).
 */
export async function forkCodexConversation(
  input: ForkCodexConversationInput,
): Promise<{ threadId: string; numTurns: number }> {
  if (!input.threadId) {
    throw new Error("Codex thread is not ready for rewind");
  }

  const targetTurnIndex = resolveCodexTargetTurnIndex(input);
  const currentUserTurnCount = input.userMessageTurns.count();
  const numTurns = currentUserTurnCount - targetTurnIndex;
  if (numTurns < 0) {
    throw new Error(`Codex user message ${input.messageId} is outside the current thread`);
  }

  // Fork is non-destructive: the old thread file stays on disk and remains
  // recoverable with `codex resume <old-uuid>` if the rewind target was wrong.
  const forked = await forkCodexThread(input.client, {
    threadId: input.threadId,
    cwd: input.cwd ?? null,
    model: input.model ?? null,
    serviceTier: input.serviceTier ?? null,
    excludeTurns: false,
    persistExtendedHistory: true,
  });
  const forkedThreadId = forked.thread.id;

  // Codex rollback is chat-only by design. File edits from rewound turns stay
  // on disk; a future file primitive would be a separate capability.
  const rolledBack = await rollbackCodexThread(input.client, {
    threadId: forkedThreadId,
    numTurns,
  });
  return { threadId: rolledBack.thread.id, numTurns };
}

/**
 * Fork the full thread without rolling anything back — the "duplicate chat"
 * primitive. The source thread is untouched.
 */
export async function duplicateCodexConversation(input: {
  client: CodexRewindClient;
  threadId: string | null;
  cwd?: string | null;
  model?: string | null;
  serviceTier?: string | null;
}): Promise<{ threadId: string }> {
  if (!input.threadId) {
    throw new Error("Codex thread is not ready for duplication");
  }
  const forked = await forkCodexThread(input.client, {
    threadId: input.threadId,
    cwd: input.cwd ?? null,
    model: input.model ?? null,
    serviceTier: input.serviceTier ?? null,
    excludeTurns: false,
    persistExtendedHistory: true,
  });
  return { threadId: forked.thread.id };
}

export async function revertCodexConversation(
  input: ForkCodexConversationInput & {
    setThreadId: (threadId: string) => void | Promise<void>;
  },
): Promise<void> {
  const forked = await forkCodexConversation(input);
  await input.setThreadId(forked.threadId);
}
