// Cloudflare Pages Function：代理「创建邮箱」
// 同源转发到上游，规避浏览器跨域（CORS）限制。
const UPSTREAM = "https://laisilsyx.tw.cpolar.io";
const SUPPORTED = ["com", "cyou", "site", "store", "edu"];

export async function onRequestPost({ request }) {
  try {
    let body = {};
    try { body = await request.json(); } catch (_) {}
    if (body.tld && !SUPPORTED.includes(body.tld)) {
      return Response.json(
        { error: `不支持的 TLD：${body.tld}（支持 ${SUPPORTED.join(", ")}）` },
        { status: 422 }
      );
    }
    const resp = await fetch(UPSTREAM + "/api/v1/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    return new Response(text, {
      status: resp.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return Response.json({ error: "上游服务不可达：" + e.message }, { status: 502 });
  }
}
