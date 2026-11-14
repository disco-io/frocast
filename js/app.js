import { DEFAULTS, SETTING_FIELDS, HOURS, TYPES, WHEN, DEFAULT_EVENTS, LOCATION } from "./config.js";
import { DOW, MON, iso, dayEvents, isBreak, tempFactor, forecast, hourly, bobaPlan, fruitPlan, machines } from "./model.js";
import { getWeather } from "./weather.js";
import * as store from "./store.js";

// ---------------- State ----------------
const saved = store.load();
const st = {
  s: { ...structuredClone(DEFAULTS), ...(saved.s || {}), base: { ...DEFAULTS.base, ...(saved.s?.base || {}) } },
  events: saved.events || structuredClone(DEFAULT_EVENTS),
  logs: saved.logs || [],          // real closing logs
  showSample: saved.showSample ?? true,
  days: [],
  live: false,
  sel: 0
};
const persist = () => store.save({ s: st.s, events: st.events, logs: st.logs, showSample: st.showSample });

const $ = id => document.getElementById(id);
const esc = v => String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtH = h => `${((h + 11) % 12) + 1}:00 ${h < 12 ? "AM" : "PM"}`;
const SIZE = { 0.25: "¼", 0.5: "½", 0.75: "¾", 1: "full" };
const shortDate = d => `${DOW[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}`;

function today() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// ---------------- Today ----------------
function renderDays() {
  $("days").innerHTML = st.days.map((d, i) => {
    const f = forecast(d, st.events, st.s).customers;
    const icons = isBreak(st.events, d.key) ? "BREAK" : dayEvents(st.events, d.key).map(e => TYPES[e.type].icon).join(" ");
    return `<div class="day ${i === st.sel ? "on" : ""}" data-i="${i}">
      <div class="d">${i === 0 ? "Today" : DOW[d.date.getDay()]} ${d.date.getDate()}</div>
      <div class="t">${d.temp}°F</div>
      <div class="c">${f} cust.</div>
      <div class="flag">${icons || "&nbsp;"}</div></div>`;
  }).join("");
  document.querySelectorAll(".day").forEach(el => el.addEventListener("click", () => {
    st.sel = +el.dataset.i;
    renderToday();
  }));
}

function renderToday() {
  renderDays();
  const day = st.days[st.sel];
  const fc = forecast(day, st.events, st.s);
  const d = day.date;
  const dow = DOW[d.getDay()];

  $("dayTitle").textContent = `${dow}, ${MON[d.getMonth()]} ${d.getDate()}`;
  $("cust").textContent = fc.customers;
  const drop = Math.round((1 - fc.customers / fc.base) * 100);
  $("cmp").innerHTML = drop > 0
    ? `<b>${drop}% fewer</b> than a typical warm ${dow} (${fc.base})`
    : `${-drop}% more than a typical warm ${dow} (${fc.base})`;
  $("wx").innerHTML = `<span>🌡 <b>${day.temp}°F</b></span><span>☁ <b>${day.cond}</b></span>` +
    dayEvents(st.events, day.key).map(e => `<span>${TYPES[e.type].icon} <b>${esc(e.label)}</b></span>`).join("");

  $("why").innerHTML = fc.factors.map(x => {
    if (x.base !== undefined) return `<div class="row"><span>${esc(x.label)}</span><span class="x flat">${x.base} customers</span></div>`;
    const cls = x.m < 0.99 ? "down" : x.m > 1.01 ? "up" : "flat";
    return `<div class="row"><span>${esc(x.label)}</span><span class="x ${cls}">×${x.m.toFixed(2)}</span></div>`;
  }).join("");
  $("formula").textContent = `${fc.base} ${fc.factors.slice(1).map(x => "× " + x.m.toFixed(2)).join(" ")} ≈ ${fc.customers} customers`;

  const bp = bobaPlan(fc.customers, day, st.events, st.s);
  const fp = fruitPlan(fc.customers, st.s);
  const mach = machines(fc.customers);
  const savedDrinks = Math.max(0, Math.round(bp.oldTossed - bp.tossed));
  $("prep").innerHTML = `
    <div class="item boba"><h3>🧋 Boba: cook ${Math.round(bp.cooked)} drinks' worth, in ${bp.batches.length} small batch${bp.batches.length === 1 ? "" : "es"}</h3>
      <ul>${bp.batches.map(b => `<li><b>${fmtH(b.h)}</b>: ${SIZE[b.size]} batch (~${Math.round(b.drinks)} drinks)</li>`).join("") || "<li>No boba needed</li>"}</ul>
      <div class="saved">Est. tossed: ~${Math.round(bp.tossed)} drinks' worth, vs. ~${Math.round(bp.oldTossed)} with ${st.s.oldBatches} full batch${st.s.oldBatches === 1 ? "" : "es"} (saves ~${savedDrinks})</div></div>
    <div class="item fruit"><h3>🍓 Fruit: cut ${fp.containers} container${fp.containers === 1 ? "" : "s"} per fruit</h3>
      <ul><li>~${Math.round(fp.cups)} cups expected to add fresh fruit</li><li>Cut half at open, the rest when it runs low</li></ul></div>
    <div class="item yo"><h3>🍦 Froyo: run ${mach} of 5 machines</h3>
      <ul><li>${mach < 5 ? "Pause the slowest flavors until it warms up" : "Busy day: run all machines"}</li><li>Keep your usual winter fill levels</li></ul></div>`;

  drawHourly(hourly(fc.customers, day, st.events), bp.batches);
}

function drawHourly(hc, batches) {
  const max = Math.max(...hc, 1);
  const W = 560, H = 190, L = 30, B = 26, bw = (W - L - 10) / HOURS.length;
  let svg = "";
  [0, 0.5, 1].forEach(t => {
    const y = H - B - t * (H - B - 20);
    svg += `<line x1="${L}" x2="${W - 10}" y1="${y}" y2="${y}" stroke="#eee"/><text x="${L - 6}" y="${y + 4}" font-size="10" fill="#999" text-anchor="end">${Math.round(max * t)}</text>`;
  });
  hc.forEach((c, i) => {
    const h = (c / max) * (H - B - 20), x = L + i * bw + 4;
    svg += `<rect x="${x}" y="${H - B - h}" width="${bw - 8}" height="${h}" rx="4" fill="var(--pink)" opacity=".85"/>`;
    if (i % 2 === 0) svg += `<text x="${x + (bw - 8) / 2}" y="${H - 8}" font-size="10" fill="#888" text-anchor="middle">${fmtH(HOURS[i]).replace(":00", "")}</text>`;
  });
  batches.forEach(b => {
    const x = L + HOURS.indexOf(b.h) * bw + bw / 2;
    svg += `<text x="${x}" y="14" font-size="13" text-anchor="middle">🧋</text><line x1="${x}" x2="${x}" y1="18" y2="${H - B}" stroke="var(--ink)" stroke-dasharray="3 3" opacity=".5"/>`;
  });
  $("hourly").innerHTML = svg;
}

// ---------------- Outlook ----------------
function renderOutlook() {
  const vals = st.days.map(d => forecast(d, st.events, st.s).customers);
  const n = st.days.length;
  const W = 900, H = 230, L = 34, B = 34, max = Math.max(...vals, 10) * 1.15, bw = (W - L - 10) / n;
  let svg = "";
  st.days.forEach((d, i) => {
    if (isBreak(st.events, d.key)) svg += `<rect x="${L + i * bw}" y="10" width="${bw}" height="${H - B - 10}" fill="#cfd8ea" opacity=".45"/>`;
  });
  [0, 0.5, 1].forEach(t => {
    const y = H - B - t * (H - B - 20);
    svg += `<line x1="${L}" x2="${W - 10}" y1="${y}" y2="${y}" stroke="#eee"/><text x="${L - 6}" y="${y + 4}" font-size="11" fill="#999" text-anchor="end">${Math.round(max * t)}</text>`;
  });
  vals.forEach((v, i) => {
    const h = (v / max) * (H - B - 20), x = L + i * bw + 6, cx = x + (bw - 12) / 2, d = st.days[i].date;
    svg += `<rect x="${x}" y="${H - B - h}" width="${bw - 12}" height="${h}" rx="5" fill="var(--pink)"/>`;
    svg += `<text x="${cx}" y="${H - B - h - 6}" font-size="12" font-weight="700" fill="#333" text-anchor="middle">${v}</text>`;
    svg += `<text x="${cx}" y="${H - 18}" font-size="11" fill="#666" text-anchor="middle">${DOW[d.getDay()]}</text>`;
    svg += `<text x="${cx}" y="${H - 5}" font-size="11" fill="#999" text-anchor="middle">${MON[d.getMonth()]} ${d.getDate()}</text>`;
  });
  $("outChart").innerHTML = svg;

  $("outTable").innerHTML =
    `<tr><th>Day</th><th>Weather</th><th>Events</th><th>Customers</th><th>Boba batches</th><th>Fruit containers</th></tr>` +
    st.days.map((d, i) => {
      const c = vals[i];
      const bp = bobaPlan(c, d, st.events, st.s);
      const notes = dayEvents(st.events, d.key)
        .map(e => `<span class="pill ${e.type === "break" ? "brk" : "ev"}">${TYPES[e.type].icon} ${esc(e.label)}</span>`).join(" ");
      return `<tr><td class="nowrap">${shortDate(d.date)}</td><td>${d.temp}°F · ${d.cond}</td><td>${notes}</td>
        <td class="n"><b>${c}</b></td><td class="n">${bp.batches.map(b => SIZE[b.size]).join(", ") || "–"}</td>
        <td class="n">${fruitPlan(c, st.s).containers}</td></tr>`;
    }).join("");
}

// ---------------- Events ----------------
function renderEvents() {
  const rows = st.events.map((e, i) => ({ ...e, i })).sort((a, b) => a.from.localeCompare(b.from));
  $("evTable").innerHTML =
    `<tr><th>Dates</th><th>Event</th><th>Type</th><th>When</th><th>Source</th><th>Effect</th><th></th></tr>` +
    rows.map(e => `<tr><td class="nowrap">${e.from === e.to ? e.from : e.from + " → " + e.to}</td><td>${esc(e.label)}</td>
      <td>${TYPES[e.type].icon} ${TYPES[e.type].name}</td><td>${WHEN[e.when].name}</td><td>${esc(e.source)}</td>
      <td class="n">×${TYPES[e.type].mult.toFixed(2)}</td>
      <td><button class="reset" data-del="${e.i}" title="Remove">✕</button></td></tr>`).join("");
  document.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => {
    st.events.splice(+b.dataset.del, 1);
    changed();
  }));
}

function initEventForms() {
  $("eType").innerHTML = Object.entries(TYPES).map(([k, t]) => `<option value="${k}">${t.icon} ${t.name}</option>`).join("");
  $("eWhen").innerHTML = Object.entries(WHEN).map(([k, w]) => `<option value="${k}">${w.name}</option>`).join("");
  $("eType").value = "student";
  $("eWhen").value = "evening";
  $("eFrom").value = iso(today());

  $("evForm").addEventListener("submit", e => {
    e.preventDefault();
    const from = $("eFrom").value;
    const to = $("eTo").value && $("eTo").value >= from ? $("eTo").value : from;
    st.events.push({ from, to, label: $("eLabel").value.trim(), type: $("eType").value, when: $("eWhen").value,
      source: $("eSource").value.trim() || "Added by staff" });
    $("eLabel").value = "";
    changed();
  });

  $("aiForm").addEventListener("submit", async e => {
    e.preventDefault();
    const msg = $("aiMsg");
    const text = $("aiText").value.trim();
    if (!text) { say(msg, "Paste some calendar text first.", "red"); return; }
    $("aiBtn").disabled = true;
    say(msg, "Reading the calendar…", "muted");
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, today: iso(today()) })
      });
      if (!res.ok) throw new Error([404, 405, 501].includes(res.status) ? "no-api" : await res.text());
      const { events } = await res.json();
      const valid = d => /^\d{4}-\d{2}-\d{2}$/.test(d || "");
      const found = (events || []).filter(ev => valid(ev.from) && TYPES[ev.type] && ev.label).map(ev => ({
        from: ev.from, to: valid(ev.to) && ev.to >= ev.from ? ev.to : ev.from, label: String(ev.label).slice(0, 80),
        type: ev.type, when: WHEN[ev.when] ? ev.when : "all", source: "Pasted calendar (AI, please check)"
      }));
      st.events.push(...found);
      changed();
      say(msg, found.length ? `Added ${found.length} event${found.length > 1 ? "s" : ""}. Check them in the table above.` : "No events found in that text.", "mint");
    } catch (err) {
      say(msg, err.message === "no-api"
        ? "AI import needs the API: run with `npx vercel dev` (or deploy) and set ANTHROPIC_API_KEY."
        : "Couldn't read that text. Try a shorter piece, or add events by hand.", "red");
    } finally {
      $("aiBtn").disabled = false;
    }
  });
}

function say(el, text, color) {
  el.style.color = color === "red" ? "var(--red)" : color === "muted" ? "var(--muted)" : "var(--mint)";
  el.textContent = text;
}

// ---------------- Closing log ----------------
function sampleHistory() {
  const pre = [0.75, 1, 0.5, 1, 0.75, 1, 0.75];
  const post = [0.25, 0.5, 0, 0.25, 0.25, 0, 0.25];
  const out = [];
  for (let i = 14; i >= 1; i--) {
    const d = today();
    d.setDate(d.getDate() - i);
    const k = 14 - i;
    const predicted = Math.round(st.s.base[DOW[d.getDay()]] * tempFactor(50));
    out.push({ key: iso(d), customers: Math.round(predicted * (0.85 + ((k * 37) % 30) / 100)), predicted,
      boba: k < 7 ? pre[k] : post[k - 7], fruit: k < 7 ? 1 : 0.5, planner: k >= 7, sample: true });
  }
  return out;
}

function allLogs() {
  const real = new Map(st.logs.map(l => [l.key, l]));
  const base = st.showSample ? sampleHistory().filter(l => !real.has(l.key)) : [];
  return [...base, ...st.logs].sort((a, b) => a.key.localeCompare(b.key));
}

function renderLog() {
  const rows = allLogs().slice(-14);
  const hasSample = rows.some(r => r.sample);
  $("wasteTitle").textContent = `Boba thrown out per day (batches)${hasSample ? " · includes sample history" : ""}`;
  $("clearSample").textContent = st.showSample ? "Hide sample history" : "Show sample history";

  const W = 520, H = 200, L = 30, B = 30, bw = (W - L - 10) / Math.max(rows.length, 1);
  let svg = "";
  [0, 0.5, 1].forEach(t => {
    const y = H - B - t * (H - B - 20);
    svg += `<line x1="${L}" x2="${W - 10}" y1="${y}" y2="${y}" stroke="#eee"/><text x="${L - 6}" y="${y + 4}" font-size="10" fill="#999" text-anchor="end">${t}</text>`;
  });
  rows.forEach((r, i) => {
    const h = r.boba * (H - B - 20), x = L + i * bw + 3;
    const [, m, d] = r.key.split("-").map(Number);
    svg += `<rect x="${x}" y="${H - B - h}" width="${bw - 6}" height="${Math.max(h, 1.5)}" rx="3" fill="${r.planner ? "var(--mint)" : "var(--red)"}" opacity="${r.sample ? 0.55 : 1}"/>`;
    if (i % 2 === 0 || rows.length < 8) svg += `<text x="${x + (bw - 6) / 2}" y="${H - 10}" font-size="10" fill="#888" text-anchor="middle">${m}/${d}</text>`;
  });
  if (!rows.length) svg += `<text x="${W / 2}" y="${H / 2}" font-size="13" fill="#999" text-anchor="middle">No closing logs yet</text>`;
  $("wasteChart").innerHTML = svg;

  const recent = rows.slice(-7);
  const err = recent.length
    ? recent.reduce((a, r) => a + Math.abs(r.customers - r.predicted) / Math.max(r.customers, 1), 0) / recent.length
    : null;
  const before = rows.filter(r => !r.planner), after = rows.filter(r => r.planner);
  const avg = a => a.reduce((x, r) => x + r.boba, 0) / Math.max(a.length, 1);
  $("acc").innerHTML = recent.length ? `
    <p style="margin:0 0 8px">Last ${recent.length} logged days, the forecast was off by <b>${Math.round(err * 100)}%</b> on average.</p>
    ${before.length && after.length ? `<p style="margin:0 0 8px">Boba thrown out: <b>${avg(before).toFixed(2)}</b> batches/day before → <b>${avg(after).toFixed(2)}</b> with FroCast.</p>` : ""}
    <p style="margin:0;color:var(--muted)">Each saved log nudges the forecast toward this shop's real numbers.${hasSample ? " Faded bars are sample history." : ""}</p>`
    : `<p style="margin:0;color:var(--muted)">Save a closing log to start tracking accuracy and waste.</p>`;
}

function initLog() {
  $("lDate").value = iso(today());
  $("logForm").addEventListener("submit", e => {
    e.preventDefault();
    const key = $("lDate").value;
    const cust = +$("lCust").value;
    const day = st.days.find(d => d.key === key);
    const [y, m, dd] = key.split("-").map(Number);
    const predicted = day
      ? forecast(day, st.events, st.s).customers
      : Math.round(st.s.base[DOW[new Date(y, m - 1, dd).getDay()]] * st.s.calib);
    const ratio = Math.min(2, Math.max(0.5, cust / Math.max(predicted, 1)));
    st.s.calib = +(st.s.calib * (1 + 0.2 * (ratio - 1))).toFixed(3);   // learn gently: 20% of the gap
    st.logs = st.logs.filter(l => l.key !== key);
    st.logs.push({ key, customers: cust, predicted, boba: +$("lBoba").value, fruit: +$("lFruit").value, planner: true });
    say($("toast"), `Saved. Forecast was ${predicted}, actual ${cust}. Future forecasts adjusted ×${st.s.calib.toFixed(2)}.`, "mint");
    changed();
  });
  $("clearSample").addEventListener("click", () => {
    st.showSample = !st.showSample;
    changed();
  });
}

// ---------------- Settings ----------------
function renderSettings() {
  const base = Object.keys(st.s.base)
    .map(d => `<label>Typical ${d} (warm day) <input type="number" data-base="${d}" value="${st.s.base[d]}" min="0"></label>`).join("");
  $("settingsBox").innerHTML = SETTING_FIELDS
    .map(([k, label, step, min, max]) => `<label>${label}<input type="number" data-k="${k}" value="${st.s[k]}" step="${step}" min="${min}" max="${max}"></label>`)
    .join("") + base;
  document.querySelectorAll("#settingsBox input").forEach(inp => inp.addEventListener("change", () => {
    const v = +inp.value;
    if (Number.isNaN(v) || v < 0) return;
    if (inp.dataset.base) st.s.base[inp.dataset.base] = v;
    else st.s[inp.dataset.k] = v;
    changed();
  }));
}

function initSettings() {
  $("resetAll").addEventListener("click", () => {
    store.clear();
    st.s = structuredClone(DEFAULTS);
    st.events = structuredClone(DEFAULT_EVENTS);
    st.logs = [];
    st.showSample = true;
    changed();
    renderSettings();
  });
}

// ---------------- Tabs & startup ----------------
function changed() {
  persist();
  renderToday();
  renderOutlook();
  renderEvents();
  renderLog();
}

function initTabs() {
  const ids = ["today", "outlook", "events", "log", "settings"];
  document.querySelectorAll("#tabs button").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("on", x === b));
    ids.forEach(id => $(id).classList.toggle("hidden", id !== b.dataset.tab));
  }));
}

async function start() {
  initTabs();
  initEventForms();
  initLog();
  initSettings();
  const { days, live } = await getWeather(today(), LOCATION);
  st.days = days;
  st.live = live;
  $("wxBadge").textContent = live ? "Live weather · sample sales numbers" : "Sample weather · sample sales numbers";
  $("wxBadge").classList.toggle("badge-live", live);
  renderSettings();
  changed();
}

start();
