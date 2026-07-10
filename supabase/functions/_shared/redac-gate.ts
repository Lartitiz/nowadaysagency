// ── Quality-gate rédactionnel des carrousels (audit du 10/07/2026) ──
//
// Constat de l'audit corpus : le `quality_check` auto-déclaré par le modèle est
// FAUX (déclarait « slides < 50 mots » et « caption ≠ slide » sur des carrousels
// qui violaient les deux), et les règles ANTI_SLOP restent probabilistes (le
// retournement par négation sortait 3-4× par carrousel malgré la règle « 1 max »).
//
// Ce module fait la seule chose fiable : MESURER en code, puis demander UNE
// re-passe LLM ciblée sur les phrases fautives (jamais plus d'une), et re-mesurer.
// Le quality_check émis au front est celui calculé ici (source: "code").

import { applyCorrectionPassCarousel, type CorrectionOptions } from "./correction-pass.ts";

// ── Détection de la famille « retournement par négation » ──
// Mêmes variantes que la règle ANTI_SLOP : "Ce n'est pas X, c'est Y" /
// "Pas X. Y." / "X n'est plus Y. C'est Z." / "Je ne dis pas X. Je dis Y."
const REVERSAL_PATTERNS: RegExp[] = [
  /\bn(?:'|’)est pas [^.!?\n]{2,90}[.,:] ?[Cc](?:'|’)est\b/,
  /\bc(?:'|’)est pas [^.!?\n]{2,90}[.,:] ?[Cc](?:'|’)est\b/,
  /\bne sont pas [^.!?\n]{2,90}[.,:] ?[Cc]e sont\b/,
  /\bn(?:'|’)est plus [^.!?\n]{2,90}\. ?[Cc](?:'|’)est\b/,
  /(?:^|[.!?]\s+)Pas (?:parce que|pour|un|une|de|du|des|le|la|les|ça)\b[^.!?\n]{0,80}[.:] ?(?:[CcJj](?:'|’)|Juste|Parce que|Mais)/,
  /\bJe ne [^.!?\n]{2,60} pas(?: ça)?[^.!?\n]{0,40}\. ?Je [^\s]+ (?:parce que|pour|que)\b/,
  /(?:^|[.!?]\s+)Pas [^.!?\n]{2,60}\. ?(?:C(?:'|’)est|Juste|Plutôt)\b/,
];

// Formules moulées repérées à l'identique dans deux contenus générés à 30 min
// d'écart : si on les laisse, elles se voient dès que deux posts cohabitent.
const MOULDED_VERBATIMS: RegExp[] = [
  /Je ne dis pas ça pour (?:me )?justifier/i,
  /L(?:'|’)IA structure, toi tu incarnes/i,
];

const wordCount = (s: string) => (s || "").trim().split(/\s+/).filter(Boolean).length;

/** Similarité lexicale grossière (Jaccard sur tokens > 3 lettres). */
function tokenSimilarity(a: string, b: string): number {
  const tok = (s: string) =>
    new Set((s || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 3));
  const ta = tok(a);
  const tb = tok(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const w of ta) if (tb.has(w)) inter++;
  return inter / Math.min(ta.size, tb.size);
}

function slideTexts(s: any): string {
  return [s?.title, s?.body, s?.overlay_text].filter(Boolean).join(" ");
}

function findReversals(text: string): string[] {
  const found: string[] = [];
  // Analyse phrase par phrase pour remonter des extraits actionnables
  const sentences = (text || "").split(/(?<=[.!?])\s+/);
  for (let i = 0; i < sentences.length; i++) {
    const window = sentences.slice(i, i + 2).join(" ");
    for (const re of REVERSAL_PATTERNS) {
      const m = window.match(re);
      if (m) {
        found.push(m[0].slice(0, 140));
        break;
      }
    }
  }
  return [...new Set(found)];
}

export interface RedacAnalysis {
  reversals: string[];
  overlongSlides: Array<{ slide: number; words: number }>;
  ctaDuplicated: boolean;
  moulded: string[];
  hashtagsCount: number;
}

export function analyzeCarouselRedac(parsed: any): RedacAnalysis {
  const slides: any[] = Array.isArray(parsed?.slides) ? parsed.slides : [];
  const caption = parsed?.caption || {};
  const allText = [
    ...slides.map(slideTexts),
    [caption.hook, caption.body, caption.cta].filter(Boolean).join(" "),
  ].join("\n");

  const reversals = findReversals(allText);

  const overlongSlides = slides
    .map((s: any) => ({ slide: s?.slide_number ?? 0, words: wordCount(slideTexts(s)) }))
    .filter((x) => x.words > 55); // 50 (règle) + tolérance de comptage

  // CTA de caption ≡ CTA de la dernière slide (la caption doit COMPLÉTER, pas répéter)
  const lastSlide = slides[slides.length - 1];
  const ctaDuplicated = Boolean(
    caption?.cta && lastSlide && tokenSimilarity(caption.cta, slideTexts(lastSlide)) >= 0.7,
  );

  const moulded = MOULDED_VERBATIMS.map((re) => allText.match(re)?.[0]).filter(Boolean) as string[];

  const hashtagsCount = Array.isArray(caption?.hashtags) ? caption.hashtags.length : 0;

  return { reversals, overlongSlides, ctaDuplicated, moulded, hashtagsCount };
}

/**
 * Normalise les hashtags de la caption : cap par canal (3 Instagram, 2 LinkedIn),
 * sans « # » (convention du schéma), dédoublonnés, espaces retirés. Le prompt
 * demandait 3 et le modèle en sortait 7-8, tantôt avec tantôt sans « # ».
 */
export function normalizeCaptionHashtags(parsed: any, isLinkedIn: boolean): void {
  const caption = parsed?.caption;
  if (!caption || !Array.isArray(caption.hashtags)) return;
  const max = isLinkedIn ? 2 : 3;
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const h of caption.hashtags) {
    if (typeof h !== "string") continue;
    const tag = h.trim().replace(/^#+/, "").replace(/\s+/g, "");
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(tag);
    if (clean.length >= max) break;
  }
  caption.hashtags = clean;
}

/** quality_check calculé (remplace l'auto-déclaré, qui rapportait faux). */
function buildQualityCheck(a: RedacAnalysis, repassed: boolean) {
  const violations =
    Math.max(0, a.reversals.length - 1) + // 1 retournement est toléré (règle « 1 max »)
    a.overlongSlides.length +
    (a.ctaDuplicated ? 1 : 0) +
    a.moulded.length;
  return {
    source: "code",
    score: Math.max(40, 100 - 10 * violations),
    reversal_negation_count: a.reversals.length,
    slides_over_50_words: a.overlongSlides,
    caption_cta_duplicates_slide: a.ctaDuplicated,
    moulded_verbatims: a.moulded,
    hashtags_count: a.hashtagsCount,
    corrected_by_repass: repassed,
  };
}

/** Construit les instructions ciblées de la re-passe à partir des mesures. */
function buildFixInstructions(a: RedacAnalysis): string {
  const lines: string[] = [];
  if (a.reversals.length > 1) {
    lines.push(
      `RETOURNEMENTS PAR NÉGATION : ${a.reversals.length} détectés, le maximum est 1 PAR CARROUSEL (caption comprise). Garde UNIQUEMENT le plus fort, réécris les autres en affirmation directe (même sens, sans « pas X, c'est Y ») :\n${a.reversals.map((r) => `- « ${r} »`).join("\n")}`,
    );
  }
  for (const s of a.overlongSlides) {
    lines.push(`SLIDE ${s.slide} : ${s.words} mots, maximum 50. Coupe sans perdre le fait concret.`);
  }
  if (a.ctaDuplicated) {
    lines.push(
      `CTA DUPLIQUÉ : le "cta" de la caption répète la dernière slide. Réécris le cta de la CAPTION pour qu'il soit COMPLÉMENTAIRE (autre formulation, autre angle d'invitation), pas une copie.`,
    );
  }
  for (const m of a.moulded) {
    lines.push(`FORMULE MOULÉE : « ${m} » est une signature IA récurrente. Réécris-la autrement (ou supprime-la).`);
  }
  return lines.join("\n\n");
}

export interface RedacGateResult {
  content: string;
  repassed: boolean;
  before: RedacAnalysis;
  after: RedacAnalysis;
}

/**
 * Gate complet sur le `content` (JSON fenced) d'un carrousel :
 * mesure → si violations, UNE re-passe LLM ciblée → re-mesure → hashtags
 * normalisés → quality_check remplacé par la version calculée.
 * En cas de JSON illisible, renvoie le contenu tel quel (même contrat que les
 * autres gardes de carousel-ai).
 */
export async function runRedacGate(
  content: string,
  opts: { isLinkedIn: boolean; correction: CorrectionOptions; onStatus?: (s: string) => void },
): Promise<RedacGateResult> {
  const parseFenced = (c: string): { parsed: any; raw: string } | null => {
    const m = c.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return { parsed: JSON.parse(m[0]), raw: m[0] };
    } catch {
      return null;
    }
  };

  const first = parseFenced(content);
  if (!first) return { content, repassed: false, before: emptyAnalysis(), after: emptyAnalysis() };

  const before = analyzeCarouselRedac(first.parsed);
  let out = content;
  let repassed = false;

  const fixes = buildFixInstructions(before);
  if (fixes) {
    try {
      opts.onStatus?.("correcting");
      const corrected = await applyCorrectionPassCarousel(out, {
        ...opts.correction,
        extraInstructions: fixes,
      });
      if (corrected && corrected !== out) {
        out = corrected;
        repassed = true;
      }
    } catch (e) {
      console.error("[redac-gate] re-passe ciblée échouée, contenu conservé :", e);
    }
  }

  const finalDoc = parseFenced(out) || parseFenced(content);
  if (!finalDoc) return { content: out, repassed, before, after: before };

  const after = analyzeCarouselRedac(finalDoc.parsed);
  normalizeCaptionHashtags(finalDoc.parsed, opts.isLinkedIn);
  finalDoc.parsed.quality_check = buildQualityCheck(after, repassed);

  out = out.includes(finalDoc.raw)
    ? out.replace(finalDoc.raw, JSON.stringify(finalDoc.parsed, null, 2))
    : content.replace(first.raw, JSON.stringify(finalDoc.parsed, null, 2));

  console.log(
    `[redac-gate] retournements ${before.reversals.length}→${after.reversals.length}, slides>50 ${before.overlongSlides.length}→${after.overlongSlides.length}, ctaDup ${before.ctaDuplicated}→${after.ctaDuplicated}, moulés ${before.moulded.length}→${after.moulded.length}, hashtags ${before.hashtagsCount}→${Math.min(before.hashtagsCount, opts.isLinkedIn ? 2 : 3)}, re-passe=${repassed}`,
  );

  return { content: out, repassed, before, after };
}

function emptyAnalysis(): RedacAnalysis {
  return { reversals: [], overlongSlides: [], ctaDuplicated: false, moulded: [], hashtagsCount: 0 };
}
