// Device pairing + owner PIN.
//   GET  /api/auth                         -> { paired, device, owner }
//   POST /api/auth { action: "pair", pin, name }   pair this device (also starts an owner session)
//   POST /api/auth { action: "owner", pin }        owner session on a paired device (12 h)
//   POST /api/auth { action: "owner-off" }         end the owner session
//   GET  /api/auth?devices=1                (owner) list paired devices
//   POST /api/auth { action: "revoke", id } (owner) un-pair a device
import { ready, LOCATION, now } from "./_lib/db.js";
import { requireDevice, requireOwner, isSecure, ipHash, tooManyFails, recordAttempt, pinMatches, sendError, FAIL_WINDOW_MIN } from "./_lib/auth.js";
import { sign, cookieHeader, DEVICE_COOKIE, OWNER_COOKIE, DEVICE_DAYS, OWNER_HOURS } from "./_lib/token.js";

async function ownerCookie(req) {
  const exp = Date.now() + OWNER_HOURS * 3600 * 1000;
  return cookieHeader(OWNER_COOKIE, await sign(`o|${LOCATION}|${exp}`), OWNER_HOURS * 3600, isSecure(req));
}

async function checkPin(req, res, db, pin) {
  const hash = await ipHash(req);
  if (await tooManyFails(db, hash)) {
    sendError(res, 429, `Too many wrong PINs. Try again in ${FAIL_WINDOW_MIN} minutes.`);
    return false;
  }
  const ok = await pinMatches(pin);
  await recordAttempt(db, hash, ok);
  if (!ok) sendError(res, 401, "Wrong PIN");
  return ok;
}

export default async function handler(req, res) {
  try {
    const db = await ready();
    if (req.method === "GET") {
      const device = await requireDevice(req);
      const owner = !!(device && (await requireOwner(req)));
      if (req.query?.devices) {
        if (!owner) return sendError(res, 403, "Owner PIN required");
        const r = await db.execute({ sql: "SELECT id, name, created_at, last_seen_at, revoked_at FROM devices WHERE location_id = ? ORDER BY created_at DESC", args: [LOCATION] });
        return res.status(200).json({ devices: r.rows.map(row => ({ ...row, current: row.id === device.id })) });
      }
      return res.status(200).json({ paired: !!device, device, owner, location: LOCATION });
    }
    if (req.method !== "POST") return sendError(res, 405, "Use GET or POST");

    const { action, pin, name, id } = req.body || {};
    if (action === "pair") {
      if (!(await checkPin(req, res, db, pin))) return;
      const deviceId = crypto.randomUUID();
      const label = String(name || "Staff device").trim().slice(0, 40) || "Staff device";
      await db.execute({ sql: "INSERT INTO devices (id, location_id, name, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)", args: [deviceId, LOCATION, label, now(), now()] });
      res.setHeader("Set-Cookie", [
        cookieHeader(DEVICE_COOKIE, await sign(`d|${LOCATION}|${deviceId}`), DEVICE_DAYS * 86400, isSecure(req)),
        await ownerCookie(req)
      ]);
      return res.status(200).json({ paired: true, device: { id: deviceId, name: label }, owner: true });
    }

    const device = await requireDevice(req);
    if (!device) return sendError(res, 401, "This device isn't paired");

    if (action === "owner") {
      if (!(await checkPin(req, res, db, pin))) return;
      res.setHeader("Set-Cookie", await ownerCookie(req));
      return res.status(200).json({ owner: true });
    }
    if (action === "owner-off") {
      res.setHeader("Set-Cookie", cookieHeader(OWNER_COOKIE, "", 0, isSecure(req)));
      return res.status(200).json({ owner: false });
    }
    if (action === "revoke") {
      if (!(await requireOwner(req))) return sendError(res, 403, "Owner PIN required");
      await db.execute({ sql: "UPDATE devices SET revoked_at = ? WHERE id = ? AND location_id = ? AND revoked_at IS NULL", args: [now(), String(id || ""), LOCATION] });
      return res.status(200).json({ revoked: String(id || "") });
    }
    return sendError(res, 400, "Unknown action");
  } catch (err) {
    console.error("auth", err);
    return sendError(res, 500, err.message?.includes("not set") ? err.message : "Server error");
  }
}
