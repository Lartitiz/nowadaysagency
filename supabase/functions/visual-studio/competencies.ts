/** Small, versioned contracts shared by planning, source validation and execution. */
export const RULES_VERSION = "studio-competencies-10-photographic-direction";
export const MAX_REFERENCES = 8;
export const REFERENCE_ROLES = [
  "person_product",
  "auto",
  "scene",
  "edit_source",
  "subject",
  "product",
  "person",
  "casting",
  "style",
  "composition",
  "logo",
] as const;
export type ReferenceRole = typeof REFERENCE_ROLES[number];
export function isIdentity(role: string) {
  return ["subject", "product", "person", "casting", "person_product"].includes(role);
}
export function referenceInstruction(role: string) {
  switch (role) {
    case "scene":
    case "edit_source":
      return "This is the exact base photograph to edit. Preserve it outside the explicitly requested changes.";
    case "person_product":
      return "Use this image for BOTH the exact person identity and the exact product. Preserve each separately; do not copy its setting unless requested.";
    case "product":
      return "Preserve this exact product: geometry, material, color, seams, markings and proportions. Do not borrow its background or the identity of anyone wearing it. Keep its orientation and support physically plausible for its shape and ordinary use.";
    case "person":
      return "Preserve the identity of this real person, including distinctive features. Do not beautify, rejuvenate or reshape their body unless explicitly requested.";
    case "casting":
      return "Use this approved fictional model identity. Keep facial features and silhouette consistent; outfit, hairstyle and scene follow the current brief.";
    case "subject":
      return "Preserve its real identity, geometry, material, colors and markings.";
    case "logo":
      return "This is an exact brand asset, not an identity reference. Do not invent or redraw it. Leave room for its editable placement.";
    case "style":
      return "Use only the requested setting, light, palette or mood. Do not copy its foreground props, product identity, product orientation or arrangement unless the brief explicitly asks for them.";
    case "composition":
      return "Use its framing and layout only where compatible with the product's shape and a physically plausible support. Do not copy its identity or force the product into an unsupported pose.";
    default:
      return "Use only for the stated role, not as a person or product identity.";
  }
}
export const COMPETENCIES = [
  {
    id: "advice",
    method: "advise",
    rule: "Une question peut appeler un conseil sans image ni source.",
  },
  {
    id: "background",
    method: "background",
    rule:
      "Conserver les pixels du sujet ; vérifier le détourage. Ne pas annoncer une nouvelle expression ou lumière du sujet.",
  },
  {
    id: "product",
    method: "product",
    rule:
      "La référence produit fait autorité pour forme, matière, logos et proportions. Vérifier produit et personne séparément.",
  },
  {
    id: "portrait",
    method: "edit",
    rule:
      "Une édition générative peut redessiner des traits. Aucune correction corporelle automatique. Les expressions précises restent expérimentales, pas promises.",
  },
  {
    id: "casting",
    method: "create",
    rule:
      "Créer une identité fictive réutilisable mobilise la méthode person_reference : planche neutre, traits stables et vues lisibles ; une scène avec un mannequin existant utilise ses références validées. Son enregistrement pour la marque est une action explicite distincte.",
  },
  {
    id: "illustration",
    method: "create",
    rule:
      "La création sans sujet réel à reproduire ne requiert aucune photo. Respecter le médium et le style demandés.",
  },
  {
    id: "revision",
    method: "edit",
    rule:
      "Modifier la version sélectionnée en conservant les références approuvées ; ne pas confondre cette itération et une nouvelle préférence durable.",
  },
] as const;
/** Metadata search terms only: never interpolate raw chat text into PostgREST filters. */
export function searchTerms(message: string) {
  const stop = new Set([
    "avec",
    "dans",
    "pour",
    "cette",
    "photos",
    "photo",
    "image",
    "images",
    "faire",
    "veux",
    "voudrais",
    "cherche",
    "montre",
    "peux",
    "comme",
    "même",
    "meme",
    "plus",
    "sans",
    "marque",
    "bibliothèque",
  ]);
  return [
    ...new Set(
      (message.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) || []).filter((s) =>
        !stop.has(s)
      ),
    ),
  ].slice(0, 6);
}
