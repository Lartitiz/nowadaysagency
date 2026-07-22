/**
 * Sélection du meilleur fichier vidéo Pexels pour un montage de reel 9:16.
 *
 * Pexels renvoie, pour chaque vidéo, plusieurs `video_files` (sd/hd/uhd, ratios
 * variés). On veut :
 *   1. du MP4 (lisible partout, accepté par le moteur de rendu) ;
 *   2. du VERTICAL (hauteur ≥ largeur) — sinon le reel a des bandes noires ;
 *   3. une définition proche de 1080 de large : assez net pour un reel, sans
 *      partir sur du 4K (uhd) qui alourdit inutilement le rendu et le stockage.
 *
 * Fonction pure (aucun I/O) → testable isolément.
 */

export interface PexelsVideoFile {
  id?: number;
  quality?: string;
  file_type?: string;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  link: string;
}

const TARGET_WIDTH = 1080;

function isMp4(f: PexelsVideoFile): boolean {
  if (f.file_type && /mp4/i.test(f.file_type)) return true;
  // Certains items n'ont pas file_type mais l'URL finit par .mp4.
  return /\.mp4(\?|$)/i.test(f.link || "");
}

function isPortrait(f: PexelsVideoFile): boolean {
  return !!f.width && !!f.height && f.height >= f.width;
}

/**
 * Score de préférence (plus bas = mieux). On vise 1080 de large, on pénalise
 * fortement le paysage (bandes noires) et un peu les définitions au-dessus de
 * 1080 (poids inutile).
 */
function score(f: PexelsVideoFile): number {
  const w = f.width || 0;
  let s = Math.abs(w - TARGET_WIDTH);
  if (w > TARGET_WIDTH) s += 400; // 4K/1440 : plus lourd, on préfère éviter
  if (!isPortrait(f)) s += 1000; // paysage : seulement en dernier recours
  return s;
}

/**
 * Renvoie le meilleur fichier MP4 (vertical de préférence), ou `null` si aucun
 * MP4 exploitable.
 */
export function pickBestVerticalFile(
  files: PexelsVideoFile[],
): PexelsVideoFile | null {
  const mp4s = (files || []).filter((f) => f && f.link && isMp4(f));
  if (!mp4s.length) return null;
  return mp4s.reduce((best, f) => (score(f) < score(best) ? f : best));
}
