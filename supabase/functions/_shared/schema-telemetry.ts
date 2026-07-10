// Télémétrie DÉTERMINISTE de fidélité des schémas visuels (visual_schema).
//
// Angle mort relevé par l'audit rendu visuel du 10/07/2026 : les champs d'un
// visual_schema (items de checklist, labels de timeline, quote, attribution…)
// ne sont ni ancrés (data-slide-text) ni couverts par la garde verbatim — le
// modèle peut en omettre ou en réécrire sans que rien ne le détecte (vu en
// live : attribution d'une quote_big simplement absente du rendu).
//
// Étape 1 volontairement NON intrusive : on MESURE (logs) sans corriger, pour
// dimensionner le problème avant de décider d'une éventuelle réinjection.
// Chaque string du schéma est cherchée dans le texte rendu de la slide, après
// la même normalisation neutre que la garde verbatim (nbsp, apostrophes
// courbes, ellipse, entités HTML).

import { normalizeForCompare } from "./verbatim-guard.ts";

/** Clés de schéma qui ne portent pas de texte affichable. */
const NON_TEXT_KEYS = new Set(["type", "checked", "position", "photo_index"]);

/** Collecte récursive des strings affichables d'un visual_schema. */
export function collectSchemaStrings(value: unknown, out: string[] = [], key = ""): string[] {
  if (typeof value === "string") {
    const v = value.trim();
    // Ignore le vide et les valeurs purement techniques (positions %, hex…)
    if (v && !NON_TEXT_KEYS.has(key) && !/^#[0-9a-fA-F]{3,8}$/.test(v) && !/^\d{1,3}%$/.test(v)) out.push(v);
    return out;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectSchemaStrings(v, out, key);
    return out;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (NON_TEXT_KEYS.has(k)) continue;
      collectSchemaStrings(v, out, k);
    }
  }
  return out;
}

/** Texte rendu d'une slide : balises retirées, entités décodées, normalisé. */
function renderedText(html: string): string {
  return normalizeForCompare((html || "").replace(/<[^>]*>/g, " "));
}

export interface SchemaFidelityReport {
  /** Strings du schéma introuvables dans le rendu (omises ou réécrites). */
  missing: string[];
  /** Nombre total de strings vérifiées. */
  checked: number;
}

/**
 * Compare les strings d'un visual_schema au texte rendu de la slide.
 * Détection par INCLUSION du texte normalisé — une string réécrite (mot changé,
 * tiret remplacé…) compte comme manquante, c'est voulu : on mesure la fidélité.
 */
export function checkSchemaFidelity(html: string, schema: unknown): SchemaFidelityReport {
  const strings = collectSchemaStrings(schema);
  const haystack = renderedText(html);
  const missing = strings.filter((s) => !haystack.includes(normalizeForCompare(s)));
  return { missing, checked: strings.length };
}
