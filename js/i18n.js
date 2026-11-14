// English/Spanish for staff screens. Text lives in strings.js; elements with data-t="key"
// get their text from it, data-t-placeholder sets placeholders, data-t-aria sets aria-label.
import { STRINGS } from "./strings.js";

const LKEY = "frocast-lang";

export function lang() {
  try {
    return localStorage.getItem(LKEY) === "es" ? "es" : "en";
  } catch {
    return "en";
  }
}

export function setLang(l) {
  try {
    localStorage.setItem(LKEY, l === "es" ? "es" : "en");
  } catch {
    // storage unavailable: language resets on reload
  }
}

// t("clock.cookAt", { size: "½", time: "2:40" }) fills {size} and {time}.
export function t(key, vars) {
  const s = STRINGS[lang()]?.[key] ?? STRINGS.en[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? "")) : s;
}

export function applyStatic(root = document) {
  document.documentElement.lang = lang();
  root.querySelectorAll("[data-t]").forEach(el => { el.textContent = t(el.dataset.t); });
  root.querySelectorAll("[data-t-placeholder]").forEach(el => { el.placeholder = t(el.dataset.tPlaceholder); });
  root.querySelectorAll("[data-t-aria]").forEach(el => { el.setAttribute("aria-label", t(el.dataset.tAria)); });
}

// Wire a toggle button; onChange re-renders anything built in JS.
export function langToggle(button, onChange) {
  const label = () => { button.textContent = t("lang.toggle"); };
  label();
  button.addEventListener("click", () => {
    setLang(lang() === "es" ? "en" : "es");
    applyStatic();
    label();
    onChange?.();
  });
}
