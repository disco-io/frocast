// Vercel-style function: pulls dated events out of pasted calendar text with Claude.
// Needs the ANTHROPIC_API_KEY environment variable (set it in .env, or in Vercel; never commit it).
import { extract } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }
  const { text = "", today = new Date().toISOString().slice(0, 10) } = req.body || {};
  if (!text.trim()) {
    res.status(400).json({ error: "No text" });
    return;
  }
  try {
    res.status(200).json({ events: await extract(text, today) });
  } catch (err) {
    res.status(500).json({ error: err.message || "Couldn't read the AI response" });
  }
}
