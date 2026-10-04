// Range les images collées (data URL base64) d'un contenu dans le bucket
// public calendar-visuals et les remplace par leur lien. Même nommage que le
// front (src/lib/carousel-media.ts) : {ownerId}/carousel-media/{sha256}.ext,
// donc une photo déjà rangée par une sauvegarde n'est pas dupliquée.
//
// Utilisé par la conversion des contenus existants (carousel-media-backfill) :
// chaque image rangée est RELUE et sa taille comparée avant de remplacer quoi
// que ce soit ; à la moindre image non vérifiée, rien n'est remplacé.

export const MEDIA_BUCKET = "calendar-visuals";
const DATA_URL = /data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+/g;
/** Petites images (pictos, textures) : gardées dans le contenu, comme le front. */
export const MIN_INLINE_LENGTH = 20_000;
const EXTENSION: Record<string, string> = { png: "png", jpg: "jpg", jpeg: "jpg", webp: "webp", gif: "gif" };

export interface MediaStorage {
  upload(path: string, bytes: Uint8Array<ArrayBuffer>, contentType: string): Promise<{ error: { message: string; statusCode?: string | number } | null }>;
  publicUrl(path: string): string;
}

export interface MediaResult<T> {
  value: T;
  /** Nombre d'images distinctes trouvées. */
  found: number;
  /** Images rangées ET vérifiées (remplacées dans value). */
  stored: number;
  /** Raisons d'échec : si non vide, value est la valeur d'origine. */
  failures: string[];
}

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

export function collectDataImages(value: unknown, found = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    if (value.length < MIN_INLINE_LENGTH || !value.includes("data:image/")) return found;
    for (const match of value.matchAll(DATA_URL)) if (match[0].length >= MIN_INLINE_LENGTH) found.add(match[0]);
  } else if (Array.isArray(value)) value.forEach((v) => collectDataImages(v, found));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => collectDataImages(v, found));
  return found;
}

function replace(value: any, links: Map<string, string>): any {
  if (typeof value === "string") return value.includes("data:image/") ? value.replace(DATA_URL, (m) => links.get(m) ?? m) : value;
  if (Array.isArray(value)) return value.map((v) => replace(v, links));
  if (value && typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = replace(v, links);
    return out;
  }
  return value;
}

/**
 * Remplace toutes les images collées de `value` par leur lien rangé et vérifié.
 * Tout ou rien : si une seule image ne peut pas être rangée ou relue à
 * l'identique, la valeur d'origine est renvoyée avec la raison.
 */
export async function externalizeVerified<T>(
  value: T,
  ownerId: string,
  storage: MediaStorage,
  fetchImpl: typeof fetch = fetch,
): Promise<MediaResult<T>> {
  const images = collectDataImages(value);
  if (!images.size) return { value, found: 0, stored: 0, failures: [] };
  const links = new Map<string, string>();
  const failures: string[] = [];
  for (const dataUrl of images) {
    try {
      const [, type = "jpeg"] = /^data:image\/([a-z]+);/.exec(dataUrl) || [];
      const ext = EXTENSION[type] || "jpg";
      const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
      const bytes = decode(dataUrl.slice(dataUrl.indexOf(",") + 1));
      const path = `${ownerId}/carousel-media/${await sha256(bytes)}.${ext}`;
      const { error } = await storage.upload(path, bytes, mime);
      if (error && !/exist|duplicate|409/i.test(`${error.statusCode ?? ""} ${error.message}`)) throw new Error(`envoi refusé : ${error.message}`);
      const url = storage.publicUrl(path);
      const check = await fetchImpl(url, { headers: { "Cache-Control": "no-cache" } });
      if (!check.ok) throw new Error(`relecture impossible (${check.status})`);
      const size = (await check.arrayBuffer()).byteLength;
      if (size !== bytes.byteLength) throw new Error(`taille différente (${size} au lieu de ${bytes.byteLength})`);
      links.set(dataUrl, url);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (failures.length) return { value, found: images.size, stored: 0, failures };
  return { value: replace(value, links), found: images.size, stored: links.size, failures: [] };
}
