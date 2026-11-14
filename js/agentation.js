// Developer-only feedback toolbar (Agentation, agentation.com): click anything on the page,
// write a note, and the coding agent reads the notes from the local Agentation server
// (npx -y agentation-mcp server, port 4747). Off unless you turn it on, so it can never show
// up in a demo by accident:
//   on:   add ?agentation=1 to any page on localhost (stays on for that browser tab)
//   off:  add ?agentation=0, or close the tab
// It never loads on the deployed site, on a phone over Wi-Fi, or inside the demo page's
// frames (the toolbar on the outer page can annotate inside them).
// The site has no React and no build step, so React and the toolbar come from the esm.sh CDN.
const KEY = "frocast-agentation";
const ENDPOINT = "http://localhost:4747";
const REACT = "18.3.1",
  TOOLBAR = "3.1.2";

function wanted() {
  try {
    const ask = new URLSearchParams(location.search).get("agentation");
    if (ask === "1") sessionStorage.setItem(KEY, "1");
    if (ask === "0") sessionStorage.removeItem(KEY);
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false; // storage blocked: stay off
  }
}

async function mount() {
  try {
    const [React, { createRoot }, { Agentation }] = await Promise.all([
      import(`https://esm.sh/react@${REACT}`),
      import(`https://esm.sh/react-dom@${REACT}/client`),
      import(
        `https://esm.sh/agentation@${TOOLBAR}?deps=react@${REACT},react-dom@${REACT}`
      ),
    ]);
    const host = document.createElement("div");
    host.id = "agentation-root";
    document.body.appendChild(host);
    createRoot(host).render(
      React.createElement(Agentation, {
        endpoint: ENDPOINT,
        appName: "FroCast",
      }),
    );
  } catch (err) {
    console.warn("Agentation toolbar did not load (offline?)", err);
  }
}

const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
if (local && window.top === window && wanted()) mount();
