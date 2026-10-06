// Cloudflare Pages Function：代理「查询邮箱信息」(GET, 支持 ?prop=)
const UPSTREAM = "https://laisilsyx.tw.cpolar.io";

export async function onRequestGet({ request, params }) {
  try {
    const url = new URL(request.url);
    const target = UPSTREAM + "/api/v1/mail/" + params.id + "/info" + url.search;
    const resp = await fetch(target);
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
