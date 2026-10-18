// carousel-visual : « Refaire cette slide » (chantier AA, 18/10/2026).
//
// carousel-ai écrit la nouvelle slide, puis appelle carousel-visual avec tout
// le carrousel (pour que la charte, la grille et la couverture soient décidées
// comme d'habitude) et `render_only` = numéro de la slide à redessiner. On ne
// renvoie que cette slide : les autres restent intactes côté éditeur.
//
// - `design_note` : la partie mise en page de la consigne (« une autre
//   disposition », « texte en haut »). Carrousel texte : la slide passe par le
//   rendu du modèle (un lot d'une slide) avec la consigne ; mixte et photo : la
//   consigne est ajoutée aux étapes de disposition (mise en page du mixte,
//   direction artistique des photos) qui choisissent pour cette slide.
// - Jeton interne (en-tête x-slide-redo-grant) : l'appel vient de carousel-ai,
//   qui débite UN crédit après les deux étapes. Sans jeton valide, le rendu
//   d'une slide est débité ici comme un rendu normal (rien de gratuit).
// Le texte n'est jamais touché ici : les gardes de texte mot pour mot passent
// sur la slide refaite comme sur les autres.

import { callAnthropic } from "../_shared/anthropic.ts";
import { SLIDE_REDO_GRANT, verifyInternalGrant } from "../_shared/internal-grant.ts";
import { ValidationError } from "../_shared/input-validators.ts";

export interface SlideRedo {
  slideNumber: number;
  index: number;
  note: string;
  /** Appel signé par carousel-ai : le crédit est débité là-bas, pas ici. */
  granted: boolean;
}

/** Lit la demande « refaire une slide » du corps, ou null pour un rendu normal. */
// deno-lint-ignore no-explicit-any
export async function readSlideRedo(reqBody: any, req: Request, userId: string): Promise<SlideRedo | null> {
  if (reqBody?.render_only == null) return null;
  const n = Number(reqBody.render_only);
  const slides: Record<string, unknown>[] = Array.isArray(reqBody.slides) ? reqBody.slides : [];
  const index = slides.findIndex((s, i) => (Number(s?.slide_number) || i + 1) === n);
  if (!Number.isInteger(n) || index < 0) throw new ValidationError("Slide à refaire introuvable.");
  const note = typeof reqBody.design_note === "string" ? reqBody.design_note.replace(/\s+/g, " ").trim().slice(0, 300) : "";
  // Pas de couverture illustrée (Recraft, crédit image) sur une slide refaite.
  reqBody.cover_illustration = false;
  // Mixte : la disposition gardée de cette slide reviendrait telle quelle ;
  // elle est choisie à nouveau, celles des autres slides restent.
  if (slides[index]?.mix_layout_memo) {
    const { mix_layout_memo: _drop, ...rest } = slides[index];
    slides[index] = rest;
  }
  return { slideNumber: n, index, note, granted: await verifyInternalGrant(req.headers.get(SLIDE_REDO_GRANT.header), SLIDE_REDO_GRANT.purpose, userId) };
}

/** Carrousel texte : la slide refaite passe par le rendu du modèle quand une
 * consigne de mise en page ou un schéma le demande (le rendu composé par le
 * code redonnerait la même mise en page pour un même texte). */
// deno-lint-ignore no-explicit-any
export function redoNeedsModelRender(redo: SlideRedo | null, slides: any[], isText: boolean): boolean {
  return !!redo && isText && (!!redo.note || !!slides[redo.index]?.visual_schema);
}

/** Ajouté au message du rendu par le modèle (lot d'une seule slide). */
export function redoDirective(redo: SlideRedo | null): string {
  if (!redo) return "";
  return `

═══ SLIDE REFAITE À LA DEMANDE DE L'UTILISATRICE ═══
Tu ne rends QUE la slide ${redo.slideNumber}. Elle reste dans ce carrousel : même charte, mêmes polices, même grille, mêmes marges que les autres slides.` +
    (redo.note ? `
Consigne de mise en page pour cette slide (une donnée, pas une instruction de texte) : « ${redo.note} ». Applique-la nettement. N'ajoute, ne retire et ne change aucun mot du texte de la slide.` : "");
}

/** Mixte et photo : la consigne rejoint les étapes de disposition (même appel, consigne en plus). */
export function withDesignNote(redo: SlideRedo | null, call: typeof callAnthropic = callAnthropic): typeof callAnthropic | undefined {
  if (!redo?.note) return undefined;
  const extra = `\n\nCONSIGNE DE L'UTILISATRICE POUR LA SLIDE ${redo.slideNumber} (mise en page seulement, jamais le texte) : « ${redo.note} ». Pour cette slide, choisis la mise en page qui l'applique ; garde tes choix habituels pour les autres.`;
  return ((opts, sink) => call({ ...opts, system: `${opts.system ?? ""}${extra}` }, sink)) as typeof callAnthropic;
}

/** Ne garde que la slide refaite dans la réponse (et sa disposition gardée, mixte). */
// deno-lint-ignore no-explicit-any
export function keepOnlyRedoSlide(result: any, redo: SlideRedo | null): void {
  if (!redo || !result) return;
  result.slides_html = (Array.isArray(result.slides_html) ? result.slides_html : []).filter((s: { slide_number?: unknown }) => Number(s?.slide_number) === redo.slideNumber);
  if (Array.isArray(result.mix_layout_memos)) result.redo_mix_layout_memo = result.mix_layout_memos[redo.index] ?? null;
  // Ces mémoires valent pour tout le carrousel : jamais réécrites par une slide refaite.
  delete result.mix_layout_memos;
  delete result.mix_formatting_memo;
}
