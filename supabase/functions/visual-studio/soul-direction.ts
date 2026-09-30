import type { Proposal } from "./media.ts";

export type SoulStyle = { id: string; name: string; description: string; preview_url?: string; description_fr?: string };
// Soul 2's official API playground uses a distinct 33-style catalogue.
// Curated IDs and previews observed in its rendered preset selector on 2026-09-30:
// https://open.higgsfield.ai/models/higgsfield-ai/soul/v2/standard/playground
// These French directions are our labels, not provider promises. Do not substitute
// the legacy /v1/text2image/soul-styles catalogue: its General ID returned HTTP 400.
export const SOUL2_STYLES: SoulStyle[] = [
  {
    "id": "3db34ab5-3439-4317-9e03-08dc30852e69",
    "name": "General",
    "preview_url": "https://cdn.higgsfield.ai/soul-v2-style/f33d85f2-6521-4fa8-8e8f-894cfbdee578.webp",
    "description": "Rendu photographique équilibré, sans effet de style marqué.",
    "description_fr": "Rendu photographique équilibré, sans effet de style marqué."
  },
  {
    "id": "dbe816eb-c651-4361-aee3-9386f8372121",
    "name": "Nature light",
    "preview_url": "https://cdn.higgsfield.ai/soul-v2-style/f795f856-42c9-4f09-991f-ff3f5d1b7db4.webp",
    "description": "Lumière naturelle et rendu doux, proche d’une prise de vue sur le vif.",
    "description_fr": "Lumière naturelle et rendu doux, proche d’une prise de vue sur le vif."
  },
  {
    "id": "fafd3087-0d0f-4fb1-9af6-91b7d304687c",
    "name": "Warm ambient",
    "preview_url": "https://cdn.higgsfield.ai/soul-v2-style/18e79fc7-3ce8-499b-a129-2daba3165707.webp",
    "description": "Ambiance lumineuse chaude, enveloppante et intime.",
    "description_fr": "Ambiance lumineuse chaude, enveloppante et intime."
  },
  {
    "id": "3d5584b2-4d15-48d2-8a09-c1073259f4c6",
    "name": "Editorial street style",
    "preview_url": "https://cdn.higgsfield.ai/soul-v2-style/84b09184-9077-4f93-b4aa-1340f3641631.webp",
    "description": "Photographie de mode en extérieur, pose vivante et cadrage éditorial.",
    "description_fr": "Photographie de mode en extérieur, pose vivante et cadrage éditorial."
  },
  {
    "id": "e62e75c2-b1bb-433d-9192-f1196faed74e",
    "name": "Subtle flash",
    "preview_url": "https://cdn.higgsfield.ai/soul-v2-style/2134d88a-8e98-4f4a-9477-19a59343bd2d.webp",
    "description": "Flash discret pour détacher le sujet et souligner les textures.",
    "description_fr": "Flash discret pour détacher le sujet et souligner les textures."
  },
  {
    "id": "7876c2a5-aa83-4530-ad09-2b368bbb5e95",
    "name": "Theatrical light",
    "preview_url": "https://cdn.higgsfield.ai/soul-v2-style/2a79c49e-29cd-46b3-b60e-d6eed72b40ec.webp",
    "description": "Éclairage théâtral, ombres marquées et contraste dramatique.",
    "description_fr": "Éclairage théâtral, ombres marquées et contraste dramatique."
  }
];
export function normalizeSoulStyles(value: unknown): SoulStyle[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is SoulStyle => !!v && typeof v === "object" &&
    typeof v.id === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(v.id) &&
    typeof v.name === "string" &&
    typeof v.description === "string").map(v => ({
      id: v.id, name: v.name, description: v.description.slice(0, 900),
      ...(typeof v.preview_url === "string" && /^https:\/\/cdn\.higgsfield\.ai\//.test(v.preview_url) ? { preview_url: v.preview_url } : {}),
    }));
}
export function selectSoulStyles(value: unknown): SoulStyle[] {
  const catalogue = normalizeSoulStyles(value);
  return SOUL2_STYLES.flatMap(selected => {
    const style = catalogue.find(s => s.id === selected.id && s.name === selected.name);
    return style ? [{ ...style, description_fr: selected.description_fr }] : [];
  });
}
export function soulStyles(): Promise<SoulStyle[]> {
  // Version-bound curated snapshot: no v1 fallback and no extra catalogue latency.
  return Promise.resolve(SOUL2_STYLES.map(style => ({ ...style })));
}
export function resolveSoulStyle(id: string | undefined, styles: SoulStyle[]) {
  if (!id || id === "none") return undefined;
  const style = styles.find(s => s.id === id);
  if (!style) throw new Error("studio_soul_style_unavailable");
  return style;
}
/** Claude owns the photographic direction. Never append the generic OpenAI edit contract. */
export function soulPrompt(proposal: Proposal) {
  const prompt = proposal.image_prompt?.trim();
  if (!prompt) throw new Error("studio_soul_prompt_missing");
  return prompt;
}
export const SOUL_DIRECTION = `DIRECTION PHOTOGRAPHIQUE SOUL
Tu écris toi-même le prompt final Soul en anglais dans scene_workflow.scene_prompt et image_prompt, identiques. Le générateur recevra ce texte autonome, sans le résumé français ni un second brief générique.
Appuie-toi sur la demande explicite, les pixels des références et la direction artistique de CETTE marque. Les descriptions de bibliothèque peuvent être fausses : vérifie les motifs sur les pixels, ne recopie pas un ancien libellé contredit par la photo. Si le détail est incertain, nomme simplement le produit exact de la référence sans inventer son motif. L'esthétique n'est pas universelle : une photo documentaire, un packshot et une campagne mode ne se préparent pas pareil. Décris concrètement le sujet, la tenue si pertinente, l'action, la disposition spatiale, le cadrage, la lumière et les matières. Adapte l'ordre au sujet. Ne crée pas de personne lorsqu'aucune n'est demandée. Une pose vivante doit être compatible avec la demande, pas un rire automatique.
Le réalisme vient de la cohérence optique, des expressions, de la lumière, des matières et des contacts. N'ajoute pas par défaut warm/diffused light, cinematic, bokeh, pores accentués, grain, imperfections ou retouche beauté. Ce sont des choix de marque ou de cette photo, pas des mots magiques. Tout choix perceptible figure aussi dans la reformulation française à confirmer.
Pour une scène avec originaux réservés, prépare des personnes/objets provisoires de géométrie compatible. Décris les caractéristiques réellement visibles de la personne (cheveux, frange, silhouette) dès ce premier cadrage, sans promettre l'identité finale. Décris toujours une tenue complète lorsqu'une personne est visible : notamment le haut couvrant le buste, même si un produit est tenu devant. Sauf demande de changement, reprends les vêtements visibles dans l'original. Si la référence ne les montre pas, choisis une tenue quotidienne adaptée à la scène et annonce-la dans le résumé à confirmer. N'introduis pas de nudité, de torse découvert ou de tenue déshabillée sans demande explicite ; un objet ne remplace pas un vêtement. Pas de faux dessin détaillé du produit : la référence originale sera intégrée ensuite.
Choisis soul_style_id exclusivement dans presets_soul_disponibles, ou none si aucun ne convient ou si l'utilisatrice demande sans preset. Un preset n'est jamais obligatoire. Sa description définit sa direction photographique : le prompt décrit une scène compatible et n'impose pas une lumière ou un étalonnage contradictoires. Ne prétends pas utiliser un preset absent. Mentionne son nom et son effet dans summary si sélectionné. La préférence explicite de l'utilisatrice prime sur une suggestion automatique. Pour une retouche, conserve le rendu de l'image approuvée, n'applique pas de nouveau preset.`;
