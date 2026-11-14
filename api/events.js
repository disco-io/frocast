// Vercel serverless function: pulls dated events out of pasted calendar text with Claude.
// Needs the ANTHROPIC_API_KEY environment variable (set it in Vercel, never commit it).

const TYPES = ["break", "exams", "athletics", "town", "student", "competition"];
const WHEN = ["all", "afternoon", "evening", "late"];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY is not set" });
    return;
  }

  const { text = "", today = new Date().toISOString().slice(0, 10) } = req.body || {};
  if (!text.trim()) {
    res.status(400).json({ error: "No text" });
    return;
  }

  const prompt = `Extract events from this calendar text that could change how busy a frozen yogurt and boba shop next to Princeton University's campus will be.
Today is ${today}. For dates without a year, use the next upcoming occurrence.
Return JSON only, no other text: {"events":[{"from":"YYYY-MM-DD","to":"YYYY-MM-DD","label":"short name","type":"${TYPES.join("|")}","when":"${WHEN.join("|")}"}]}
- "break": students leave campus (recess, vacation). "exams": reading period or final exams.
- "athletics": games and meets. "town": town or Palmer Square events. "student": concerts, shows, club events. "competition": hackathons, tournaments, club competitions.
- "when" is the part of the day the event brings people out: afternoon (12-5 PM), evening (5-9 PM), late (8-11 PM), or all.
- Only include events actually listed in the text. Never invent events.

Text:
"""
${String(text).slice(0, 12000)}
"""`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }]
      })
    });
    if (!r.ok) {
      res.status(502).json({ error: `AI request failed (${r.status})` });
      return;
    }
    const data = await r.json();
    const out = (data.content || []).map(c => c.text || "").join("");
    const json = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
    const events = (json.events || []).filter(e => TYPES.includes(e.type) && e.from && e.label);
    res.status(200).json({ events });
  } catch (err) {
    res.status(500).json({ error: "Couldn't read the AI response" });
  }
}
