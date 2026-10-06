// Cloudflare Pages Function：代理「查收件箱」(GET) 与「销毁邮箱」(DELETE)
const UPSTREAM = "https://laisilsyx.tw.cpolar.io";

export async function onRequest({ request, params }) {
  try {
    const url = new URL(request.url);
    const target = UPSTREAM + "/api/v1/mail/" + params.id + url.search;
    const init = { method: request.method, headers: {} };
    if (request.method === "POST") {
      init.headers["Content-Type"] = "application/json";
      init.body = await request.text();
    }
    const resp = await fetch(target, init);
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
