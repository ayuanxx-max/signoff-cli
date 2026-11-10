window.__ModuleLoader__.load({
  id: "@local/signoff-board",
  factory(require) {
    const React = require("react");
    const h = React.createElement;
    const { useEffect, useState, useCallback } = React;

    const API = "/signoff-board";
    const PANEL_KEY = "signoff-board";

    // 面板文案跟随浏览器语言（也就是 DSH 窗口的语言），不额外依赖宿主接口：
// 同一个英文窗口里，页面和面板说的是同一件事。
const EN = typeof navigator !== "undefined" && /^en/i.test(String((navigator.languages && navigator.languages[0]) || navigator.language || ""));
const M = EN
  ? {
      gates: { p1: "Tests", p2: "Coverage", p3: "Tasks", p4: "Risky actions", p5: "Docs", sec: "Secrets", release: "Release" },
      blocked: "failed", unknown: "unmeasured", ready: "all pass",
      rate: "pass rate", commits: "commits", tasks: "task groups",
      open: "Open full page", fix: "How to fix: ",
      err: "Cannot read the data: run signoff report --html --mount inside the repository, then open this panel in the DSH window (direct access from an external browser is disabled).",
      title: "SignOff board", updated: "updated", none: "no mount records yet",
      loading: "loading...", refresh: "Refresh",
      noRepos: "No repository mounted yet. Run once inside a repo:",
      mountHint: "The page is written to ~/.signoff/reports and will show up here.",
      ro: "Read-only: this panel runs no gate, skips nothing and changes no threshold. Open the full page for details.",
    }
  : {
      gates: { p1: "测试", p2: "覆盖率", p3: "并发任务", p4: "危险动作", p5: "文档", sec: "密钥", release: "发布" },
      blocked: "未过", unknown: "待测", ready: "全过",
      rate: "过闸率", commits: "提交", tasks: "组任务",
      open: "打开完整页面", fix: "怎么修：",
      err: "读不到数据：请确认已在仓库里跑过 signoff report --html --mount，并在 DSH 窗口里打开这个面板（外部浏览器直连被禁用）。",
      title: "SignOff 看板", updated: "更新于", none: "还没有挂载记录",
      loading: "读取中…", refresh: "刷新",
      noRepos: "还没有挂载任何仓库。在仓库里跑一次：",
      mountHint: "页面会写到 ~/.signoff/reports，这里就会列出来。",
      ro: "只读：这里不跑闸、不跳过、不改阈值；要看完整页面点「打开完整页面」。",
    };

const GATE_NAME = M.gates;

const VERDICT = {
      blocked: { text: M.blocked, color: "#f87171", bg: "rgba(248,113,113,.12)", line: "rgba(248,113,113,.45)" },
      unknown: { text: M.unknown, color: "#fbbf24", bg: "rgba(251,191,36,.12)", line: "rgba(251,191,36,.45)" },
      ready: { text: M.ready, color: "#4ade80", bg: "rgba(74,222,128,.12)", line: "rgba(74,222,128,.45)" },
    };

    const styles = {
      wrap: { padding: "18px 22px 40px", maxWidth: 980, margin: "0 auto", color: "inherit" },
      head: { display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 },
      title: { fontSize: 19, fontWeight: 650, letterSpacing: 0.2 },
      meta: { fontSize: 12, opacity: 0.6 },
      card: {
        border: "1px solid rgba(128,128,128,.28)",
        borderRadius: 12,
        padding: "14px 16px",
        marginTop: 14,
        background: "rgba(128,128,128,.06)",
      },
      row: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
      name: { fontSize: 15, fontWeight: 640 },
      chip: {
        display: "inline-block",
        padding: "1px 9px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 620,
        border: "1px solid",
        lineHeight: "19px",
      },
      blockers: { margin: "10px 0 0", padding: 0, listStyle: "none" },
      blocker: { padding: "7px 0", borderTop: "1px dashed rgba(128,128,128,.3)", fontSize: 13 },
      fix: { fontSize: 12, opacity: 0.72, marginTop: 3 },
      checks: { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 },
      check: { fontSize: 11.5, padding: "1px 7px", borderRadius: 6, border: "1px solid rgba(128,128,128,.35)" },
      btn: {
        fontSize: 12.5,
        padding: "5px 12px",
        borderRadius: 8,
        border: "1px solid rgba(128,128,128,.45)",
        background: "transparent",
        color: "inherit",
        cursor: "pointer",
      },
      empty: { marginTop: 16, fontSize: 13, lineHeight: 1.8, opacity: 0.85 },
      code: {
        fontFamily: "ui-monospace, Cascadia Mono, Consolas, monospace",
        fontSize: 12,
        padding: "1px 6px",
        borderRadius: 5,
        background: "rgba(128,128,128,.16)",
      },
    };

    function CheckChips(props) {
      return h(
        "div",
        { style: styles.checks },
        (props.checks || []).map((c) =>
          h(
            "span",
            {
              key: c.id,
              title: c.detail || "",
              style: Object.assign({}, styles.check, {
                color: c.ok ? "var(--dsw-alias-pass, #3fa96a)" : "var(--dsw-alias-fail, #d9534f)",
                borderColor: c.ok ? "rgba(63,169,106,.45)" : "rgba(217,83,79,.45)",
              }),
            },
            `${c.ok ? "✓" : "✗"} ${c.label || c.id}`,
          ),
        ),
      );
    }

    function RepoCard(props) {
      const r = props.repo;
      const v = VERDICT[r.verdict] || VERDICT.unknown;
      return h(
        "section",
        { style: styles.card },
        h(
          "div",
          { style: styles.row },
          h("span", { style: styles.name }, r.name),
          h(
            "span",
            { style: Object.assign({}, styles.chip, { color: v.color, borderColor: v.line, background: v.bg }) },
            v.text,
          ),
          r.rate != null ? h("span", { style: styles.meta }, `${M.rate} ${r.rate}%`) : null,
          r.commits != null ? h("span", { style: styles.meta }, `${r.commits} ${M.commits}`) : null,
          r.tasks != null ? h("span", { style: styles.meta }, `${r.tasks} ${M.tasks}`) : null,
          h("span", { style: { flex: 1 } }),
          h(
            "button",
            {
              style: styles.btn,
              onClick: () => props.onOpen(r.slug),
              "data-signoff": "open-page",
            },
            M.open,
          ),
        ),
        h("div", { style: Object.assign({}, styles.meta, { marginTop: 4 }) }, r.root),
        r.blockers && r.blockers.length
          ? h(
              "ul",
              { style: styles.blockers },
              r.blockers.slice(0, 6).map((b) =>
                h(
                  "li",
                  { key: b.id, style: styles.blocker },
                  h("b", null, `${b.id} · ${b.label || b.title || GATE_NAME[b.id] || ""}`),
                  b.why || b.detail
                    ? h("div", { style: { opacity: 0.8, marginTop: 2 } }, `${b.why ? b.why + " · " : ""}${b.detail || ""}`)
                    : null,
                  b.fix ? h("div", { style: styles.fix }, `${M.fix}${b.fix}`) : null,
                ),
              ),
            )
          : null,
        h(CheckChips, { checks: r.checks }),
      );
    }

    function Board() {
      const [data, setData] = useState(null);
      const [error, setError] = useState(null);
      const [busy, setBusy] = useState(false);

      const load = useCallback(() => {
        setBusy(true);
        fetch(API + "/state", { headers: { accept: "application/json" } })
          .then((r) => r.json())
          .then((d) => {
            setData(d);
            setError(null);
          })
          .catch((e) => {
            const msg = String((e && e.message) || e);
            setError(
              /failed to fetch|networkerror|load failed/i.test(msg)
                ? M.err
                : msg,
            );
          })
          .finally(() => setBusy(false));
      }, []);

      useEffect(() => {
        load();
        const onFocus = () => load();
        window.addEventListener("focus", onFocus);
        return () => window.removeEventListener("focus", onFocus);
      }, [load]);

      const open = (slug) => {
        fetch(API + "/open", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ slug }),
        }).catch(() => {});
      };

      const repos = (data && data.repos) || [];
      return h(
        "div",
        { style: styles.wrap },
        h(
          "div",
          { style: styles.head },
          h("span", { style: styles.title }, M.title),
          h(
            "span",
            { style: styles.meta },
            data && data.updatedAt ? `${M.updated} ${data.updatedAt}` : M.none,
          ),
          h("span", { style: { flex: 1 } }),
          h("button", { style: styles.btn, onClick: load, disabled: busy }, busy ? M.loading : M.refresh),
        ),
        error ? h("div", { style: { marginTop: 12, color: "#d9534f", fontSize: 13 } }, error) : null,
        repos.length === 0
          ? h(
              "div",
              { style: styles.empty },
              M.noRepos,
              h("div", { style: { marginTop: 8 } }, h("code", { style: styles.code }, "signoff report --html --mount")),
              h("div", { style: { marginTop: 10, opacity: 0.75 } }, M.mountHint),
            )
          : repos.map((r) => h(RepoCard, { key: r.slug, repo: r, onOpen: open })),
        h(
          "div",
          { style: Object.assign({}, styles.meta, { marginTop: 18 }) },
          M.ro,
        ),
      );
    }

    function Icon(props) {
      const size = (props && props.size) || 16;
      return h(
        "svg",
        { viewBox: "0 0 16 16", width: size, height: size, "aria-hidden": true },
        h("rect", { x: 1, y: 1, width: 14, height: 14, rx: 4, fill: "#b4232a" }),
        h("rect", {
          x: 2.7, y: 2.7, width: 10.6, height: 10.6, rx: 2.8,
          fill: "none", stroke: "#ffffff", strokeOpacity: 0.5, strokeWidth: 0.9,
        }),
        h("path", {
          d: "M4.9 8.3 7 10.4 11.3 6",
          fill: "none", stroke: "#ffffff", strokeWidth: 1.7,
          strokeLinecap: "round", strokeLinejoin: "round",
        }),
      );
    }

    return {
      inject: ["slots"],
      apply(ctx) {
        ctx.slots.inject("sidebar.panellist", () =>
          ctx.slots.register(
            {
              name: "sidebar.panellist",
              id: PANEL_KEY,
              order: 40,
              label: M.title,
            },
            Icon,
          ),
        );
        ctx.slots.inject("main", () =>
          ctx.slots.register({ name: "main", key: PANEL_KEY }, Board),
        );
      },
    };
  },
});
