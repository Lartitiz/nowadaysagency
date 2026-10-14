// MISE EN FORME des carrousels dans carousel-ai (lot 8 « séparation écriture /
// design », 14/10/2026 ; voir docs/creation-contenu/CARTE.md, section 3).
//
// carousel-ai ÉCRIT : texte, structure du récit (slide_type, photo_index) et
// légende. Les choix de DESIGN qu'il fait encore avant de répondre vivent ici,
// et seulement ici :
//   - schémas (visual_schema) proposés APRÈS l'écriture, sur le texte final ;
//   - plafond des schémas (2 maximum, jamais consécutifs) ;
//   - disposition du mixte et gabarits photo que la rédaction écrirait quand
//     même : ignorés à la sortie de l'écriture ;
//   - harmonisation des styles d'overlay (photo, mixte) ;
//   - gabarits photo (couverture, chiffre, liste, citation, finale…) posés sur
//     le texte FINAL, puis revérifiés après la dernière réparation du fil ;
//   - récit continu photo / mixte (lot 8b) : gabarit, style et position du
//     texte sur photo, disposition du mixte et mot mis en valeur sur la
//     couverture (cover_accent), posés passage par passage.
//
// Code déplacé À L'IDENTIQUE depuis index.ts : mêmes appels, même ordre, même
// sortie (prouvé par handler_contract_test.ts, généré avant le déplacement).
// index.ts appelle ces fonctions aux mêmes endroits qu'avant ; l'ordre compte
// (les gabarits photo passent avant la réparation du fil, puis sont revérifiés).
//
// Frontière testée (_shared/carousel-design-boundaries_test.ts) : dans
// carousel-ai, seul ce fichier importe les modules de design partagés.
// Crédits : rien ici ne débite. Les jetons des schémas s'ajoutent à l'usage de
// la rédaction (une unité `carousel`), comme avant.

import type { UsageSink } from "../_shared/anthropic.ts";
import { limitVisualSchemas } from "../_shared/schema-limit.ts";
import { addSchemasToContent, type SchemaPlan } from "../_shared/schema-formatting.ts";
import { keepDraftLayoutFields, stripMixWriterLayoutFields } from "../_shared/mix-layout-formatting.ts";
import { normalizeOverlayStyles } from "../_shared/photo-slide-structure.ts";
import { assignPhotoTemplates, assignTemplatesToProvidedSlides, revalidatePhotoLayoutContent, stripWriterLayoutFields } from "../_shared/photo-template-assign.ts";
import { coverAccentMaxWords, validExtract } from "../_shared/carousel-design-plan.ts";

// Gabarits photo : posés sur le texte définitif (après relecture et redac-gate),
// revérifiés après une réparation globale du fil, et seuls pour « Mes slides ».
export { assignPhotoTemplates, assignTemplatesToProvidedSlides, revalidatePhotoLayoutContent };

// Un overlay long en style « minimal »/« technique » rend un pavé (lot E).
export { normalizeOverlayStyles };

// Étage SCHÉMAS (03/10/2026) : lancé seulement s'il reste du temps avant la
// coupure de la plateforme (~400 s) ; il s'arrête de lui-même à 25 s.
/** Schémas sur le carrousel mixte : dessinés par mix-slide-layouts (slide « pause »). */
export const MIX_SCHEMAS_ENABLED = true;
const SCHEMA_START_LIMIT_MS = 330_000;
const schemasAllowed = (startedAt: number): boolean => {
  const ok = Date.now() - startedAt <= SCHEMA_START_LIMIT_MS;
  if (!ok) console.log(JSON.stringify({ type: "carousel_time_budget", skipped: "schemas", elapsed_ms: Date.now() - startedAt }));
  return ok;
};

/** SCHÉMAS du carrousel texte, décidés après l'écriture et ses relectures. */
export function placeTextSchemas(content: string, opts: { usage: UsageSink; startedAt: number; maxSlides: number }) {
  return addSchemasToContent(content, { isMix: false, usage: opts.usage, allowed: schemasAllowed(opts.startedAt), maxSlides: opts.maxSlides });
}

/** SCHÉMAS du mixte : dessinés par le code en slide « pause » (piste B
 * validée par Laetitia le 03/10/2026, mix-schema-render.ts), seulement les
 * types que la mise en page sait dessiner (MIX_SCHEMA_TYPES). */
export function placeMixSchemas(content: string, opts: { usage: UsageSink; startedAt: number }) {
  return addSchemasToContent(content, { isMix: true, usage: opts.usage, allowed: MIX_SCHEMAS_ENABLED && schemasAllowed(opts.startedAt) });
}

/** Trace de l'étage schémas (mêmes champs qu'avant le déplacement). */
export function logSchemaFormatting(label: string, plan: SchemaPlan | null | undefined): void {
  if (plan) console.log(JSON.stringify({ event: "carousel_schema_formatting", label, status: plan.status, proposed: plan.proposed ?? 0, rejected: plan.rejected ?? [], spotted: plan.spotted ?? [], schemas: plan.schemas.map(x => x.visual_schema.type) }));
}

// Garde DÉTERMINISTE : le prompt limite les schémas (max 2, jamais consécutifs)
// mais le modèle déborde (3 consécutifs observés en prod le 04/07). On applique
// la règle par code — le narratif prime, cf PR #112/#113.
export function capVisualSchemas(content: string, logPrefix: string): string {
  const capped = limitVisualSchemas(content);
  if (capped.stripped > 0) console.warn(`${logPrefix}: ${capped.stripped} visual_schema retiré(s) (max 2, jamais consécutifs)`);
  return capped.content;
}

type MixWrite = (sink: UsageSink) => Promise<string>;
type MixRepair = (draft: string, defects: string, sink: UsageSink, abortTimeoutMs?: number) => Promise<string>;

// DISPOSITION hors de la rédaction (04/10/2026) : la rédaction du mixte
// n'écrit que le texte et la structure (slide_type, photo_index). Ce qu'elle
// écrirait quand même en photo_layout / overlay_position / overlay_style est
// ignoré ; une réparation garde ceux du brouillon (structure confirmée). La
// disposition est choisie au rendu par mix-layout-formatting.ts.
export function withoutMixWriterLayout(write: MixWrite, repair: MixRepair | undefined): { write: MixWrite; repair: MixRepair | undefined } {
  return {
    write: (sink: UsageSink) => write(sink).then(stripMixWriterLayoutFields),
    repair: repair ? (draft, defects, sink, abortTimeoutMs) => repair(draft, defects, sink, abortTimeoutMs).then(out => keepDraftLayoutFields(draft, out)) : undefined,
  };
}

// Mise en page hors de l'écriture (photo) : gabarit, chiffre, liste, étape et
// attribution sont posés ensuite, à partir du texte FINAL (assignPhotoTemplates,
// après la relecture et le redac-gate).
export function withoutPhotoWriterLayout(content: string): string {
  return stripWriterLayoutFields(content);
}

// RÉCIT CONTINU photo / mixte (lot 8b, 14/10/2026) : continuous-narrative.ts
// écrit les passages et leur structure (slide_type, rôle, photo_index) ;
// la mise en forme de chaque passage vient d'ici. Code déplacé à l'identique
// depuis composeNarrative (mêmes champs, même ordre, même sortie).

/** Mot clé de couverture gardé seulement s'il est un extrait exact et court de
 * l'accroche (même longueur maximale et même règle que le rendu, sinon
 * carousel-visual le refuserait). L'IA le propose en écrivant (socle, règle 7). */
export function narrativeCoverAccent(hook: string, accent: string | undefined): string | undefined {
  return validExtract(hook, accent, coverAccentMaxWords(hook.trim().split(/\s+/).filter(Boolean).length));
}

/** Passage plein écran (photo_full) : style, position et gabarit du texte sur
 * la photo ; les champs de gabarit restent vides. */
// deno-lint-ignore no-explicit-any
export function narrativePhotoLayout(i: number, last: boolean, ref: any) {
  return {
    overlay_position: ref.overlay_position || "bottom_center",
    overlay_style: "narratif",
    template: i === 0 ? "couverture" : last ? "finale" : "profonde",
    kicker: null,
    detail: null,
    cta_label: null,
  };
}

/** Passage du mixte hors plein écran : aucun schéma ; disposition seulement
 * celle d'une structure confirmée. Un défaut posé ici passait pour un choix et
 * la disposition est décidée au rendu (mix-layout-formatting.ts). */
// deno-lint-ignore no-explicit-any
export function narrativeMixLayout(slideType: string, ref: any) {
  return {
    visual_schema: null,
    ...(slideType === "photo_integrated" && ref.photo_layout
      ? { photo_layout: ref.photo_layout }
      : {}),
  };
}
