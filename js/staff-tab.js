// Staffing tab: how many workers to schedule each day, and how many people are needed at each
// time, for the days in the weather forecast. The numbers come from js/staffing.js (the same
// forecast as the rest of the dashboard); this file only draws them.
// Every rate is a placeholder until the shop sets it in Settings, and the tab says so.
import { DEFAULTS, HOURS, TYPES } from "./config.js";
import { DOW, MON, forecast, dayEvents, isBreak } from "./model.js";
import { staffPlan, crew, span, clock, BUSY, CLOSE_MIN } from "./staffing.js";

const $ = (id) => document.getElementById(id);
const esc = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const people = (n) => `${n} ${n === 1 ? "person" : "people"}`;
const tenth = (n) => String(Math.round(n * 10) / 10);
const hourTag = (h) => `${h % 12 || 12}${h < 12 ? "a" : "p"}`; // 10a, 12p, 9p
const shade = (n) => `p${Math.max(0, Math.min(5, n))}`; // heat step: 1, 2, 3, 4, 5 or more
const dayName = (d, i) =>
  `${i === 0 ? "Today · " : ""}${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`;
const RATES = [
  "teaPerHour",
  "froyoPerHour",
  "cookWorkMin",
  "minStaff",
  "closeStaff",
  "shiftHours",
];
const NOTE = {
  prep: "Prep: cut fruit, start the first boba",
  close: "Close-out: clean machines, count the drawer, closing log",
};

let sel = 0; // selected day
let rows = []; // one per day: { d, fc, plan, crew }
let tipTimer = null;

export function renderStaffing(st) {
  if (!st.days.length || !$("sfTable")) return;
  rows = st.days.map((d) => {
    const fc = forecast(d, st.events, st.s);
    const plan = staffPlan(fc, d, st.events, st.s, st.shape);
    return { d, fc, plan, crew: crew(plan, st.s) };
  });
  sel = Math.min(sel, rows.length - 1);
  drawWeek(st);
  drawDay(st);
}

// One row per day: the workers to schedule, then people needed in each slot (prep, each open hour, close-out).
function drawWeek(st) {
  const head =
    `<tr><th>Day</th><th class="n">Customers</th><th class="n">Workers</th><th class="sf-h sf-prep">Prep</th>` +
    HOURS.map((h) => `<th class="sf-h">${hourTag(h)}</th>`).join("") +
    `<th class="sf-h sf-close">Close</th><th class="n">Staff-hours</th></tr>`;
  $("sfTable").innerHTML =
    head +
    rows
      .map((r, i) => {
        const icons = isBreak(st.events, r.d.key)
          ? "🧳"
          : [
              ...new Set(
                dayEvents(st.events, r.d.key).map((e) => TYPES[e.type].icon),
              ),
            ].join(" ");
        const cells = r.plan.slots
          .map(
            (x, k) =>
              `<td class="sf-c${x.what === "prep" ? " sf-prep" : x.what === "close" ? " sf-close" : ""}" data-k="${k}"><span class="${shade(x.staff)}">${x.staff}</span></td>`,
          )
          .join("");
        return `<tr class="${i === sel ? "on" : ""}" data-i="${i}">
      <td class="nowrap"><button class="reset sf-pick" type="button" aria-pressed="${i === sel}">${esc(dayName(r.d.date, i))}</button> <span class="sf-ev">${icons}</span></td>
      <td class="n">${r.fc.customers}</td><td class="n sf-crew"><b>${r.crew.workers}</b></td>${cells}<td class="n">${tenth(r.plan.staffHours)}</td></tr>`;
      })
      .join("");

  $("sfTable")
    .querySelectorAll("tr[data-i]")
    .forEach((tr) => {
      tr.addEventListener("click", () => {
        sel = +tr.dataset.i;
        hideTip();
        drawWeek(st);
        drawDay(st);
      });
      tr.querySelectorAll("td.sf-c").forEach((td) => {
        td.addEventListener("pointerenter", () =>
          showTip(td, rows[+tr.dataset.i], +td.dataset.k, +tr.dataset.i),
        );
        // A finger leaves as soon as it lifts, so keep the card up a moment on touch screens
        td.addEventListener("pointerleave", (e) => {
          clearTimeout(tipTimer);
          tipTimer = setTimeout(hideTip, e.pointerType === "mouse" ? 0 : 2500);
        });
      });
    });

  const left = RATES.filter((k) => st.s[k] === DEFAULTS[k]).length;
  $("sfAssumed").classList.toggle("hidden", !left);
  $("sfAssumed").textContent =
    left === RATES.length
      ? "assumed rates"
      : `${left} of ${RATES.length} rates assumed`;
}

// Small card above one cell: the head count first, then when, then what the work is.
function showTip(td, r, k, i) {
  clearTimeout(tipTimer);
  const x = r.plan.slots[k],
    hour = x.what === "open" ? r.plan.hours[k - 1] : null;
  $("sfTipVal").textContent = people(x.staff);
  $("sfTipWhen").textContent =
    `${dayName(r.d.date, i)} · ${span(x.from, x.to)}`;
  $("sfTipWhy").textContent = hour
    ? `${Math.round(hour.froyo)} froyo · ${Math.round(hour.tea)} tea${hour.cooks ? ` · ${hour.cooks} boba batch${hour.cooks === 1 ? "" : "es"} started` : ""} · ${hour.workMin} work min`
    : NOTE[x.what];
  const box = td.getBoundingClientRect(),
    tip = $("sfTip");
  tip.style.left = `${Math.max(140, Math.min(window.innerWidth - 140, box.left + box.width / 2))}px`;
  tip.style.top = `${box.top}px`;
  tip.classList.add("on");
}
const hideTip = () => $("sfTip").classList.remove("on");

// The selected day: workers to schedule and why, the shift blocks, and the hour-by-hour numbers.
function drawDay(st) {
  const { d, fc, plan, crew: c } = rows[sel],
    s = st.s;
  $("sfDayTitle").textContent = `${dayName(d.date, sel)} · schedule`;
  $("sfWorkers").textContent = c.workers;
  $("sfWorkersLbl").textContent =
    `worker${c.workers === 1 ? "" : "s"} to schedule`;
  const at =
    c.atOnceWhat === "open"
      ? `from ${clock(c.atOnceFrom)}`
      : c.atOnceWhat === "close"
        ? "at close-out"
        : "for prep";
  $("sfSummary").textContent =
    `Most at once: ${people(c.atOnce)} ${at} · ${tenth(plan.staffHours)} staff-hours · ${fc.customers} expected customers`;

  $("sfBlocks").innerHTML = plan.blocks
    .map(
      (b) =>
        `<div class="sf-block"><span class="sf-time">${span(b.from, b.to)}</span><span class="sf-n ${shade(b.staff)}">${b.staff}</span>` +
        `<span><b>${people(b.staff)}</b>${NOTE[b.what] ? ` <span class="sf-what">${NOTE[b.what]}</span>` : ""}</span></div>`,
    )
    .join("");

  const pct = Math.round((s.cushion ?? 0.2) * 100);
  $("sfOnCall").innerHTML =
    `<b>If it's ${pct}% busier than expected:</b> ` +
    (plan.onCall.length
      ? `have ${plan.onCall.map((b) => `${b.staff} more ${b.staff === 1 ? "person" : "people"} on call ${span(b.from, b.to)}`).join(", ")}`
      : "the same crew covers it");

  $("sfWhy").innerHTML =
    `<div class="row"><span>Staff-hours ÷ longest shift (${s.shiftHours} h)</span><span class="x flat">${tenth(plan.staffHours)} ÷ ${s.shiftHours} = ${tenth(plan.staffHours / s.shiftHours)} → ${c.byHours}</span></div>` +
    `<div class="row"><span>Most people needed at once</span><span class="x flat">${c.atOnce}</span></div>` +
    `<div class="row"><span>Workers to schedule (the larger of the two)</span><span class="x flat">${c.workers}</span></div>`;

  $("sfHours").innerHTML =
    `<tr><th>Hour</th><th class="n">Froyo</th><th class="n">Tea</th><th class="n">Boba starts</th><th class="n">Work min</th><th class="n">People</th><th class="n">If ${pct}% busier</th></tr>` +
    plan.hours
      .map(
        (
          x,
        ) => `<tr><td class="nowrap">${clock(x.h * 60)}</td><td class="n">${Math.round(x.froyo)}</td><td class="n">${Math.round(x.tea)}</td>
      <td class="n">${x.cooks || "–"}</td><td class="n">${x.workMin}</td><td class="n"><span class="sf-n ${shade(x.staff)}">${x.staff}</span></td>
      <td class="n">${x.busyStaff > x.staff ? `<b>${x.busyStaff}</b>` : x.busyStaff}</td></tr>`,
      )
      .join("");

  const prep = plan.slots[0];
  $("sfHow").textContent =
    `Work minutes in an hour = tea drinks × 60 ÷ ${s.teaPerHour} + froyo customers × 60 ÷ ${s.froyoPerHour} + ${s.cookWorkMin} min for each boba batch started. ` +
    `People = work minutes ÷ ${Math.round(60 * BUSY)} (each person planned at most ${Math.round(BUSY * 100)}% busy, because customers come in bursts), rounded up, at least ${s.minStaff} while open. ` +
    `Prep: ${people(prep.staff)} from ${clock(prep.from)}. Close-out: ${people(Math.max(1, s.closeStaff))} for ${CLOSE_MIN} minutes. ` +
    `Workers per day = staff-hours ÷ the longest shift (${s.shiftHours} h), rounded up, and never fewer than the most people needed at once. ` +
    `These rates are placeholders until the shop sets them in Settings.`;
}
