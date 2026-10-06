# 莱斯临时邮箱 · 部署文档（Cloudflare Pages）

本文档记录把本项目部署到 **Cloudflare Pages** 的完整、可复现步骤，包含**两种部署方式**、**踩过的坑**、以及**故障排查**。照着做即可，不需要从头试错。

---

## 1. 项目简介

本项目是一个**临时邮箱 Web 工具**的前端 + 服务端代理，封装了「莱斯邮件服务」API（`https://laisilsyx.tw.cpolar.io`）。

功能：创建临时邮箱、自动轮询收件箱、安全渲染邮件内容、查看过期倒计时、一键销毁。

> ⚠️ 该上游 API **只支持收件**，不支持发件。页面中的「发测试邮件」是跳转第三方发信页来验证收件链路。

---

## 2. 架构与为什么需要 `functions/`

浏览器直接调用 `https://laisilsyx.tw.cpolar.io` 会被**同源策略 / CORS** 拦截（该 API 不返回 `Access-Control-Allow-Origin` 头）。

解决办法：用 **Cloudflare Pages Functions** 在同域（`你的站点域名`）下做服务端转发。前端只调 `/api/...`，Functions 在边缘节点把请求转发到上游，再把响应原样返回——浏览器侧完全无跨域问题。

```
浏览器 ──/api/v1/create──▶ Cloudflare Pages Functions ──▶ laisilsyx.tw.cpolar.io
        ◀──── JSON ──────      （同域，无 CORS）            （真实 API）
```

---

## 3. 目录结构

```
.
├── public/                         # 静态站点 = Pages 构建输出目录
│   ├── index.html
│   └── static/{style.css, app.js}
├── functions/                      # Pages Functions：服务端代理（必带，否则跨域失败）
│   ├── api/meta.js                 # GET  /api/meta
│   └── api/v1/
│       ├── create.js               # POST /api/v1/create
│       ├── mail/[id].js            # GET  /api/v1/mail/:id  （收件箱）
│       │                           # DELETE /api/v1/mail/:id（销毁）
│       └── mail/[id]/info.js       # GET  /api/v1/mail/:id/info?prop=mail|expiry
├── app.py                          # 可选：本地开发服务器（python3 app.py）
├── README.md
└── DEPLOYMENT.md
```

> 上游地址写在每个 `functions/*.js` 顶部的 `UPSTREAM` 常量里，换服务改这一行即可。

---

## 4. 前置条件

- 一个 Cloudflare 账号（免费版即可，Pages Functions 有每日免费额度）。
- 本项目代码（已推到 Git 仓库，或本地 `/workspace`）。
- 方式二需要：**Cloudflare Account ID** + 一个 **API Token**（仅 Pages 权限）。

---

## 5. 方式一：Git 连接 + 原生部署（★推荐，最省事）

适合：把代码放在 GitHub/GitLab，让 Cloudflare 每次 push 自动构建。

### 步骤

1. 把本项目推到 GitHub（仓库名随意，例如 `lais-temp-mail`）。
2. Cloudflare 控制台 → **Workers & Pages → Create → Pages → 连接 Git 仓库**。
3. 授权后选择你的仓库。
4. **构建设置**（关键，照填）：

   | 设置项 | 值 |
   |---|---|
   | Framework preset | `None` |
   | Build command（构建命令） | **留空** |
   | Preview command（预览命令） | **留空** |
   | Build output directory（构建输出目录） | **`public`** |
   | Root directory（根目录） | 留空 |

5. 点 **Save and Deploy**。

Cloudflare 会自动把 `public/` 当静态站点，并把 `functions/` 编译为边缘函数。**无需任何环境变量或 API 令牌。**

> 部署完成后会得到一个 `https://<项目名>.pages.dev` 网址，直接打开即用。

---

## 6. 方式二：Wrangler 直传（命令行，无需连 Git）

适合：不想连 Git、或后台「构建命令必填」等限制导致方式一走不通时。本项目实际就是用这种方式成功上线的。

### 6.1 准备凭据

1. Cloudflare 控制台 → **My Profile（右上角头像）→ API Tokens → Create Token**。
2. 用模板 **"Cloudflare Pages: Edit"**（或自定义：Account → Cloudflare Pages → Edit）。
3. 生成后复制令牌（形如 `cfut_xxxx`）。
4. 记下 **Account ID**：控制台右下角「Account ID」，或任意项目 URL 里 `accounts/<这段>`。

### 6.2 部署命令

```bash
# 设置凭据（替换为你的真实值）
export CLOUDFLARE_ACCOUNT_ID="你的AccountID"
export CLOUDFLARE_API_TOKEN="你的Token"

# 创建直传型 Pages 项目（只需一次；Git Provider 会是 No）
npx wrangler pages project create lais-temp-mail --production-branch main

# 上传 public/（含 functions 自动打包）
npx wrangler pages deploy public --project-name lais-temp-mail
```

成功后终端会给出预览网址（带哈希），生产网址为 `https://lais-temp-mail.pages.dev`。

> 以后改了代码，重新跑最后一条 `wrangler pages deploy` 即可上线。

---

## 7. 踩坑记录（重要，照抄能省几小时）

### 坑 1：`wrangler.toml` 让 Cloudflare 误用 `npx wrangler deploy`

**现象**：构建日志出现
```
Executing user deploy command: npx wrangler deploy
✘ [ERROR] Missing entry-point to Worker script or to assets directory
```
**原因**：仓库里若有 `wrangler.toml`，Cloudflare 会自动把构建命令设成 `npx wrangler deploy`——这是给 **Workers** 用的，不是 Pages，于是找不到入口点报错。
**解决**：**删除 `wrangler.toml`**，改用方式一（空命令）或方式二（`wrangler pages deploy`）。

### 坑 2：构建命令 / 预览命令「必填」

部分 Cloudflare 界面把这两个框标为必填。若确实不能留空：
- 填 `npx wrangler pages deploy public --project-name lais-temp-mail`（注意带 `pages`）。
- 并在 **Settings → Environment variables** 加 `CLOUDFLARE_ACCOUNT_ID` 和 `CLOUDFLARE_API_TOKEN`（生产 + 预览都加）。
- 但这会与 Git 连接机制冲突（见坑 3），所以**最干净的还是留空 + 输出目录 `public`**。

### 坑 3：`wrangler pages deploy` 报 "project does not exist" / Git 冲突

**现象**：
```
✘ [ERROR] The Pages project "lais-temp-mail" does not exist.
```
或直传被拒，提示项目由 Git 管理。
**原因**：用 `wrangler pages deploy` 直传到**已通过 Git 连接创建**的项目会失败（Git 项目与直传互斥）。
**解决**：用 `wrangler pages project create lais-temp-mail` **新建一个直传型项目**（Git Provider = No），再 deploy。或反过来：删掉 Git 项目，纯用直传。

### 坑 4：直传命令缺项目名

**现象**：`✘ [ERROR] Missing Pages project name. Use --project-name <name>`
**解决**：命令末尾加 `--project-name lais-temp-mail`。

### 坑 5：Dashboard 看不到项目（账户不对）

**现象**：API 已创建项目且站点可访问，但控制台里找不到。
**原因**：项目建在给的 Account ID 对应账户下，而你的 Dashboard 停留在**另一个账户**。
**解决**：右上角账户切换菜单，切到 Account ID = `53b5feb40439f5786d8c9bda9df9dc15` 的账户。若看不到，说明该账户不是你常用登录账号（可能是组织/协作者账户），需登录正确账户或被邀请为成员。

---

## 8. 修改上游 API

编辑以下文件顶部的 `UPSTREAM` 常量，改成你的服务地址：

- `functions/api/meta.js`
- `functions/api/v1/create.js`
- `functions/api/v1/mail/[id].js`
- `functions/api/v1/mail/[id]/info.js`

```js
const UPSTREAM = "https://你的上游地址";
```

改完重新部署即可。

---

## 9. 本地开发

不依赖 Cloudflare，用 Flask 在本地起同源服务：

```bash
pip3 install flask requests
python3 app.py            # 默认 http://localhost:8080
# 自定义上游/端口：
LES_UPSTREAM=https://x.tw.cpolar.io PORT=9000 python3 app.py
```

`app.py` 从 `public/` 提供静态文件，并把 `/api/*` 转发到上游，逻辑与线上 Functions 一致，方便离线调试。

---

## 10. 安全与令牌管理

- **API Token 用完即废**：令牌一旦离开 Cloudflare 控制台（如粘贴到聊天/脚本）就不再安全。部署完成后立即去 **API Tokens** 删除或轮换。
- 优先用**仅 Pages:Edit 权限**的窄权限令牌，不要用全局 API Key。
- 上游 `laisilsyx.tw.cpolar.io` 是第三方隧道服务，稳定性不在本项目控制范围内；如需长期自用，建议自建上游并在 `UPSTREAM` 中替换。

---

## 11. 常见问题

**Q：页面空白 / 无样式？**
A：多半是把 `index.html` 单独传了，缺少 `static/`。必须连同 `public/` 整个目录部署，且 Build output directory 填 `public`。

**Q：创建邮箱报错 / 接口 404？**
A：确认 `functions/` 目录已随 `public/` 一起部署（方式一的输出目录为 `public`，functions 在仓库根，Cloudflare 会自动识别；方式二用 `wrangler pages deploy public` 会自动打包 functions）。

**Q：收件箱一直为空？**
A：正常。临时邮箱需要第三方真正向该地址发信才会进收件箱；可点页面「发测试邮件（第三方）」验证收件链路。

**Q：想绑自定义域名？**
A：Cloudflare 控制台 → 你的 Pages 项目 → **Custom domains** → 按提示添加并解析 CNAME。

---

## 12. 删除项目

```bash
export CLOUDFLARE_ACCOUNT_ID="你的AccountID"
export CLOUDFLARE_API_TOKEN="你的Token"
npx wrangler pages project delete lais-temp-mail --yes
```
