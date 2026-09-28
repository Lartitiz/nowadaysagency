import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
export const compositionSchema = z.object({
  logo_data_url: z.string().max(400000).regex(
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/,
  ).nullable().default(null),
  title: z.string().max(180),
  body: z.string().max(1200),
  footer: z.string().max(300),
  format: z.enum(["square", "portrait", "story"]).default("portrait"),
  layout: z.enum(["image_top", "image_full"]).default("image_top"),
  background: z.string().regex(/^#[0-9a-f]{6}$/i).default("#ffffff"),
  foreground: z.string().regex(/^#[0-9a-f]{6}$/i).default("#242124"),
  accent: z.string().regex(/^#[0-9a-f]{6}$/i).default("#863f67"),
  font: z.string().regex(/^[a-zA-Z0-9 ,'-]{1,80}$/).default("sans-serif"),
  align: z.enum(["left", "center"]).default("left"),
});
