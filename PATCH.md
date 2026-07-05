# Patch Summary: Preserve and merge configured Codex MCP servers when injecting runtime MCP

Branch: `feat/subagent-mcp-inheritance`

Base: `origin/main`

Anchor commit: cd7d1acecce287afbb4cb97e95e7e2d7a785a863 — fix(codex): normalize string-typed numeric fields in configured MCP server config

## Preserve Codex's own MCP servers when injecting Paseo's runtime MCP config

**Purpose:** Codex's app-server treats the `config.mcp_servers` object sent on `thread/start` / `thread/resume` as the complete MCP server set for that thread — it is not merged with the user's `~/.codex/config.toml` servers by Codex itself. Before this change, Paseo's Codex provider built `mcp_servers` from scratch out of `this.config.mcpServers` (Paseo's own injected servers, e.g. the `paseo` runtime-tools MCP server) whenever any MCP servers were configured. That meant injecting the `paseo` MCP server silently wiped out any MCP servers the user had configured for Codex directly (e.g. a `browser` or `godot` MCP server declared in their Codex config). This patch makes Paseo read Codex's already-loaded MCP server config first and merge Paseo's runtime servers on top of it, so both sets are present.

**Files:**

- `packages/server/src/server/agent/providers/codex-app-server-agent.ts`
- `packages/server/src/server/agent/providers/codex-app-server-agent.test.ts`
- `docs/providers.md`

**Public surface (all in `codex-app-server-agent.ts`):**

- `type CodexMcpServerConfig = Record<string, unknown>` — widened from a fixed interface (`url?`, `http_headers?`, `command?`, `args?`, `env?`, `tool_timeout_sec?`) to an open record, since configs read back from Codex's own `config/read` can contain arbitrary fields Paseo doesn't otherwise model.
- `const CODEX_MCP_NUMBER_FIELDS = new Set(["startup_timeout_sec", "tool_timeout_sec"])` — the set of fields that Codex's per-thread config validation requires to be numbers (unlike the loaded-config echo from `config/read`, which may return them as strings).
- `function toCodexMcpConfig(config: McpServerConfig): CodexMcpServerConfig` — unchanged; converts one of Paseo's own `McpServerConfig` variants (`stdio` / `http` / `sse`) into the Codex wire shape.
- `function normalizeCodexConfiguredMcpServerConfig(name: string, config: Record<string, unknown>, logger: Logger): CodexMcpServerConfig` — new. Shallow-copies `config`, then for each field in `CODEX_MCP_NUMBER_FIELDS`: if the field's value is a string, attempts `Number(value.trim())`; if finite, replaces it with the numeric value; if not finite (e.g. `"'"`), deletes the field entirely and logs `logger.debug({ mcpServerName: name, field, value }, "Dropped invalid numeric Codex MCP server field from merged config")`. Non-string values for these fields are left untouched.
- `async function readCodexConfiguredMcpServers(client: CodexAppServerClient, logger: Logger): Promise<Record<string, CodexMcpServerConfig>>` — new. Calls `client.request("config/read", {})`, drills into `response.config.mcp_servers` via `toObjectRecord`, and for every entry that is itself an object record, normalizes it with `normalizeCodexConfiguredMcpServerConfig` and adds it to the result under its original name. Returns `{}` if `config.mcp_servers` is absent/not an object, or if the `config/read` request throws (logged at debug level as `"Failed to read Codex MCP servers from config"`) — read failures are non-fatal, they just mean no configured servers get merged in.
- `private async buildCodexInnerConfig(): Promise<Record<string, unknown> | null>` — signature changed from sync to `async`. Behavior: when `this.config.mcpServers` is set, it now seeds `mcpServers` from `this.client ? await readCodexConfiguredMcpServers(this.client, this.logger) : {}` (Codex's own configured servers, already normalized) and then overlays Paseo's own servers by iterating `this.config.mcpServers` and setting `mcpServers[name] = toCodexMcpConfig(serverConfig)` for each — so a Paseo-injected server with the same name as a Codex-configured one wins, and everything else configured in Codex is preserved. The rest of the function (merging `this.config.extra?.codex` and `this.deps.customCodexConfig` over `innerConfig`, returning `null` when empty) is unchanged.

**Call sites updated to `await` the now-async `buildCodexInnerConfig()`:**

- `ensureThreadLoaded()` — builds `config` for `thread/resume` when reattaching to a persisted-but-unloaded thread.
- the thread-resume path used when app-server resume of a persisted thread needs a config payload (second `await this.buildCodexInnerConfig()` call, same pattern as above, near the `thread/resume` request built off `params.config`).
- the thread-start path that creates a brand-new Codex thread (builds `config` for `thread/start`, alongside `approvalPolicy`/`sandbox`/`developerInstructions`).

**Behavior/edge cases:**

- If `this.client` is `null` (no live Codex app-server connection yet), `buildCodexInnerConfig` falls back to `{}` for the base `mcpServers` map rather than attempting the read — Paseo's own servers are still applied on top.
- Field normalization is scoped to `startup_timeout_sec` and `tool_timeout_sec` only; only string-typed values are coerced, and unparseable strings are dropped (not passed through as strings, which Codex's stricter per-thread validation would reject) rather than left as-is or defaulted to `0`.
- Merge key is the server name: Paseo's injected servers (e.g. `paseo`) always take precedence over a same-named Codex-configured server.

**Tests added (`codex-app-server-agent.test.ts`):** `"merges configured Codex MCP servers when injecting runtime MCP servers"` — sets up a fake Codex app-server whose `config/read` returns two configured servers: `browser` (with `startup_timeout_sec: "3.5"` and `tool_timeout_sec: "12"`, both strings) and `godot` (with `tool_timeout_sec: "'"`, an unparseable string). Creates a `CodexAppServerAgentSession` with a `paseo` HTTP MCP server injected via `config.mcpServers`, calls `session.startTurn(...)`, and asserts the resulting `thread/start` params' `config.mcp_servers` contains: `browser` with `startup_timeout_sec: 3.5` and `tool_timeout_sec: 12` coerced to numbers (other fields like `command`/`args`/`env` untouched), `godot` with the invalid `tool_timeout_sec` field dropped entirely, and `paseo` present with its `url`/`http_headers` from the injected `McpServerConfig`.

**Docs:** `docs/providers.md` gained a paragraph under the MCP-tools section explaining that Codex app-server treats per-thread `config.mcp_servers` as the complete server set (so Paseo must read-then-merge rather than replace), and that per-thread config validation is stricter than the `config/read` echo, requiring scalar fields like timeouts to be normalized to numbers or omitted before being sent back.
