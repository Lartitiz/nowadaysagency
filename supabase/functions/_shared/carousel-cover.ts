// Couverture des carrousels (slide 1) — décision de Laetitia du 04/10/2026,
// maquettes validées (artifact PgWoFihtKiEnjyZ6LmhfnS) :
//   - une ACCROCHE en titre (4 à 10 mots, cible 5 à 8), qui crée une tension ;
//   - au plus un sous-titre de 12 mots, seulement s'il apporte quelque chose ;
//   - rien d'autre (pas de petit texte au-dessus, de corps, de pastille, de
//     motif, de numéro, de logo, de flèche « glisse ») ;
//   - titre et sous-titre centrés ; fond = aplat de la charte ou photo plein
//     cadre avec voile uniforme.
// La slide 2 relance comme une deuxième accroche : Instagram peut ouvrir le
// carrousel directement sur elle.
//
// Ce module porte la consigne d'écriture (partagée par tous les chemins qui
// rédigent une couverture) et le garde-fou appliqué APRÈS la rédaction : il ne
// touche que la slide 1 (et, si un sous-titre trop long doit partir, le début
// de la slide 2). Les autres slides gardent leur texte développé.
//
// La consigne COVER_WRITING et ses plafonds (règle « couverture_accroche » du
// socle commun) vivent dans socle.ts : réexportés ici à texte égal.

import { COVER_HOOK_MAX_WORDS, COVER_SUBTITLE_MAX_WORDS, COVER_WRITING } from "./socle.ts";
export { COVER_HOOK_MAX_WORDS, COVER_SUBTITLE_MAX_WORDS, COVER_WRITING };



export type CoverKind = "text" | "photo" | "mix";

export const coverKind = (carouselType: unknown): CoverKind =>
  carouselType === "photo" ? "photo" : carouselType === "mix" ? "mix" : "text";

export const coverWords = (text: unknown): number =>
  String(text ?? "").trim().split(/\s+/).filter(Boolean).length;

type Slide = Record<string, any>;

/** Champs de la couverture selon le type : `hook` = titre affiché, `subtitle`
 * = sous-titre facultatif. Photo et photo_full du mixte : overlay_text +
 * detail ; texte et slides title/body : title + body. */
export function coverFieldNames(slide: Slide, kind: CoverKind): { hook: string; subtitle: string } {
  const overlay = kind === "photo" || slide?.slide_type === "photo_full";
  return overlay ? { hook: "overlay_text", subtitle: "detail" } : { hook: "title", subtitle: "body" };
}

export interface CoverCheck {
  hookWords: number;
  subtitleWords: number;
  /** Le titre dépasse COVER_HOOK_MAX_WORDS (ou manque alors qu'un texte existe). */
  needsRewrite: boolean;
  /** Champs interdits présents sur la couverture. */
  extras: string[];
}

export function checkCover(slide: Slide | undefined, kind: CoverKind): CoverCheck {
  if (!slide) return { hookWords: 0, subtitleWords: 0, needsRewrite: false, extras: [] };
  const f = coverFieldNames(slide, kind);
  const hookWords = coverWords(slide[f.hook]);
  const subtitleWords = coverWords(slide[f.subtitle]);
  const extras = ["kicker", "cta_label", "big_number", "attribution"].filter((k) => String(slide[k] ?? "").trim());
  if (Array.isArray(slide.points) && slide.points.length) extras.push("points");
  if (slide.visual_schema) extras.push("visual_schema");
  return {
    hookWords,
    subtitleWords,
    needsRewrite: hookWords > COVER_HOOK_MAX_WORDS || (hookWords === 0 && subtitleWords > 0),
    extras,
  };
}

/** Index de la couverture (plus petit slide_number). */
function coverIndex(slides: Slide[]): number {
  let best = 0;
  slides.forEach((s, i) => {
    if ((Number(s?.slide_number) || i + 1) < (Number(slides[best]?.slide_number) || best + 1)) best = i;
  });
  return best;
}

function secondIndex(slides: Slide[], first: number): number {
  const n = Number(slides[first]?.slide_number) || first + 1;
  let best = -1;
  slides.forEach((s, i) => {
    if (i === first) return;
    const k = Number(s?.slide_number) || i + 1;
    if (k > n && (best < 0 || k < (Number(slides[best]?.slide_number) || best + 1))) best = i;
  });
  return best;
}

/** Texte principal d'une slide, champ éditable selon son type. */
function mainField(slide: Slide, kind: CoverKind): string {
  if (kind === "photo" || slide?.slide_type === "photo_full") return "overlay_text";
  return "body";
}

const numbers = (text: string) => new Set((text.match(/\d+(?:[.,]\d+)?/g) || []).map((n) => n.replace(",", ".")));

export interface CoverRewrite { hook: string; subtitle: string | null }

/** Une réécriture est acceptée si elle respecte les longueurs et n'apporte
 * aucun chiffre absent de la couverture d'origine (ni des sources). */
export function acceptCoverRewrite(rewrite: unknown, original: string, sources = ""): CoverRewrite | null {
  const r = rewrite as any;
  const hook = typeof r?.hook === "string" ? r.hook.trim() : "";
  const subtitle = typeof r?.subtitle === "string" && r.subtitle.trim() ? r.subtitle.trim() : null;
  const hw = coverWords(hook);
  if (hw < 2 || hw > COVER_HOOK_MAX_WORDS) return null;
  if (subtitle && coverWords(subtitle) > COVER_SUBTITLE_MAX_WORDS) return null;
  const allowed = numbers(original + "\n" + sources);
  for (const n of numbers(hook + " " + (subtitle || ""))) if (!allowed.has(n)) return null;
  return { hook, subtitle };
}

export interface CoverReceipt {
  kind: CoverKind;
  hook_words_before: number;
  hook_words_after: number;
  removed: string[];
  moved_to_slide_2: boolean;
  rewrite: "not_needed" | "accepted" | "rejected" | "failed" | "skipped_user_text" | "skipped_selected_hook" | "skipped_time";
}

export interface EnforceCoverOptions {
  kind: CoverKind;
  /** Texte écrit par la personne (« Mes slides ») : on ne touche pas aux mots. */
  userAuthored?: boolean;
  /** Accroche choisie par la personne à l'étape « accroches » : conservée. */
  selectedHook?: string | null;
  /** Sources (brief, recherche) : les chiffres de la réécriture doivent y figurer. */
  sources?: string;
  /** Réécriture IA de la couverture ; absente ou en échec → repli déterministe. */
  rewrite?: (input: { hook: string; subtitle: string; slide2: string }) => Promise<unknown>;
}

/**
 * Garde-fou de couverture, appliqué au document final. Ne modifie que la
 * slide 1 (et le début de la slide 2 quand un sous-titre trop long y part).
 * Ne jette jamais de propos rédigé : un sous-titre trop long passe en tête de
 * la slide 2. Le petit libellé au-dessus du titre (kicker) est retiré : c'est
 * une étiquette, pas du propos.
 */
export async function enforceCover(doc: any, opts: EnforceCoverOptions): Promise<{ doc: any; receipt: CoverReceipt | null }> {
  const slides: Slide[] = Array.isArray(doc?.slides) ? doc.slides : [];
  if (!slides.length) return { doc, receipt: null };
  const i1 = coverIndex(slides);
  const cover: Slide = { ...slides[i1] };
  const f = coverFieldNames(cover, opts.kind);
  const before = checkCover(cover, opts.kind);
  const removed: string[] = [];
  const out = slides.slice();
  let moved = false;

  // 1. Éléments de mise en forme qui n'ont pas leur place sur la couverture.
  for (const k of ["cta_label", "big_number", "attribution", "visual_schema"]) {
    if (cover[k]) { removed.push(k); cover[k] = null; }
  }
  if (Array.isArray(cover.points) && cover.points.length) { removed.push("points"); cover.points = []; }
  if (cover.template && cover.template !== "couverture") cover.template = "couverture";
  if (cover.art_direction) { removed.push("art_direction"); delete cover.art_direction; }
  if (cover.photo_format) delete cover.photo_format;
  if (cover.mix_format) delete cover.mix_format;
  if (String(cover.kicker ?? "").trim()) { removed.push("kicker"); cover.kicker = null; }

  // 2. Titre trop long : réécriture courte de la couverture seule.
  let rewrite: CoverReceipt["rewrite"] = "not_needed";
  const hookText = String(cover[f.hook] ?? "").trim();
  const subText = String(cover[f.subtitle] ?? "").trim();
  const i2 = secondIndex(out, i1);
  const slide2Field = i2 >= 0 ? mainField(out[i2], opts.kind) : "";
  const slide2Text = i2 >= 0 ? String(out[i2][slide2Field] ?? out[i2].title ?? "") : "";
  const selected = String(opts.selectedHook ?? "").trim();
  if (before.needsRewrite) {
    if (opts.userAuthored) rewrite = "skipped_user_text";
    else if (selected && hookText === selected) rewrite = "skipped_selected_hook";
    else if (!opts.rewrite) rewrite = "skipped_time";
    else {
      try {
        const accepted = acceptCoverRewrite(
          await opts.rewrite({ hook: hookText, subtitle: subText, slide2: slide2Text }),
          `${hookText}\n${subText}`,
          opts.sources,
        );
        if (accepted) {
          // Sans nouveau sous-titre, l'ancien reste (un sous-titre trop long
          // partira en tête de la slide 2 à l'étape suivante).
          cover[f.hook] = accepted.hook;
          cover[f.subtitle] = accepted.subtitle ?? (subText || (f.subtitle === "detail" ? null : ""));
          rewrite = "accepted";
        } else rewrite = "rejected";
      } catch {
        rewrite = "failed";
      }
    }
  }

  // 3. Sous-titre trop long : il part en tête de la slide 2 (texte gardé).
  const sub = String(cover[f.subtitle] ?? "").trim();
  if (!opts.userAuthored && coverWords(sub) > COVER_SUBTITLE_MAX_WORDS && i2 >= 0) {
    const s2 = { ...out[i2] };
    const field = slide2Field;
    const current = String(s2[field] ?? "").trim();
    if (!current.includes(sub)) s2[field] = current ? `${sub}\n\n${current}` : sub;
    out[i2] = s2;
    cover[f.subtitle] = f.subtitle === "detail" ? null : "";
    removed.push("long_subtitle");
    moved = true;
  }

  out[i1] = cover;
  return {
    doc: { ...doc, slides: out },
    receipt: {
      kind: opts.kind,
      hook_words_before: before.hookWords,
      hook_words_after: coverWords(cover[f.hook]),
      removed,
      moved_to_slide_2: moved,
      rewrite,
    },
  };
}

/** Prompt de la passe courte « couverture ». */
export function coverRewritePrompt(input: { hook: string; subtitle: string; slide2: string }, address?: "tu" | "vous" | null): string {
  // Tu ou vous réglé dans la fiche de marque : règle ferme (04/10/2026).
  const register = address === "vous"
    ? "le registre, et VOUVOIE le public (règle ferme de la fiche de marque : « vous », « votre », « vos », jamais « tu », « ton », « ta », « tes »)"
    : address === "tu"
      ? "le registre, et TUTOIE le public (règle ferme de la fiche de marque : « tu », « ton », « ta », « tes », jamais « vous », « votre », « vos »)"
      : "le registre et le tutoiement ou vouvoiement";
  return `${COVER_WRITING}

Réécris UNIQUEMENT la couverture de ce carrousel pour respecter ces règles. Garde le sens, la position défendue, ${register}. N'ajoute aucun fait, chiffre, nom ou vécu absent du texte fourni. Ne reprends pas mot pour mot la slide 2.

Couverture actuelle :
- titre : ${JSON.stringify(input.hook)}
- sous-titre : ${JSON.stringify(input.subtitle)}
Slide 2 (pour contexte, ne pas la répéter) : ${JSON.stringify(input.slide2.slice(0, 600))}

Réponds en JSON strict : {"hook": "accroche de 4 à ${COVER_HOOK_MAX_WORDS} mots", "subtitle": "sous-titre de ${COVER_SUBTITLE_MAX_WORDS} mots maximum, ou null s'il n'apporte rien"}`;
}
