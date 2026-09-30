import { personReferencePrompt, type PersonReference } from "./person-reference.ts";
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
  scene_workflow?: import("./scene-workflow.ts").SceneWorkflow;
  planning_references?: Reference[];
  operation: string;
  person_reference?: PersonReference;
  summary?: string;
  exact_text?: string[];
  background_prompt?: string;
  image_prompt?: string;
  format?: string;
  preserve?: string[];
  change?: string[];
  model?: string;
  visual_kind?: "photo" | "graphic";
  photo_treatment?: "natural" | "directed" | "unspecified";
  product_placement?: string;
  composition?: unknown;
  references?: Reference[];
  input_path?: string | null;
  series_size?: number;
  series_index?: number;
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
  const isSheet = proposal.person_reference?.mode === "sheet";
  const charter = isSheet || proposal.scene_workflow ? null : proposal.brand_context?.charter;
  const direction = (value: unknown) =>
    (typeof value === "string"
      ? value
      : Array.isArray(value)
      ? value.filter((part): part is string => typeof part === "string").join("; ")
      : "").trim().slice(0, 500);
  const style = direction(charter?.photo_style);
  const mood = direction(charter?.mood_keywords);
  const avoid = direction(charter?.visual_donts);
  const naturalPhoto = !isSheet && proposal.visual_kind === "photo" &&
    proposal.photo_treatment === "natural" &&
    !proposal.exact_text?.length;
  const productReference = refs.some((ref) => ref.role === "product");
  const productPlacement = proposal.product_placement?.trim();
  const productStaging = (proposal.operation === "product" || productReference)
    ? [
      "Stage the exact product in a physically plausible position for its shape and normal use. Show real contact with the confirmed supporting surface and a believable contact shadow; never balance it implausibly merely to expose a painted face. Use a hand only when the confirmed brief calls for one.",
      "A bowl normally rests base-down with its opening upward; a plate or shallow dish rests flat or is held. Only use an upright display when the confirmed brief explicitly asks for it and shows a plausible visible support.",
      "The product's support and orientation follow the confirmed placement. When inserting it into the supplied setting, match that setting's camera perspective, scale, light direction and color temperature. Keep perspective changes minimal and supported by the visible product reference; never invent an unseen face or flatten an incompatible view into the scene. A reference used only for mood or color does not dictate the camera.",
      "Show the perspective cues appropriate to the confirmed view: rim ellipse, visible wall or thin edge, thickness and contact shadow. Preserve the true shallow or deep profile; do not make a plate into a bowl. Keep the original markings on the same parts of the object, allowing natural foreshortening and occlusion instead of tilting it to expose every marking. Do not invent details of an unseen side.",
      productPlacement && (!isSeries || !proposal.series_index)
        ? `Confirmed product placement: ${productPlacement}. Follow this placement when other staging words are ambiguous.`
        : "",
    ].filter(Boolean).join(" ")
    : "";
  const detail = charter?.visual_direction && typeof charter.visual_direction === "object" && !Array.isArray(charter.visual_direction)
    ? charter.visual_direction as Record<string, unknown> : {};
  const photoDirection = [
    ["Composition", detail.composition], ["Lighting", detail.light],
    ["Framing", detail.framing], ["Retouching", detail.retouch],
  ].map(([label, value]) => direction(value) ? `${label}: ${direction(value)}` : "").filter(Boolean).join("; ");
  const referenceNotes = Array.isArray(charter?.mood_board_urls)
    ? charter.mood_board_urls.filter((item): item is Record<string, unknown> => !!item && typeof item === "object" && !Array.isArray(item))
      .slice(0, 12).map(item => ({ role: item.role, note: direction(item.note).slice(0, 300) })).filter(item => !!item.note)
    : [];
  const followNotes = referenceNotes.filter(item => item.role !== "avoid").map(item => item.note).slice(0, 5).join("; ");
  const avoidNotes = referenceNotes.filter(item => item.role === "avoid").map(item => item.note).slice(0, 5).join("; ");
  return [
    personReferencePrompt(proposal.person_reference && isSeries && !isSheet
      ? { ...proposal.person_reference, variable_details: proposal.summary || proposal.image_prompt || "" }
      : proposal.person_reference),
    // Number only after reference selection, sorting and edit-source deduplication.
    // This list uses the same order as the image[] payload in generateImage.
    proposal.input_path || refs.length ? "REFERENCE IMAGES" : "",
    proposal.input_path
      ? proposal.scene_workflow?.phase === "integration"
        ? "Image 1 is the approved scene to preserve during product integration."
        : "Image 1 is the selected version to edit. Keep the subject and features the brief asks to preserve; apply the requested changes to its setting and styling."
      : "",
    ...refs.map(
      (ref, i) =>
        `Image ${i + 1 + (proposal.input_path ? 1 : 0)}: ${ref.role} reference, ${ref.name}. ${referenceInstruction(ref.role)}${ref.role === "casting" && ref.description ? ` Saved identity description: ${ref.description}` : ""}`,
    ),
    proposal.summary
      ? `CONFIRMED BRIEF\n${proposal.summary}\nThis brief and the confirmed preservation and change lists govern the result. The technical instructions below only explain how to realize them; do not introduce unconfirmed subjects, props, actions, text or style changes.`
      : "",
    proposal.image_prompt ? `SHOT INSTRUCTIONS\n${proposal.image_prompt}` : "",
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
    proposal.scene_workflow?.phase === "scene"
      ? "SCENE PREPARATION ONLY. Create the confirmed setting, including any confirmed person or hand, with a physically usable area for the future product. Do not render that product or a placeholder. No text or logos. Preserve the confirmed photographic composition and camera; do not add decorative props."
      : productStaging,
    proposal.scene_workflow?.phase === "integration"
      ? "PRODUCT INTEGRATION. Image 1 is the approved scene, not a loose style reference. Preserve its camera, framing, person, surfaces and background. Integrate only the exact original product from the product references. If it is already present in the selected image, adjust that existing instance as requested; never add a duplicate. Preserve silhouette, proportions, material, color, motif placement, logo and lettering. Adapt only placement, physically necessary occlusion, local reflections, light and contact shadows. Do not redesign the scene or add decorations. Keep everything else unchanged."
      : "",
    refs.length > 1
      ? "Several reference photos may show one subject from different angles. When the brief identifies them as the same person or product, combine their evidence into one subject; do not add a separate copy for each reference. Keep style-only references distinct from identity references."
      : "",
    style || mood || avoid || photoDirection || followNotes || avoidNotes
      ? `Brand visual direction from the confirmed charter: ${[
        style ? `Visual style: ${style}` : "",
        mood ? `Mood: ${mood}` : "",
        avoid ? `Avoid: ${avoid}` : "",
        followNotes ? `Reference notes to follow: ${followNotes}` : "",
        avoidNotes ? `Reference notes to avoid: ${avoidNotes}` : "",
        photoDirection,
      ].filter(Boolean).join("; ")}. Apply it where compatible with this shot. The user's specific request and exact person or product references take priority; never recolor or reshape them merely to fit the brand. Confirmed product placement takes priority over brand composition advice.`
      : "",
    naturalPhoto
      ? "Natural photograph with coherent light, plausible contact and credible material and skin textures. Follow the confirmed camera style, contrast, grain, depth of field and composition. Do not automatically simplify the setting or add imperfections, blur, beauty retouching or decorative props. Preserve the requested accessories and photographic hierarchy. Exact person and product references take priority."
      : "",
    "No invented watermarks, promotional claims or extra decorative elements. Preserve authentic product lettering and logos when present in the reference. Match the requested visual medium; do not default to stock imagery.",
    proposal.operation === "edit" && !isSheet
      ? "Keep everything else unchanged. Do not alter the camera or rearrange the scene for a texture-only or lighting-only correction."
      : "",
    isSeries && !isSheet
      ? "Produce ONE image for this shot, not a collage. Its camera framing, crop and pose must follow this shot's brief even when the reference uses a different framing. Shot brief: " + proposal.image_prompt
      : "",
    isSheet ? "No text or labels." : "",
  ]
    .filter(Boolean)
    .join("\n");
}
