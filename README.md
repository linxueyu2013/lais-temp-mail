# 莱斯临时邮箱 · TempMail（Cloudflare Pages 版）

临时邮箱前端封装，部署到 Cloudflare Pages：**静态前端 `public/` + 边缘函数代理 `functions/`**（解决浏览器跨域）。

## 目录结构

```
public/                      # 静态站点（Pages 构建输出目录）
  index.html
  static/{style.css, app.js}
functions/                   # Pages Functions：服务端代理上游 API（必带）
  api/meta.js
  api/v1/create.js
  api/v1/mail/[id].js        # GET 收件箱 / DELETE 销毁
  api/v1/mail/[id]/info.js   # GET 邮箱信息（含过期时间）
wrangler.toml                # 可选：Wrangler 部署配置
app.py                       # 可选：本地开发服务器（python3 app.py）
```

> 上游服务：`https://laisilsyx.tw.cpolar.io`（写在各 `functions/*.js` 的 `UPSTREAM` 常量里，可改）。

## 部署方式一：Cloudflare Dashboard（推荐）

1. 把本目录推到 GitHub / GitLab。
2. Cloudflare 控制台 → **Workers & Pages → Create → Pages → 连接仓库**。
3. 构建设置：
   - **Framework preset**：`None`
   - **Build command**：留空
   - **Build output directory**：`public`
4. 点击 Deploy。`functions/` 会自动作为边缘函数生效，**无需任何环境变量或绑定**。

## 部署方式二：Wrangler CLI

```bash
# 本地预览（含 Functions）
npx wrangler pages dev public

# 部署到生产
npx wrangler pages deploy public
```

## 本地开发（不依赖 Wrangler）

```bash
pip3 install flask requests
python3 app.py            # 默认 http://localhost:8080
# 自定义上游/端口：LES_UPSTREAM=... PORT=9000 python3 app.py
```

## 说明

- 该邮件 API 仅提供**收件**能力，无发件接口；页面「发测试邮件」按钮跳转第三方发信页用于验证收件链路。
- 上游域名会轮换（`kuromee.com` / `nilufa.kuromee.com` 等），页面以接口返回的真实地址为准。
- Pages Functions 免费额度对个人临时邮箱使用足够。
