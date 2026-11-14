// Topping bar check: open and close checks (photo prefill or by hand), refills during the
// day, usage per bin, and the "Why?" view. Behind the TOPPING_CAMERA feature flag.
// Demo: toppings.html?demo=1&day=2026-11-14&min=1380
import { applyStatic, langToggle, t } from "./i18n.js";
import { call } from "./api.js";
import { LEVELS, prefill, usage, discards } from "./toppings-math.js";
import { DEMO_PHOTOS } from "./demo-data.js";

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const demo = params.get("demo") === "1";
const S = {
  tab: "open", data: null, owner: false, enabled: false,
  draft: { open: {}, close: {} }, est: { open: null, close: null }, dismissed: new Set(), negatives: [], newBins: 0
};

// ---------- helpers ----------
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const D = { day: demo ? params.get("day") : null, min: demo && params.has("min") ? Number(params.get("min")) : null };
const ctx = () => ({ scenario: demo ? "demo" : "live", ...(D.day ? { day: D.day } : {}), ...(D.min !== null ? { min: D.min } : {}) });
const qs = () => new URLSearchParams(ctx()).toString();
const lvl = v => t(`top.lvl.${v}`);
const FR = { 0.25: "¼", 0.5: "½", 0.75: "¾" };
function pans(n) {
  if (n == null) return "–";
  const sign = n < 0 ? "−" : "", a = Math.abs(Math.round(n * 4) / 4), whole = Math.floor(a), frac = a - whole;
  return `${sign}${whole || !frac ? whole : ""}${FR[frac] || ""}`;
}
const pansText = n => (Math.abs(n) === 1 ? t("top.pan", { n: pans(n) }) : t("top.pans", { n: pans(n) }));
const timeOf = iso => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const minText = m => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${m < 720 ? "AM" : "PM"}`;
const bins = () => S.data?.bins || [];

function say(id, text, color) {
  $(id).style.color = color === "red" ? "var(--red)" : color === "muted" ? "var(--muted)" : "var(--mint)";
  $(id).textContent = text;
}

function banner(kind, html) {
  const b = $("banner");
  b.className = `tp-banner ${kind || ""}`;
  b.innerHTML = html;
  b.classList.toggle("hidden", !html);
  b.querySelector("[data-retake]")?.addEventListener("click", () => $("photoInput").click());
  b.querySelector("[data-hand]")?.addEventListener("click", enterByHand);
}

// ---------- data ----------
async function load() {
  const [r, guide, tot, sugg] = await Promise.all([
    call(`/api/toppings?${qs()}`),
    call(`/api/toppings?${qs()}&guidance=1`),
    call(`/api/toppings?${qs()}&totals=1&days=7`),
    call(`/api/toppings?${qs()}&suggestions=1`)
  ]);
  if (r.status === 401) { location.href = `/pair.html?next=${encodeURIComponent(location.pathname + location.search)}`; return; }
  if (!r.ok) return;
  S.data = r.data;
  S.extra = { guidance: guide.ok ? guide.data : null, totals: tot.ok ? tot.data : null, suggestions: sugg.ok ? sugg.data.suggestions : [] };
  S.owner = !!r.data.owner;
  for (const kind of ["open", "close"]) {
    const c = r.data.checks[kind];
    if (c && !Object.keys(S.draft[kind]).length) for (const [id, l] of Object.entries(c.levels)) S.draft[kind][id] = l.level;
  }
  render();
}

// ---------- photo ----------
// Downscale on the phone (long edge 1600 px) and re-encode as JPEG, which also drops EXIF data such as location.
async function downscale(file, maxEdge = 1600) {
  let src;
  try {
    src = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    src = await new Promise((ok, bad) => { const img = new Image(); img.onload = () => ok(img); img.onerror = bad; img.src = URL.createObjectURL(file); });
  }
  const w0 = src.width || src.naturalWidth, h0 = src.height || src.naturalHeight;
  const k = Math.min(1, maxEdge / Math.max(w0, h0));
  const c = document.createElement("canvas");
  c.width = Math.round(w0 * k);
  c.height = Math.round(h0 * k);
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
}

async function onPhoto(file) {
  const kind = S.tab;
  if (!file || !["open", "close"].includes(kind)) return;
  banner("", esc(t("top.checking")));
  let dataUrl;
  try {
    dataUrl = await downscale(file);
  } catch {
    return banner("bad", `${esc(t("top.unavailable"))} <button class="btn ghost" type="button" data-retake>${esc(t("top.retake"))}</button>`);
  }
  $("photoPreview").src = dataUrl;
  $("photoPreview").classList.remove("hidden");
  showResult(kind, await askVision({ kind, image: dataUrl }));
}

// Demo only: the placeholder photo pair with canned (simulated) estimates.
async function onSample() {
  const kind = S.tab;
  if (!["open", "close"].includes(kind)) return;
  banner("", esc(t("top.checking")));
  $("photoPreview").src = DEMO_PHOTOS[kind];
  $("photoPreview").classList.remove("hidden");
  showResult(kind, await askVision({ kind, sample: true }));
}

async function askVision(body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 30000);
  try {
    const r = await fetch("/api/vision", { method: "POST", credentials: "same-origin", signal: ctl.signal,
      headers: { "content-type": "application/json" }, body: JSON.stringify({ ...ctx(), ...body }) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function showResult(kind, res) {
  const retake = `<button class="btn ghost" type="button" data-retake>${esc(t("top.retake"))}</button>`;
  const hand = `<button class="btn ghost" type="button" data-hand>${esc(t("top.byHand"))}</button>`;
  if (!res || !res.available) {
    S.est[kind] = null;
    banner("", esc(t("top.unavailable")));
    return render();
  }
  if (res.problems.includes("person_in_frame")) {
    S.est[kind] = null;
    $("photoPreview").classList.add("hidden");
    return banner("bad", `${esc(t("top.person"))} ${retake} ${hand}`);
  }
  if (!res.photo_usable) {
    S.est[kind] = null;
    const reasons = res.problems.map(p => t(`top.p.${p}`)).join(", ") || t("top.p.view_blocked");
    return banner("bad", `${esc(t("top.unusable", { reasons }))} ${retake} ${hand}`);
  }
  S.est[kind] = { ...res, byId: Object.fromEntries(res.bins.map(b => [b.id, b])) };
  for (const b of bins()) S.draft[kind][b.id] = prefill(S.est[kind].byId[b.id]);
  banner("ok", esc(t("top.prefilled")));
  render();
}

// ---------- step 3: live camera with this morning's photo as an overlay ----------
const overlaySrc = () => {
  const id = S.data?.checks.open?.photoId;
  return id ? `/api/toppings?photo=${encodeURIComponent(id)}` : (demo ? DEMO_PHOTOS.open : null);
};
let camStream = null;

async function takePhoto() {
  const live = S.tab === "close" && !S.noLiveCam && overlaySrc() && window.isSecureContext && navigator.mediaDevices?.getUserMedia;
  if (!live) return $("photoInput").click();
  try {
    camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } }, audio: false });
  } catch {
    // No camera permission or no camera: fall back to the plain photo picker (needs a fresh tap on iPhone).
    S.noLiveCam = true;
    return banner("", esc(t("top.camNoLive")));
  }
  $("camVideo").srcObject = camStream;
  $("camOverlay").src = overlaySrc();
  $("camOverlay").classList.toggle("hidden", !$("camOverlayOn").checked);
  $("camSheet").classList.remove("hidden");
  $("camShot").focus();
}

function stopCamera() {
  camStream?.getTracks().forEach(tr => tr.stop());
  camStream = null;
  $("camVideo").srcObject = null;
  $("camSheet").classList.add("hidden");
}

async function shootCamera() {
  const v = $("camVideo");
  if (!v.videoWidth) return;
  const k = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight));
  const c = document.createElement("canvas");
  c.width = Math.round(v.videoWidth * k);
  c.height = Math.round(v.videoHeight * k);
  c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
  const dataUrl = c.toDataURL("image/jpeg", 0.82);
  stopCamera();
  const kind = S.tab;
  banner("", esc(t("top.checking")));
  $("photoPreview").src = dataUrl;
  $("photoPreview").classList.remove("hidden");
  showResult(kind, await askVision({ kind, image: dataUrl }));
}

// ---------- step 4: guidance and totals ----------
const amt = n => ([0.25, 0.5, 0.75, 1].includes(n) ? t(`top.amt.${n}`) : t("top.amt.n", { n: pans(n) }));

function renderGuide(kind) {
  const g = S.extra?.guidance;
  const box = $("guideBox");
  if (kind !== "open" || !g) { box.classList.add("hidden"); return; }
  const lines = g.bins.filter(b => b.usedYesterday != null && b.fresh);
  box.innerHTML = `<h3>${esc(t("top.guideTitle"))}</h3>` + (lines.length
    ? `<ul>${lines.map(b => `<li>${esc(t("top.guideLine", { bin: b.bin, setOut: amt(b.setOut), used: amt(b.usedYesterday) }))}</li>`).join("")}</ul>`
    : `<p style="margin:0">${esc(t("top.guideNone"))}</p>`);
  box.classList.remove("hidden");
}

function renderTotals(kind) {
  const tt = S.extra?.totals;
  if (kind !== "close" || !tt) { $("totalsBox").textContent = ""; return; }
  const parts = [t("top.totals", { days: tt.days, pans: pansText(tt.pans) })];
  if (tt.dollars > 0) parts.push(t("top.totalsCost", { d: tt.dollars.toFixed(2) }));
  if (tt.pansNoCost > 0) parts.push(t("top.totalsNoCost", { pans: pansText(tt.pansNoCost) }));
  parts.push(t("top.totalsBoba", { n: Math.round(tt.bobaDrinks) }));
  parts.push(tt.co2eKg == null ? t("top.totalsCo2") : `${tt.co2eKg} kg CO₂e`);
  $("totalsBox").textContent = parts.join(" · ");
}

function enterByHand() {
  S.est[S.tab] = null;
  banner("", "");
  $("photoPreview").classList.add("hidden");
  render();
  $("grid").querySelector("button")?.focus();
}

// ---------- render ----------
function render() {
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === S.tab));
  $("checkView").classList.toggle("hidden", !["open", "close"].includes(S.tab));
  $("refillsView").classList.toggle("hidden", S.tab !== "refills");
  $("binsView").classList.toggle("hidden", S.tab !== "bins");
  $("dayLabel").textContent = demo ? `${D.day || ""} · demo (simulated)` : new Date().toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
  if (!S.data) return;
  if (S.tab === "open" || S.tab === "close") renderCheck(S.tab);
  if (S.tab === "refills") renderRefills();
  if (S.tab === "bins") renderBins();
}

function byRow(list) {
  const rows = new Map();
  list.forEach(b => { if (!rows.has(b.row_no)) rows.set(b.row_no, []); rows.get(b.row_no).push(b); });
  return [...rows.entries()].sort((a, b) => a[0] - b[0]);
}

function renderCheck(kind) {
  const check = S.data.checks[kind];
  $("checkLead").textContent = t(kind === "open" ? "top.openLead" : "top.closeLead");
  $("checkStatus").textContent = check
    ? t("top.confirmed", { time: timeOf(check.confirmedAt), who: check.confirmedBy, how: check.estimator === "vision" ? t("top.howPhoto") : t("top.howHand") })
    : "";
  const est = S.est[kind];
  if (!bins().length) {
    $("grid").innerHTML = `<p>${esc(t("top.noBins"))}</p>`;
  } else {
    $("grid").innerHTML = byRow(bins()).map(([row, list]) =>
      `<div class="tp-row" style="grid-column:1/-1">${esc(row === 1 ? t("top.rowBack") : t("top.row", { n: row }))}</div>` +
      list.map(b => {
        const e = est?.byId[b.id];
        const cur = S.draft[kind][b.id];
        const look = e && prefill(e) === null && (cur == null);
        const hint = e ? (prefill(e) === null ? t("top.needsLook") : t("top.fromPhoto", { level: lvl(e.level), conf: t(`top.conf.${e.confidence}`) })) : "";
        return `<div class="tp-bin${look ? " look" : ""}"><h3><span>${esc(b.name)}</span><span class="tp-hint">${esc(hint)}</span></h3>
          <div class="tp-levels" role="group" aria-label="${esc(b.name)}">${LEVELS.map(v =>
            `<button type="button" data-bin="${esc(b.id)}" data-lv="${v}" aria-pressed="${cur === v}">${esc(lvl(v))}</button>`).join("")}</div></div>`;
      }).join("")).join("");
    $("grid").querySelectorAll("[data-lv]").forEach(btn => btn.addEventListener("click", () => {
      S.draft[kind][btn.dataset.bin] = Number(btn.dataset.lv);
      renderCheck(kind);
    }));
  }
  renderNegatives();
  renderUsage();
  renderGuide(kind);
  renderTotals(kind);
}

function renderNegatives() {
  const list = S.negatives.filter(id => !S.dismissed.has(id));
  $("negatives").innerHTML = list.map(id => {
    const b = bins().find(x => x.id === id);
    const u = S.data.usage.find(x => x.binId === id);
    if (!b || !u || !u.negative) return "";
    return `<div class="tp-neg"><p>${esc(t("top.negTitle", { bin: b.name, used: pans(u.used) }))}</p><div class="btns">
      <button class="btn" type="button" data-neg="${esc(id)}" data-amt="1">${esc(t("top.negFull"))}</button>
      <button class="btn" type="button" data-neg="${esc(id)}" data-amt="0.5">${esc(t("top.negHalf"))}</button>
      <button class="btn ghost" type="button" data-neg="${esc(id)}" data-amt="0">${esc(t("top.negNo"))}</button></div></div>`;
  }).join("");
  $("negatives").querySelectorAll("[data-neg]").forEach(btn => btn.addEventListener("click", async () => {
    const id = btn.dataset.neg, amt = Number(btn.dataset.amt);
    if (amt > 0) await call("/api/toppings", { method: "POST", body: { ...ctx(), action: "refill", binId: id, amount: amt, source: "missed" } });
    else S.dismissed.add(id);
    await load();
    S.negatives = S.data.usage.filter(u => u.negative).map(u => u.binId);
    render();
  }));
}

function renderUsage() {
  if (!S.data.checks.close) { $("usageBox").innerHTML = ""; return; }
  $("usageBox").innerHTML = `<h2>${esc(t("top.usage"))}</h2>` + bins().map(b => {
    const u = S.data.usage.find(x => x.binId === b.id);
    const val = u?.used == null ? t("top.usageNeedsOpen") : pansText(u.used);
    return `<button type="button" data-why="${esc(b.id)}"><span>${esc(b.name)}</span><b>${esc(val)}</b></button>`;
  }).join("");
  $("usageBox").querySelectorAll("[data-why]").forEach(btn => btn.addEventListener("click", () => openWhy(btn.dataset.why)));
}

function levelRow(label, check, binId) {
  if (!check || !check.levels[binId]) return row(label, "–");
  const l = check.levels[binId];
  const note = t("top.whyHow", { how: t(`top.how.${check.estimator || "none"}`), outcome: t(`top.out.${l.outcome}`), time: timeOf(check.confirmedAt), who: check.confirmedBy }) +
    (l.estimated != null ? ` · ${t("top.fromPhoto", { level: lvl(l.estimated), conf: t(`top.conf.${l.confidence}`) })}` : "") +
    (check.photoDeleted ? ` · ${t("top.photoGone")}` : "");
  const photo = check.photoId ? ` <a href="/api/toppings?photo=${encodeURIComponent(check.photoId)}" target="_blank" rel="noopener">📷</a>` : "";
  return row(label + photo, lvl(l.level), note, true);
}

function row(label, value, note = "", labelIsHtml = false) {
  return `<div class="row"><span>${labelIsHtml ? label : esc(label)}${note ? `<br><small style="color:var(--muted)">${esc(note)}</small>` : ""}</span><span class="x flat">${esc(value)}</span></div>`;
}

function openWhy(binId) {
  const b = bins().find(x => x.id === binId);
  const { open, close } = S.data.checks;
  const refills = S.data.refills.filter(r => r.binId === binId);
  const u = usage({ open: open?.levels[binId]?.level ?? null, close: close?.levels[binId]?.level ?? null, refills });
  const waste = S.data.waste.find(w => w.item_key === binId);
  const wasteVal = discards(b)
    ? (waste ? pansText(waste.amount) + (b.pan_cost != null ? ` · $${(waste.amount * b.pan_cost).toFixed(2)}` : "") : t("top.whyNone"))
    : t("top.whyCarry");
  $("whyTitle").textContent = `${b.name} · ${t("top.whyTitle")}`;
  $("whyRows").innerHTML = [
    levelRow(t("top.whyOpen"), open, binId),
    row(t("top.whyRefills"), refills.length ? `+${pans(u.refilled)}` : t("top.whyNone"),
      refills.map(r => `${pans(r.amount)} · ${minText(r.atMin)} · ${r.by}${r.source === "missed" ? " (added at close)" : ""}`).join("; ")),
    levelRow(t("top.whyClose"), close, binId),
    row(t("top.whyWaste"), wasteVal, b.discard_at_close == null ? t("top.assumed") : "")
  ].join("");
  $("whyFormula").textContent = u.used == null ? t("top.usageNeedsOpen")
    : `${pans(open.levels[binId].level)} + ${pans(u.refilled)} − ${pans(close.levels[binId].level)} = ${pansText(u.used)}`;
  $("whySheet").classList.remove("hidden");
  $("whyClose").focus();
}

function renderRefills() {
  $("refillGrid").innerHTML = bins().length ? bins().map(b => `<div class="tp-bin tp-refill"><h3><span>${esc(b.name)}</span></h3><div class="btns">
      <button class="btn" type="button" data-refill="${esc(b.id)}" data-amt="1">${esc(t("top.refilled"))} · ${esc(t("top.full"))}</button>
      <button class="btn ghost half" type="button" data-refill="${esc(b.id)}" data-amt="0.5">${esc(t("top.half"))}</button></div></div>`).join("")
    : `<p>${esc(t("top.noBins"))}</p>`;
  $("refillGrid").querySelectorAll("[data-refill]").forEach(btn => btn.addEventListener("click", async () => {
    btn.disabled = true;
    const r = await call("/api/toppings", { method: "POST", body: { ...ctx(), action: "refill", binId: btn.dataset.refill, amount: Number(btn.dataset.amt) } });
    btn.disabled = false;
    if (r.ok) await load();
  }));
  const list = S.data.refills.slice().reverse();
  $("refillList").innerHTML = list.length ? `<ul class="tp-list">${list.map(r => {
    const b = bins().find(x => x.id === r.binId);
    return `<li><span>${esc(minText(r.atMin))} · <b>${esc(b?.name || "?")}</b> · ${esc(pans(r.amount))} · ${esc(r.by)}</span><button class="btn ghost" type="button" data-undo="${esc(r.id)}">${esc(t("clock.undo"))}</button></li>`;
  }).join("")}</ul>` : `<p style="color:var(--muted)">${esc(t("top.noRefills"))}</p>`;
  $("refillList").querySelectorAll("[data-undo]").forEach(btn => btn.addEventListener("click", async () => {
    await call("/api/toppings", { method: "POST", body: { ...ctx(), action: "undoRefill", id: btn.dataset.undo } });
    await load();
  }));
}

// Step 4: owner-approved suggestions (approving changes nothing by itself).
function renderSuggestions() {
  const list = (S.extra?.suggestions || []).filter(s => s.status === "open");
  $("suggestBox").innerHTML = (S.owner && S.suggMsg ? `<p class="tp-msg" style="color:var(--mint)">${esc(S.suggMsg)}</p>` : "") + (S.owner ? list.map(s => `<div class="tp-sugg"><p>${esc(t("top.suggTitle", { bin: s.bin, high: s.evidence.highDays, days: s.evidence.days }))}</p>
    <div class="btns"><button class="btn" type="button" data-sugg="${esc(s.id)}" data-d="approved">${esc(t("top.suggApprove"))}</button>
    <button class="btn ghost" type="button" data-sugg="${esc(s.id)}" data-d="dismissed">${esc(t("top.suggDismiss"))}</button></div></div>`).join("") : "");
  $("suggestBox").querySelectorAll("[data-sugg]").forEach(btn => btn.addEventListener("click", async () => {
    const r = await call("/api/toppings", { method: "POST", body: { ...ctx(), action: "decideSuggestion", id: btn.dataset.sugg, decision: btn.dataset.d } });
    if (r.ok) S.suggMsg = t(btn.dataset.d === "approved" ? "top.suggApproved" : "top.suggDismissed");
    await load();
  }));
}

function renderBins() {
  $("ownerForm").classList.toggle("hidden", S.owner);
  $("addBin").classList.toggle("hidden", !S.owner);
  renderSuggestions();
  if (!S.owner) { $("binList").innerHTML = ""; return; }
  const list = [...bins(), ...Array.from({ length: S.newBins }, (_, i) => ({ id: "", name: "", row_no: 1, col_no: bins().length + i + 1, discard_at_close: null, pan_label: null, pan_cost: null }))];
  const badge = `<span class="tp-assumed">${esc(t("top.assumed"))}</span>`;
  $("binList").innerHTML = list.map((b, i) => `<form class="tp-binrow" data-i="${i}" data-id="${esc(b.id)}">
      <label>${esc(t("top.name"))}<input name="name" required maxlength="40" value="${esc(b.name)}"></label>
      <label>${esc(t("top.rowNo"))}<input name="row" type="number" min="1" max="6" value="${b.row_no}"></label>
      <label>${esc(t("top.colNo"))}<input name="col" type="number" min="1" max="20" value="${b.col_no}"></label>
      <label>${esc(t("top.atClose"))}<select name="discard">
        <option value="" ${b.discard_at_close == null ? "selected" : ""}>${esc(t("top.unset"))}</option>
        <option value="1" ${b.discard_at_close === 1 ? "selected" : ""}>${esc(t("top.discard"))}</option>
        <option value="0" ${b.discard_at_close === 0 ? "selected" : ""}>${esc(t("top.carry"))}</option></select>${b.discard_at_close == null ? badge : ""}</label>
      <label>${esc(t("top.panLabel"))}<input name="panLabel" maxlength="40" value="${esc(b.pan_label || "")}">${b.pan_label ? "" : badge}</label>
      <label>${esc(t("top.panCost"))}<input name="panCost" type="number" min="0" step="0.01" value="${b.pan_cost ?? ""}">${b.pan_cost == null ? badge : ""}</label>
      <button class="btn" type="submit">${esc(t("top.save"))}</button>
      ${b.id ? `<button class="btn ghost" type="button" data-remove="${esc(b.id)}">${esc(t("top.remove"))}</button>` : "<span></span>"}
    </form>`).join("");
  $("binList").querySelectorAll("form").forEach(f => f.addEventListener("submit", async e => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    const bin = { id: f.dataset.id || undefined, name: v.name, row: Number(v.row), col: Number(v.col),
      discard: v.discard === "1" ? true : v.discard === "0" ? false : null, panLabel: v.panLabel || null, panCost: v.panCost === "" ? null : Number(v.panCost) };
    const r = await call("/api/toppings", { method: "POST", body: { action: "saveBin", bin } });
    if (r.ok && !f.dataset.id) S.newBins = Math.max(0, S.newBins - 1);
    if (r.status === 403) S.owner = false;
    await load();
  }));
  $("binList").querySelectorAll("[data-remove]").forEach(btn => btn.addEventListener("click", async () => {
    await call("/api/toppings", { method: "POST", body: { action: "deleteBin", id: btn.dataset.remove } });
    await load();
  }));
}

// ---------- confirm ----------
async function confirmAll() {
  const kind = S.tab;
  const missing = bins().filter(b => S.draft[kind][b.id] == null);
  if (missing.length) return say("confirmMsg", t("top.missing", { n: missing.length }), "red");
  const est = S.est[kind];
  const body = {
    ...ctx(), action: "confirm", kind,
    levels: bins().map(b => ({ binId: b.id, level: S.draft[kind][b.id], estimate: est?.byId[b.id] || null })),
    estimator: est ? "vision" : "none", photoId: est?.photoId || null, model: est?.model || null,
    problems: est?.problems || [], photoUsable: !!est?.photo_usable
  };
  $("confirmAll").disabled = true;
  const r = await call("/api/toppings", { method: "POST", body });
  $("confirmAll").disabled = false;
  if (!r.ok) return say("confirmMsg", r.data?.error || t("top.saveFailed"), "red");
  say("confirmMsg", t("top.saved"));
  S.negatives = r.data.negatives || [];
  S.dismissed.clear();
  banner("", "");
  await load();
}

// ---------- start ----------
async function start() {
  applyStatic();
  langToggle($("lang"), render);
  const flags = await call("/api/toppings?flags=1");
  if (flags.status === 401) { location.href = `/pair.html?next=${encodeURIComponent(location.pathname + location.search)}`; return; }
  S.enabled = !!flags.data?.enabled;
  $("offCard").classList.toggle("hidden", S.enabled);
  $("app").classList.toggle("hidden", !S.enabled);
  if (!S.enabled) return;
  document.querySelectorAll("#tabs button").forEach(b => b.addEventListener("click", () => {
    S.tab = b.dataset.tab;
    banner("", "");
    $("photoPreview").classList.add("hidden");
    $("confirmMsg").textContent = "";
    render();
  }));
  $("photoInput").addEventListener("change", e => { onPhoto(e.target.files[0]); e.target.value = ""; });
  $("byHand").addEventListener("click", enterByHand);
  $("takePhoto").addEventListener("click", takePhoto);
  $("camShot").addEventListener("click", shootCamera);
  $("camCancel").addEventListener("click", stopCamera);
  $("camOverlayOn").addEventListener("change", e => $("camOverlay").classList.toggle("hidden", !e.target.checked));
  $("camSheet").addEventListener("keydown", e => { if (e.key === "Escape") stopCamera(); });
  $("confirmAll").addEventListener("click", confirmAll);
  $("whyClose").addEventListener("click", () => $("whySheet").classList.add("hidden"));
  $("whySheet").addEventListener("keydown", e => { if (e.key === "Escape") $("whySheet").classList.add("hidden"); });
  $("addBin").addEventListener("click", () => { S.newBins++; renderBins(); });
  $("ownerForm").addEventListener("submit", async e => {
    e.preventDefault();
    const r = await call("/api/auth", { method: "POST", body: { action: "owner", pin: $("ownerPin").value } });
    if (r.ok) { $("ownerPin").value = ""; await load(); }
    else say("ownerMsg", r.status === 429 ? t("pair.locked") : t("top.wrongPin"), "red");
  });
  if (location.hash === "#close" || location.hash === "#refills" || location.hash === "#bins") S.tab = location.hash.slice(1);
  if (demo) {
    $("samplePhoto").classList.remove("hidden");
    $("samplePhoto").addEventListener("click", onSample);
    // The demo page's slider sets the simulated day and time.
    window.addEventListener("message", e => {
      if (e.origin !== location.origin || e.data?.type !== "frocast-time") return;
      if (e.data.day && e.data.day !== D.day) { D.day = e.data.day; S.draft = { open: {}, close: {} }; S.est = { open: null, close: null }; }
      D.min = Number(e.data.min);
      if (e.data.tab) S.tab = e.data.tab;
      load();
    });
  }
  render();
  await load();
}

start();
