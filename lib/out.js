"use strict";

// Write a whole document to stdout without losing the tail.
//
// `process.stdout.write()` hands the bytes to a libuv buffer and returns; the process
// then exits through `process.exit()` in bin/signoff.js, which does not wait for the
// pipe. On macOS and Linux a pipe takes about 64 KB per write, so a big `--json`
// document could arrive cut in half — that is exactly what `macos-latest, node 20`
// reported for 4.2.0:
//   SyntaxError: Unexpected end of JSON input
// Windows happens to write pipes synchronously, which hid it locally.
//
// `fs.writeSync(1, …)` is a blocking syscall on an inherited pipe: it returns only
// after the reader has taken the bytes. A terminal or a non-blocking descriptor can
// answer EAGAIN, in which case the remainder goes back through the stream.

const fs = require("fs");

function write(text) {
  const buf = Buffer.isBuffer(text) ? text : Buffer.from(String(text), "utf8");
  let off = 0;
  while (off < buf.length) {
    try {
      off += fs.writeSync(1, buf, off, buf.length - off);
    } catch (e) {
      if (e && (e.code === "EAGAIN" || e.code === "EWOULDBLOCK")) {
        process.stdout.write(buf.subarray(off));
        return;
      }
      if (e && e.code === "EPIPE") return;
      process.stdout.write(buf.subarray(off));
      return;
    }
  }
}

module.exports = { write };
