// Source unique des limites de taille d'upload vers Supabase Storage.
// DOIT rester alignée sur `storage.buckets.file_size_limit` posé par la migration
// anti-abus. Le serveur rejette nativement tout fichier au-dessus de la limite
// (erreur 413) ; ces contrôles client servent uniquement à afficher un message
// propre AVANT l'envoi plutôt que de laisser remonter le 413 brut.
//
// NB : certains call sites imposent une limite UX plus stricte (logo 5 Mo,
// média calendrier 10 Mo). Ces plafonds volontaires restent locaux ; ce module
// ne reflète que le plafond serveur (le maximum absolu par bucket).

const MB = 1024 * 1024;

// Plafonds serveur par bucket — synchronisés avec la migration SQL.
export const BUCKET_SIZE_LIMITS: Record<string, number> = {
  "brand-assets": 25 * MB,
  "inspiration-screenshots": 25 * MB,
  "calendar-visuals": 25 * MB,
  "user-photos": 25 * MB,
  "moodboards": 25 * MB,
  "calendar-media": 150 * MB,
};

const DEFAULT_LIMIT = 25 * MB;

function formatMb(bytes: number): string {
  return `${Math.round(bytes / MB)} Mo`;
}

/**
 * Renvoie un message d'erreur (français) si le fichier dépasse la limite du
 * bucket visé, ou `null` s'il est dans les clous.
 *
 * @param file   Fichier (ou objet `{ size, name }`) sur le point d'être uploadé.
 * @param bucket Identifiant du bucket de destination.
 */
export function checkUploadSize(
  file: { size: number; name?: string },
  bucket: string,
): string | null {
  const limit = BUCKET_SIZE_LIMITS[bucket] ?? DEFAULT_LIMIT;
  if (file.size <= limit) return null;
  const label = file?.name ? `« ${file.name} »` : "Ce fichier";
  return `${label} est trop lourd (${formatMb(file.size)}). Taille maximale : ${formatMb(limit)}.`;
}
