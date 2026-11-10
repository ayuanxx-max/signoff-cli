"use strict";

// `.signoff/runs.log` — one line per gate run, append-only.
//
// The gate JSONs are last-wins, so without this file nothing can answer "is the guard
// getting slower / redder". Records are tiny and never carry secrets: gate id, verdict,
// wall clock, optional duration.

const fs = require("fs");
const path = require("path");
const core = require("./core");

function logPath(cwd) {
  return core.statePath(cwd, "runs.log");
}

function note(cwd, gate, payload, ms) {
  try {
    const rec = { ts: core.nowISO(), gate: String(gate), ok: !!(payload && payload.ok) };
    const took = Number(ms != null ? ms : payload && (payload.elapsedMs || payload.ms));
    if (Number.isFinite(took) && took >= 0) rec.ms = Math.round(took);
    core.appendJsonl(logPath(cwd), rec);
    return rec;
  } catch (e) {
    return null; // a failed log line must never fail a gate
  }
}

function read(cwd, limit) {
  let text = "";
  try {
    text = fs.readFileSync(logPath(cwd), "utf8");
  } catch (e) {
    return [];
  }
  const out = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r && r.gate) out.push(r);
    } catch (e) {
      /* skip a torn line */
    }
  }
  return limit ? out.slice(-limit) : out;
}

function dir(cwd) {
  return path.dirname(logPath(cwd));
}

module.exports = { note, read, logPath, dir };
