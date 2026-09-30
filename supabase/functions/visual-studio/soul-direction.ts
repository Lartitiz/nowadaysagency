import type { Proposal } from "./media.ts";

export type SoulStyle = { id: string; name: string; description: string; preview_url?: string; description_fr?: string };
// Names and descriptions verified against the authenticated provider catalogue on 2026-09-30.
// IDs/previews still come from the live catalogue; no stale hard-coded provider ID is sent.
const photographicStyles = [
  { name: "General", description_fr: "Lumière douce, couleurs fidèles et rendu équilibré." },
  { name: "iPhone", description_fr: "Lumière naturelle et cadrage spontané, avec un léger rendu HDR." },
  { name: "Gallery", description_fr: "Décor épuré, murs neutres et présentation soignée du sujet." },
  { name: "90's Editorial", description_fr: "Photo de magazine rétro, grain argentique, léger flou et couleurs nostalgiques." },
  { name: "Tokyo Streetstyle", description_fr: "Mode urbaine, silhouettes marquées, superpositions et couleurs affirmées." },
  { name: "Spotlight", description_fr: "Lumière directe et contrastée, avec un effet de flash affirmé." },
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
  return photographicStyles.flatMap(selected => {
    const style = catalogue.find(s => s.name === selected.name);
    return style ? [{ ...style, description_fr: selected.description_fr }] : [];
  });
}
let cached: { expires: number; styles: SoulStyle[] } | undefined;
export async function soulStyles(): Promise<SoulStyle[]> {
  if (cached && cached.expires > Date.now()) return cached.styles;
  const credentials = Deno.env.get("HIGGSFIELD_API_KEY");
  if (!credentials) return [];
  try {
    const response = await fetch("https://api.higgsfield.ai/v1/text2image/soul-styles", {
      headers: { Authorization: `Key ${credentials}` }, signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) { await response.text(); return []; }
    const styles = normalizeSoulStyles(await response.json());
    cached = { expires: Date.now() + 300_000, styles };
    return styles;
  } catch { return []; }
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
