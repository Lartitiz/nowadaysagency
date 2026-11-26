// photo-describe, mode "describe_image" (26/11/2026, demande de Laetitia).
//
// Une photo importée depuis l'ordinateur dans l'écran de création ne passe pas
// par « Mes photos » : elle n'était donc jamais décrite, et la fenêtre « Que
// montre chaque photo ? » arrivait vide. Ce mode décrit UNE image envoyée
// telle quelle (déjà allégée par le navigateur) et rend une courte légende.
// Rien n'est écrit en base. Sans crédit (micro-appel, comme le mode describe).
//
// La légende sert de SUGGESTION à vérifier : factuelle, courte, jamais une
// phrase adressée à l'utilisatrice.

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

/** ~2,2 Mo d'image une fois décodée : au-delà, le navigateur n'a pas allégé la photo. */
export const DESCRIBE_IMAGE_MAX_CHARS = 3_000_000;
export const CAPTION_MAX = 120;

export const DescribeImageSchema = z.object({
  mode: z.literal("describe_image"),
  workspace_id: z.string().uuid().optional(),
  image: z.object({
    base64: z.string().min(100).max(DESCRIBE_IMAGE_MAX_CHARS),
    mimeType: z.string().max(40).optional(),
  }),
});

const VISION_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** Sépare « data:image/…;base64, » du contenu. `null` : format que la vision ne lit pas. */
export function splitImage(image: { base64: string; mimeType?: string }): { data: string; media_type: string } | null {
  const m = /^data:([a-z0-9.+/-]+);base64,(.*)$/is.exec(image.base64.trim());
  const media_type = (m ? m[1] : image.mimeType || "image/jpeg").toLowerCase().replace("image/jpg", "image/jpeg");
  const data = (m ? m[2] : image.base64).replace(/\s+/g, "");
  if (!VISION_TYPES.has(media_type) || !data) return null;
  return { data, media_type };
}

export const DESCRIBE_IMAGE_SYSTEM =
  "Tu écris la légende factuelle d'une photo pour une entrepreneuse qui prépare un carrousel. La légende dit ce que la photo MONTRE : le sujet, et le lieu ou la pièce quand on le voit. Rien d'autre : pas d'interprétation, pas de marketing, pas de phrase adressée à quelqu'un.";

export const DESCRIBE_IMAGE_TEXT =
  "Écris la légende de cette photo : 4 à 10 mots, en français, sans verbe d'introduction (pas de « Cette photo montre », pas de « On voit »). Exemples de forme : « La façade côté rue », « Cuisine ouverte avec îlot central », « Mains qui poncent un plan de travail ».";

export const DESCRIBE_IMAGE_TOOL = {
  name: "save_photo_caption",
  description: "Enregistre la légende de la photo",
  input_schema: {
    type: "object",
    properties: {
      caption: { type: "string", description: "Légende factuelle, 4 à 10 mots, en français, commence par le sujet de la photo" },
    },
    required: ["caption"],
  },
};

const INTRO = /^(cette (photo|image) (montre|représente|présente)|on (y )?voit|voici|voilà|il s['’]agit d['’]|image d['’]|photo d['’]|photo de|image de)\s*:?\s*/i;

/**
 * Nettoie la légende reçue : guillemets, phrase d'introduction, point final, longueur.
 * Rend "" si ce n'est pas une légende (phrase à la première personne, refus du modèle…) :
 * mieux vaut un champ vide qu'une ligne fausse.
 */
export function cleanCaption(raw: unknown): string {
  let text = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
  text = text.replace(/^[«"“'\s]+|[»"”'\s]+$/g, "").replace(INTRO, "").replace(/[.\s]+$/, "").trim();
  if (!text || /^(j['’]|(je|désolée?|impossible)(?![\p{L}]))/iu.test(text)) return "";
  if (text.length > CAPTION_MAX) text = text.slice(0, CAPTION_MAX).replace(/\s+\S*$/, "");
  return text[0].toUpperCase() + text.slice(1);
}

/** Lit la sortie de l'outil (JSON) et rend la légende propre. */
export function captionFromToolOutput(raw: string): string {
  try { return cleanCaption((JSON.parse(raw) as { caption?: unknown })?.caption); } catch { return ""; }
}
