/**
 * Runs one agent with Claude Code in headless mode (`claude -p`), on whatever
 * login the CLI has, so a subscription covers it with no API key.
 *
 * Every agent is isolated: no settings, skills, MCP servers or slash commands,
 * and only the built-in tools it is given. Structured output comes back through
 * `--json-schema`. The runner reads the session's start-up event and fails the
 * agent if it was handed any tool beyond the ones asked for.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const BIN = () => process.env.WORKERS_BENCH_CLAUDE_BIN ?? "claude";
/** Claude Code adds this tool itself when --json-schema is set. */
const STRUCTURED = "StructuredOutput";

export interface AgentSpec {
  name: string;
  prompt: string;
  systemPrompt: string;
  model: string;
  schema: object;
  /** Built-in tools to allow, e.g. ["Read", "Glob", "Grep"]. Empty for none. */
  tools: string[];
  /** Working folder. File tools are confined to it. Defaults to an empty temp folder. */
  cwd?: string;
  timeoutMs?: number;
  /** Where to save the raw stream-json, which agent-trace-viewer can open. */
  logPath?: string;
  /** MCP servers for this agent, as Claude Code's --mcp-config JSON. Their tools must also be listed in mcpTools. */
  mcpConfig?: object;
  /** Extra permission rules for --allowedTools, e.g. ["Bash(npm test)"]. A tool in `tools` but not covered by a rule is denied, since nothing can approve it. */
  allowedRules?: string[];
  /** MCP tool names to allow, e.g. ["mcp__cloudflare-docs__search_cloudflare_documentation"]. */
  mcpTools?: string[];
}

export interface AgentResult {
  output: unknown;
  durationMs: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  toolCalls: { name: string; input: unknown }[];
  /** Tool calls Claude Code refused for lack of permission. */
  denied?: number;
  error?: string;
}

export interface AgentRunner {
  run(spec: AgentSpec): Promise<AgentResult>;
}

export class ClaudeCodeRunner implements AgentRunner {
  async run(spec: AgentSpec): Promise<AgentResult> {
    const scratch = spec.cwd ? null : await mkdtemp(path.join(os.tmpdir(), "workers-bench-"));
    const cwd = spec.cwd ?? scratch!;
    try {
      const tools = spec.tools.join(",");
      const args = [
        "-p", spec.prompt,
        "--model", spec.model,
        "--system-prompt", spec.systemPrompt,
        "--tools", tools,
        "--restricted",
        "--strict-mcp-config",
        "--setting-sources", "",
        "--disable-slash-commands",
        "--no-session-persistence",
        "--json-schema", JSON.stringify(spec.schema),
        "--output-format", "stream-json",
        "--verbose",
      ];
      const ruled = new Set((spec.allowedRules ?? []).map((r) => r.replace(/\(.*$/, "")));
      const allowed = [...spec.tools.filter((t) => !ruled.has(t)), ...(spec.allowedRules ?? []), ...(spec.mcpTools ?? [])].join(",");
      if (allowed) args.push("--allowedTools", allowed);
      if (spec.mcpConfig) args.push("--mcp-config", JSON.stringify(spec.mcpConfig));
      const { stdout, stderr, code } = await runProcess(BIN(), args, cwd, spec.timeoutMs ?? 300_000);
      if (spec.logPath) await writeFile(spec.logPath, stdout);
      const r = parseStream(stdout);
      if (!r.error && code !== 0) r.error = `claude exited ${code}: ${stderr.trim().split("\n").pop() ?? ""}`;
      const stray = r.tools.filter((t) => t !== STRUCTURED && !spec.tools.includes(t) && !(spec.mcpTools ?? []).includes(t));
      if (stray.length) r.error = `isolation: ${spec.name} was given tools it should not have: ${stray.join(", ")}`;
      const { tools: _t, ...result } = r;
      return result;
    } finally {
      if (scratch) await rm(scratch, { recursive: true, force: true });
    }
  }
}

/** Read Claude Code's stream-json: the tools it started with, the calls made, and the result. */
export function parseStream(stdout: string): AgentResult & { tools: string[] } {
  const r: AgentResult & { tools: string[] } = { output: undefined, durationMs: 0, costUsd: 0, inputTokens: 0, outputTokens: 0, toolCalls: [], tools: [] };
  let sawResult = false;
  for (const line of stdout.split("\n")) {
    if (!line.trim().startsWith("{")) continue;
    let e: any;
    try {
      e = JSON.parse(line);
    } catch {
      continue;
    }
    if (e.type === "system" && e.subtype === "init") r.tools = e.tools ?? [];
    else if (e.type === "assistant") {
      for (const c of e.message?.content ?? []) if (c.type === "tool_use" && c.name !== STRUCTURED) r.toolCalls.push({ name: c.name, input: c.input });
    } else if (e.type === "result") {
      sawResult = true;
      r.durationMs = e.duration_ms ?? 0;
      r.costUsd = e.total_cost_usd ?? 0;
      r.inputTokens = (e.usage?.input_tokens ?? 0) + (e.usage?.cache_read_input_tokens ?? 0) + (e.usage?.cache_creation_input_tokens ?? 0);
      r.outputTokens = e.usage?.output_tokens ?? 0;
      r.denied = Array.isArray(e.permission_denials) ? e.permission_denials.length : 0;
      if (e.is_error) r.error = String(e.result ?? e.subtype ?? "error").slice(0, 300);
      else if (e.structured_output === undefined) r.error = "no structured output in the result";
      else r.output = e.structured_output;
    }
  }
  if (!sawResult && !r.error) r.error = "no result event from claude";
  return r;
}

/** Environment for the child CLI: drop the variables of any Claude session this runs inside. */
function childEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const nested = !!env.CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH;
  for (const k of ["CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH", "CLAUDE_CODE_MESSAGING_TOKEN"]) delete env[k];
  if (nested) delete env.ANTHROPIC_BASE_URL; // the host app's proxy, not this run's
  return env;
}

export function runProcess(cmd: string, args: string[], cwd: string, timeoutMs: number): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: childEnv(), stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      stderr += `\ntimed out after ${timeoutMs / 1000}s`;
    }, timeoutMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`could not start ${cmd}: ${err.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}
