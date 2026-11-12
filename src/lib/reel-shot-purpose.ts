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

/**
 * Nom de la structure du reel, sans anglicisme (« Face cam confession »,
 * « Voix off + B-roll », « Hook loop » s'affichaient tels quels, QA du
 * 12/11/2026). Couvre la clé technique et les reels déjà enregistrés.
 */
/**
 * Indication de plan d'un passage (« Face cam, regard caméra… ») : les anciens
 * reels gardent l'anglicisme du modèle, on le traduit à l'affichage.
 */
export function readableVisualCue(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .replace(/\bface[\s_-]*cam(?![a-zà-ÿ])/gi, (m) => (m[0] === "F" ? "Face caméra" : "face caméra"))
    .replace(/\bb[\s_-]*roll\b/gi, "images d'illustration")
    .replace(/\bplans? de coupe\b/gi, (m) => (/s de/i.test(m) ? "images d'illustration" : "image d'illustration"))
    .trim();
}

export function readableReelFormat(raw: unknown): string {
  if (typeof raw !== "string" || !raw.trim()) return "";
  const s = raw.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/hook[\s_-]*loop|boucle/.test(s)) return "Boucle courte";
  if (/voix[\s_-]*off|b[\s_-]*roll/.test(s)) return "Voix off sur images";
  if (/face[\s_-]*cam/.test(s)) return "Face caméra";
  return raw.trim();
}

/**
 * Nom d'un passage du script, lisible : « hook », « body », « cta » sortaient
 * tels quels dans la fiche d'une idée et dans le contenu du calendrier (essai
 * de reprise du 12/11/2026). Le libellé écrit par la génération passe d'abord.
 */
export function reelSectionName(section: any): string {
  const label = typeof section?.label === "string" ? section.label.trim() : "";
  if (label) return label;
  const raw = typeof section?.section === "string" ? section.section.trim() : "";
  if (!raw) return "";
  const key = raw.toLowerCase();
  if (key === "hook") return "Accroche";
  if (key === "cta") return "Fin";
  if (key === "body") return "Développement";
  const numbered = key.match(/^body[\s_]*(\d+)$/);
  if (numbered) return `Passage ${numbered[1]}`;
  const text = readableShotPurpose(raw);
  return text.charAt(0).toUpperCase() + text.slice(1);
}
