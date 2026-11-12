/**
 * « Sert pour » du plan de tournage d'un reel, en français lisible.
 *
 * Le générateur écrit ce champ avec les identifiants internes du script
 * (« hook », « section explication_1 », « plan de coupe section body 2 »,
 * « cta »). Ils s'affichaient tels quels (QA reel du 12/11/2026). On les
 * traduit à l'affichage : ça couvre aussi les reels déjà enregistrés.
 */
export function readableShotPurpose(raw: string): string {
  return raw
    .replace(/\bsections?\s+/gi, "")
    .replace(/\bbody[\s_]*(\d+)/gi, "passage $1")
    .replace(/\b(?:tous les |les )?segments? body\b/gi, "le développement")
    .replace(/\bbody\b/gi, "le développement")
    .replace(/\bhook\b/gi, "l'accroche")
    .replace(/\bcta\b/gi, "la fin")
    .replace(/\bprobleme\b/gi, "problème")
    .replace(/\b([a-zàâçéèêëîïôûùüÿœ]+)_(\d+)\b/gi, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Libellé du type de plan, sans anglicisme. */
export function shotTypeLabel(type: unknown): string {
  return type === "face_cam" ? "🎤 Face caméra" : type === "insert" ? "🔍 Gros plan" : "🎬 Plan d'illustration";
}
