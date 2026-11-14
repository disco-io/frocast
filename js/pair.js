// Pairing screen: the owner types the PIN once and this device stays set up.
import { applyStatic, langToggle, t } from "./i18n.js";
import { call, safeNext } from "./api.js";

const $ = id => document.getElementById(id);
const next = safeNext(new URLSearchParams(location.search).get("next"));

function say(text, color) {
  const el = $("pMsg");
  el.style.color = color === "red" ? "var(--red)" : "var(--mint)";
  el.textContent = text;
}

async function init() {
  applyStatic();
  langToggle($("lang"));
  const status = await call("/api/auth");
  if (status.ok && status.data?.paired) location.replace(next);

  $("pairForm").addEventListener("submit", async e => {
    e.preventDefault();
    $("pGo").disabled = true;
    const r = await call("/api/auth", { method: "POST", body: { action: "pair", pin: $("pPin").value, name: $("pName").value || t("pair.namePh") } });
    $("pGo").disabled = false;
    if (r.ok) {
      say(t("pair.done"));
      location.replace(next);
    } else if (r.status === 401) {
      say(t("pair.wrong"), "red");
      $("pPin").select();
    } else if (r.status === 429) {
      say(t("pair.locked"), "red");
    } else if (r.status === 0) {
      say(t("pair.offline"), "red");
    } else {
      say(t("pair.error", { msg: r.data?.error || r.status }), "red");
    }
  });
}

init();
