// Topping-bar vision: photo + the owner's bin list -> fill level per bin, as JSON only.
// A close photo can come with the day's open photo and its confirmed levels as a yardstick (ref).
// Model: VISION_MODEL, default claude-opus-5-5 at low effort (VISION_EFFORT: low | medium | high).
// On drawn before/after photos of two bowls with a known answer (an earlier version of
// tools/testbar/bowls.mjs, 24 levels per run) Opus read 23-24 right at low and at medium effort,
// in about 2 s at low and 6 s at medium; Sonnet read 20 and Haiku 17. On the one-cup drawings it
// makes now (12 levels per run) Opus at low effort read 11 right in one run.
// Drawings only: re-run the scorer before changing these.
// VISION_STUB=<path to JSON> returns a canned answer (tests and offline demo).
import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { readFileSync } from "node:fs";

export const VISION_MODEL = process.env.VISION_MODEL || "claude-opus-5-5";
const EFFORT = ["low", "medium", "high"].includes(process.env.VISION_EFFORT) ? process.env.VISION_EFFORT : "low";
export const PROBLEMS = ["glare", "blur", "too_dark", "bins_cut_off", "view_blocked", "person_in_frame", "not_topping_bar"];

const SCHEMA = {
  type: "object",
  properties: {
    photo_usable: { type: "boolean" },
    problems: { type: "array", items: { type: "string", enum: PROBLEMS } },
    bins: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          level: { type: "number", enum: [0, 0.25, 0.5, 0.75, 1] },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          visible: { type: "boolean" }
        },
        required: ["id", "level", "confidence", "visible"],
        additionalProperties: false
      }
    }
  },
  required: ["photo_usable", "problems", "bins"],
  additionalProperties: false
};

const SYSTEM = `You check photos of topping containers at a frozen yogurt shop: the pans of the topping bar, or bowls or cups of toppings on a counter. Staff take one photo when the shop opens and one at close.
For each bin in the list, estimate how full its container is as a fraction of a full one: 0 (empty), 0.25, 0.5, 0.75 or 1 (full). A level is a height: how far up the container's depth the top of the food sits. It is not how much of the opening the food covers when seen from above (a bowl narrows toward the bottom, so a half-full bowl still shows a wide patch of food). At 1 the food reaches about the rim and almost no inside wall shows. At 0.5 the band of inside wall showing above the food is about as tall as the food is deep. At 0.25 the food is a shallow layer on the bottom with mostly bare wall above it. At 0 only scraps or the bare bottom are left.
Find each bin by what is in it when its name says so (for example "Strawberries"). When names don't settle it, use position: rows are numbered from the back (row 1) toward the camera, columns from left (1) to right as seen in the photo.
When an earlier photo from the same day is included, it was taken from the same spot and staff confirmed the levels in it. Use it as the yardstick: compare each container with the same container in the earlier photo, and work out the level now from how far the top of the food has dropped (how much more inside wall shows now) or risen after a refill. A container that looks unchanged keeps its earlier level.
Only estimate a bin you can actually see. If a bin is cut off, covered, blurry, or you can't tell which bin it is, set visible to false or confidence to "low". Do not guess.
Set photo_usable to false and list the problems if glare or reflections hide bins, the photo is blurry or too dark, bins are cut off, something blocks the view, the photo does not show the containers (not_topping_bar), or any person (face, body, arm or hand) is in the frame (person_in_frame).
Return every bin in the list exactly once, using its id.`;

const keyOk = () => {
  const k = process.env.ANTHROPIC_API_KEY;
  return !!k && k !== "paste-your-key-here";
};
export const visionAvailable = () => !!process.env.VISION_STUB || keyOk();

// Demo/testing only: the topping bar may be a picture on a screen (tools/testbar/viewer.html).
const SCREEN_NOTE = `Testing note: this photo may show the topping bar on a computer or TV screen. If it does, judge the topping bar shown on the screen as if it were the real bar, and ignore the screen frame, browser window, menu bar and desktop around it. Don't count the screen itself as not_topping_bar, glare or view_blocked; still report real problems with the bar as shown (glare on it, blur, darkness, bins cut off, a person).`;

const LEVEL_WORD = { 0: "empty", 0.25: "a quarter full", 0.5: "half full", 0.75: "three-quarters full", 1: "full" };

// ref (optional): { base64, mime, levels: { [binId]: level } } from the day's confirmed open check.
export async function estimateBins({ base64, mime, bins, kind, allowScreen = false, ref = null }) {
  if (process.env.VISION_STUB) return { ...JSON.parse(readFileSync(process.env.VISION_STUB, "utf8")), model: "stub" };
  if (!keyOk()) return { unavailable: true, reason: "no_key" };
  const client = new Anthropic({ timeout: 20000, maxRetries: 1 });
  const list = bins.map(b => `- id ${JSON.stringify(b.id)}: ${JSON.stringify(b.name)} (row ${b.row_no}, column ${b.col_no})`).join("\n");
  const intro = `This is the ${kind === "close" ? "closing" : "opening"} photo.${allowScreen ? ` ${SCREEN_NOTE}` : ""}`;
  const image = (m, data) => ({ type: "image", source: { type: "base64", media_type: m, data } });
  const before = ref ? bins.filter(b => ref.levels[b.id] != null).map(b => `- ${JSON.stringify(b.name)}: ${ref.levels[b.id]} (${LEVEL_WORD[ref.levels[b.id]] || "level"})`).join("\n") : "";
  const content = before
    ? [
      { type: "text", text: `Earlier photo from today's opening check, taken from the same spot. Staff confirmed these levels in it:\n${before}` },
      image(ref.mime, ref.base64),
      { type: "text", text: "Current photo:" },
      image(mime, base64),
      { type: "text", text: `${intro} Estimate the levels in the current photo, using the earlier photo as the yardstick. Bins:\n${list}` }
    ]
    : [image(mime, base64), { type: "text", text: `${intro} Bins:\n${list}` }];
  const msg = await client.messages.parse({
    model: VISION_MODEL,
    max_tokens: 8000,
    system: SYSTEM,
    messages: [{ role: "user", content }],
    output_config: { format: jsonSchemaOutputFormat(SCHEMA), effort: EFFORT }
  });
  if (msg.stop_reason === "refusal") return { unavailable: true, reason: "refusal" };
  if (msg.stop_reason === "max_tokens" || !msg.parsed_output) return { unavailable: true, reason: "bad_output" };
  return { ...msg.parsed_output, model: msg.model };
}
