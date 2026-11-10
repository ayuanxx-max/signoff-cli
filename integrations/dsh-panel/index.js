import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const name = "signoff-board";
export const inject = ["webServer"];

const PREFIX = "/signoff-board";

function mountRoot(config) {
  const dir = (config && config.mountDir) || "";
  return dir ? path.resolve(dir) : path.join(homedir(), ".signoff", "reports");
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

// One repository card: only the fields the panel draws. The full page stays the artifact.
function card(slug, entry, report) {
  const data = report || {};
  const summary = data.summary || {};
  return {
    slug,
    name: entry.name || slug,
    root: entry.root || "",
    verdict: data.verdict || entry.verdict || "unknown",
    headline: data.headline || entry.headline || "",
    blockers: (data.blockers || []).map((b) => ({ id: b.id, label: b.label, why: b.why, detail: b.detail, fix: b.fix })),
    rate: data.health ? data.health.rate : entry.rate ?? null,
    commits: summary.commits ?? null,
    tasks: Array.isArray(data.tasks) ? data.tasks.length : null,
    checks: Array.isArray(data.gates)
      ? data.gates.map((g) => ({ id: g.id, label: g.label, ok: g.ok, detail: g.detail }))
      : [],
    generatedAt: data.generatedAt || null,
    page: entry.page || `${slug}/latest.html`,
  };
}

async function state(config) {
  const root = mountRoot(config);
  const index = await readJson(path.join(root, "index.json"));
  const repos = index && index.repos ? index.repos : {};
  const slugs = Object.keys(repos).sort();
  const cards = await Promise.all(
    slugs.map(async (slug) => card(slug, repos[slug], await readJson(path.join(root, slug, "report.json")))),
  );
  return { ok: true, root, updatedAt: index ? index.updatedAt : null, repos: cards };
}

function opener(file) {
  if (process.platform === "win32") return ["cmd", ["/c", "start", "", file]];
  if (process.platform === "darwin") return ["open", [file]];
  return ["xdg-open", [file]];
}

async function openPage(config, slug) {
  const root = mountRoot(config);
  const index = await readJson(path.join(root, "index.json"));
  if (!index || !index.repos || !index.repos[slug]) return { ok: false, error: "unknown repo" };
  const file = path.join(root, slug, "latest.html");
  const [cmd, args] = opener(file);
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
    return { ok: true, page: file };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

function writeJson(res, body, status = 200) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(text),
  });
  res.end(text);
}

export function apply(ctx, config) {
  ctx.effect(() => {
    let dispose = () => {};
    try {
      dispose = ctx.webServer.register({
      kind: "prefix",
      path: PREFIX,
      handler: async (req, res) => {
        const url = new URL(req.url, "http://localhost");
        const route = url.pathname.replace(/\/+$/, "");
        try {
          if (route === `${PREFIX}/state` && req.method === "GET") {
            writeJson(res, await state(config));
            return;
          }
          if (route === `${PREFIX}/open` && req.method === "POST") {
            let slug = "";
            try {
              const body = await new Promise((resolve) => {
                let data = "";
                req.on("data", (chunk) => {
                  data += chunk;
                  if (data.length > 4096) req.destroy();
                });
                req.on("end", () => resolve(data));
                req.on("error", () => resolve(""));
              });
              slug = String(JSON.parse(body || "{}").slug || "");
            } catch {
              writeJson(res, { ok: false, error: "bad body" }, 400);
              return;
            }
            if (!/^[A-Za-z0-9._-]+$/.test(slug)) {
              writeJson(res, { ok: false, error: "bad slug" }, 400);
              return;
            }
            writeJson(res, await openPage(config, slug));
            return;
          }
          writeJson(res, { ok: false, error: "not found" }, 404);
        } catch (e) {
          writeJson(res, { ok: false, error: String((e && e.message) || e) }, 500);
        }
      },
      });
    } catch (e) {
      // 同进程内重复注册同一个 prefix（改代码后热重载，旧路由还没释放）不该拖垮整个插件：
      // 旧路由仍在服务，等下次重启进程时自然换成新代码。
      dispose = () => {};
      console.log("[signoff-board] route kept from earlier activation:", String((e && e.message) || e));
    }
    return () => {
      try {
        dispose();
      } catch {
        /* already gone */
      }
    };
  }, "signoff-board: 看板数据路由");
}
