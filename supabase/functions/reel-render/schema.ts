/**
 * Contrat d'entrée du rendu (action "submit") — séparé de index.ts pour être
 * testé sans démarrer le serveur. Toute clé ABSENTE d'ici est retirée en
 * silence par zod avant d'atteindre buildReelRecipe.
 */
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

export const SectionSchema = z.object({
  clip_url: z.string().url(),
  seek: z.number().min(0).optional(),
  duration: z.number().positive().max(90),
  voice_audio_url: z.string().url().optional(),
  voice_text: z.string().max(600).optional(),
  // Texte à l'écran du mode silencieux. ABSENT du schéma jusqu'ici : zod
  // retirait la clé en silence, et un reel « sans voix » partait au rendu
  // sans aucun texte. Borne large : un texte n'est jamais raccourci, et le
  // repli sur le texte parlé d'une section peut être long.
  overlay_text: z.string().max(4000).optional(),
  broll_url: z.string().url().optional(),
  broll_start: z.number().min(0).max(90).optional(),
  broll_duration: z.number().positive().max(90).optional(),
  broll_seek: z.number().min(0).max(90).optional(),
}).refine(s => !s.broll_url || (s.broll_duration != null &&
  (s.broll_start || 0) + s.broll_duration <= s.duration + 0.01),
  "Le plan de coupe dépasse la durée du passage.");

export const SubmitSchema = z.object({
  action: z.literal("submit"),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  sections: z.array(SectionSchema).min(1).max(20),
  voice_mode: z.enum(["recorded", "tts", "silent"]),
  tts_voice: z.string().max(60).optional(),
  subtitles: z.boolean().optional(),
  subtitle_settings: z.record(z.unknown()).optional(),
  // "filme" (prise face cam, clip gardé avec son) / "cache" (défaut, comportement existant).
  mode: z.enum(["filme", "cache"]).optional(),
});
