/**
 * Modèle OpenAI Images par usage — pilotable par secret (bascule GPT Image 2.5,
 * 28/09/2026).
 *
 * - slide   (carousel-slide-image) : création pure, pas de produit à respecter
 *   → Flare, le modèle rapide (~2× moins de latence que gpt-image-2).
 * - product (product-on-model)     : édition d'une photo produit, fidélité
 *   CRITIQUE → Sunburst, le modèle « précision d'édition ».
 *
 * 🔑 Retour arrière SANS code : poser le secret `OPENAI_IMAGE_MODEL_SLIDE` ou
 * `OPENAI_IMAGE_MODEL_PRODUCT` à `gpt-image-2` (via Lovable). Le secret vide ou
 * absent = défaut ci-dessous.
 *
 * Une valeur hors motif `gpt-image-…` (faute de frappe) ferait échouer CHAQUE
 * appel en 400 : on retombe alors sur le défaut, en le disant dans les logs.
 */
export type OpenAIImageUsage = "slide" | "product";

export const OPENAI_IMAGE_MODEL_DEFAULTS: Record<OpenAIImageUsage, string> = {
  slide: "gpt-image-2.5-flare",
  product: "gpt-image-2.5-sunburst",
};

const ENV_NAME: Record<OpenAIImageUsage, string> = {
  slide: "OPENAI_IMAGE_MODEL_SLIDE",
  product: "OPENAI_IMAGE_MODEL_PRODUCT",
};

const MODEL_RE = /^gpt-image-\d[a-z0-9.-]*$/;

export function openaiImageModel(usage: OpenAIImageUsage): string {
  const fallback = OPENAI_IMAGE_MODEL_DEFAULTS[usage];
  const configured = (Deno.env.get(ENV_NAME[usage]) || "").trim();
  if (!configured) return fallback;
  if (MODEL_RE.test(configured)) return configured;
  console.warn(
    `[openai-image] ${ENV_NAME[usage]}="${configured}" non reconnu — repli sur ${fallback}`,
  );
  return fallback;
}
