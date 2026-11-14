import { DEFAULTS, SETTING_FIELDS, HOURS, TYPES, WHEN, DEFAULT_SOURCES, withFixed, LEGACY_LABELS, LOCATION } from "./config.js";
import { DOW, MON, iso, dayEvents, isBreak, tempFactor, forecast, hourly, bobaPlan, fruitPlan, machines } from "./model.js";
import { getWeather } from "./weather.js";
import * as store from "./store.js";

// ---------------- State ----------------
// FIXED_EVENTS are always present (first in the list) and can't be deleted: see withFixed in config.js
const saved = store.load();
const st = {
  s: { ...structuredClone(DEFAULTS), ...(saved.s || {}), base: { ...DEFAULTS.base, ...(saved.s?.base || {}) } },
  events: withFixed((saved.events || []).filter(e => saved.v === 2 || !LEGACY_LABELS.includes(e.label))),
  sources: saved.sources || structuredClone(DEFAULT_SOURCES),   // calendars read by Sync
  sync: saved.sync || {},          // per source: last sync time, method, count, error
  logs: saved.logs || [],          // real closing logs
  showSample: saved.showSample ?? true,
  days: [],
  live: false,
  sel: 0
};
const persist = opts => store.save({ v: 2, s: st.s, events: st.events.filter(e => !e.fixed), sources: st.sources, sync: st.sync, logs: st.logs, showSample: st.showSample }, opts);

const $ = id => document.getElementById(id);
const esc = v => String(v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtH = h => `${((h + 11) % 12) + 1}:00 ${h < 12 ? "AM" : "PM"}`;
const fmtM = m => `${((Math.floor(m / 60) + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${m < 720 ? "AM" : "PM"}`;
const SIZE = { 0.25: "¼", 0.5: "½", 0.75: "¾", 1: "full" };
// How busy a day is, compared with the average of the next 14 days (min = lowest share of that average for the level)
const LEVELS = [
  { min: 1.25, name: "Very busy", cls: "lv-hot" },
  { min: 1.05, name: "Busy", cls: "lv-warm" },
  { min: 0.85, name: "Slightly busy", cls: "lv-ok" },
  { min: 0.6, name: "Not busy", cls: "lv-cool" },
  { min: 0, name: "Very slow", cls: "lv-cold" }
];
const shortDate = d => `${DOW[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}`;

function today() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// ---------------- Today ----------------
const avgCust = () => st.days.reduce((a, x) => a + forecast(x, st.events, st.s).customers, 0) / Math.max(st.days.length, 1);
const levelOf = (customers, avg) => LEVELS.find(l => customers / Math.max(avg, 1) >= l.min);
const uniq = list => [...new Set(list)];

function renderDays() {
  const avg = avgCust();
  $("days").innerHTML = st.days.map((d, i) => {
    const f = forecast(d, st.events, st.s).customers;
    const icons = isBreak(st.events, d.key) ? "BREAK" : uniq(dayEvents(st.events, d.key).map(e => TYPES[e.type].icon)).join(" ");
    return `<div class="day ${i === st.sel ? "on" : ""}" data-i="${i}">
      <div class="d">${i === 0 ? "Today" : DOW[d.date.getDay()]} ${d.date.getDate()}</div>
      <div class="t">${d.temp}°F</div>
      <div class="c" title="Expected customers">👥 ${f}</div>
      <div><span class="level xs ${levelOf(f, avg).cls}">${levelOf(f, avg).name}</span></div>
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
  const avg = avgCust();
  const ratio = fc.customers / Math.max(avg, 1);
  const lv = levelOf(fc.customers, avg);
  $("level").textContent = lv.name;
  $("level").className = `level ${lv.cls}`;
  $("level").title = `${Math.round(ratio * 100)}% of the 2-week average (${Math.round(avg)} customers)`;
  const drop = Math.round((1 - fc.customers / fc.base) * 100);
  $("cmp").innerHTML = (drop > 0
    ? `<b>${drop}% fewer</b> than a typical warm ${dow} (${fc.base})`
    : `${-drop}% more than a typical warm ${dow} (${fc.base})`) +
    ` · <span class="sw" style="background:var(--pink)"></span>${fc.froyo} froyo · <span class="sw" style="background:var(--blue)"></span>${fc.tea} tea`;
  $("wx").innerHTML = `<span>🌡 <b>${day.temp}°F</b></span><span>☁ <b>${day.cond}</b></span>` +
    dayEvents(st.events, day.key).map(e => `<span>${TYPES[e.type].icon} <b>${esc(e.label)}</b></span>`).join("");

  const cls = m => (m < 0.99 ? "down" : m > 1.01 ? "up" : "flat");
  $("why").innerHTML = fc.factors.map(x => {
    if (x.base !== undefined) return `<div class="row"><span>${esc(x.label)}</span><span class="x flat">${x.base} customers (${Math.round(x.froyo)} froyo · ${Math.round(x.tea)} tea)</span></div>`;
    if (x.m === undefined) return `<div class="row"><span>${esc(x.label)}</span><span><span class="x ${cls(x.mf)}">froyo ×${x.mf.toFixed(2)}</span> · <span class="x ${cls(x.mt)}">tea ×${x.mt.toFixed(2)}</span></span></div>`;
    return `<div class="row"><span>${esc(x.label)}</span><span class="x ${cls(x.m)}">×${x.m.toFixed(2)}</span></div>`;
  }).join("");
  const chain = key => fc.factors.slice(1).map(x => "× " + (x[key] ?? x.m).toFixed(2)).join(" ");
  const [b0] = fc.factors;
  $("formula").textContent = `Froyo ${Math.round(b0.froyo)} ${chain("mf")} ≈ ${fc.froyo} · Tea ${Math.round(b0.tea)} ${chain("mt")} ≈ ${fc.tea} → ${fc.customers} customers`;

  const bp = bobaPlan(fc, day, st.events, st.s);
  const fp = fruitPlan(fc, st.s);
  const mach = machines(fc.froyo);
  const machBusy = machines(Math.round(bp.busyFc.froyo));
  const moreFruit = fruitPlan(bp.busyFc, st.s).containers - fp.containers;
  const pct = Math.round((st.s.cushion ?? 0.2) * 100);
  const cookAt = h => fmtM(h * 60 - (st.s.cookLead ?? 45));
  const savedDrinks = Math.max(0, Math.round(bp.oldTossed - bp.tossed));
  $("prep").innerHTML = `
    <div class="item boba"><h3>🧋 Boba: cook ${Math.round(bp.cooked)} drinks' worth, in ${bp.batches.length} small batch${bp.batches.length === 1 ? "" : "es"}</h3>
      <ul>${bp.batches.map(b => `<li><b>Start ${cookAt(b.h)}</b> (ready ${fmtH(b.h)}): ${SIZE[b.size]} batch (~${Math.round(b.drinks)} drinks)</li>`).join("") || "<li>No boba needed</li>"}</ul>
      <div class="backup"><b>If it's busier than expected</b> (~${bp.busyCustomers} customers, +${pct}%): ${bp.backup.length
        ? Object.entries(bp.backup.reduce((g, b) => ((g[b.size] ||= []).push(cookAt(b.h)), g), {}))
          .map(([size, starts]) => `add a ${SIZE[size]} batch, start ${starts.join(", ")}`).join("; ")
        : "no extra boba needed"}</div>
      <div class="saved">Est. tossed: ~${Math.round(bp.tossed)} drinks' worth, vs. ~${Math.round(bp.oldTossed)} with ${st.s.oldBatches} full batch${st.s.oldBatches === 1 ? "" : "es"} (saves ~${savedDrinks})</div></div>
    <div class="item fruit"><h3>🍓 Fruit: cut ${fp.containers} container${fp.containers === 1 ? "" : "s"} per fruit</h3>
      <ul><li>~${Math.round(fp.cups)} cups expected to add fresh fruit</li><li>Cut half at open, the rest when it runs low</li>${moreFruit > 0 ? `<li>If busier: have ${moreFruit} more container${moreFruit === 1 ? "" : "s"} ready to cut</li>` : ""}</ul></div>
    <div class="item yo"><h3>🍦 Froyo: run ${mach} of 5 machines</h3>
      <ul><li>${mach < 5 ? "Pause the slowest flavors until it warms up" : "Busy day: run all machines"}</li><li>Keep your usual winter fill levels</li>${machBusy > mach ? `<li>If busier: turn on ${machBusy} machines</li>` : ""}</ul></div>`;

  drawHourly(hourly(fc.froyo, day, st.events), hourly(fc.tea, day, st.events), bp.batches);
}

// Stacked bars: froyo (pink) at the bottom, tea (blue) on top, 2px gap between
function drawHourly(hf, ht, batches) {
  const tot = hf.map((f, i) => f + ht[i]);
  const max = Math.max(...tot, 1);
  const W = 560, H = 190, L = 30, B = 26, bw = (W - L - 10) / HOURS.length;
  let svg = "";
  [0, 0.5, 1].forEach(t => {
    const y = H - B - t * (H - B - 20);
    svg += `<line x1="${L}" x2="${W - 10}" y1="${y}" y2="${y}" stroke="#eee"/><text x="${L - 6}" y="${y + 4}" font-size="10" fill="#999" text-anchor="end">${Math.round(max * t)}</text>`;
  });
  hf.forEach((c, i) => {
    const hF = (c / max) * (H - B - 20), hT = (ht[i] / max) * (H - B - 20), x = L + i * bw + 4;
    svg += `<rect x="${x}" y="${H - B - hF}" width="${bw - 8}" height="${hF}" fill="var(--pink)"><title>${fmtH(HOURS[i])}: ${Math.round(c)} froyo</title></rect>`;
    svg += `<rect x="${x}" y="${H - B - hF - 2 - hT}" width="${bw - 8}" height="${Math.max(hT, 0)}" rx="4" fill="var(--blue)"><title>${fmtH(HOURS[i])}: ${Math.round(ht[i])} tea</title></rect>`;
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
  const fcs = st.days.map(d => forecast(d, st.events, st.s));
  const vals = fcs.map(f => f.customers);
  const avg = avgCust();
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
    const hF = (fcs[i].froyo / max) * (H - B - 20), hT = Math.max(0, h - hF - 2);
    svg += `<rect x="${x}" y="${H - B - hF}" width="${bw - 12}" height="${hF}" fill="var(--pink)"><title>${fcs[i].froyo} froyo</title></rect>`;
    svg += `<rect x="${x}" y="${H - B - h}" width="${bw - 12}" height="${hT}" rx="5" fill="var(--blue)"><title>${fcs[i].tea} tea</title></rect>`;
    svg += `<text x="${cx}" y="${H - B - h - 6}" font-size="12" font-weight="700" fill="#333" text-anchor="middle">${v}</text>`;
    svg += `<text x="${cx}" y="${H - 18}" font-size="11" fill="#666" text-anchor="middle">${DOW[d.getDay()]}</text>`;
    svg += `<text x="${cx}" y="${H - 5}" font-size="11" fill="#999" text-anchor="middle">${MON[d.getMonth()]} ${d.getDate()}</text>`;
  });
  $("outChart").innerHTML = svg;

  $("outTable").innerHTML =
    `<tr><th>Day</th><th>Weather</th><th>Events</th><th>Customers</th><th>Busyness</th><th>Boba batches</th><th>Fruit containers</th></tr>` +
    st.days.map((d, i) => {
      const c = vals[i];
      const bp = bobaPlan(fcs[i], d, st.events, st.s);
      const byType = {};   // one tag per event type (icon shown once); extra events counted as "+ N more"
      dayEvents(st.events, d.key).forEach(e => (byType[e.type] ||= []).push(e));
      const notes = Object.entries(byType).map(([t, list]) =>
        `<span class="pill ${t === "break" ? "brk" : "ev"}" title="${esc(list.map(e => e.label).join(", "))}">${TYPES[t].icon} ${esc(list[0].label)}${list.length > 1 ? ` + ${list.length - 1} more` : ""}</span>`).join(" ");
      const lv = levelOf(c, avg);
      return `<tr><td class="nowrap">${shortDate(d.date)}</td><td>${d.temp}°F · ${d.cond}</td><td>${notes}</td>
        <td class="n"><b>${c}</b> <span style="color:var(--muted)">(${fcs[i].froyo} froyo · ${fcs[i].tea} tea)</span></td><td><span class="level sm ${lv.cls}">${lv.name}</span></td><td class="n">${bp.batches.map(b => SIZE[b.size]).join(", ") || "–"}</td>
        <td class="n">${fruitPlan(fcs[i], st.s).containers}</td></tr>`;
    }).join("");
}

// ---------------- Events ----------------
function renderEvents() {
  const rows = st.events.map((e, i) => ({ ...e, i })).sort((a, b) => a.from.localeCompare(b.from));
  $("evTable").innerHTML =
    `<tr><th>Dates</th><th>Event</th><th>Type</th><th>When</th><th>Source</th><th></th></tr>` +
    (rows.map(e => `<tr><td class="nowrap">${e.from === e.to ? e.from : e.from + " → " + e.to}</td><td>${esc(e.label)}</td>
      <td>${TYPES[e.type].icon} ${TYPES[e.type].name}</td><td>${WHEN[e.when].name}</td>
      <td>${/^https?:/.test(e.url || "") ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.source)}</a>` : esc(e.source)}</td>
      <td>${e.fixed ? "" : `<button class="reset" data-del="${e.i}" title="Remove">✕</button>`}</td></tr>`).join("") ||
      `<tr><td colspan="6" class="note">No events yet. They load automatically from the calendar sources below, or add one by hand.</td></tr>`);
  document.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", () => {
    st.events.splice(+b.dataset.del, 1);
    changed();
  }));
}

// ---------------- Calendar sources ----------------
const evKey = e => `${e.from}|${e.label.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
const ago = t => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

function renderSources() {
  $("srcTable").innerHTML = `<tr><th>Source</th><th>Status</th><th>Events</th><th></th></tr>` +
    st.sources.map((s, i) => {
      const r = st.sync[s.id] || {};
      const n = st.events.filter(e => e.sid === s.id).length;
      const status = r.error ? `<span style="color:var(--red)" title="${esc(r.error)}">⚠ ${esc(r.error)}</span>`
        : r.at ? `✓ ${r.method} · ${ago(r.at)}` : '<span class="note" style="margin:0">not synced yet</span>';
      return `<tr><td><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a></td><td>${status}</td>
        <td class="n">${n}</td><td><button class="reset" data-rm="${i}" title="Remove source">✕</button></td></tr>`;
    }).join("");
  document.querySelectorAll("[data-rm]").forEach(b => b.addEventListener("click", () => {
    const s = st.sources.splice(+b.dataset.rm, 1)[0];
    st.events = st.events.filter(e => e.sid !== s.id);
    delete st.sync[s.id];
    changed();
  }));
}

// Server reads every source (feeds parsed, pages read by AI); each source's events are replaced on sync.
// Runs automatically: on every page load, every 30 minutes, and when a source is added.
let syncing = false;
async function syncAll() {
  if (syncing) return;
  syncing = true;
  const msg = $("syncMsg");
  say(msg, "Updating events…", "muted");
  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sources: st.sources, today: iso(today()) })
    });
    if (!res.ok) throw new Error([404, 405, 501].includes(res.status) ? "no-api" : `Sync failed (${res.status})`);
    const { results } = await res.json();
    st.events = st.events.filter(e => !results.some(r => r.ok && r.id === e.sid));
    const seen = new Set(st.events.map(evKey));
    let added = 0;
    for (const r of results) {
      const src = st.sources.find(s => s.id === r.id);
      if (!src) continue;
      if (!r.ok) {
        st.sync[r.id] = { ...(st.sync[r.id] || {}), error: r.error };
        continue;
      }
      st.sync[r.id] = { at: Date.now(), method: r.method, count: r.events.length };
      for (const e of r.events) {
        if (seen.has(evKey(e))) continue;
        seen.add(evKey(e));
        st.events.push({ ...e, source: src.name, url: src.url, sid: src.id, method: r.method });
        added++;
      }
    }
    const bad = results.filter(r => !r.ok).length;
    changed();
    say(msg, bad ? `Updated, but ${bad} of ${results.length} sources failed (see above).` : "Events up to date.", bad ? "red" : "mint");
  } catch (err) {
    say(msg, err.message === "no-api"
      ? "Events can't update: stop the current server and run `npm start`."
      : "Couldn't update events. Will try again in a few minutes.", "red");
  } finally {
    syncing = false;
  }
}

function initSources() {
  $("srcForm").addEventListener("submit", e => {
    e.preventDefault();
    const url = $("sUrl").value.trim();
    if (!/^https?:\/\//.test(url)) { say($("syncMsg"), "The link must start with http:// or https://", "red"); return; }
    st.sources.push({ id: "s" + Date.now().toString(36), name: $("sName").value.trim() || new URL(url).hostname, url, hint: $("sHint").value });
    $("sName").value = $("sUrl").value = "";
    changed();
    syncAll();
  });
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
        ? "AI import needs the local server: stop the current one and run `npm start`, with ANTHROPIC_API_KEY in .env."
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
  // stockouts come from real logs only (sample history doesn't record them)
  const mine = st.logs.slice(-7), ranOut = mine.filter(l => l.ran).length;
  if (mine.length) {
    $("acc").innerHTML += `<p style="margin:10px 0 0">Ran out of boba on <b>${ranOut}</b> of the last ${mine.length} logged day${mine.length === 1 ? "" : "s"}.${ranOut >= 2
      ? ' <b style="color:var(--red)">Consider raising the busy-day backup in Settings</b> so the plan prepares for busier days.' : ""}</p>`;
  }
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
    const ran = $("lRan").value;   // "" = didn't run out, else when in the day
    st.logs.push({ key, customers: cust, predicted, boba: +$("lBoba").value, fruit: +$("lFruit").value, ran, planner: true });
    say($("toast"), `Saved. Forecast was ${predicted}, actual ${cust}. Future forecasts adjusted ×${st.s.calib.toFixed(2)}.${ran ? " Noted that you ran out of boba." : ""}`, "mint");
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
    st.events = st.events.filter(e => e.fixed);
    st.sources = structuredClone(DEFAULT_SOURCES);
    st.sync = {};
    st.logs = [];
    st.showSample = true;
    changed();
    renderSettings();
  });
}

// ---------------- Tabs & startup ----------------
function changed(opts) {
  persist(opts);
  renderToday();
  renderOutlook();
  renderEvents();
  renderSources();
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
  initSources();
  initLog();
  initSettings();
  const [{ days, live }, remote] = await Promise.all([getWeather(today(), LOCATION), store.pull()]);
  st.days = days;
  st.live = live;
  // Shared data (Turso) wins over this browser's copy, so all paired devices match.
  if (remote) useShared(remote);
  $("wxBadge").textContent = live ? "Live weather · sample sales numbers" : "Sample weather · sample sales numbers";
  $("wxBadge").classList.toggle("badge-live", live);
  renderSettings();
  changed();
  // Pick up other devices' changes (every minute, and when this tab comes back into view).
  store.watch(shared => {
    useShared(shared);
    renderSettings();
    changed({ push: false });
  });
  syncAll();                                  // always read the calendars on load...
  setInterval(syncAll, 30 * 60 * 1000);       // ...and keep them fresh while the page stays open
}

function useShared(shared) {
  if (shared.s) st.s = { ...structuredClone(DEFAULTS), ...shared.s, base: { ...DEFAULTS.base, ...(shared.s.base || {}) } };
  if (shared.events) st.events = withFixed(shared.events);   // fixed events are never stored in the shared copy
  if (shared.logs) st.logs = shared.logs;
  if (shared.showSample !== undefined) st.showSample = shared.showSample;
}

start();
