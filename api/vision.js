// Topping-bar photo -> fill level per bin (prefill only; staff always confirm).
//   POST /api/vision { kind: "open" | "close", image: "data:image/jpeg;base64,...", scenario?, day? }
//   -> { available, photo_usable, problems, bins: [{ id, level, confidence, visible }], photoId, model }
// The photo is stored only if the check passed and no person is in the frame.
// Any failure returns { available: false } so the close-out falls back to the manual grid.
import { ready, LOCATION, now } from "./_lib/db.js";
import { requireDevice, sendError } from "./_lib/auth.js";
import { estimateBins, visionAvailable, PROBLEMS } from "./_lib/ai.js";
import { toppingsEnabled, parseDataUrl, purgeOld } from "./_lib/photos.js";
import { shopNow, isDay } from "./_lib/shop-time.js";
import { isLevel } from "../js/toppings-math.js";
import { DEMO_ESTIMATES } from "../js/demo-data.js";

const CONF = ["low", "medium", "high"];

export default async function handler(req, res) {
  try {
    if (!toppingsEnabled()) return sendError(res, 404, "Topping check is turned off");
    const device = await requireDevice(req);
    if (!device) return sendError(res, 401, "This device isn't paired");
    if (req.method !== "POST") return sendError(res, 405, "Use POST");
    const { kind, image } = req.body || {};
    if (!["open", "close"].includes(kind)) return sendError(res, 400, "kind must be open or close");
    const sample = req.body.scenario === "demo" && req.body.sample === true; // demo sample photo: no upload
    const photo = sample ? null : parseDataUrl(image);
    if (!sample && !photo) return sendError(res, 400, "Send the photo as a data URL");
    if (photo?.tooBig) return sendError(res, 413, "Photo is too large");

    const db = await ready();
    const scenario = req.body.scenario === "demo" ? "demo" : "live";
    const day = scenario === "demo" && isDay(req.body.day) ? req.body.day : shopNow().day;
    const bins = (await db.execute({ sql: "SELECT id, name, row_no, col_no FROM bins WHERE location_id = ? AND scenario = ? AND active = 1 ORDER BY row_no, col_no", args: [LOCATION, scenario] })).rows;
    if (!bins.length) return res.status(200).json({ available: false, reason: "no_bins" });
    // Demo "sample photo": canned estimates for the placeholder pair (labeled simulated, never stored).
    if (scenario === "demo" && req.body.sample === true) {
      const canned = DEMO_ESTIMATES[kind] || {};
      return res.status(200).json({
        available: true, photo_usable: true, problems: [], photoId: null, model: "sample (simulated)",
        bins: bins.map(b => canned[b.name] ? { id: b.id, level: canned[b.name][0], confidence: canned[b.name][1], visible: true } : { id: b.id, level: 0, confidence: "low", visible: false })
      });
    }
    if (!visionAvailable()) return res.status(200).json({ available: false, reason: "no_key" });

    let est;
    try {
      est = await estimateBins({ base64: photo.base64, mime: photo.mime, bins, kind });
    } catch (err) {
      console.error("vision", err.name, err.message);
      return res.status(200).json({ available: false, reason: err.name === "APIConnectionTimeoutError" ? "timeout" : "error" });
    }
    if (est.unavailable) return res.status(200).json({ available: false, reason: est.reason });

    // Keep only known bins and allowed values; anything missing becomes "needs a look".
    const byId = new Map((est.bins || []).map(b => [String(b.id), b]));
    const out = bins.map(b => {
      const e = byId.get(b.id);
      const ok = e && isLevel(e.level) && CONF.includes(e.confidence);
      return ok ? { id: b.id, level: Number(e.level), confidence: e.confidence, visible: !!e.visible } : { id: b.id, level: 0, confidence: "low", visible: false };
    });
    const problems = [...new Set((est.problems || []).filter(p => PROBLEMS.includes(p)))];
    const person = problems.includes("person_in_frame");
    const usable = !!est.photo_usable && !person;

    let photoId = null;
    if (usable) {
      photoId = crypto.randomUUID();
      await db.execute({
        sql: "INSERT INTO photos (id, location_id, scenario, day, kind, mime, data, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: [photoId, LOCATION, scenario, day, kind, photo.mime, Buffer.from(photo.base64, "base64"), photo.bytes, now()]
      });
      await purgeOld(db);
    }
    return res.status(200).json({ available: true, photo_usable: usable, problems, bins: out, photoId, model: est.model });
  } catch (err) {
    console.error("vision", err);
    return res.status(200).json({ available: false, reason: "error" });
  }
}
