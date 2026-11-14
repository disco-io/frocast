// Shared helpers for the api/ functions. Files starting with "_" are not routes.
// Needs ANTHROPIC_API_KEY (in .env locally, or in Vercel's environment variables).

export const TYPES = ["break", "exams", "athletics", "town", "student", "competition"];
export const WHEN = ["all", "afternoon", "evening", "late"];

const UA = "FroCast/0.1 (student project; reads public calendar pages)";

// ---------------- AI ----------------
export async function ask(prompt, max = 4000) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === "paste-your-key-here") throw new Error("ANTHROPIC_API_KEY is not set (put it in .env)");
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
      max_tokens: max,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!r.ok) throw new Error(`AI request failed (${r.status})`);
  const data = await r.json();
  const out = (data.content || []).map(c => c.text || "").join("");
  try {
    return JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
  } catch {
    throw new Error("Couldn't read the AI response");
  }
}

const RULES = `- "break": students leave campus (recess, vacation). "from" is the first day with no classes (the day after the last class), "to" is the last day of the break. "exams": reading period or final exams.
- "athletics": games and meets. "town": town or Palmer Square events. "student": concerts, shows, club events. "competition": hackathons, tournaments, club competitions.
- "when" is the part of the day the event brings people out: afternoon (12-5 PM), evening (5-9 PM), late (8-11 PM), or all.`;

// Read dated events out of messy page text (any format)
export async function extract(text, today, hint = "") {
  const out = await ask(`Extract events from this calendar text that could change how busy a frozen yogurt and boba shop next to Princeton University's campus will be.
Today is ${today}. For dates without a year, use the next upcoming occurrence.${hint ? `\nThe page is: ${hint}.` : ""}
Return JSON only, no other text: {"events":[{"from":"YYYY-MM-DD","to":"YYYY-MM-DD","label":"short name","type":"${TYPES.join("|")}","when":"${WHEN.join("|")}"}]}
${RULES}
- Only include events actually listed in the text. Never invent events.

Text:
"""
${String(text).slice(0, 40000)}
"""`);
  return clean(out.events);
}

// From a feed with many items (some irrelevant, like store promos): keep and label the ones that matter
async function pick(items, today, hint) {
  const lines = items.map((e, i) => `${i}|${e.from}${e.to !== e.from ? ".." + e.to : ""}|${e.hour ?? "-"}|${e.title}`).join("\n");
  const out = await ask(`These are items from a public calendar feed${hint ? ` (${hint})` : ""}. Today is ${today}.
Keep only the ones that could bring crowds or change foot traffic near a frozen yogurt and boba shop on Nassau St next to Princeton University (concerts, performances, markets, festivals, parades, tree lightings, games, student events, breaks). Skip store promos, sales, specials, drives, classes and small private events.
Format: index|date or date..date|start hour (24h, "-" if unknown)|title
Return JSON only: {"keep":[{"i":0,"label":"short name","type":"${TYPES.join("|")}","when":"${WHEN.join("|")}"}]}
${RULES}

${lines}`, 4000);
  return (out.keep || []).filter(k => items[k.i]).map(k => ({
    from: items[k.i].from, to: items[k.i].to, label: k.label || items[k.i].title, type: k.type, when: k.when
  }));
}

export function clean(events) {
  const ok = d => /^\d{4}-\d{2}-\d{2}$/.test(d || "");
  return (events || []).filter(e => ok(e.from) && TYPES.includes(e.type) && e.label).map(e => ({
    from: e.from,
    to: ok(e.to) && e.to >= e.from ? e.to : e.from,
    label: String(e.label).slice(0, 80),
    type: e.type,
    when: WHEN.includes(e.when) ? e.when : "all"
  }));
}

// ---------------- Fetching pages ----------------
function blocked(host) {
  return host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.)/.test(host) || host.includes(":");
}

export async function fetchText(url) {
  let u;
  try { u = new URL(url); } catch { throw new Error("Not a valid URL"); }
  if (!/^https?:$/.test(u.protocol) || blocked(u.hostname)) throw new Error("URL not allowed");
  const r = await fetch(u, { headers: { "user-agent": UA, accept: "text/calendar,text/html,*/*" }, signal: AbortSignal.timeout(20000) });
  if (r.status === 403 || r.status === 401) throw new Error(`Site blocks automated access (${r.status}). Paste the page text into the box below instead.`);
  if (!r.ok) throw new Error(`Page returned ${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  return { type: r.headers.get("content-type") || "", body: new TextDecoder().decode(buf.slice(0, 4e6)) };
}

export function htmlToText(html) {
  const ent = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " ", "#8211": "–", "#8217": "'" };
  return html
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d|\/section)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#?\w+);/g, (m, k) => ent[k] ?? " ")
    .replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}

// ---------------- iCal (.ics) ----------------
const NY = "America/New_York";
const ny = d => d.toLocaleString("sv-SE", { timeZone: NY });                  // "2026-11-27 17:00:00"
const day = (s, n) => new Date(Date.parse(s + "T12:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const unesc = s => s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1");

function when(val, params) {
  const v = val.trim();
  if (/VALUE=DATE(?!-)/.test(params) || /^\d{8}$/.test(v)) return { date: `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`, hour: null, midnight: false };
  const m = v.match(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)?(Z?)$/);
  if (!m) return null;
  if (m[7]) {                                                                 // UTC: convert to New York time
    const [d, t] = ny(new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)))).split(" ");
    return { date: d, hour: +t.slice(0, 2), midnight: t.startsWith("00:00") };
  }
  return { date: `${m[1]}-${m[2]}-${m[3]}`, hour: +m[4], midnight: m[4] + m[5] === "0000" };
}

export function parseIcs(text) {
  const lines = text.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const out = [];
  let cur = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") {
      if (cur?.start && cur.title) {
        const s = cur.start, e = cur.end;
        let to = s.date;
        if (e) to = s.hour === null ? day(e.date, -1) : e.midnight && e.date > s.date ? day(e.date, -1) : e.date;
        out.push({ title: cur.title, location: cur.location || "", from: s.date, to: to < s.date ? s.date : to, hour: s.hour, url: cur.url });
      }
      cur = null;
    } else if (cur) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const [name, ...p] = line.slice(0, i).split(";");
      const val = line.slice(i + 1);
      if (name === "SUMMARY") cur.title = unesc(val);
      else if (name === "LOCATION") cur.location = unesc(val);
      else if (name === "DTSTART") cur.start = when(val, p.join(";"));
      else if (name === "DTEND") cur.end = when(val, p.join(";"));
    }
  }
  return out;
}

export const slot = (hour, from, to) =>
  hour === null || from !== to ? "all" : hour < 12 ? "all" : hour < 17 ? "afternoon" : hour < 20 ? "evening" : "late";

// Home game = played in Princeton. The feed's location is usually "Princeton, N.J." but is sometimes just a venue
// (", Hobey Baker Rink") or blank; Sidearm titles say "vs" for home and "at" for away.
const VENUES = /Jadwin|Hobey Baker|Princeton Stadium|Powers Field|Roberts Stadium|DeNunzio|Class of 1952|Caldwell Field|Weaver|Sherrerd|Lenz|Myslik|Finney Field|Poe Field|Clarke Field|University Field|Shea Rowing/i;
export const isHome = e =>
  /^Princeton, N\.?J/i.test(e.location) || VENUES.test(e.location) || (!e.location.replace(/[,\s]/g, "") && / vs /i.test(e.title) && !/TBA|TBD/i.test(e.title));

// ---------------- One source -> events ----------------
const addDays = (key, n) => day(key, n);

export async function read(src, today, windowDays = 45) {
  const { type, body } = await fetchText(src.url);
  const end = addDays(today, windowDays);
  const inside = e => e.to >= today && e.from <= end;
  const isIcs = /text\/calendar/i.test(type) || /^\s*BEGIN:VCALENDAR/.test(body);

  if (isIcs) {
    const items = parseIcs(body).filter(inside);
    if (src.hint === "athletics") {                                          // home games only, no AI needed
      const events = items.filter(isHome).map(e => ({
        from: e.from, to: e.to, type: "athletics", when: slot(e.hour, e.from, e.to),
        label: e.title.replace(/^\[[A-Z]\]\s*/, "").replace(/^Princeton University\s+/, "").slice(0, 80)
      }));
      return { method: "feed", events };
    }
    const events = items.length ? await pick(items.slice(0, 150), today, src.name) : [];
    return { method: "feed + AI", events: clean(events).filter(inside) };
  }

  const text = htmlToText(body);
  if (text.length < 300) throw new Error("No readable text on that page (it may load events with JavaScript). Paste the text below instead.");
  return { method: "AI", events: (await extract(text, today, src.name)).filter(inside) };
}
