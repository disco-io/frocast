// Reads every calendar source (feeds and web pages) on the server and returns dated events.
// Feeds (.ics) are parsed directly; web pages in any format are read by AI.
import { read } from "./_lib.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }
  const { sources = [], today = new Date().toISOString().slice(0, 10) } = req.body || {};
  const results = await Promise.all(sources.slice(0, 12).map(async s => {
    const base = { id: s.id, name: s.name, url: s.url };
    try {
      const { method, events } = await read(s, today);
      return { ...base, ok: true, method, events };
    } catch (err) {
      return { ...base, ok: false, error: err.message || "Failed" };
    }
  }));
  res.status(200).json({ results });
}
