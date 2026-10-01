import type { Proposal } from "./media.ts";
import { imageInputPaths, photoSourcePath } from "./photo-preservation.ts";
import { referenceInstruction } from "./competencies.ts";

/** A provider-sized rendering of the same confirmed integration data. Never
 * shorten user fields or rewrite the approved technical instructions. Generic
 * rules appear once and apply only to subjects actually present in the manifest. */
export function compactIntegrationPrompt(p: Proposal): string | null {
  const workflow = p.scene_workflow;
  if (workflow?.phase !== "integration" || !p.input_path ||
    (p.series_size || 1) > 1 || p.person_reference?.mode === "sheet") return null;
  const refs = p.references || [];
  const paths = imageInputPaths(p);
  const subsequent = !!workflow.approved_scene_id && p.input_path !== workflow.scene_path;
  const person = !!p.person_reference || refs.some(r => ["person", "casting", "person_product"].includes(r.role));
  const product = refs.some(r => ["product", "person_product"].includes(r.role));
  const source = photoSourcePath(p);
  const role = (r: typeof refs[number]) => {
    if (["person", "casting"].includes(r.role)) return "Exact identity, face, hair and build; not its lighting or pose.";
    if (r.role === "product") return "Exact product shape, proportions, materials, colors, markings and lettering; not its lighting.";
    if (r.role === "person_product") return "Exact person AND product; not their reference lighting or pose.";
    return referenceInstruction(r.role);
  };
  return [
    "TARGETED PHOTO EDIT. Edit Image 1 only. The confirmed brief and current Changes govern; technical instructions explain them without adding decisions. Preserve everything else, including accepted corrections.",
    ...refs.map((r, i) => `Image ${i + 2}: ${r.role} reference, ${r.name}. ${role(r)}${r.role === "casting" && r.description ? ` Saved identity description: ${r.description}` : ""}`),
    source ? `Image ${paths.indexOf(source) + 1}: photographic source for camera, framing, background, surfaces, light direction/hardness, contrast, temperature, grain and depth of field. Only an explicit confirmed lighting/style change overrides the matching property; a reference or brand style does not.` : "",
    workflow.scene_path && workflow.scene_path !== p.input_path && workflow.scene_path !== source
      ? `Image ${paths.indexOf(workflow.scene_path) + 1}: approved original scene, preservation anchor only; do not restore provisional subjects or undo accepted corrections.` : "",
    p.summary ? `CONFIRMED BRIEF\n${p.summary}` : "",
    p.image_prompt ? `SHOT INSTRUCTIONS\n${p.image_prompt}` : "",
    p.preserve?.length ? `Preserve: ${p.preserve.join("; ")}` : "",
    p.change?.length ? `Changes: ${p.change.join("; ")}` : "",
    p.exact_text?.length ? `Render exactly once, legibly, with correct accents: ${p.exact_text.map(t => JSON.stringify(t)).join("; ")}. No additional text.` : "",
    p.product_placement?.trim() ? `Confirmed product placement: ${p.product_placement.trim()}` : "",
    workflow.targets?.length ? [
      subsequent ? "SUBJECT ANCHORS ALREADY INTEGRATED. Apply only current Changes; do not repeat initial replacements." : "AUTHORIZED TARGETS. Replace EVERY listed provisional subject from its originals; never duplicate it.",
      ...workflow.targets.map(t => `${t.location}: ${subsequent ? t.role : t.instruction} Sources: ${t.reference_ids.map(id => {
        const i = refs.findIndex(r => r.id === id);
        return i < 0 ? "missing original (do not invent)" : `Image ${i + 2}`;
      }).join(", ")}`),
    ].join("\n") : "",
    workflow.accepted_changes?.length ? `PREVIOUSLY ACCEPTED CHOICES (current Changes take precedence): ${workflow.accepted_changes.join("; ")}` : "",
    p.person_reference ? `IDENTITY — ${p.person_reference.name}\n${p.person_reference.stable_traits}\nSCENE CHOICES\n${p.person_reference.variable_details}` : "",
    person ? "Use each original identity, not provisional features. Keep approved pose/outfit unless changed. Match source lighting to the new morphology; preserve natural skin, facial shadows and anatomy. No automatic fill/frontal light, beauty smoothing, reshaping, invented blemishes or aging. When only a product changes, keep the person unchanged." : "",
    product ? "Keep product profile and markings, including authentic logos. Match source perspective, scale, reflections, occlusions and contact shadows. Use plausible support/orientation; do not invent unseen faces or tilt an object merely to show markings. Use hands only if requested." : "",
    refs.length > 1 ? "Multiple views of one subject remain ONE subject. Keep distinct identities separate; style references never define identity." : "",
    "Allow only necessary local junctions, contact and perspective adjustments. No invented props, claims, watermarks, blur or grain; preserve the confirmed medium and photographic texture. Do not restore earlier provisional subjects.",
  ].filter(Boolean).join("\n");
}
