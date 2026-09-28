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
  background_prompt?: string;
  image_prompt?: string;
  format?: string;
  preserve?: string[];
  change?: string[];
  model?: string;
  references?: Reference[];
  input_path?: string | null;
};
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
export async function visionBlock(blob: Blob) {
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
    response = await fetch("https://image-api.photoroom.com/v2/edit", {
      method: "POST",
      headers: { "x-api-key": Deno.env.get("PHOTOROOM_API_KEY")! },
      body: form,
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) throw new Error("Image provider failed");
    const blob = await response.blob();
    if (blob.type !== "image/jpeg" || blob.size > 15_000_000) {
      throw new Error("Invalid output");
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
  response = await fetch(
    `https://api.openai.com/v1/images/${
      inputs.length ? "edits" : "generations"
    }`,
    { method: "POST", headers, body, signal: AbortSignal.timeout(150_000) },
  );
  if (!response.ok) throw new Error("Image provider failed");
  const data = await response.json();
  const encoded = data.data?.[0]?.b64_json;
  if (typeof encoded !== "string" || encoded.length > 21_000_000) {
    throw new Error("Invalid output");
  }
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  if (!bytes.length || bytes.length > 15_000_000) {
    throw new Error("Invalid output");
  }
  return new Blob([bytes], { type: "image/jpeg" });
}

export function imagePrompt(proposal: Proposal) {
  const refs = proposal.references || [];
  return [
    proposal.image_prompt,
    "Modify only what is requested. Preserve: " +
    (proposal.preserve || []).join("; "),
    "Changes: " + (proposal.change || []).join("; "),
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
    "No invented watermarks, promotional claims or extra decorative elements. Match the requested visual medium; do not default to stock imagery.",
  ]
    .filter(Boolean)
    .join("\n");
}
