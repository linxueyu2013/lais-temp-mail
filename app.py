"""
莱斯临时邮箱 · Web 工具后端
- 提供静态前端
- 同源代理莱斯邮件服务 API（绕开浏览器跨域限制 CORS）
- 上游不可达时返回友好错误
"""
import os
import requests
from flask import Flask, request, jsonify, Response, send_from_directory

# 本地开发服务器（可选）。生产环境请部署到 Cloudflare Pages（public/ + functions/）。
app = Flask(__name__, static_folder="public/static", static_url_path="/static")

UPSTREAM = os.environ.get("LES_UPSTREAM", "https://laisilsyx.tw.cpolar.io")
TIMEOUT = int(os.environ.get("LES_TIMEOUT", "20"))

# 文档中声明支持的 TLD
SUPPORTED_TLDS = ["com", "cyou", "site", "store", "edu"]


def _proxy(method, path, *, forward_json=True):
    url = UPSTREAM + path
    try:
        if forward_json and method == "POST":
            payload = request.get_json(silent=True) or {}
            resp = requests.request(method, url, json=payload, timeout=TIMEOUT)
        else:
            resp = requests.request(method, url, params=request.args, timeout=TIMEOUT)

        ctype = resp.headers.get("Content-Type", "")
        if "application/json" in ctype:
            try:
                return jsonify(resp.json()), resp.status_code
            except ValueError:
                pass
        return Response(resp.text, status=resp.status_code, mimetype=ctype or "text/plain")
    except requests.exceptions.Timeout:
        return jsonify({"error": "上游服务响应超时，请稍后重试"}), 504
    except requests.exceptions.RequestException as e:
        return jsonify({"error": f"上游服务不可达：{e}"}), 502


@app.route("/")
def index():
    return send_from_directory("public", "index.html")


@app.route("/api/v1/create", methods=["POST"])
def proxy_create():
    # 简单校验，避免把无意义请求打到上游
    body = request.get_json(silent=True) or {}
    tld = body.get("tld", "")
    if tld and tld not in SUPPORTED_TLDS:
        return jsonify({"error": f"不支持的 TLD：{tld}（支持 {', '.join(SUPPORTED_TLDS)}）"}), 422
    return _proxy("POST", "/api/v1/create")


@app.route("/api/v1/mail/<path:mail_id>/info", methods=["GET"])
def proxy_info(mail_id):
    return _proxy("GET", f"/api/v1/mail/{mail_id}/info", forward_json=False)


@app.route("/api/v1/mail/<path:mail_id>", methods=["GET", "DELETE"])
def proxy_mail(mail_id):
    return _proxy(request.method, f"/api/v1/mail/{mail_id}", forward_json=False)


@app.route("/api/meta")
def meta():
    return jsonify({"upstream": UPSTREAM, "supported_tlds": SUPPORTED_TLDS})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port, debug=False)
