// Dashboard links for features behind flags: the topping bar check shows only when
// TOPPING_CAMERA is on. Offline or flag off: the link stays hidden.
import { call } from "./api.js";

const link = document.getElementById("toppingsLink");
if (link) {
  call("/api/toppings?flags=1").then(r => {
    if (r.ok && r.data?.enabled) link.hidden = false;
  });
}
