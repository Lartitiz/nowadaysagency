import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

/**
 * Entrée de `analyze-excel-mapping` : validation + mise aux bornes.
 *
 * Constaté le 01/08/2026 : la fonction faisait `const { sheets } = await req.json()`
 * puis `sheets.map(...)` sans rien vérifier. Un corps sans `sheets` partait donc en
 * TypeError et ressortait en **500 « Erreur interne du serveur »** — un message qui
 * ne dit rien à l'utilisatrice et rien au diagnostic, alors que les fonctions
 * voisines répondent un 400 qui NOMME le champ manquant.
 *
 * Volontairement dans le dossier de la fonction et non dans `_shared/` : toucher
 * `_shared/input-validators.ts` aurait marqué ses dizaines de consommateurs comme
 * « à redéployer » pour un changement qui ne les concerne pas.
 */

export const ExcelMappingSchema = z.object({
  sheets: z
    .array(
      z.object({
        name: z.string().max(300),
        headers: z.array(z.string().max(300).nullable()),
        sampleRows: z.array(z.array(z.string().max(300).nullable())).optional(),
      }).passthrough(),
    )
    .min(1, "au moins une feuille est requise"),
}).passthrough();

/**
 * Bornes du prompt. On TRONQUE au lieu de refuser : un classeur inhabituel doit
 * rester analysable (même philosophie que `clampAiField`). Refuser casserait
 * l'import pour une utilisatrice dont le fichier est simplement gros.
 */
export const MAX_SHEETS = 20;
export const MAX_HEADERS = 150;
export const MAX_CELL = 120;

export interface NormalizedSheet {
  name: string;
  headers: (string | null)[];
  sampleRows: (string | null)[][];
}

const clip = (v: string | null | undefined): string | null =>
  v == null ? null : String(v).slice(0, MAX_CELL);

/** Ramène le payload validé aux bornes du prompt, et dit si on a coupé. */
export function normalizeSheets(
  raw: Array<{ name: string; headers: (string | null)[]; sampleRows?: (string | null)[][] }>,
): { sheets: NormalizedSheet[]; truncated: boolean } {
  const sheets = raw.slice(0, MAX_SHEETS).map((s) => ({
    name: clip(s.name) ?? "",
    headers: (s.headers ?? []).slice(0, MAX_HEADERS).map(clip),
    sampleRows: (s.sampleRows ?? []).slice(0, 3).map((r) => (r ?? []).slice(0, MAX_HEADERS).map(clip)),
  }));
  const truncated =
    raw.length > MAX_SHEETS ||
    raw.some((s) => (s.headers?.length ?? 0) > MAX_HEADERS) ||
    raw.some((s) => (s.sampleRows?.length ?? 0) > 3);
  return { sheets, truncated };
}
