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
import { addSchemasToContent, DENSE_SLIDE_WORDS, planRequestedSchema, SCHEMA_TYPES, wordCount, type SchemaPlan } from "../_shared/schema-formatting.ts";
import { MIX_SCHEMA_TYPES } from "../_shared/mix-schema-render.ts";
import { SLIDE_REDO_GRANT, signInternalGrant } from "../_shared/internal-grant.ts";
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

// ── « REFAIRE CETTE SLIDE » (chantier AA, 18/10/2026) ──
// L'écriture (modes/slide-redo.ts) refait le texte ; la mise en forme vient
// d'ici : le schéma demandé par l'utilisatrice, puis le dessin de la slide par
// carousel-visual. Rien ici ne débite : le crédit unique est posé par le mode,
// après les deux étapes.

/** Types de schéma que l'utilisatrice peut demander (le mixte n'en dessine que quelques-uns). */
export const REDO_SCHEMA_TYPES: readonly string[] = SCHEMA_TYPES;
export const REDO_MIX_SCHEMA_TYPES: readonly string[] = MIX_SCHEMA_TYPES;

/** Carrousel texte : un schéma ne se pose qu'à côté d'un texte court (45 mots au
 * plus, titre compris ; décision de Laetitia du 04/10/2026). Vu au premier essai
 * réel du 18/10/2026 : une frise demandée, un texte de 55 mots, schéma refusé. */
export const REDO_SCHEMA_MAX_WORDS = DENSE_SLIDE_WORDS;
// deno-lint-ignore no-explicit-any
export function redoSchemaHasRoom(slide: Record<string, any>, isMix: boolean): boolean {
  return isMix || wordCount(slide) <= DENSE_SLIDE_WORDS;
}

/** Schéma demandé, tiré du texte final de la slide ; null si le texte ne le permet pas. */
// deno-lint-ignore no-explicit-any
export function redoSlideSchema(slide: Record<string, any>, type: string, isMix: boolean, usage: UsageSink, request = "") {
  return planRequestedSchema(slide, type, isMix, usage, undefined, request);
}

export interface RedesignRequest {
  /** Corps habituel de carousel-visual préparé par l'appli (photos, charte, type), sans les slides. */
  visualRequest: Record<string, unknown>;
  slides: unknown[];
  slideNumber: number;
  designNote: string;
  authHeader: string;
  userId: string;
}
export type RedesignResult =
  | { ok: true; html: string; mixLayoutMemo: unknown; usage: { total_tokens?: number; model?: string } }
  | { ok: false; status: number; error: string; quota?: unknown };

/** Dessin de la slide refaite par carousel-visual (render_only), jeton interne
 * pour qu'il ne débite pas une deuxième fois. */
export async function redesignSlide(r: RedesignRequest): Promise<RedesignResult> {
  const grant = await signInternalGrant(SLIDE_REDO_GRANT.purpose, r.userId);
  let res: Response;
  try {
    res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/carousel-visual`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: r.authHeader, apikey: Deno.env.get("SUPABASE_ANON_KEY") || "", [SLIDE_REDO_GRANT.header]: grant },
      body: JSON.stringify({ ...r.visualRequest, slides: r.slides, render_only: r.slideNumber, design_note: r.designNote || undefined, cover_illustration: false }),
      signal: AbortSignal.timeout(200_000),
    });
  } catch (e) {
    return { ok: false, status: 504, error: e instanceof Error ? e.message.slice(0, 200) : "délai dépassé" };
  }
  // deno-lint-ignore no-explicit-any
  const data: any = await res.json().catch(() => null);
  if (!res.ok || !data?.result) return { ok: false, status: res.status || 502, error: String(data?.error || "rendu indisponible").slice(0, 300), quota: data?.quota };
  // deno-lint-ignore no-explicit-any
  const slide = (Array.isArray(data.result.slides_html) ? data.result.slides_html : []).find((s: any) => Number(s?.slide_number) === r.slideNumber);
  if (typeof slide?.html !== "string" || !slide.html.trim()) return { ok: false, status: 502, error: "slide vide" };
  return { ok: true, html: slide.html, mixLayoutMemo: data.result.redo_mix_layout_memo ?? null, usage: data.redo_usage || {} };
}
