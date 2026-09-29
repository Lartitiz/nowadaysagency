import { encodeBase64 } from "https://deno.land/std@0.224.0/encoding/base64.ts";
import { openaiImageModel } from "../_shared/openai-image-model.ts";
import { referenceInstruction, type ReferenceRole } from "./competencies.ts";
export type Reference = {
  id: string;
  photo_id: string | null;
  role: ReferenceRole;
  path: string;
  name: string;
  kind?: string;
  memory_id?: string;
  version_id?: string;
  description?: string;
};
export type Proposal = {
  operation: string;
  summary?: string;
  exact_text?: string[];
  background_prompt?: string;
  image_prompt?: string;
  format?: string;
  preserve?: string[];
  change?: string[];
  model?: string;
  visual_kind?: "photo" | "graphic";
  composition?: unknown;
  references?: Reference[];
  input_path?: string | null;
  series_size?: number;
  brand_context?: { charter?: Record<string, unknown> | null };
};
/** The request may have reached the image provider; repeating it may incur another charge. */
export class ProviderOutcomeUncertainError extends Error {
  constructor() {
    super("Image provider outcome unknown");
    this.name = "ProviderOutcomeUncertainError";
  }
}
async function providerResponse(url: string, init: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new ProviderOutcomeUncertainError();
  }
  // A 4xx response explicitly rejects the request. A server error is less conclusive.
  if (!response.ok) {
    if (response.status >= 500) throw new ProviderOutcomeUncertainError();
    throw new Error("Image provider rejected request");
  }
  return response;
}
export function legacyReferences(session: {
  references?: Reference[];
  source_path: string | null;
  source_photo_id: string | null;
  name: string;
  source_metadata: { kind?: string; description?: string };
}): Reference[] {
  return (
    session.references ??
      (session.source_path && session.source_photo_id
        ? [
          {
            id: session.source_photo_id,
            photo_id: session.source_photo_id,
            path: session.source_path,
            role: "subject",
            name: session.name,
            ...session.source_metadata,
          },
        ]
        : [])
  );
}
export async function visionBlock(
  blob: Blob,
  resize?: (width: number) => Promise<Blob | null>,
) {
  // Keep the original for image generation. Only the interpreter sees a resized copy.
  if (blob.size > 5_000_000 && resize) {
    for (const width of [2048, 1600, 1200]) {
      const candidate = await resize(width);
      if (candidate && /^image\/(jpeg|png|webp)$/.test(candidate.type) &&
        candidate.size <= 5_000_000) {
        blob = candidate;
        break;
      }
    }
  }
  // Anthropic image limit is 5 MB; fail explicitly rather than pretending to have seen it.
  if (blob.size > 5_000_000) throw new Error("studio_image_too_large");
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: blob.type,
      data: encodeBase64(await blob.arrayBuffer()),
    },
  };
}
export function imageModel(operation: string) {
  return operation === "background" ? "photoroom-v2" : openaiImageModel(
    ["product", "edit"].includes(operation) ? "product" : "slide",
  );
}
export async function generateImage(proposal: Proposal, inputs: Blob[]) {
  let response: Response;
  if (proposal.operation === "background") {
    if (!inputs[0]) throw new Error("Source missing");
    const form = new FormData();
    form.append("imageFile", inputs[0], "source.jpg");
    form.append("referenceBox", "originalImage");
    form.append("background.prompt", proposal.background_prompt!);
    form.append("removeBackground", "true");
    form.append("outputSize", "originalImage");
    form.append("export.format", "jpeg");
    response = await providerResponse("https://image-api.photoroom.com/v2/edit", {
      method: "POST",
      headers: { "x-api-key": Deno.env.get("PHOTOROOM_API_KEY")! },
      body: form,
      signal: AbortSignal.timeout(90_000),
    });
    const blob = await response.blob().catch(() => { throw new ProviderOutcomeUncertainError(); });
    if (blob.type !== "image/jpeg" || blob.size > 15_000_000) {
      throw new ProviderOutcomeUncertainError();
    }
    return blob;
  }
  const prompt = imagePrompt(proposal);
  const size = proposal.format === "landscape"
    ? "1536x1024"
    : proposal.format === "portrait"
    ? "1024x1536"
    : "1024x1024";
  const options = {
    model: proposal.model || imageModel(proposal.operation),
    prompt,
    size,
    quality: "high",
    output_format: "jpeg",
  };
  const headers: Record<string, string> = {
    Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
  };
  let body: BodyInit;
  if (inputs.length) {
    const form = new FormData();
    for (const [key, value] of Object.entries(options)) form.append(key, value);
    inputs.forEach((blob, i) =>
      form.append(
        "image[]",
        blob,
        `reference-${i}.${
          blob.type === "image/png"
            ? "png"
            : blob.type === "image/webp"
            ? "webp"
            : "jpg"
        }`,
      )
    );
    body = form;
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({ ...options, n: 1 });
  }
  response = await providerResponse(
    `https://api.openai.com/v1/images/${
      inputs.length ? "edits" : "generations"
    }`,
    { method: "POST", headers, body, signal: AbortSignal.timeout(150_000) },
  );
  const data = await response.json().catch(() => { throw new ProviderOutcomeUncertainError(); });
  const encoded = data?.data?.[0]?.b64_json;
  if (typeof encoded !== "string" || encoded.length > 21_000_000) {
    throw new ProviderOutcomeUncertainError();
  }
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  } catch {
    throw new ProviderOutcomeUncertainError();
  }
  if (!bytes.length || bytes.length > 15_000_000) {
    throw new ProviderOutcomeUncertainError();
  }
  const output = new ArrayBuffer(bytes.length);
  new Uint8Array(output).set(bytes);
  return new Blob([output], { type: "image/jpeg" });
}

export function imagePrompt(proposal: Proposal) {
  const refs = proposal.references || [];
  const isSeries = (proposal.series_size || 1) > 1;
  const charter = proposal.brand_context?.charter;
  const direction = (value: unknown) =>
    (typeof value === "string"
      ? value
      : Array.isArray(value)
      ? value.filter((part): part is string => typeof part === "string").join("; ")
      : "").trim().slice(0, 500);
  const style = direction(charter?.photo_style);
  const mood = direction(charter?.mood_keywords);
  const avoid = direction(charter?.visual_donts);
  const detail = charter?.visual_direction && typeof charter.visual_direction === "object" && !Array.isArray(charter.visual_direction)
    ? charter.visual_direction as Record<string, unknown> : {};
  const photoDirection = [
    ["Composition", detail.composition], ["Lighting", detail.light],
    ["Framing", detail.framing], ["Retouching", detail.retouch],
  ].map(([label, value]) => direction(value) ? `${label}: ${direction(value)}` : "").filter(Boolean).join("; ");
  return [
    proposal.image_prompt,
    proposal.exact_text?.length
      ? `Render exactly this text in the image, once each, clearly and legibly: ${proposal.exact_text.map((item) => JSON.stringify(item)).join("; ")}. Do not invent dates, prices, addresses, claims, extra letters, or a different logo. Check spelling and accents.`
      : "",
    (proposal.operation === "create"
      ? "Create a new photograph or artwork following this shot's brief. Reference images define only their stated roles; do not copy their camera framing or pose unless requested. Preserve: "
      : "Modify only what is requested. Preserve: ") +
    (proposal.preserve || []).join("; "),
    // Series snapshots share the plan's change list, which may describe other shots.
    // Each shot's complete image_prompt is the authority for its framing and pose.
    !isSeries ? "Changes: " + (proposal.change || []).join("; ") : "",
    proposal.input_path
      ? "Image 1 is the selected version to edit. Keep its other features."
      : "",
    ...refs.map(
      (ref, i) =>
        `Image ${
          i + 1 + (proposal.input_path ? 1 : 0)
        }: ${ref.role} reference, ${ref.name}. ${
          referenceInstruction(ref.role)
        }`,
    ),
    refs.length > 1
      ? "Several reference photos may show one subject from different angles. When the brief identifies them as the same person or product, combine their evidence into one subject; do not add a separate copy for each reference. Keep style-only references distinct from identity references."
      : "",
    style || mood || avoid || photoDirection
      ? `Brand visual direction from the confirmed charter: ${[
        style ? `Visual style: ${style}` : "",
        mood ? `Mood: ${mood}` : "",
        avoid ? `Avoid: ${avoid}` : "",
        photoDirection,
      ].filter(Boolean).join("; ")}. Apply it where compatible with this shot. The user's specific request and exact person or product references take priority; never recolor or reshape them merely to fit the brand.`
      : "",
    "No invented watermarks, promotional claims or extra decorative elements. Match the requested visual medium; do not default to stock imagery.",
    isSeries
      ? "Produce ONE image for this shot, not a collage. Its camera framing, crop and pose must follow this shot's brief even when the reference uses a different framing. Shot brief: " + proposal.image_prompt
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
