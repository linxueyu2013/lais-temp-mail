// Cloudflare Pages Function：返回元信息（前端展示用）
export async function onRequestGet() {
  return Response.json({
    upstream: "https://laisilsyx.tw.cpolar.io",
    supported_tlds: ["com", "cyou", "site", "store", "edu"],
  });
}
