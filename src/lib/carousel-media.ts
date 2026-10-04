import { supabase } from "@/integrations/supabase/client";
import type { DraftStore } from "@/lib/carousel-autosave";

// Les photos posées sur une slide arrivent en data URL (base64) dans le HTML
// de la slide. Gardées telles quelles, elles faisaient peser un brouillon de
// carrousel jusqu'à ~8 Mo, multipliés par l'historique « Restaurer » : idées
// lentes à ouvrir, sauvegardes lourdes, base saturée.
//
// À l'écriture, chaque image est rangée UNE fois dans le bucket public
// calendar-visuals (déjà utilisé pour les photos des idées et du calendrier),
// sous un nom tiré de son contenu : la même photo, dans 8 versions de
// l'historique, n'est stockée qu'une fois. Le HTML garde le lien public.
// À l'export (PNG, PowerPoint, Canva), inlineCarouselMedia remet les images
// en data URL : les exports restent identiques à aujourd'hui.

const BUCKET = "calendar-visuals";
const DATA_URL = /data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+/g;
/** Petites images (pictos, textures) : gardées dans le HTML. */
const MIN_INLINE_LENGTH = 20_000;
const MEDIA_URL = /https:\/\/[^"'\s()&<>]+\/storage\/v1\/object\/public\/calendar-visuals\/[^"'\s()&<>]+\/carousel-media\/[0-9a-f]{64}\.(?:png|jpg|webp|gif)/g;

const EXTENSION: Record<string, string> = { png: "png", jpg: "jpg", jpeg: "jpg", webp: "webp", gif: "gif" };

type StorageClient = Pick<typeof supabase, "storage">;

// data URL → lien public (ou promesse en cours). Évite de renvoyer la même
// photo à chaque sauvegarde automatique.
const stored = new Map<string, Promise<string>>();
// lien public → data URL, pour les exports.
const fetched = new Map<string, Promise<string>>();

function decode(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function storeImage(dataUrl: string, ownerId: string, client: StorageClient): Promise<string> {
  const [, type = "jpeg"] = /^data:image\/([a-z]+);/.exec(dataUrl) || [];
  const ext = EXTENSION[type] || "jpg";
  const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
  const bytes = decode(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const path = `${ownerId}/carousel-media/${await sha256(bytes)}.${ext}`;
  const { error } = await client.storage.from(BUCKET).upload(path, new Blob([bytes], { type: mime }), {
    contentType: mime, upsert: false, cacheControl: "31536000",
  });
  // Même contenu = même nom : un fichier déjà présent est exactement celui-ci.
  if (error && !/exist|duplicate|409/i.test(`${(error as any).statusCode || ""} ${error.message}`)) throw error;
  return client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

function collect(value: unknown, found: Set<string>): void {
  if (typeof value === "string") {
    if (value.length < MIN_INLINE_LENGTH || !value.includes("data:image/")) return;
    for (const match of value.matchAll(DATA_URL)) if (match[0].length >= MIN_INLINE_LENGTH) found.add(match[0]);
  } else if (Array.isArray(value)) value.forEach((v) => collect(v, found));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collect(v, found));
}

function replace(value: any, links: Map<string, string>): any {
  if (typeof value === "string") {
    if (!value.includes("data:image/")) return value;
    return value.replace(DATA_URL, (match) => links.get(match) ?? match);
  }
  if (Array.isArray(value)) return value.map((v) => replace(v, links));
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = replace(v, links);
    return out;
  }
  return value;
}

/**
 * Range les images d'un contenu (HTML des slides, historique…) et les remplace
 * par leur lien public. Une image qui n'a pas pu être rangée (hors ligne…)
 * reste dans le contenu : la sauvegarde n'échoue jamais à cause d'elle.
 */
export async function externalizeCarouselMedia<T>(value: T, ownerId: string, client: StorageClient = supabase): Promise<T> {
  const found = new Set<string>();
  collect(value, found);
  if (!found.size || !ownerId) return value;
  const links = new Map<string, string>();
  for (const dataUrl of found) {
    const key = `${ownerId}:${dataUrl}`;
    let pending = stored.get(key);
    if (!pending) {
      pending = storeImage(dataUrl, ownerId, client);
      stored.set(key, pending);
      pending.catch(() => stored.delete(key));
    }
    try { links.set(dataUrl, await pending); }
    catch (error) { console.warn("[carousel-media] image gardée dans le contenu", error); }
  }
  return links.size ? replace(value, links) : value;
}

/** Une sauvegarde de brouillon de carrousel qui range ses images avant d'écrire. */
export function withCarouselMedia(store: DraftStore, ownerId: string, client: StorageClient = supabase): DraftStore {
  return {
    read: (id) => store.read(id),
    insert: async (id, raw) => store.insert(id, await externalizeCarouselMedia(raw, ownerId, client)),
    update: async (id, timestamp, raw) => store.update(id, timestamp, await externalizeCarouselMedia(raw, ownerId, client)),
  };
}

async function toDataUrl(url: string): Promise<string> {
  const response = await fetch(url, { credentials: "omit" });
  if (!response.ok) throw new Error(`Image indisponible (${response.status})`);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Image illisible"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Remet en data URL les images rangées par externalizeCarouselMedia, pour les
 * exports qui en dépendent (repérage des photos du PowerPoint modifiable).
 * Une image injoignable garde son lien : le rendu la charge alors lui-même.
 */
export async function inlineCarouselMedia(html: string): Promise<string> {
  if (!html || !html.includes("/carousel-media/")) return html;
  const urls = new Set(html.match(MEDIA_URL) || []);
  const inline = new Map<string, string>();
  await Promise.all([...urls].map(async (url) => {
    let pending = fetched.get(url);
    if (!pending) {
      pending = toDataUrl(url);
      fetched.set(url, pending);
      pending.catch(() => fetched.delete(url));
    }
    try { inline.set(url, await pending); }
    catch (error) { console.warn("[carousel-media] image gardée en lien pour l'export", error); }
  }));
  return inline.size ? html.replace(MEDIA_URL, (url) => inline.get(url) ?? url) : html;
}

/** Même chose pour une liste de slides { html }. */
export async function inlineSlidesMedia<S extends { html: string }>(slides: S[]): Promise<S[]> {
  return Promise.all(slides.map(async (slide) => ({ ...slide, html: await inlineCarouselMedia(slide.html) })));
}
