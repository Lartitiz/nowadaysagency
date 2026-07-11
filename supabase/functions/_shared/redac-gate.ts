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
  // Toutes les fins possibles (« justifier », « dénigrer », « me plaindre »…) :
  // c'est l'OUVERTURE qui est moulée, vue à l'identique dans des contenus distincts.
  /Je ne dis pas ça pour /i,
  /L(?:'|’)IA structure, toi tu incarnes/i,
];

const wordCount = (s: string) => (s || "").trim().split(/\s+/).filter(Boolean).length;

// ── Chiffres inventés (lot 3) ──
// Politique (arbitrage 10/07) : aucun chiffre précis qui ne vient pas de
// l'utilisatrice (brief, réponses, branding) ou de l'actu fournie. L'audit a
// montré des stats fabriquées ET contradictoires entre contenus (pertes
// « 10-20 % » vs « 20-30 % » vs « une sur trois » dans le même carrousel).

const NUMBER_TOKEN = /\d+(?:[.,]\d+)?/g;

/** Tokens numériques d'un texte (pour construire la liste blanche d'entrée). */
export function numbersIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of (text || "").matchAll(NUMBER_TOKEN)) out.add(m[0].replace(",", "."));
  return out;
}

/** Chiffres du texte absents de la liste blanche, avec un extrait de contexte. */
function findFabricatedNumbers(text: string, allowed: Set<string>): string[] {
  const found: string[] = [];
  const seenValues = new Set<string>();
  for (const m of (text || "").matchAll(NUMBER_TOKEN)) {
    const tok = m[0].replace(",", ".");
    if (allowed.has(tok)) continue;
    // Ordinaux (« 1er », « 2e », « 1ʳᵉ ») : pas des statistiques.
    const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 3);
    if (/^(?:er|re|e\b|ᵉ|ʳ)/.test(after)) continue;
    // Dédup par VALEUR : « 35 » relevé trois fois = un seul chiffre à traiter.
    if (seenValues.has(tok)) continue;
    seenValues.add(tok);
    const ctx = text.slice(Math.max(0, m.index! - 30), m.index! + m[0].length + 30).replace(/\s+/g, " ").trim();
    found.push(`${m[0]} (« …${ctx}… »)`);
  }
  return found;
}

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

/** Corps mesurable d'une slide pour la règle « 50 mots » (titre exclu). */
function slideBody(s: any): string {
  return [s?.body, s?.overlay_text].filter(Boolean).join(" ");
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
  fabricatedNumbers: string[];
}

export function analyzeCarouselRedac(parsed: any, allowedNumbers?: Set<string>): RedacAnalysis {
  const slides: any[] = Array.isArray(parsed?.slides) ? parsed.slides : [];
  const caption = parsed?.caption || {};
  const allText = [
    ...slides.map(slideTexts),
    [caption.hook, caption.body, caption.cta].filter(Boolean).join(" "),
  ].join("\n");

  const reversals = findReversals(allText);

  const overlongSlides = slides
    .map((s: any) => ({ slide: s?.slide_number ?? 0, words: wordCount(slideBody(s)) }))
    .filter((x) => x.words > 55); // 50 (règle, corps seul) + tolérance de comptage

  // CTA de caption ≡ CTA de la dernière slide (la caption doit COMPLÉTER, pas répéter)
  const lastSlide = slides[slides.length - 1];
  const ctaDuplicated = Boolean(
    caption?.cta && lastSlide && tokenSimilarity(caption.cta, slideTexts(lastSlide)) >= 0.7,
  );

  const moulded = MOULDED_VERBATIMS.map((re) => allText.match(re)?.[0]).filter(Boolean) as string[];

  const hashtagsCount = Array.isArray(caption?.hashtags) ? caption.hashtags.length : 0;

  // Chiffres : on analyse aussi les schémas visuels (stats affichées sur les slides)
  const schemaText = slides
    .map((s: any) => (s?.visual_schema ? JSON.stringify(s.visual_schema) : ""))
    .join("\n");
  const fabricatedNumbers = allowedNumbers
    ? findFabricatedNumbers(allText + "\n" + schemaText, allowedNumbers)
    : [];

  return { reversals, overlongSlides, ctaDuplicated, moulded, hashtagsCount, fabricatedNumbers };
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
    a.moulded.length +
    Math.min(3, a.fabricatedNumbers.length);
  return {
    source: "code",
    score: Math.max(40, 100 - 10 * violations),
    reversal_negation_count: a.reversals.length,
    slides_over_50_words: a.overlongSlides,
    caption_cta_duplicates_slide: a.ctaDuplicated,
    moulded_verbatims: a.moulded,
    fabricated_numbers: a.fabricatedNumbers.length,
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
  if (a.fabricatedNumbers.length) {
    lines.push(
      `CHIFFRES SANS SOURCE : ces chiffres ne viennent ni du brief, ni des réponses de l'utilisatrice, ni de son branding, ni de l'actu fournie :\n${a.fabricatedNumbers.map((n) => `- ${n}`).join("\n")}\nRemplace CHACUN par une formulation qualitative honnête (« une bonne partie », « plusieurs semaines », « la plupart », « bien plus cher »). N'invente JAMAIS de statistique, de prix, de durée ou de proportion. Si un schéma visuel de type stats n'a plus de chiffre à afficher, transforme-le en slide texte.`,
    );
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
  opts: {
    isLinkedIn: boolean;
    correction: CorrectionOptions;
    onStatus?: (s: string) => void;
    /** Texte d'entrée (brief, réponses, branding, actu) : liste blanche des chiffres autorisés. */
    inputText?: string;
  },
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

  const allowedNumbers = opts.inputText !== undefined ? numbersIn(opts.inputText) : undefined;
  const before = analyzeCarouselRedac(first.parsed, allowedNumbers);
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

  // Filet schémas : la re-passe ne voit que les textes — un visual_schema qui
  // porte encore des chiffres sans source est retiré en code (la slide redevient
  // texte au rendu). Vu au re-test v3 : slides propres mais schéma stats
  // « 20 % d'eau / 7-14j / 1000°C+ » entièrement inventé.
  if (allowedNumbers) {
    const slides = Array.isArray(finalDoc.parsed?.slides) ? finalDoc.parsed.slides : [];
    for (const sl of slides) {
      if (!sl?.visual_schema) continue;
      const fab = findFabricatedNumbers(JSON.stringify(sl.visual_schema), allowedNumbers);
      if (fab.length) {
        console.log(`[redac-gate] visual_schema slide ${sl.slide_number} retiré (chiffres sans source : ${fab.map((f) => f.split(" ")[0]).join(", ")})`);
        sl.visual_schema = null;
      }
    }
  }

  const after = analyzeCarouselRedac(finalDoc.parsed, allowedNumbers);
  normalizeCaptionHashtags(finalDoc.parsed, opts.isLinkedIn);
  finalDoc.parsed.quality_check = buildQualityCheck(after, repassed);

  out = out.includes(finalDoc.raw)
    ? out.replace(finalDoc.raw, JSON.stringify(finalDoc.parsed, null, 2))
    : content.replace(first.raw, JSON.stringify(finalDoc.parsed, null, 2));

  console.log(
    `[redac-gate] retournements ${before.reversals.length}→${after.reversals.length}, slides>50 ${before.overlongSlides.length}→${after.overlongSlides.length}, ctaDup ${before.ctaDuplicated}→${after.ctaDuplicated}, moulés ${before.moulded.length}→${after.moulded.length}, chiffres inventés ${before.fabricatedNumbers.length}→${after.fabricatedNumbers.length}, hashtags ${before.hashtagsCount}→${Math.min(before.hashtagsCount, opts.isLinkedIn ? 2 : 3)}, re-passe=${repassed}`,
  );

  return { content: out, repassed, before, after };
}

function emptyAnalysis(): RedacAnalysis {
  return { reversals: [], overlongSlides: [], ctaDuplicated: false, moulded: [], hashtagsCount: 0, fabricatedNumbers: [] };
}

// ── Variante TEXTE (lot 4) : LinkedIn et newsletter ──
// Mêmes mesures que le gate carrousel, sur un texte brut. Le résultat s'injecte
// en `extraInstructions` dans la passe de correction DÉJÀ existante de
// creative-flow (aucun appel IA supplémentaire).

export interface TextRedacAnalysis {
  reversals: string[];
  moulded: string[];
  fabricatedNumbers: string[];
}

export function analyzeTextRedac(text: string, allowedNumbers?: Set<string>): TextRedacAnalysis {
  const reversals = findReversals(text || "");
  const moulded = MOULDED_VERBATIMS.map((re) => (text || "").match(re)?.[0]).filter(Boolean) as string[];
  const fabricatedNumbers = allowedNumbers ? findFabricatedNumbers(text || "", allowedNumbers) : [];
  return { reversals, moulded, fabricatedNumbers };
}

/** Instructions ciblées pour la passe de correction texte ("" si rien à corriger). */
export function buildTextFixInstructions(a: TextRedacAnalysis): string {
  const lines: string[] = [];
  if (a.reversals.length > 1) {
    lines.push(
      `RETOURNEMENTS PAR NÉGATION : ${a.reversals.length} détectés, le maximum est 1 PAR CONTENU. Garde UNIQUEMENT le plus fort, réécris les autres en affirmation directe :\n${a.reversals.map((r) => `- « ${r} »`).join("\n")}`,
    );
  }
  for (const m of a.moulded) {
    lines.push(`FORMULE MOULÉE : « ${m} » est une signature IA récurrente. Réécris-la autrement (ou supprime-la).`);
  }
  if (a.fabricatedNumbers.length) {
    lines.push(
      `CHIFFRES SANS SOURCE : ces chiffres ne viennent ni du brief, ni des réponses de l'utilisatrice, ni de son branding, ni de l'actu fournie :\n${a.fabricatedNumbers.map((n) => `- ${n}`).join("\n")}\nRemplace CHACUN par une formulation qualitative honnête (« une bonne partie », « plusieurs heures », « bien plus cher »). N'invente JAMAIS de statistique, de prix, de durée ou de proportion.`,
    );
  }
  return lines.join("\n\n");
}
