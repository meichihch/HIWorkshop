// 學生手機端
(function () {
  const app = document.getElementById("app");
  const who = document.getElementById("who");
  const S = {
    name: store.get("hl-name") || "",
    group: store.get("hl-group") || "",
    state: null,
    q: null,
    rows: [],
    liked: new Set(),
    busy: false,
  };
  if (!window.GROUPS.includes(S.group)) S.group = "";

  const toast = (msg) => { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2200); };
  const groupClass = (tag) => { const i = window.GROUPS.indexOf(tag); return i >= 0 ? "g" + (i + 1) : ""; };

  // ---------- 報到：名字＋組別 ----------
  function renderWho() {
    who.innerHTML = S.name && S.group ? `${esc(S.name)}・${esc(S.group)}<br><button id="rename">修改</button>` : "";
    const b = document.getElementById("rename");
    if (b) b.onclick = () => renderCheckin();
  }
  function renderCheckin() {
    who.innerHTML = "";
    let pick = S.group;
    app.innerHTML = `
      <form class="card" id="nameForm">
        <h1 class="prompt">歡迎！先報到</h1>
        <p class="hint">填名字、選組別就好，不需要登入。</p>
        <div class="field"><label for="nm">名字</label>
          <input class="input" id="nm" maxlength="30" autocomplete="nickname" value="${esc(S.name)}" required></div>
        <div class="field"><label>你的組別</label><div class="chips" id="grp">
          ${window.GROUPS.map((g) => `<button type="button" class="chip" data-v="${esc(g)}" aria-pressed="${g === pick}">${esc(g)}</button>`).join("")}
        </div></div>
        <button class="btn" type="submit" id="go">報到</button>
      </form>`;
    document.getElementById("grp").onclick = (e) => {
      const b = e.target.closest(".chip"); if (!b) return;
      pick = b.dataset.v;
      document.querySelectorAll("#grp .chip").forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
    };
    document.getElementById("nameForm").onsubmit = async (e) => {
      e.preventDefault();
      const v = document.getElementById("nm").value.trim().slice(0, 30);
      if (!v) return toast("請填名字");
      if (!pick) return toast("請選組別");
      const btn = document.getElementById("go"); btn.disabled = true;
      try {
        await Live.insert({ q: CHECKIN_Q, name: v, tag: pick });
        S.name = v; S.group = pick; store.set("hl-name", v); store.set("hl-group", pick);
        start();
      } catch (err) { console.error(err); toast("報到失敗，請再試一次"); btn.disabled = false; }
    };
  }

  // ---------- 題目 ----------
  function waiting(big, small) {
    app.innerHTML = `<div class="card waiting"><div class="pulse" aria-hidden="true"></div><div class="big">${big}</div><p class="hint">${small}</p></div>`;
  }
  function renderQuestion() {
    renderWho();
    const q = S.q;
    if (!q) return waiting("等待講師出題", "題目出現時，這裡會自動更新");
    if (q.type === "checkin") return waiting("報到完成", `你在${esc(S.group)}，請看大螢幕`);
    if (q.type.startsWith("survey") || q.readonly) return waiting("請看大螢幕", "這一段不用作答");

    const head = `<div class="eyebrow">${esc(q.title)}</div><h1 class="prompt">${esc(q.prompt)}</h1>${q.hint ? `<p class="hint">${esc(q.hint)}</p>` : ""}`;

    if (q.type === "cloud") {
      app.innerHTML = `<form class="card" id="f">${head}
        <div class="row"><input class="input" id="t" maxlength="${q.maxLen || 20}" placeholder="${esc(q.placeholder || "")}" autocomplete="off">
        <button class="btn" type="submit">送出</button></div>
        <div class="mine" id="mine"></div></form>`;
      document.getElementById("f").onsubmit = async (e) => {
        e.preventDefault();
        const el = document.getElementById("t"); const v = el.value.trim();
        if (!v) return;
        if (await submit({ body: v })) { el.value = ""; el.focus(); }
      };
    }

    if (q.type === "wall") {
      app.innerHTML = `<form class="card" id="f">${head}
          <div class="field"><label for="t">內容（${esc(S.group)}）</label><textarea class="input" id="t" maxlength="${q.maxLen || 300}" placeholder="${esc(q.placeholder || "")}"></textarea></div>
          <button class="btn" type="submit" id="send">送出</button></form>
        ${q.hostOnly ? "" : `<section class="wall"><div class="wall-head"><h2 id="listTitle">大家送出的</h2><span class="hint" id="count"></span></div><div class="wall" id="list"></div></section>`}`;
      document.getElementById("f").onsubmit = async (e) => {
        e.preventDefault();
        const t = document.getElementById("t"); const v = t.value.trim();
        if (!v) return toast("請先寫內容");
        if (await submit({ body: v })) t.value = "";
      };
    }
    renderData();
  }

  // ---------- 會隨資料更新的部分 ----------
  function renderData() {
    const q = S.q; if (!q) return;
    const rows = S.rows.filter((r) => !r.hidden);

    if (q.type === "cloud") {
      const mine = rows.filter((r) => r.name === S.name);
      const box = document.getElementById("mine");
      if (box) box.innerHTML = mine.length ? `<span class="label">你送出的：</span>` + mine.map((r) => `<span>${esc(r.body)}</span>`).join("") : "";
    }

    if (q.type === "wall" && !q.readonly) {
      const list = document.getElementById("list"); if (!list) return;
      const locked = q.hideUntilReveal && !(S.state && S.state.reveal);
      const visible = (locked ? rows.filter((r) => r.name === S.name) : rows).sort((a, b) => b.created_at.localeCompare(a.created_at));
      document.getElementById("listTitle").textContent = locked ? "你送出的（揭曉前只有你看得到）" : "大家送出的";
      document.getElementById("count").textContent = visible.length ? `${visible.length} 則` : "";
      if (!visible.length) { list.innerHTML = `<div class="empty">${locked ? "還沒送出內容" : "還沒有人送出，當第一個吧"}</div>`; return; }
      const showNames = S.state && S.state.show_names;
      list.innerHTML = visible.map((r) => {
        const liked = S.liked.has(r.id);
        return `<article class="note ${groupClass(r.tag)}" style="animation:none">
          <div class="body">${esc(r.body)}</div>
          <div class="meta">${r.tag ? `<span class="tag">${esc(r.tag)}</span>` : ""}${showNames || r.name === S.name ? `<span>${r.name === S.name ? "你" : esc(r.name)}</span>` : ""}
            ${q.likes ? `<button class="like" data-like="${r.id}" aria-pressed="${liked}" ${liked ? "disabled" : ""}>${esc(q.likes)} ${r.likes || 0}</button>` : ""}</div>
        </article>`;
      }).join("");
      list.onclick = async (e) => {
        const lk = e.target.closest("[data-like]"); if (!lk) return;
        S.liked.add(lk.dataset.like); lk.disabled = true; lk.setAttribute("aria-pressed", "true");
        try { await Live.like(lk.dataset.like, S.name); } catch (err) { console.error(err); }
      };
    }
  }

  async function submit(fields) {
    if (S.busy) return false;
    S.busy = true;
    try {
      await Live.insert({ q: dataKey(S.q), name: S.name, tag: S.group, ...fields });
      toast("送出了！");
      await loadRows();
      return true;
    } catch (err) {
      console.error(err); toast("送出失敗，請再試一次"); return false;
    } finally { S.busy = false; }
  }

  // ---------- 資料 ----------
  async function loadState() {
    try { S.state = await Live.getState(); } catch (err) { console.error(err); return; }
    const q = findQuestion(S.state.current_q);
    if (!S.q || !q || q.id !== S.q.id) { S.q = q; S.rows = []; renderQuestion(); await loadRows(); }
    else renderData();
  }
  async function loadRows() {
    const q = S.q;
    if (!q || q.type !== "cloud" && q.type !== "wall" || q.readonly) return;
    try {
      S.rows = await Live.listResponses(dataKey(q));
      if (q.likes) (await Live.myLikes(S.name)).forEach((id) => S.liked.add(id));
    } catch (err) { console.error(err); }
    renderData();
  }
  const refreshRows = debounce(loadRows, 200);

  let started = false;
  function start() {
    renderWho();
    if (!started) {
      started = true;
      Live.subscribe((kind) => { if (kind === "state" || kind === "poll") loadState(); if (kind === "responses" || kind === "poll") refreshRows(); });
    }
    S.q = null; loadState();
  }
  if (S.name && S.group) start(); else renderCheckin();
})();
