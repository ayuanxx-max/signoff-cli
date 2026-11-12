#!/usr/bin/env node
"use strict";

// A dependency-free MCP server (stdio, JSON-RPC 2.0) that exposes the SignOff CLI as
// tools. Claude Desktop / DSH / any MCP client can call these instead of shelling out.
//
//   node integrations/mcp/server.js
//
// Tools: signoff_run, signoff_status, signoff_doctor, signoff_audit, signoff_explain, signoff_report,
// signoff_review, signoff_dispute, signoff_patterns, signoff_fix (--check only).
// Every tool forwards to `signoff <subcommand>` in the client's cwd and returns the
// combined stdout/stderr plus the exit code, because the exit code is the verdict.

const { spawnSync } = require("child_process");

const SERVER = { name: "signoff", version: require("../../package.json").version };
const PROTOCOL = "2024-11-05";

const TOOLS = [
  {
    name: "signoff_run",
    description:
      "Run the five SignOff gates in the current repo (P1 tests, P2 coverage, P3 queue, P4 ledger, P5 anti-slop). Returns exit code, stdout and stderr; exit 0 means pass.",
    inputSchema: {
      type: "object",
      properties: {
        full: { type: "boolean", description: "run the pre-push scope (all stages) instead of the staged scope" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "signoff_status",
    description: "Report whether the repo is guarded: installed hooks, config path, last run, install point.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "signoff_doctor",
    description: "Read-only diagnosis of why the gates are not doing what the user expects; with fix=true it repairs what can be proved.",
    inputSchema: {
      type: "object",
      properties: { fix: { type: "boolean", description: "apply the provable repairs, then re-check" } },
      additionalProperties: false,
    },
  },
  {
    name: "signoff_audit",
    description: "Check whether the commits that landed carry a SignOff trailer; sinceInstall limits the window to after `signoff init`.",
    inputSchema: {
      type: "object",
      properties: {
        sinceInstall: { type: "boolean", description: "audit from the recorded install point" },
        range: { type: "string", description: "explicit git range, e.g. origin/main..HEAD" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "signoff_report",
    description:
      "Read-only board about this repo: verdict (can I ship), blockers with fixes, the seven checks, guard health, task groups, run trend. Same JSON as `signoff report --json`.",
    inputSchema: {
      type: "object",
      properties: {
        gate: { type: "string", enum: ["p1", "p2", "p3", "p4", "p5", "sec", "release"], description: "limit the board to one check" },
        task: { type: "string", description: "limit to one task group key, e.g. report" },
        days: { type: "number", description: "look back N days (default 120)" },
        wouldBlock: { type: "boolean", description: "read-only preview: what would block a commit right now" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "signoff_explain",
    description: "Explain what one gate checks and how it decides: p1, p2, p3, p4 or p5.",
    inputSchema: {
      type: "object",
      properties: { gate: { type: "string", enum: ["p1", "p2", "p3", "p4", "p5"] } },
      required: ["gate"],
      additionalProperties: false,
    },
  },
  {
    name: "signoff_review",
    description:
      "Attest that a diff was reviewed (action=record, needs by), or verify that the diff being shipped is the one that was approved (action=verify, default). Proves binding, not that a human read the code.",
    inputSchema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["verify", "status", "list", "record"] },
        by: { type: "string", description: "reviewer id, required for record" },
        model: { type: "string" },
        note: { type: "string" },
        verdict: { type: "string", enum: ["approve", "reject"] },
        limit: { type: "number" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "signoff_dispute",
    description:
      "Settle a pass/fail dispute by running the same reproducer N times: supported (exit 0), refuted (1), unresolved (3). A command that cannot run writes no evidence and exits 2.",
    inputSchema: {
      type: "object",
      properties: {
        claim: { type: "string" },
        run: { type: "array", items: { type: "string" }, description: "the reproducer command(s), in order" },
        expect: { type: "string", enum: ["pass", "fail"] },
        repeat: { type: "number" },
        budget: { type: "number" },
        replay: { type: "string", description: "replay an evidence json instead of running a new dispute" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "signoff_patterns",
    description:
      "Group repeated gate failures from .signoff/runs.log into patterns, so a failure that keeps coming back is visible instead of being 'fixed' the same way again.",
    inputSchema: {
      type: "object",
      properties: {
        min: { type: "number", description: "occurrences before something counts as a pattern (default 2)" },
        top: { type: "number" },
        since: { type: "number", description: "look back N days" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "signoff_fix",
    description:
      "Preview the bounded repair loop without applying anything: is the baseline red, is the patch inside scope, does it touch a verdict path. Over MCP the patch is never applied.",
    inputSchema: {
      type: "object",
      properties: {
        patch: { type: "string", description: "path to a unified diff" },
        scope: { type: "array", items: { type: "string" } },
        run: { type: "array", items: { type: "string" } },
      },
      required: ["patch"],
      additionalProperties: false,
    },
  },
];

function callSignoff(argv) {
  // Always run the bin that ships with this package: same version as the server, no PATH
  // lookup, no shell (spawning `signoff` through cmd.exe is both slower and deprecated).
  const local = require("path").join(__dirname, "..", "..", "bin", "signoff.js");
  const r = spawnSync(process.execPath, [local, ...argv], { encoding: "utf8" });
  return {
    exitCode: r.status === null ? 1 : r.status,
    stdout: r.stdout || "",
    stderr: r.stderr || "",
  };
}

function runTool(name, args) {
  switch (name) {
    case "signoff_run": {
      const argv = ["guard"];
      if (args && args.full) argv.push("--full");
      return callSignoff(argv);
    }
    case "signoff_status":
      return callSignoff(["status"]);
    case "signoff_doctor":
      return callSignoff(args && args.fix ? ["doctor", "--fix"] : ["doctor"]);
    case "signoff_audit": {
      const argv = ["audit"];
      if (args && args.sinceInstall) argv.push("--since-install");
      if (args && args.range) argv.push("--range", String(args.range));
      return callSignoff(argv);
    }
    case "signoff_explain":
      return callSignoff(["explain", String((args && args.gate) || "")]);
    case "signoff_report": {
      const argv = ["report", "--json"];
      if (args && args.gate) argv.push("--gate", String(args.gate));
      if (args && args.task) argv.push("--task", String(args.task));
      if (args && args.days) argv.push("--days", String(args.days));
      if (args && args.wouldBlock) argv.push("--would-block");
      return callSignoff(argv);
    }
    case "signoff_review": {
      const action = (args && args.action) || "verify";
      const argv = ["review"];
      if (action === "record") {
        argv.push("--by", String((args && args.by) || ""));
        if (args.model) argv.push("--model", String(args.model));
        if (args.note) argv.push("--note", String(args.note));
        if (args.verdict) argv.push("--verdict", String(args.verdict));
        argv.push("--json");
      } else if (action === "status") argv.push("--status");
      else if (action === "list") argv.push("--list");
      else argv.push("--verify");
      if (args && args.limit) argv.push("--limit", String(args.limit));
      return callSignoff(argv);
    }
    case "signoff_dispute": {
      if (args && args.replay) return callSignoff(["dispute", "--replay", String(args.replay), "--json"]);
      const argv = ["dispute", "--json"];
      if (args && args.claim) argv.push("--claim", String(args.claim));
      for (const cmd of (args && args.run) || []) argv.push("--run", String(cmd));
      if (args && args.expect) argv.push("--expect", String(args.expect));
      if (args && args.repeat) argv.push("--repeat", String(args.repeat));
      if (args && args.budget) argv.push("--budget", String(args.budget));
      return callSignoff(argv);
    }
    case "signoff_patterns": {
      const argv = ["patterns"];
      if (args && args.min) argv.push("--min", String(args.min));
      if (args && args.top) argv.push("--top", String(args.top));
      if (args && args.since) argv.push("--since", String(args.since));
      return callSignoff(argv);
    }
    case "signoff_fix": {
      // 只预览：--check 在基线红、scope 内、判定路径未碰时才退出 0，永不落盘。
      const argv = ["fix", "--patch", String((args && args.patch) || ""), "--check"];
      for (const sc of (args && args.scope) || []) argv.push("--scope", String(sc));
      for (const cmd of (args && args.run) || []) argv.push("--run", String(cmd));
      return callSignoff(argv);
    }
    default:
      throw Object.assign(new Error(`unknown tool: ${name}`), { code: -32602 });
  }
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function reply(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function fail(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function handle(req) {
  const { id, method, params } = req || {};
  if (method === "initialize") {
    return reply(id, {
      protocolVersion: PROTOCOL,
      capabilities: { tools: {} },
      serverInfo: SERVER,
    });
  }
  if (method === "tools/list") return reply(id, { tools: TOOLS });
  if (method === "tools/call") {
    const name = params && params.name;
    const args = (params && params.arguments) || {};
    try {
      const r = runTool(name, args);
      const text =
        `exit ${r.exitCode}\n` +
        (r.stdout ? r.stdout.trimEnd() + "\n" : "") +
        (r.stderr ? r.stderr.trimEnd() : "");
      return reply(id, {
        content: [{ type: "text", text: text.trimEnd() }],
        isError: r.exitCode !== 0,
      });
    } catch (e) {
      return reply(id, { content: [{ type: "text", text: String(e.message || e) }], isError: true });
    }
  }
  if (method === "ping") return reply(id, {});
  if (id !== undefined) fail(id, -32601, `method not found: ${method}`);
}

let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let req;
    try {
      req = JSON.parse(line);
    } catch (e) {
      fail(null, -32700, "parse error");
      continue;
    }
    if (Array.isArray(req)) req.forEach(handle);
    else handle(req);
  }
});
