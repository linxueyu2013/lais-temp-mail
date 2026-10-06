"use strict";

const state = {
  mail: null,        // 邮箱地址
  id: null,          // 句柄
  expiry: null,      // 过期时间 ISO
  mails: [],         // 邮件列表
  selected: -1,      // 当前选中的邮件索引
  pollTimer: null,
  countdownTimer: null,
};

const $ = (sel) => document.querySelector(sel);

/* ---------- Toast ---------- */
let toastTimer = null;
function toast(msg, type = "") {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast show " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = "toast " + type; }, 2400);
}

/* ---------- API ---------- */
async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  let data = null;
  try { data = await res.json(); } catch (_) { data = null; }
  if (!res.ok) {
    const err = (data && data.error) ? data.error : `请求失败 (HTTP ${res.status})`;
    throw new Error(err);
  }
  return data;
}

/* ---------- 创建邮箱 ---------- */
async function createMailbox(tld, prefix) {
  const body = { tld };
  if (prefix && prefix.trim()) body.prefix = prefix.trim();
  return api("/api/v1/create", { method: "POST", body: JSON.stringify(body) });
}

async function getInbox(id) {
  return api(`/api/v1/mail/${encodeURIComponent(id)}`);
}

async function getInfo(id) {
  return api(`/api/v1/mail/${encodeURIComponent(id)}/info?prop=mail|expiry`);
}

async function deleteMailbox(id) {
  return api(`/api/v1/mail/${encodeURIComponent(id)}`, { method: "DELETE" });
}

/* ---------- 渲染：创建视图 ---------- */
function showCreateView() { $("#createView").classList.remove("hidden"); $("#mailView").classList.add("hidden"); }

function showMailView() {
  $("#createView").classList.add("hidden");
  $("#mailView").classList.remove("hidden");
}

/* ---------- 头像（按发件人哈希生成确定性渐变色） ---------- */
function avatarFor(name) {
  const s = String(name || "?").trim();
  const letter = s ? s[0].toUpperCase() : "?";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  const bg = `linear-gradient(135deg, hsl(${h} 72% 60%), hsl(${(h + 45) % 360} 72% 50%))`;
  return { letter, bg };
}

/* ---------- 渲染：收件箱 ---------- */
function renderInbox() {
  const list = $("#mailList");
  if (!state.mails.length) {
    list.innerHTML = `
      <div class="empty" id="emptyState">
        <div class="empty-emoji">📭</div>
        <p>收件箱为空</p>
        <small class="muted">正在等待邮件…（自动刷新已开启）</small>
      </div>`;
    return;
  }
  list.innerHTML = state.mails.map((m, i) => {
    const a = avatarFor(m.sender || "?");
    return `
    <div class="mail-item ${i === state.selected ? "active" : ""}" data-i="${i}">
      <span class="m-avatar" style="background:${a.bg}">${escapeHtml(a.letter)}</span>
      <div class="m-body">
        <div class="m-top">
          <span class="mi-sender">${escapeHtml(m.sender || "(未知发件人)")}</span>
          <span class="m-unread" title="未读"></span>
        </div>
        <div class="mi-subject">${escapeHtml(m.subject || "(无主题)")}</div>
      </div>
    </div>`;
  }).join("");
  list.querySelectorAll(".mail-item").forEach((el) => {
    el.addEventListener("click", () => selectMail(Number(el.dataset.i)));
  });
}

function selectMail(i) {
  state.selected = i;
  renderInbox();
  const m = state.mails[i];
  const detail = $("#mailDetail");
  const a = avatarFor(m.sender || "?");
  detail.innerHTML = `
    <div class="md-head">
      <div class="m-top" style="align-items:flex-start;margin-bottom:8px">
        <span class="m-avatar" style="background:${a.bg};width:36px;height:36px;font-size:15px;border-radius:11px">${escapeHtml(a.letter)}</span>
        <div style="flex:1;min-width:0">
          <div class="md-subject">${escapeHtml(m.subject || "(无主题)")}</div>
          <div class="md-meta">发件人：${escapeHtml(m.sender || "—")}</div>
        </div>
      </div>
    </div>
    <iframe class="md-frame" sandbox="" title="邮件内容"></iframe>`;
  // 用 srcdoc 渲染原始 HTML，sandbox="" 阻止脚本执行，隔离于本页
  detail.querySelector(".md-frame").srcdoc = m.content || "<p style='padding:16px;font-family:sans-serif;color:#333'>（邮件内容为空）</p>";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

/* ---------- 倒计时 ---------- */
function tickCountdown() {
  const el = $("#countdown");
  if (!state.expiry) { el.textContent = "—"; return; }
  const diff = new Date(state.expiry).getTime() - Date.now();
  if (diff <= 0) {
    el.textContent = "已过期";
    el.classList.add("expired");
    return;
  }
  el.classList.remove("expired");
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  el.textContent = d > 0
    ? `${d}天 ${pad(h)}:${pad(m)}:${pad(s)}`
    : `${pad(h)}:${pad(m)}:${pad(s)}`;
}
function pad(n) { return String(n).padStart(2, "0"); }

/* ---------- 轮询 ---------- */
function startPolling() {
  stopPolling();
  state.pollTimer = setInterval(pollInbox, 5000);
}
function stopPolling() {
  if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
}

async function pollInbox() {
  if (!state.id) return;
  try {
    const data = await getInbox(state.id);
    const incoming = data.mails || [];
    const prevCount = state.mails.length;
    state.mails = incoming;
    if (incoming.length > prevCount) {
      toast(`收到 ${incoming.length - prevCount} 封新邮件`, "ok");
      if (state.selected < 0) selectMail(0);
    }
    renderInbox();
  } catch (e) {
    // 句柄失效（过期/销毁）时停止轮询
    if (/404|不存在|过期|expired|Not exists/i.test(e.message)) {
      stopPolling();
      toast("邮箱已失效或过期", "err");
    }
  }
}

/* ---------- 事件绑定 ---------- */
$("#createForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#createBtn");
  const label = btn.querySelector(".cta-label");
  const spin = btn.querySelector(".spinner");
  btn.disabled = true; label.textContent = "创建中…"; spin.hidden = false;
  try {
    const tld = $("#tld").value;
    const prefix = $("#prefix").value;
    const data = await createMailbox(tld, prefix);
    state.mail = data.mail;
    state.id = data.id;
    state.mails = [];
    state.selected = -1;
    $("#mailAddr").textContent = data.mail;
    // 拉取过期时间
    try {
      const info = await getInfo(data.id);
      state.expiry = info.expiry || null;
    } catch (_) { state.expiry = null; }
    showMailView();
    tickCountdown();
    renderInbox();
    if (state.countdownTimer) clearInterval(state.countdownTimer);
    state.countdownTimer = setInterval(tickCountdown, 1000);
    startPolling();
    toast("邮箱已创建", "ok");
  } catch (err) {
    toast(err.message || "创建失败", "err");
  } finally {
    btn.disabled = false; label.textContent = "创建临时邮箱"; spin.hidden = true;
  }
});

$("#copyAddr").addEventListener("click", async () => {
  if (!state.mail) return;
  try {
    await navigator.clipboard.writeText(state.mail);
    toast("已复制邮箱地址", "ok");
  } catch (_) {
    toast("复制失败，请手动选择", "err");
  }
});

$("#autoRefresh").addEventListener("change", (e) => {
  if (e.target.checked) { startPolling(); toast("已开启自动刷新"); }
  else { stopPolling(); toast("已关闭自动刷新"); }
});

$("#refreshBtn").addEventListener("click", async () => {
  const btn = $("#refreshBtn");
  btn.disabled = true;
  try { await pollInbox(); toast("已刷新"); }
  catch (e) { toast(e.message, "err"); }
  finally { btn.disabled = false; }
});

$("#sendTestBtn").addEventListener("click", () => {
  // 第三方测试发信页（该服务本身无发件接口）
  const url = "https://sendtestemail.online/";
  window.open(url, "_blank", "noopener");
  if (state.mail) toast(`请把地址 ${state.mail} 粘贴到发信页`, "ok");
});

$("#deleteBtn").addEventListener("click", async () => {
  if (!state.id) return;
  if (!confirm("确定销毁该邮箱？销毁后邮件将无法恢复。")) return;
  const btn = $("#deleteBtn");
  btn.disabled = true;
  try {
    await deleteMailbox(state.id);
    stopPolling();
    if (state.countdownTimer) clearInterval(state.countdownTimer);
    state.id = null; state.mail = null; state.expiry = null; state.mails = [];
    showCreateView();
    toast("邮箱已销毁", "ok");
  } catch (e) {
    toast(e.message, "err");
  } finally {
    btn.disabled = false;
  }
});

// 初始
showCreateView();
