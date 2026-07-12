// Post-traitement déterministe des scripts Reel (audit qualité reels 12/07).
//
// Trois responsabilités, toutes en code pur (pas d'appel IA) :
// 1. Recalibrage des durées : la durée affichée découle du texte réel
//    (~150 mots parlés/min, soit 2,5 mots/s) au lieu du chiffre déclaré par
//    le modèle (mesuré systématiquement sous-estimé de 40-80 % à l'audit).
// 2. Extraction / réinjection des textes pour la passe de correction
//    (même approche que applyCorrectionPassCarousel : on n'envoie jamais le
//    JSON complet au correcteur, on ne peut donc pas casser la structure).
// 3. Détection des violations face_cam=non (l'utilisatrice ne veut pas se
//    montrer : aucun plan ni format visuel face cam ne doit subsister).

/** Rythme parlé naturel : 2,5 mots par seconde (~150 mots/min). */
const WORDS_PER_SECOND = 2.5;

interface ReelSection {
  section?: string;
  timing?: string;
  format_visuel?: string | null;
  texte_parle?: string | null;
  texte_overlay?: string | null;
  cut?: string | null;
  tip?: string | null;
}

function sectionsOf(parsed: any): ReelSection[] {
  if (Array.isArray(parsed?.script)) return parsed.script;
  if (Array.isArray(parsed?.sections)) return parsed.sections;
  return [];
}

function wordCount(text: string | null | undefined): number {
  return (text || "").split(/\s+/).filter(Boolean).length;
}

/** Total de mots parlés du script (hors overlays). */
export function countReelSpokenWords(parsed: any): number {
  return sectionsOf(parsed).reduce((acc, s) => acc + wordCount(s.texte_parle), 0);
}

/** Tout le texte visible/audible du reel, pour l'analyse rédactionnelle (chiffres, tics). */
export function reelAuditableText(parsed: any): string {
  const parts: string[] = [];
  for (const s of sectionsOf(parsed)) {
    if (s.texte_parle) parts.push(s.texte_parle);
    if (s.texte_overlay) parts.push(s.texte_overlay);
  }
  if (parsed?.caption?.text) parts.push(parsed.caption.text);
  if (parsed?.caption?.cta) parts.push(parsed.caption.cta);
  for (const a of Array.isArray(parsed?.amplification_stories) ? parsed.amplification_stories : []) {
    if (a?.text) parts.push(a.text);
  }
  if (parsed?.cover_text) parts.push(parsed.cover_text);
  return parts.join("\n");
}

/**
 * Recalcule timing par section + duree_cible à partir des mots réels.
 * Mutations en place : script[i].timing, duree_cible, et miroir `sections`
 * (compat UI ReelResult). lecture_test/accroche ne bougent pas.
 */
export function recalibrateReelTimings(parsed: any): void {
  const script = sectionsOf(parsed);
  if (!script.length) return;
  let cursor = 0;
  for (const s of script) {
    // Minimum 2 s par section (une respiration à l'écran), hook souvent 3 s.
    const secs = Math.max(2, Math.round(wordCount(s.texte_parle) / WORDS_PER_SECOND));
    s.timing = `${cursor}-${cursor + secs} sec`;
    cursor += secs;
  }
  parsed.duree_cible = `${cursor} sec`;
  // Miroir strict : l'UI lit `sections`, le calendrier lit `script`.
  if (Array.isArray(parsed.script)) parsed.sections = parsed.script;
}

/**
 * Reconstruit lecture_test = concaténation des texte_parle dans l'ordre.
 * À l'origine c'est le modèle qui concatène ; après la passe de correction les
 * texte_parle ont bougé et le monologue affiché (1er bloc de ReelResult)
 * divergeait du script (faille trouvée à la revue du 12/07). Déterministe
 * > déclaratif : on reconstruit toujours.
 */
export function rebuildReelLectureTest(parsed: any): void {
  const spoken = sectionsOf(parsed)
    .map((s) => (s.texte_parle || "").trim())
    .filter(Boolean);
  if (spoken.length && typeof parsed === "object" && parsed !== null) {
    parsed.lecture_test = spoken.join(" ");
  }
}

/**
 * Verrouille le hook CHOISI par l'utilisatrice (étape hook_selection) sur la
 * section 1 : ni la génération ni la passe de correction ne doivent le
 * réécrire — c'est SON choix, fait sur ces mots précis.
 * Retourne true si quelque chose a été réaligné.
 */
export function enforceSelectedReelHook(
  parsed: any,
  selectedHook: { text?: unknown; text_overlay?: unknown } | null | undefined,
): boolean {
  const script = sectionsOf(parsed);
  const first = script[0];
  if (!first || String(first.section || "") !== "hook") return false;
  const text = typeof selectedHook?.text === "string" ? selectedHook.text.trim() : "";
  // Garde-fou : ne jamais verrouiller un placeholder (fallback auto du brief).
  if (!text || text.startsWith("(")) return false;
  let touched = false;
  if (first.texte_parle !== text) {
    first.texte_parle = text;
    touched = true;
  }
  const overlay = typeof selectedHook?.text_overlay === "string" ? selectedHook.text_overlay.trim() : "";
  if (overlay && !overlay.startsWith("(") && first.texte_overlay !== overlay) {
    first.texte_overlay = overlay;
    touched = true;
  }
  if (touched && Array.isArray(parsed?.script)) parsed.sections = parsed.script;
  return touched;
}

/** Bloc balisé des textes corrigibles (pour la passe de correction). */
export function extractReelTexts(parsed: any): string {
  const lines: string[] = [];
  sectionsOf(parsed).forEach((s, i) => {
    if (typeof s.texte_parle === "string" && s.texte_parle.trim()) {
      lines.push(`[SECTION ${i + 1} - PARLE]\n${s.texte_parle.trim()}`);
    }
    if (typeof s.texte_overlay === "string" && s.texte_overlay.trim()) {
      lines.push(`[SECTION ${i + 1} - OVERLAY]\n${s.texte_overlay.trim()}`);
    }
  });
  if (typeof parsed?.caption?.text === "string" && parsed.caption.text.trim()) {
    lines.push(`[CAPTION]\n${parsed.caption.text.trim()}`);
  }
  if (typeof parsed?.caption?.cta === "string" && parsed.caption.cta.trim()) {
    lines.push(`[CAPTION - CTA]\n${parsed.caption.cta.trim()}`);
  }
  (Array.isArray(parsed?.amplification_stories) ? parsed.amplification_stories : []).forEach(
    (a: any, i: number) => {
      if (typeof a?.text === "string" && a.text.trim()) {
        lines.push(`[STORY ${i + 1}]\n${a.text.trim()}`);
      }
    },
  );
  return lines.join("\n\n");
}

/**
 * Réinjecte un bloc balisé corrigé dans le JSON d'origine.
 * Un marqueur absent du bloc corrigé = champ inchangé (jamais de suppression).
 * Retourne une COPIE : l'original n'est pas muté (fallback sûr en cas d'échec).
 */
export function reinjectReelTexts(parsed: any, correctedBlock: string): any {
  const out = JSON.parse(JSON.stringify(parsed));
  const map = new Map<string, string>();
  const re = /^\[(SECTION \d+ - (?:PARLE|OVERLAY)|CAPTION(?: - CTA)?|STORY \d+)\]\s*\n([\s\S]*?)(?=\n\[(?:SECTION \d+ - (?:PARLE|OVERLAY)|CAPTION(?: - CTA)?|STORY \d+)\]|$)/gm;
  for (const m of correctedBlock.matchAll(re)) {
    const text = m[2].trim();
    if (text) map.set(m[1], text);
  }
  if (map.size === 0) return out;
  const script = sectionsOf(out);
  script.forEach((s, i) => {
    const parle = map.get(`SECTION ${i + 1} - PARLE`);
    if (parle && typeof s.texte_parle === "string") s.texte_parle = parle;
    const overlay = map.get(`SECTION ${i + 1} - OVERLAY`);
    if (overlay && typeof s.texte_overlay === "string") s.texte_overlay = overlay;
  });
  if (map.get("CAPTION") && out?.caption?.text) out.caption.text = map.get("CAPTION");
  if (map.get("CAPTION - CTA") && out?.caption?.cta) out.caption.cta = map.get("CAPTION - CTA");
  (Array.isArray(out?.amplification_stories) ? out.amplification_stories : []).forEach(
    (a: any, i: number) => {
      const t = map.get(`STORY ${i + 1}`);
      if (t && typeof a?.text === "string") a.text = t;
    },
  );
  if (Array.isArray(out.script)) out.sections = out.script;
  return out;
}

/**
 * Violations de la contrainte face_cam=non (liste vide = conforme).
 * Sert à construire les instructions ciblées de la passe de correction.
 */
export function reelFaceCamViolations(parsed: any): string[] {
  const violations: string[] = [];
  const ft = String(parsed?.format_type || "");
  if (/face.?cam/i.test(ft)) {
    violations.push(`format_type "${ft}" est une structure face cam`);
  }
  sectionsOf(parsed).forEach((s, i) => {
    if (/face.?cam|regarde? la caméra|regard caméra/i.test(String(s.format_visuel || ""))) {
      violations.push(`section ${i + 1} : format_visuel "${s.format_visuel}" demande de la face cam`);
    }
  });
  (Array.isArray(parsed?.plan_tournage) ? parsed.plan_tournage : []).forEach(
    (p: any, i: number) => {
      if (String(p?.type || "") === "face_cam" || /face caméra|face cam/i.test(String(p?.plan || ""))) {
        violations.push(`plan_tournage ${i + 1} : plan face cam ("${String(p?.plan || "").slice(0, 60)}…")`);
      }
    },
  );
  return violations;
}

/**
 * Enforcement déterministe de face_cam=non : convertit la STRUCTURE (format_type,
 * format_visuel, plan_tournage) en voix off. La passe de correction texte ne
 * touche pas ces champs ; sans ça, une utilisatrice qui ne veut pas se montrer
 * recevait un script 100 % face cam (mesuré à l'audit, cas R7).
 * Mutations en place. Retourne true si quelque chose a été corrigé.
 */
export function enforceReelNoFaceCam(parsed: any): boolean {
  let touched = false;
  if (/face.?cam/i.test(String(parsed?.format_type || ""))) {
    parsed.format_type = "voix_off_broll";
    parsed.format_label = "Voix off + B-roll";
    touched = true;
  }
  for (const s of sectionsOf(parsed)) {
    if (/face.?cam|regarde? la caméra|regard caméra/i.test(String(s.format_visuel || ""))) {
      s.format_visuel = "Plan sur ton activité (mains, gestes, matière) : le texte passe en voix off + sous-titres";
      touched = true;
    }
  }
  for (const p of Array.isArray(parsed?.plan_tournage) ? parsed.plan_tournage : []) {
    if (String(p?.type || "") === "face_cam" || /face caméra|face cam/i.test(String(p?.plan || ""))) {
      p.type = "b_roll";
      p.plan = "Plans de ton activité (gestes du métier, matière, lieu) pendant que la voix off déroule le script";
      p.conseil = "Enregistre la voix off séparément, au calme : pas besoin de te montrer";
      touched = true;
    }
  }
  if (touched && Array.isArray(parsed?.script)) parsed.sections = parsed.script;
  return touched;
}

/** Fuites de gabarit connues (mesurées 8/8 à l'audit) — détection déterministe. */
export function reelTemplateLeaks(parsed: any): string[] {
  const leaks: string[] = [];
  sectionsOf(parsed).forEach((s, i) => {
    const ov = String(s.texte_overlay || "").trim().toUpperCase();
    if (ov === "SAUVEGARDE" || ov === "SAUVEGARDE CE REEL") {
      leaks.push(`section ${i + 1} : overlay "${s.texte_overlay}" est le gabarit du prompt, pas une punchline`);
    }
  });
  (Array.isArray(parsed?.amplification_stories) ? parsed.amplification_stories : []).forEach(
    (a: any, i: number) => {
      if (/^nouveau reel\b/i.test(String(a?.text || "").trim())) {
        leaks.push(`story ${i + 1} : "${String(a.text).slice(0, 40)}…" commence par "Nouveau Reel" (gabarit du prompt)`);
      }
    },
  );
  return leaks;
}
