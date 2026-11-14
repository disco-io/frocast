// Topping-bar vision: photo + the owner's bin list -> fill level per bin, as JSON only.
// Uses the same model as the AI event import (ANTHROPIC_MODEL, default claude-haiku-5-5).
// VISION_STUB=<path to JSON> returns a canned answer (tests and offline demo).
import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";
import { readFileSync } from "node:fs";

export const VISION_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
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

const SYSTEM = `You check photos of the topping bar at a frozen yogurt shop. Staff take one photo when the shop opens and one at close.
For each bin in the list, estimate how full it is as a fraction of a full pan: 0 (empty), 0.25, 0.5, 0.75 or 1 (full).
Rows are numbered from the back of the bar (row 1) toward the camera. Columns are numbered from left (1) to right as seen in the photo.
Only estimate a bin you can actually see. If a bin is cut off, covered, blurry, or you can't tell which bin it is, set visible to false or confidence to "low". Do not guess.
Set photo_usable to false and list the problems if glare or reflections hide bins, the photo is blurry or too dark, bins are cut off, something blocks the view, the photo is not of a topping bar, or any person (face, body, arm or hand) is in the frame (person_in_frame).
Return every bin in the list exactly once, using its id.`;

const keyOk = () => {
  const k = process.env.ANTHROPIC_API_KEY;
  return !!k && k !== "paste-your-key-here";
};
export const visionAvailable = () => !!process.env.VISION_STUB || keyOk();

export async function estimateBins({ base64, mime, bins, kind }) {
  if (process.env.VISION_STUB) return { ...JSON.parse(readFileSync(process.env.VISION_STUB, "utf8")), model: "stub" };
  if (!keyOk()) return { unavailable: true, reason: "no_key" };
  const client = new Anthropic({ timeout: 20000, maxRetries: 1 });
  const list = bins.map(b => `- id ${JSON.stringify(b.id)}: ${JSON.stringify(b.name)} (row ${b.row_no}, column ${b.col_no})`).join("\n");
  const msg = await client.messages.parse({
    model: VISION_MODEL,
    max_tokens: 4000,
    system: SYSTEM,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mime, data: base64 } },
        { type: "text", text: `This is the ${kind === "close" ? "closing" : "opening"} photo. Bins:\n${list}` }
      ]
    }],
    output_config: { format: jsonSchemaOutputFormat(SCHEMA) }
  });
  if (msg.stop_reason === "refusal") return { unavailable: true, reason: "refusal" };
  if (msg.stop_reason === "max_tokens" || !msg.parsed_output) return { unavailable: true, reason: "bad_output" };
  return { ...msg.parsed_output, model: msg.model };
}
