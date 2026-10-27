// 投影＋講師控制端
(function () {
  const CFG = window.LIVE_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const H = {
    pin: store.get("hl-pin") || "",
    unlocked: false,
    state: { current_q: null, show_compare: false, show_names: false, reveal: false },
    q: null,
    rows: [],
    seen: new Set(),
    sort: "new",
    filter: "",
    qr: store.get("hl-qr") || "big",
    present: false,
    clearArm: false,
  };

  // ---------- QR code ----------
  const studentUrl = CFG.STUDENT_URL || new URL("./", location.href).href.replace(/host\.html.*$/, "");
  $("url").textContent = studentUrl.replace(/^https?:\/\//, "");
  try { new QRCode($("qrcode"), { text: studentUrl, width: 512, height: 512, colorDark: "#17231f", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M }); }
  catch { $("qrcode").textContent = "QR 載入失敗"; }
  const applyQr = () => { document.body.classList.toggle("qr-small", H.qr === "small"); document.body.classList.toggle("qr-off", H.qr === "off"); };
  applyQr();

  const toast = (msg) => { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2400); };
  const groupClass = (tag) => { const i = window.GROUPS.indexOf(tag); return i >= 0 ? "g" + (i + 1) : ""; };
  const optClass = (i) => "g" + ((i % 6) + 1);
  const hash = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.codePointAt(0)) | 0; return h; };
  const groupsIn = (rows) => window.GROUPS.filter((g) => rows.some((r) => r.tag === g));   // 只列出有人的組別
  const keyOf = (q) => (q && q.type === "checkin" ? CHECKIN_Q : dataKey(q));
  const hasData = (q) => q && ["checkin", "cloud", "wall"].includes(q.type);

  // ---------- 視覺化 ----------
  function barsHtml(data, total, cls = "") {
    const max = Math.max(1, ...data.map((d) => d.value));
    return `<div class="bars ${cls}">${data.map((d, i) => {
      const pct = total ? Math.round((d.value / total) * 100) : 0;
      return `<div class="bar-row ${optClass(i)}"><div class="bar-label"><span>${esc(d.label)}</span><span>${d.value}${total ? `｜${pct}%` : ""}</span></div>
        <div class="bar-track"><div class="bar-fill" data-w="${(d.value / max) * 100}"></div></div></div>`;
    }).join("")}</div>`;
  }
  const growBars = (root) => requestAnimationFrame(() => root.querySelectorAll(".bar-fill").forEach((b) => (b.style.width = b.dataset.w + "%")));

  function cloudHtml(pairs, isLive) {
    if (!pairs.length) return `<div class="empty">等待第一個詞出現⋯⋯</div>`;
    const max = Math.max(...pairs.map((p) => p[1]));
    // 現場的詞多半只出現一次：依出現順序套用固定的大小變化，就算只有兩三個詞也有大有小
    const VARY = [1, 0.45, 0.75, 0.32, 0.9, 0.6, 0.4, 0.82, 0.52, 0.68];
    const order = new Map(pairs.map((p, i) => [p[0], i]));
    const sorted = [...pairs].sort((a, b) => hash(a[0]) - hash(b[0]));
    return `<div class="cloud">${sorted.map(([w, c]) => {
      const vary = isLive ? VARY[order.get(w) % VARY.length] : 1;
      const size = 1.3 + 4.2 * Math.sqrt(c / max) * vary;
      const fresh = isLive && !H.seen.has("w:" + w);
      if (isLive) H.seen.add("w:" + w);
      return `<span class="w${Math.abs(hash(w)) % 6}" style="font-size:${size.toFixed(2)}rem;${fresh ? "" : "animation:none"}" title="${c}">${esc(w)}</span>`;
    }).join("")}</div>`;
  }

  function filtersHtml(rows) {
    const gs = groupsIn(rows);
    if (gs.length < 2) return "";
    return `<div class="filters"><button class="chip" data-filter="" aria-pressed="${!H.filter}">全部</button>${gs.map((t) => `<button class="chip" data-filter="${esc(t)}" aria-pressed="${H.filter === t}">${esc(t)}</button>`).join("")}</div>`;
  }

  function noteHtml(r) {
    const q = H.q;
    const fresh = !H.seen.has(r.id); H.seen.add(r.id);
    return `<article class="note ${groupClass(r.tag)}" style="${fresh ? "" : "animation:none"}">
      ${H.unlocked ? `<button class="hide" data-hide="${r.id}">隱藏</button>` : ""}
      <div class="body">${esc(r.body)}</div>
      <div class="meta">${r.tag ? `<span class="tag">${esc(r.tag)}</span>` : ""}${H.state.show_names ? `<span>${esc(r.name)}</span>` : ""}
        ${q.likes ? `<span class="like" style="margin-left:auto">${esc(q.likes)} ${r.likes || 0}</span>` : ""}</div>
    </article>`;
  }

  function render() {
    const q = H.q, viz = $("viz");
    $("qTitle").textContent = q ? q.title : "";
    $("prompt").textContent = q ? q.prompt : "等待開始";
    const rows = H.rows.filter((r) => !r.hidden);
    if (!q) { $("count").innerHTML = ""; viz.innerHTML = `<div class="empty">在下方選擇題目開始</div>`; renderBar(); return; }

    if (q.type === "checkin") {
      // 同一個名字以最後一次報到為準
      const latest = new Map();
      rows.forEach((r) => latest.set(r.name, r));
      const people = [...latest.values()];
      $("count").innerHTML = `<b>${people.length}</b> 人報到`;
      // 6 組永遠都列出來，還沒有人的組也先排好位置
      viz.innerHTML = `<div class="roster">${window.GROUPS.map((g) => {
          const names = people.filter((p) => p.tag === g).sort((a, b) => a.created_at.localeCompare(b.created_at));
          return `<section class="roster-group glass ${groupClass(g)}"><h3>${esc(g)}<span>${names.length} 人</span></h3>
            <ul>${names.map((p) => { const fresh = !H.seen.has("p:" + p.name); H.seen.add("p:" + p.name); return `<li style="${fresh ? "" : "animation:none"}">${esc(p.name)}</li>`; }).join("")}</ul></section>`;
        }).join("")}</div>`;
    } else if (q.type === "survey-ai") {
      $("count").innerHTML = "";
      viz.innerHTML = surveyAi(); growBars(viz);
    } else if (q.type === "survey-happy") {
      $("count").innerHTML = "";
      viz.innerHTML = surveyHappy();
    } else if (q.type === "cloud") {
      $("count").innerHTML = `<b>${new Set(rows.map((r) => r.name)).size}</b> 人・${rows.length} 個詞`;
      const shown = rows.filter((r) => !H.filter || r.tag === H.filter);
      const counts = new Map();
      shown.forEach((r) => { const k = wordKey(r.body); if (!k) return; const cur = counts.get(k) || [r.body.trim(), 0]; cur[1]++; counts.set(k, cur); });
      const live = cloudHtml([...counts.values()], true);
      const liveTitle = H.filter ? `現在：${esc(H.filter)}` : "現在，在這間教室";
      viz.innerHTML = filtersHtml(rows) + (H.state.show_compare && q.compare
        ? `<div class="split"><div class="panel then glass"><h3>${esc(q.compare.title)}</h3>${cloudHtml(q.compare.words, false)}</div>
             <div class="panel glass"><h3>${liveTitle}</h3>${live}</div></div>`
        : `<div class="solo glass">${live}</div>`);
    } else if (q.type === "wall") {
      $("count").innerHTML = `<b>${new Set(rows.map((r) => r.tag)).size}</b> 組・${rows.length} 則`;
      if (q.hideUntilReveal && !H.state.reveal) {
        const all = window.GROUPS.map((g) => ({ g, n: rows.filter((r) => r.tag === g).length }));   // 6 組都列出來，還沒送的是 0
        viz.innerHTML = `<div class="solo glass sealed"><div class="sealed-msg">內容先保密，揭曉時再一起看</div>
          <div class="sealed-groups">${all.map((x) => `<div class="sealed-g ${groupClass(x.g)}"><b>${x.n}</b><span>${esc(x.g)}</span></div>`).join("")}</div></div>`;
      } else {
        const list = rows.filter((r) => !H.filter || r.tag === H.filter);
        list.sort((a, b) => H.sort === "likes" ? (b.likes || 0) - (a.likes || 0) || b.created_at.localeCompare(a.created_at) : b.created_at.localeCompare(a.created_at));
        viz.innerHTML = filtersHtml(rows) + (list.length ? `<div class="walls">${list.map(noteHtml).join("")}</div>` : `<div class="empty">還沒有內容</div>`);
      }
    }
    renderBar();
  }

  function surveyAi() {
    const S = window.SURVEY;
    const daily = S.frequency.find((f) => f.label === "每天").value;
    return `<div class="survey">
      <div class="panel glass"><h3>${esc(S.period)}・${S.n} 人回覆</h3><div><div class="hero-num">${daily}<small> / ${S.n} 人</small></div><div class="insight" style="margin-top:6px">每天都在用 AI</div></div></div>
      <div class="panel glass"><h3>用過的 AI 工具</h3>${barsHtml(S.tools, 0)}</div>
      <div class="panel glass"><h3>自評能力（1–5 分平均）</h3><div class="bars">${S.ratings.map((r) => `<div class="rating"><span style="font-weight:600">${esc(r.label)}</span><span style="font-variant-numeric:tabular-nums;font-weight:700">${r.value.toFixed(1)}</span><div class="scale"><i style="width:${((r.value - 1) / 4) * 100}%"></i></div></div>`).join("")}</div></div>
      <div class="panel glass"><h3>最想學的主題（可複選）</h3>${barsHtml(S.wantToLearn, 0)}</div>
    </div>`;
  }
  function surveyHappy() {
    const S = window.SURVEY;
    return `<div class="quotes">${S.happinessQuotes.map((t, i) => `<article class="note g${(i % 4) + 1}" style="--i:${i}"><div class="body">${esc(t)}</div></article>`).join("")}</div>`;
  }

  // ---------- 控制列 ----------
  function renderBar() {
    const bar = $("bar"), q = H.q;
    const qrLabel = { big: "大", small: "小", off: "隱藏" }[H.qr];
    if (!H.unlocked) {
      bar.innerHTML = `<form class="pin" id="pinForm"><input type="password" id="pinInput" placeholder="講師密碼" autocomplete="current-password" value="${esc(H.pin)}"><button class="btn small">解鎖控制</button></form>
        <span class="spacer"></span><button class="btn small ghost" data-act="qr">QR：${qrLabel}</button><button class="btn small ghost" data-act="full">全螢幕</button>`;
      $("pinForm").onsubmit = async (e) => { e.preventDefault(); await unlock($("pinInput").value.trim()); };
      return;
    }
    const opts = window.WORKSHOPS.map((w) => `<optgroup label="${esc(w.title)}">${w.questions.map((x) => `<option value="${x.id}" ${q && x.id === q.id ? "selected" : ""}>${esc(x.title)}</option>`).join("")}</optgroup>`).join("");
    const hiddenCount = H.rows.filter((r) => r.hidden).length;
    const canClear = q && hasData(q) && !q.readonly;
    const isWall = q && q.type === "wall";
    const showingNotes = isWall && !(q.hideUntilReveal && !H.state.reveal);
    bar.innerHTML = `
      <button class="btn small ghost" data-act="prev" title="上一題（←）">◀</button>
      <select id="qSel" aria-label="選擇題目"><option value="">（待機畫面）</option>${opts}</select>
      <button class="btn small ghost" data-act="next" title="下一題（→）">▶</button>
      <span class="sep"></span>
      ${q && q.hideUntilReveal ? `<button class="btn small ${H.state.reveal ? "ghost" : ""}" data-act="reveal">${H.state.reveal ? "收起內容" : "揭曉"}</button>` : ""}
      ${q && q.compare ? `<button class="btn small ghost" data-act="compare" aria-pressed="${H.state.show_compare}">對照問卷</button>` : ""}
      ${showingNotes ? `<button class="btn small ghost" data-act="names" aria-pressed="${H.state.show_names}">顯示姓名</button>` : ""}
      ${showingNotes && q.likes ? `<button class="btn small ghost" data-act="sort" aria-pressed="${H.sort === "likes"}">依票數排序</button>` : ""}
      ${hiddenCount ? `<button class="btn small ghost" data-act="unhide">復原隱藏（${hiddenCount}）</button>` : ""}
      <span class="spacer"></span>
      ${canClear ? `<button class="btn small ${H.clearArm ? "danger" : "ghost"}" data-act="clear">${H.clearArm ? "確定清空本題？" : "清空本題"}</button>` : ""}
      <button class="btn small ghost" data-act="csv">匯出 Excel（CSV）</button>
      <button class="btn small ghost" data-act="qr">QR：${qrLabel}</button>
      <button class="btn small ghost" data-act="present" aria-pressed="${H.present}" title="控制列滑鼠移過去才出現">簡報模式</button>
      <button class="btn small ghost" data-act="full">全螢幕</button>`;
    $("qSel").onchange = (e) => goTo(e.target.value || null);
  }

  $("bar").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const act = b.dataset.act;
    if (act === "qr") { H.qr = { big: "small", small: "off", off: "big" }[H.qr]; store.set("hl-qr", H.qr); applyQr(); renderBar(); }
    if (act === "full") { try { document.fullscreenElement ? await document.exitFullscreen() : await document.documentElement.requestFullscreen(); } catch {} }
    if (act === "present") { H.present = !H.present; document.body.classList.toggle("present", H.present); renderBar(); }
    if (act === "prev" || act === "next") step(act === "next" ? 1 : -1);
    if (act === "reveal") await pushState({ reveal: !H.state.reveal });
    if (act === "compare") await pushState({ show_compare: !H.state.show_compare });
    if (act === "names") await pushState({ show_names: !H.state.show_names });
    if (act === "sort") { H.sort = H.sort === "likes" ? "new" : "likes"; render(); }
    if (act === "csv") exportCsv();
    if (act === "unhide") { for (const r of H.rows.filter((x) => x.hidden)) await Live.hostHide(H.pin, r.id, false); await loadRows(); }
    if (act === "clear") {
      if (!H.clearArm) { H.clearArm = true; renderBar(); setTimeout(() => { H.clearArm = false; renderBar(); }, 4000); return; }
      H.clearArm = false;
      try { await Live.hostClear(H.pin, keyOf(H.q)); H.seen.clear(); toast("已清空本題"); await loadRows(); } catch (err) { console.error(err); toast("清空失敗"); }
    }
  });

  $("viz").addEventListener("click", async (e) => {
    const f = e.target.closest("[data-filter]");
    if (f) { H.filter = f.dataset.filter; render(); return; }
    const h = e.target.closest("[data-hide]");
    if (h && H.unlocked) { try { await Live.hostHide(H.pin, h.dataset.hide, true); await loadRows(); } catch (err) { console.error(err); toast("隱藏失敗"); } }
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input, textarea, select")) return;
    if (e.key === "ArrowRight" && H.unlocked) step(1);
    if (e.key === "ArrowLeft" && H.unlocked) step(-1);
    if (e.key === "f") $("bar").querySelector('[data-act="full"]').click();
  });

  async function unlock(pin) {
    try {
      const ok = await Live.hostCheck(pin);
      if (!ok) return toast("密碼不對");
      H.pin = pin; H.unlocked = true; store.set("hl-pin", pin); render();
    } catch (err) { console.error(err); toast("連不上資料庫，請檢查 config.js"); }
  }

  function step(d) {
    const ids = window.ALL_QUESTIONS.map((q) => q.id);
    const i = H.q ? ids.indexOf(H.q.id) : -1;
    const n = Math.min(ids.length - 1, Math.max(0, i + d));
    if (n !== i) goTo(ids[n]);
  }
  async function goTo(id) { H.filter = ""; H.sort = "new"; await pushState({ current_q: id, show_compare: false, reveal: false }); }
  async function pushState(patch) {
    const next = { ...H.state, ...patch };
    try { await Live.hostSet(H.pin, next); H.state = next; await applyState(); }
    catch (err) { console.error(err); toast("切換失敗，請確認密碼與連線"); }
  }

  // ---------- 匯出 ----------
  async function exportCsv() {
    try {
      const all = await Live.listAll();
      const head = ["場次", "題目", "姓名", "組別", "內容", "讚數", "已隱藏", "時間"];
      const cell = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const lines = all.map((r) => {
        const q = findQuestion(r.q);
        const w = r.q === CHECKIN_Q ? "" : q ? (q.workshop === "w1" ? "第一場" : "第二場") : "";
        const title = r.q === CHECKIN_Q ? "報到" : q ? q.prompt.replace(/\n/g, " ") : r.q;
        return [w, title, r.name, r.tag, r.body, r.likes || 0, r.hidden ? "是" : "", new Date(r.created_at).toLocaleString("zh-TW", { hour12: false })].map(cell).join(",");
      });
      const blob = new Blob(["﻿" + [head.join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `幸福力互動牆_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      toast(`已匯出 ${all.length} 筆`);
    } catch (err) { console.error(err); toast("匯出失敗"); }
  }

  // ---------- 資料 ----------
  async function applyState() {
    const q = findQuestion(H.state.current_q);
    if (!H.q || !q || q.id !== H.q.id) { H.q = q; H.rows = []; H.seen.clear(); H.filter = ""; render(); await loadRows(); }
    else render();
  }
  async function loadState() { try { H.state = await Live.getState(); await applyState(); } catch (err) { console.error(err); $("prompt").textContent = "連不上資料庫，請檢查 config.js"; } }
  async function loadRows() {
    if (!hasData(H.q)) { render(); return; }
    try { H.rows = await Live.listResponses(keyOf(H.q)); } catch (err) { console.error(err); }
    render();
  }
  const refresh = debounce(loadRows, 150);
  Live.subscribe((kind, s) => {
    if (kind === "status") $("dot").classList.toggle("on", s === "SUBSCRIBED");
    if (kind === "state" || kind === "poll") loadState();
    if (kind === "responses" || kind === "poll") refresh();
  });
  loadState();
  if (H.pin) Live.hostCheck(H.pin).then((ok) => { if (ok) { H.unlocked = true; render(); } }).catch(() => {});
})();
