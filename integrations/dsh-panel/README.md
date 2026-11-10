# @local/signoff-board

随 `signoff-cli` 的 npm 包一起分发（`integrations/dsh-panel/`）；下面写的是本机 profile 里的接线方式。

DSH 侧栏里的「SignOff 看板」：只读展示每个已挂载仓库能不能发。

## 它显示什么

数据全部来自 `~/.signoff/reports`（由 `signoff report --html --mount` 写出，`dsh-signoff` 仓库提供）：

- 每个仓库一张卡：判定（现在不能发 / 可以发）、阻塞项与修法、过闸率、提交数、任务组数；
- 七项检查的通过标记（p1…p5、sec、publish）；
- 「打开完整页面」按钮：调系统 opener 打开 `<仓库>/latest.html`（win `start` / mac `open` / linux `xdg-open`）。

面板不做的事：不跑闸、不跳过、不改阈值、不写任何仓库状态。要跑闸用 `signoff run`。

## 装法

正常情况下：

```
plugin_manager install_bundle  target=E:\DSH.Jack.01\dsh-signoff\integrations\dsh-panel
```

本机 2026-11-10 装的时候 pnpm 报 `EPERM rename ... dsh-session-fork-tree_tmp_*`（该 `link:` 依赖被运行中的进程占用，
与这个包无关），于是按 pnpm 对 `link:` 依赖的同样做法手工装：

1. `~/.dsh/profiles/desktop/package.json` 的 `dependencies` 加
   `"@local/signoff-board": "link:E:/DSH.Jack.01/plugins/signoff-board"`；
2. `node_modules/@local/signoff-board` 建目录联接（`mklink /J`）指向本目录；
3. `~/.dsh/profiles/desktop/cordis.patch.yml` 末尾加：

   ```yaml
   - insert:
       - id: signoff-board
         name: '@local/signoff-board'
         config:
           mountDir: ''
   ```

   改动前后各一份 `.bak-before-signoff-board`。

Loader 会热加载 patch：`sidebar.panellist` 会立刻多出 `signoff-board`（order 40）。
客户端 bundle 在页面下次加载时生效，刷新页面即可。

## 路由

宿主半注册两个只读 HTTP 路由（`ctx.webServer.register`，prefix `/signoff-board`）：

- `GET  /signoff-board/state` —— 读 `index.json` 与各仓 `report.json`，返回面板要的字段；
- `POST /signoff-board/open` —— `{ slug }`，校验 slug 后交给系统 opener 打开该仓页面。

Electron 渲染进程的网络会话自带 `NATIVE_ACCESS_HEADER`，所以面板的 fetch 会被放行；
普通浏览器（含 headless 校验）访问同一地址会是 `403 Browser access is disabled`——这是桌面端的访问策略，
不是插件故障。要让外部浏览器也能看，需要在 DSH 设置里打开 browser access。

## 路径不能放在 `/api` 下面

桌面端在 `/api` 上挂了一个 prefix 路由做网关：请求先被它接走，未注册的路径直接回 `not found`
（浏览器里则是 `403 Browser access is disabled`），后注册的 `/api/local/*` 永远轮不到。
所以看板路由放在 `/signoff-board`，与 `/api` 网关无关。

另一个坑：同一个进程里重复注册相同 prefix 会抛 `webserver: duplicate prefix route`。
热重载时旧路由可能还没释放（早期版本没有返回 disposer），所以注册包了 try/catch：
走旧路由继续服务，重启进程后自然换成新代码。

## 卸载

删 `cordis.patch.yml` 里的那条 insert（Loader 会摘掉面板），再删 `node_modules/@local/signoff-board`
联接与 `package.json` 里的依赖；`~/.signoff/reports` 可以留着（那是页面与数据）。
