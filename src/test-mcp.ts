/**
 * A one-tool MCP server for the "run" conditions: `run_tests` runs the
 * workspace's Vitest tests inside workerd and returns the output.
 *
 * It exists so the agent can run its tests without a shell. Claude Code's Bash
 * permission rules are not a hard wall (read-only commands such as `whoami`
 * are allowed whatever the rules say), so the agent gets no Bash at all, only
 * this tool, which takes no input and runs one fixed command.
 *
 *   node --import tsx src/test-mcp.ts <workspace>
 *
 * Speaks MCP over stdio: newline-delimited JSON-RPC.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import readline from "node:readline";

const WORKSPACE = path.resolve(process.argv[2] ?? ".");
const VITEST = path.join(import.meta.dirname, "..", "node_modules", ".bin", "vitest");
const TIMEOUT_MS = 120_000;
const MAX_OUTPUT = 12_000;

const TOOL = {
  name: "run_tests",
  description: "Run the Vitest tests in test/*.test.ts inside workerd, the Workers runtime, with the bindings from wrangler.jsonc. Returns the test output.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
};

export function runTests(cwd: string): Promise<{ text: string; passed: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(VITEST, ["run"], { cwd, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1", NO_COLOR: "1", FORCE_COLOR: "0" } });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => { child.kill("SIGKILL"); out += `\ntests timed out after ${TIMEOUT_MS / 1000}s`; }, TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      const text = out.length > MAX_OUTPUT ? "[output trimmed]\n" + out.slice(-MAX_OUTPUT) : out;
      resolve({ text: text.trim() || `vitest exited ${code}`, passed: code === 0 });
    });
  });
}

function send(msg: object) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

async function handle(req: any) {
  const { id, method, params } = req;
  if (id === undefined) return; // a notification
  if (method === "initialize") {
    return send({ jsonrpc: "2.0", id, result: { protocolVersion: params?.protocolVersion ?? "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "bench", version: "1.0.0" } } });
  }
  if (method === "tools/list") return send({ jsonrpc: "2.0", id, result: { tools: [TOOL] } });
  if (method === "tools/call") {
    if (params?.name !== TOOL.name) return send({ jsonrpc: "2.0", id, error: { code: -32602, message: `unknown tool ${params?.name}` } });
    const r = await runTests(WORKSPACE);
    return send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: r.text }], isError: !r.passed } });
  }
  if (method === "ping") return send({ jsonrpc: "2.0", id, result: {} });
  send({ jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rl = readline.createInterface({ input: process.stdin });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let req: any;
    try { req = JSON.parse(line); } catch { return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } }); }
    handle(req).catch((e) => send({ jsonrpc: "2.0", id: req.id ?? null, error: { code: -32603, message: String(e?.message ?? e) } }));
  });
}
