// Daily housekeeping (Vercel cron, see vercel.json): delete topping photos older than the
// retention period in Settings (default 14 days). Confirmed numbers are kept.
// Vercel sends "Authorization: Bearer <CRON_SECRET>".
import { ready } from "./_lib/db.js";
import { sendError } from "./_lib/auth.js";
import { purgeOld } from "./_lib/photos.js";

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return sendError(res, 401, "Not allowed");
  try {
    const db = await ready();
    return res.status(200).json(await purgeOld(db));
  } catch (err) {
    console.error("cron", err);
    return sendError(res, 500, "Server error");
  }
}
