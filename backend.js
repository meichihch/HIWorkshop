// 資料層：有填 Supabase 就用 Supabase，沒填就用示範模式（瀏覽器本機）
(function () {
  const CFG = window.LIVE_CONFIG || {};
  const configured = CFG.SUPABASE_URL && !CFG.SUPABASE_URL.includes("YOUR") && CFG.SUPABASE_KEY && !CFG.SUPABASE_KEY.includes("YOUR");

  // 照片縮小到最長邊 1280px，避免手機原圖太大
  async function shrinkImage(file, max = 1280) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      return await new Promise((res) => c.toBlob(res, "image/jpeg", 0.82));
    } finally { URL.revokeObjectURL(url); }
  }
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

  // ---------------- Supabase ----------------
  function supabaseBackend() {
    const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, { realtime: { params: { eventsPerSecond: 20 } } });
    const ok = ({ data, error }) => { if (error) throw error; return data; };
    return {
      demo: false,
      async getState() { return ok(await sb.from("room_state").select("*").eq("id", 1).single()); },
      async listResponses(q) { return ok(await sb.from("responses").select("*").eq("q", q).order("created_at", { ascending: true })); },
      async listAll() { return ok(await sb.from("responses").select("*").order("created_at", { ascending: true }).limit(5000)); },
      async myLikes(name) { return ok(await sb.from("likes").select("response_id").eq("voter", name)).map((r) => r.response_id); },
      async insert(row) { ok(await sb.from("responses").insert(row)); },
      async like(id, voter) {
        const { error } = await sb.from("likes").insert({ response_id: id, voter });
        if (error && error.code !== "23505") throw error;   // 23505 = 已經按過
      },
      async hostCheck(pin) { return ok(await sb.rpc("host_check", { p_pin: pin })); },
      async hostSet(pin, s) { ok(await sb.rpc("host_set", { p_pin: pin, p_current: s.current_q, p_compare: s.show_compare, p_names: s.show_names, p_reveal: !!s.reveal })); },
      async hostHide(pin, id, hidden) { ok(await sb.rpc("host_hide", { p_pin: pin, p_id: id, p_hidden: hidden })); },
      async hostClear(pin, q) { ok(await sb.rpc("host_clear", { p_pin: pin, p_q: q })); },
      async uploadPhoto(file) {
        const blob = await shrinkImage(file);
        const path = `${new Date().toISOString().slice(0, 10)}/${uid()}.jpg`;
        ok(await sb.storage.from("photos").upload(path, blob, { contentType: "image/jpeg" }));
        return sb.storage.from("photos").getPublicUrl(path).data.publicUrl;
      },
      subscribe(cb) {
        let status = "connecting";
        sb.channel("live")
          .on("postgres_changes", { event: "*", schema: "public", table: "room_state" }, () => cb("state"))
          .on("postgres_changes", { event: "*", schema: "public", table: "responses" }, () => cb("responses"))
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "likes" }, () => cb("responses"))
          .subscribe((s) => { status = s; cb("status", s); });
        // 保險：連線斷掉時每 8 秒重抓一次
        setInterval(() => { if (status !== "SUBSCRIBED") cb("poll"); }, 8000);
      },
    };
  }

  // ---------------- 示範模式（同一台電腦、同一個瀏覽器的分頁間同步）----------------
  function demoBackend() {
    const KEY = "happiness-live-demo";
    const empty = () => ({ state: { id: 1, current_q: "w1-checkin", show_compare: false, show_names: false, reveal: false }, responses: [], likes: [] });
    const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || empty(); } catch { return memory || empty(); } };
    let memory = null;
    const write = (db) => { memory = db; try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {} ch && ch.postMessage("changed"); listeners.forEach((f) => f("responses")); };
    let ch = null; try { ch = new BroadcastChannel(KEY); } catch {}
    const listeners = [];
    const withLikes = (db, rows) => rows.map((r) => ({ ...r, likes: db.likes.filter((l) => l.response_id === r.id).length }));
    return {
      demo: true,
      async getState() { return read().state; },
      async listResponses(q) { const db = read(); return withLikes(db, db.responses.filter((r) => r.q === q)); },
      async listAll() { const db = read(); return withLikes(db, db.responses); },
      async myLikes(name) { return read().likes.filter((l) => l.voter === name).map((l) => l.response_id); },
      async insert(row) { const db = read(); db.responses.push({ id: uid(), likes: 0, hidden: false, created_at: new Date().toISOString(), parent: null, tag: null, choice: null, photo: null, body: null, ...row }); write(db); },
      async like(id, voter) { const db = read(); if (!db.likes.some((l) => l.response_id === id && l.voter === voter)) { db.likes.push({ response_id: id, voter }); write(db); } },
      async hostCheck() { return true; },
      async hostSet(pin, s) { const db = read(); db.state = { ...db.state, ...s }; write(db); listeners.forEach((f) => f("state")); },
      async hostHide(pin, id, hidden) { const db = read(); const r = db.responses.find((x) => x.id === id); if (r) r.hidden = hidden; write(db); },
      async hostClear(pin, q) { const db = read(); const ids = new Set(db.responses.filter((r) => r.q === q).map((r) => r.id)); db.responses = db.responses.filter((r) => !ids.has(r.id) && !ids.has(r.parent)); db.likes = db.likes.filter((l) => !ids.has(l.response_id)); write(db); },
      async uploadPhoto(file) {
        const blob = await shrinkImage(file, 480);
        return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
      },
      subscribe(cb) {
        listeners.push(cb);
        if (ch) ch.onmessage = () => { cb("state"); cb("responses"); };
        window.addEventListener("storage", (e) => { if (e.key === KEY) { cb("state"); cb("responses"); } });
        cb("status", "SUBSCRIBED");
      },
      _seed(db) { write(db); },
    };
  }

  window.Live = configured && window.supabase ? supabaseBackend() : demoBackend();

  // ---------------- 共用小工具 ----------------
  window.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  window.store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch {} },
  };
  window.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  window.wordKey = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
})();
