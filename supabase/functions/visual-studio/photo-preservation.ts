import type { Proposal } from "./media.ts";

/** Shared by preparation and the final provider prompt; never rely on a rewrite retaining it. */
export const PHOTO_PRESERVATION = `PRÉSERVATION PHOTOGRAPHIQUE PAR DÉFAUT
Ces règles s'appliquent à la modification d'une image existante. Une demande explicite et confirmée de changement d'éclairage ou de style prime sur les règles de conservation correspondantes, et seulement sur celles-ci. Une référence de mannequin, de produit ou la charte de marque ne constitue pas à elle seule une telle demande.
Effectue uniquement les modifications demandées. Préserve le rendu photographique de l'image source : direction et dureté de la lumière, contraste entre ombre et lumière, température de couleur, grain et profondeur de champ.
Si la personne change, adapte les ombres à sa morphologie en conservant les conditions lumineuses de la source. Maintiens les ombres naturelles du nez, des arcades, des cheveux et du menton. Ne débouche pas automatiquement les zones sombres. N'ajoute pas d'éclairage frontal ou de retouche beauté.
Préserve les pores discrets, les ridules et les variations naturelles de la peau, sans lissage ni accentuation excessive. N'invente pas de grain, de rides ou d'imperfections absents des références.
Intègre les produits avec des reflets, des ombres portées et des ombres de contact cohérents avec cette même lumière. Respecte leurs caractéristiques visuelles.
Tout élément qui ne fait pas l'objet d'une modification demandée doit rester aussi fidèle que possible à l'original. Si seul le produit change, conserve le visage, l'identité, l'expression, les ombres du visage et sa texture de peau ; adapte uniquement les contacts ou occultations nécessaires autour du produit. La présence d'une référence d'identité n'autorise pas à remplacer de nouveau la personne.`;

export function preservesPhoto(p: Proposal) {
  return !!p.input_path && ["edit", "product"].includes(p.operation) &&
    p.visual_kind !== "graphic" && p.person_reference?.mode !== "sheet";
}

export function photoSourcePath(p: Proposal): string | undefined {
  if (!preservesPhoto(p)) return undefined;
  return p.photo_source_path ||
    (p.scene_workflow?.phase === "integration" ? p.scene_workflow.scene_path : undefined) || p.input_path!;
}

/** Inherit only from the selected edit branch, never from an unrelated reference. */
export function inheritedPhotoSource(p: Proposal, parent?: { result_path: string; proposal: Proposal } | null) {
  if (!preservesPhoto(p)) return undefined;
  return parent && parent.result_path === p.input_path ? photoSourcePath(parent.proposal) || p.input_path! : p.input_path!;
}

/** One manifest for storage reads, prompt numbering and the multipart count. Keep
 * reference aliases: their IDs may belong to separate target mappings. */
export function imageInputPaths(p: Proposal): string[] {
  const paths = [...(p.input_path ? [p.input_path] : []), ...(p.references || []).map(r => r.path)];
  const source = photoSourcePath(p) ||
    (p.scene_workflow?.phase === "integration" ? p.scene_workflow.scene_path : undefined);
  if (source && !paths.includes(source)) paths.push(source);
  return paths;
}

export function photographicReferencePrompt(p: Proposal) {
  const source = photoSourcePath(p);
  if (!source) return "";
  const number = imageInputPaths(p).indexOf(source) + 1;
  return `Image ${number} is the PRIMARY PHOTOGRAPHIC SOURCE: composition, lighting, shadows, colors, texture and atmosphere. Its lighting takes priority over the lighting of identity, product and style references unless the confirmed user request explicitly changes lighting or style. Edit Image 1, keeping all accepted corrections; the original source is not a request to restore provisional people or products.
${(p.references || []).map((r, i) => {
    const label = `Image ${i + 2}`;
    const person = ["person", "casting", "person_product"].includes(r.role);
    const product = ["product", "person_product"].includes(r.role);
    return [person ? `${label}: IDENTITY ONLY — use the person's identity and traits, not their reference lighting. Relight the person within the source scene; do not transfer the portrait's soft or frontal illumination.` : "",
      product ? `${label}: PRODUCT — exact shape, proportions, colors, materials and patterns. Adapt reflections, cast shadows and contact shadows to the source lighting, not the product photo's lighting.` : ""].filter(Boolean).join("\n");
  }).filter(Boolean).join("\n")}
${PHOTO_PRESERVATION}`;
}
