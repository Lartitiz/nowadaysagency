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
  // Amorce de prise de position suggérée par DEPTH_LAYER_DUAL, devenue un tic :
  // mesurée dans 5/10 carrousels du corpus qualité 11/07, toujours même position.
  /Ce qui me (?:dérange|gêne)\b/i,
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

// ── Cohérence des durées slides ↔ caption (bilan hebdo 17/08/2026) ──
// Trou trouvé au juge /5 : un carrousel « avant/après » notait « Trois semaines
// sans visite » en slide 2 et « Un mois entre les deux photos » en légende — deux
// chiffres qui décrivent le MÊME fait, et le gate lui a mis 100/100.
// Pourquoi ça passait : NUMBER_TOKEN ne voit que les CHIFFRES (\d), donc les
// nombres écrits EN LETTRES échappaient déjà à `findFabricatedNumbers` ; et rien
// ne relisait les slides CONTRE la caption (les deux textes n'étaient comparés
// que pour le CTA). Une contradiction interne est pourtant le défaut le plus
// coûteux : il décrédibilise la publication devant l'audience de la cliente.

const FRENCH_NUMERALS: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7,
  huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, quinze: 15, vingt: 20,
  trente: 30, quarante: 40, cinquante: 50, soixante: 60, cent: 100,
};

/** Durée exprimée en JOURS, pour comparer « trois semaines » et « un mois ». */
const DURATION_UNITS: Array<{ re: RegExp; days: number }> = [
  { re: /^secondes?$/, days: 1 / 86400 },
  { re: /^minutes?$/, days: 1 / 1440 },
  { re: /^heures?$/, days: 1 / 24 },
  { re: /^(?:jours?|journées?)$/, days: 1 },
  { re: /^semaines?$/, days: 7 },
  { re: /^mois$/, days: 30 },
  { re: /^trimestres?$/, days: 90 },
  { re: /^(?:ans?|années?)$/, days: 365 },
];

interface Duration { raw: string; days: number }

/** Durées d'un texte, chiffrées (« 3 semaines ») ou en lettres (« trois semaines »). */
function extractDurations(text: string): Duration[] {
  const out: Duration[] = [];
  const words = "(?:" + Object.keys(FRENCH_NUMERALS).join("|") + ")";
  const re = new RegExp(`(\\d+(?:[.,]\\d+)?|${words})\\s+(\\p{L}+)`, "giu");
  for (const m of (text || "").matchAll(re)) {
    const qty = /^\d/.test(m[1]) ? parseFloat(m[1].replace(",", ".")) : FRENCH_NUMERALS[m[1].toLowerCase()];
    if (!qty || !Number.isFinite(qty)) continue;
    const unit = DURATION_UNITS.find((u) => u.re.test(m[2].toLowerCase()));
    if (!unit) continue;
    out.push({ raw: `${m[1]} ${m[2]}`, days: qty * unit.days });
  }
  return out;
}

/**
 * Durées PROCHES mais DIFFÉRENTES entre les slides et la caption = très
 * probablement le même fait raconté deux fois avec deux chiffres.
 *
 * Volontairement étroit pour ne pas crier à tort :
 *  - il faut une durée de CHAQUE côté ;
 *  - une durée commune aux deux côtés désamorce tout (le fait est cohérent) ;
 *  - on ne retient que les écarts du même ORDRE DE GRANDEUR (rapport ≤ 3) —
 *    « 2 minutes » côté slide et « 10 ans » côté caption parlent d'autre chose.
 */
function findDurationConflicts(slidesText: string, captionText: string): string[] {
  const a = extractDurations(slidesText);
  const b = extractDurations(captionText);
  if (!a.length || !b.length) return [];
  const same = (x: number, y: number) => Math.abs(x - y) < 1e-9;
  if (a.some((x) => b.some((y) => same(x.days, y.days)))) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of a) {
    for (const y of b) {
      const ratio = Math.max(x.days, y.days) / Math.min(x.days, y.days);
      if (ratio > 3) continue;
      const key = `${x.raw}|${y.raw}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(`slides « ${x.raw} » vs légende « ${y.raw} »`);
    }
  }
  return out;
}

// ── Recopie de la fiche de marque (audit slop 18/08) ──
// Constat du corpus mesuré le 18/08 : le champ combat_cause d'une fiche de
// marque ressortait QUASI MOT POUR MOT dans 4 contenus sur 7 générés dans le
// même run. Chaque contenu pris seul était correct — c'est la RÉPÉTITION
// LITTÉRALE d'un même passage qui trahit la machine dès que deux contenus
// cohabitent sur le même feed. Symétrique à findFabricatedNumbers() : au lieu
// d'une liste blanche de chiffres autorisés, une liste de passages à NE PAS
// recopier (les champs de marque bruts, fournis en entrée).
const BRAND_COPY_MIN_WORDS = 7;

/** Mots normalisés (accents gardés, ponctuation ignorée) pour comparer deux textes. */
function normalizeWordsForOverlap(text: string): string[] {
  return (text || "").toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || [];
}

interface OffsetWord { word: string; start: number; end: number }

/** Comme normalizeWordsForOverlap, mais garde la position dans le texte source. */
function wordsWithOffsets(text: string): OffsetWord[] {
  const out: OffsetWord[] = [];
  const re = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text || ""))) {
    out.push({ word: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/**
 * Passages du texte généré qui recopient `minWords` mots CONSÉCUTIFS d'un
 * champ de marque fourni en entrée (brandText). Volontairement une fenêtre
 * large (7 mots par défaut) : un mot de vocabulaire métier partagé seul
 * (« savon », « saponification ») ne peut jamais déclencher — il faut une
 * SÉQUENCE entière recopiée. Fusionne les fenêtres qui se chevauchent en un
 * seul passage pour ne pas remonter dix fois la même phrase longue.
 */
export function findBrandCopyOverlap(text: string, brandText: string | undefined, minWords = BRAND_COPY_MIN_WORDS): string[] {
  if (!text || !brandText) return [];
  const sourceWords = normalizeWordsForOverlap(brandText);
  if (sourceWords.length < minWords) return [];
  const sourceGrams = new Set<string>();
  for (let i = 0; i + minWords <= sourceWords.length; i++) {
    sourceGrams.add(sourceWords.slice(i, i + minWords).join(" "));
  }
  if (sourceGrams.size === 0) return [];

  const genWords = wordsWithOffsets(text);
  const matchedStart: boolean[] = new Array(genWords.length).fill(false);
  for (let i = 0; i + minWords <= genWords.length; i++) {
    const gram = genWords.slice(i, i + minWords).map((w) => w.word).join(" ");
    if (sourceGrams.has(gram)) matchedStart[i] = true;
  }

  const found: string[] = [];
  let i = 0;
  while (i < matchedStart.length) {
    if (!matchedStart[i]) { i++; continue; }
    let j = i;
    while (j < matchedStart.length && matchedStart[j]) j++;
    // Fenêtres qui démarrent en i..j-1 → passage complet [i, (j-1)+minWords).
    const spanStart = genWords[i].start;
    const spanEnd = genWords[j - 1 + minWords - 1].end;
    found.push(text.slice(spanStart, spanEnd).replace(/\s+/g, " ").trim());
    i = j;
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
  return [
    s?.title,
    s?.body,
    s?.overlay_text,
    // Champs de gabarit photo AFFICHÉS à l'écran (composés 13/07) : les ignorer
    // laissait passer sans contrôle un big_number inventé (rendu en 170px), des
    // tics ou des verbatims moulés logés dans kicker/detail/points/cta_label.
    s?.kicker,
    s?.detail,
    s?.big_number,
    ...(Array.isArray(s?.points) ? s.points : []),
    s?.attribution,
    s?.cta_label,
  ].filter(Boolean).join(" ");
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
  /** Overlays photo > 28 mots (règle : 5-25, un overlay est une phrase posée SUR la photo). */
  overlongOverlays: Array<{ slide: number; words: number }>;
  ctaDuplicated: boolean;
  moulded: string[];
  hashtagsCount: number;
  fabricatedNumbers: string[];
  /** Durées qui se contredisent entre les slides et la caption (même fait, 2 chiffres). */
  durationConflicts: string[];
  /** Passages qui recopient quasi mot pour mot un champ de la fiche de marque. */
  brandCopyOverlap: string[];
}

export function analyzeCarouselRedac(parsed: any, allowedNumbers?: Set<string>, brandGuardText?: string): RedacAnalysis {
  const slides: any[] = Array.isArray(parsed?.slides) ? parsed.slides : [];
  const caption = parsed?.caption || {};
  const slidesText = slides.map(slideTexts).join("\n");
  const captionText = [caption.hook, caption.body, caption.cta].filter(Boolean).join(" ");
  const allText = [slidesText, captionText].join("\n");

  const reversals = findReversals(allText);
  const brandCopyOverlap = findBrandCopyOverlap(allText, brandGuardText);

  const overlongSlides = slides
    .map((s: any) => ({ slide: s?.slide_number ?? 0, words: wordCount(slideBody(s)) }))
    .filter((x) => x.words > 55); // 50 (règle, corps seul) + tolérance de comptage

  // Overlay = phrase posée SUR la photo : la règle 5-25 mots n'avait aucun gate
  // (30 mots vus en live, audit 12/07 lot D). Seuil 28 = 25 + tolérance.
  const overlongOverlays = slides
    .filter((s: any) => typeof s?.overlay_text === "string" && s.overlay_text.trim())
    .map((s: any) => ({ slide: s?.slide_number ?? 0, words: wordCount(s.overlay_text) }))
    .filter((x) => x.words > 28);

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

  const durationConflicts = findDurationConflicts(slidesText, captionText);

  return {
    reversals, overlongSlides, overlongOverlays, ctaDuplicated, moulded,
    hashtagsCount, fabricatedNumbers, durationConflicts, brandCopyOverlap,
  };
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

/** Nombre de violations rédactionnelles — formule partagée avec le quality_check. */
export function redacViolations(a: RedacAnalysis): number {
  return (
    Math.max(0, a.reversals.length - 1) + // 1 retournement est toléré (règle « 1 max »)
    a.overlongSlides.length +
    a.overlongOverlays.length +
    (a.ctaDuplicated ? 1 : 0) +
    a.moulded.length +
    Math.min(3, a.fabricatedNumbers.length) +
    // Plafonné à 1 : une contradiction, c'est UN fait à corriger, même si le
    // croisement slides × caption en remonte plusieurs formulations.
    Math.min(1, a.durationConflicts.length) +
    Math.min(3, a.brandCopyOverlap.length)
  );
}

/** Score rédactionnel 0-100 (plancher 40), dérivé des violations. */
export function redacScore(a: RedacAnalysis): number {
  return Math.max(40, 100 - 10 * redacViolations(a));
}

/** quality_check calculé (remplace l'auto-déclaré, qui rapportait faux). */
function buildQualityCheck(a: RedacAnalysis, repassed: boolean) {
  const violations = redacViolations(a);
  return {
    source: "code",
    score: redacScore(a),
    reversal_negation_count: a.reversals.length,
    slides_over_50_words: a.overlongSlides,
    overlays_over_28_words: a.overlongOverlays,
    caption_cta_duplicates_slide: a.ctaDuplicated,
    moulded_verbatims: a.moulded,
    fabricated_numbers: a.fabricatedNumbers.length,
    duration_conflicts: a.durationConflicts,
    brand_copy_overlap: a.brandCopyOverlap.length,
    hashtags_count: a.hashtagsCount,
    corrected_by_repass: repassed,
  };
}

// ── Chute de caption imposée (caption v2, 12/07) ──
// Le tirage par code d'une forme de chute (question / affirmation / invitation
// impérative / confidence / sobre) n'est PAS respecté de façon fiable par le
// modèle (re-test v3 : 5/7 questions pour ~1-2 attendues). Le gate mesure la
// conformité et la re-passe ciblée corrige — même patron que le reste du gate.

export interface CaptionEndingRule {
  /** true = la chute imposée est une question ; false = toute autre forme (aucun « ? »). */
  requiresQuestion: boolean;
  /** Description de la forme imposée, réinjectée telle quelle dans la re-passe. */
  instruction: string;
}

/** La caption viole-t-elle la forme de chute imposée ? */
export function captionEndingViolated(parsed: any, rule?: CaptionEndingRule): boolean {
  if (!rule) return false;
  const caption = parsed?.caption;
  if (!caption || typeof caption !== "object") return false;
  const cta = String(caption.cta || "").trim();
  const bodyTail = String(caption.body || "").trim().split("\n").filter(Boolean).pop() || "";
  const tail = (cta || bodyTail).trim();
  if (rule.requiresQuestion) return !/\?/.test(cta + " " + bodyTail);
  // Forme non-question : un « ? » dans le cta, ou une fin de caption en question, = violation.
  return /\?/.test(cta) || /\?\s*$/.test(tail);
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
  for (const s of a.overlongOverlays) {
    lines.push(
      `OVERLAY SLIDE ${s.slide} : ${s.words} mots posés SUR LA PHOTO, maximum 25. Réécris l'overlay_text en UNE phrase complète (sujet + verbe) de 25 mots max, sans perdre le fait concret ni casser l'enchaînement avec les slides voisines.`,
    );
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
  if (a.durationConflicts.length) {
    lines.push(
      `DURÉES QUI SE CONTREDISENT entre les slides et la légende :\n${a.durationConflicts.map((c) => `- ${c}`).join("\n")}\nC'est le MÊME fait raconté deux fois avec deux chiffres différents — devant l'audience, ça décrédibilise tout le contenu. Choisis UNE durée et emploie EXACTEMENT la même des deux côtés (ou retire-la d'un des deux). Ne « fais pas la moyenne » : garde celle du brief si le brief en donne une.`,
    );
  }
  if (a.brandCopyOverlap.length) {
    lines.push(
      `PASSAGES RECOPIÉS DE LA FICHE DE MARQUE : ces extraits reprennent quasi mot pour mot un champ de la fiche de marque de l'utilisatrice (combat, mission, ton, expressions, convictions) :\n${a.brandCopyOverlap.map((o) => `- « ${o} »`).join("\n")}\nCette fiche est la MATIÈRE de l'utilisatrice, jamais son texte final. Reformule CHAQUE extrait avec des mots neufs, garde le sens et l'intensité, mais ne recopie plus la fiche de marque telle quelle.`,
    );
  }
  return lines.join("\n\n");
}

export interface RedacGateResult {
  content: string;
  repassed: boolean;
  before: RedacAnalysis;
  after: RedacAnalysis;
  /** Score rédactionnel 0-100 du document final (null si contenu illisible). */
  score: number | null;
  /** Nombre de violations du document final (null si contenu illisible). */
  violations: number | null;
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
    /** Forme de chute de caption imposée par le tirage code (caption v2). */
    captionEnding?: CaptionEndingRule;
    /** Champs de marque bruts (buildBrandGuardText) : passages à ne jamais recopier tels quels. */
    brandGuardText?: string;
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
  if (!first) return { content, repassed: false, before: emptyAnalysis(), after: emptyAnalysis(), score: null, violations: null };

  const allowedNumbers = opts.inputText !== undefined ? numbersIn(opts.inputText) : undefined;
  const before = analyzeCarouselRedac(first.parsed, allowedNumbers, opts.brandGuardText);
  let out = content;
  let repassed = false;

  let fixes = buildFixInstructions(before);
  const endingViolatedBefore = captionEndingViolated(first.parsed, opts.captionEnding);
  if (endingViolatedBefore && opts.captionEnding) {
    fixes += (fixes ? "\n\n" : "") +
      `CHUTE DE CAPTION NON CONFORME : la forme imposée pour cette génération est « ${opts.captionEnding.instruction} ». ` +
      (opts.captionEnding.requiresQuestion
        ? `La caption ne contient aucune question : réécris le champ "cta" de la CAPTION en question spécifique au sujet.`
        : `La caption se termine par une question alors que la forme imposée n'en est pas une : réécris le champ "cta" de la CAPTION dans la forme imposée, SANS aucun point d'interrogation. Garde le sens, change la forme.`);
  }
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
  if (!finalDoc) return { content: out, repassed, before, after: before, score: redacScore(before), violations: redacViolations(before) };

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
    // Filet gabarits photo : la re-passe LLM ne réécrit que les textes — elle ne
    // peut pas corriger un big_number ou un point de liste. Un chiffre encore
    // sans source ici est retiré EN CODE ; le rendu dégrade proprement le
    // gabarit (resolvePhotoTemplate) plutôt que d'afficher une stat inventée en 170px.
    for (const sl of slides) {
      if (sl?.big_number && findFabricatedNumbers(String(sl.big_number), allowedNumbers).length) {
        console.log(`[redac-gate] big_number slide ${sl.slide_number} retiré (chiffre sans source : ${sl.big_number})`);
        sl.big_number = null;
        if (sl.template === "chiffre") sl.template = null;
      }
      if (Array.isArray(sl?.points) && sl.points.length) {
        const kept = sl.points.filter((p: any) => !findFabricatedNumbers(String(p), allowedNumbers).length);
        if (kept.length !== sl.points.length) {
          console.log(`[redac-gate] points slide ${sl.slide_number} : ${sl.points.length - kept.length} item(s) retiré(s) (chiffres sans source)`);
          sl.points = kept.length >= 2 ? kept : null;
          if (!sl.points && sl.template === "liste") sl.template = null;
        }
      }
    }
  }

  let after = analyzeCarouselRedac(finalDoc.parsed, allowedNumbers, opts.brandGuardText);
  // Duplication caption/slide PERSISTANTE malgré la re-passe (vue livrée avec le
  // flag true, audit 12/07 lot D) : suppression déterministe — le CTA vit sur la
  // slide, la caption garde sa chute (dernière ligne du body). Supprimer > inventer.
  if (after.ctaDuplicated && finalDoc.parsed?.caption) {
    console.log("[redac-gate] caption.cta supprimé (duplication de la dernière slide persistante après re-passe)");
    finalDoc.parsed.caption.cta = "";
    after = analyzeCarouselRedac(finalDoc.parsed, allowedNumbers, opts.brandGuardText);
  }
  normalizeCaptionHashtags(finalDoc.parsed, opts.isLinkedIn);
  finalDoc.parsed.quality_check = buildQualityCheck(after, repassed);

  out = out.includes(finalDoc.raw)
    ? out.replace(finalDoc.raw, JSON.stringify(finalDoc.parsed, null, 2))
    : content.replace(first.raw, JSON.stringify(finalDoc.parsed, null, 2));

  console.log(
    `[redac-gate] retournements ${before.reversals.length}→${after.reversals.length}, slides>50 ${before.overlongSlides.length}→${after.overlongSlides.length}, ctaDup ${before.ctaDuplicated}→${after.ctaDuplicated}, moulés ${before.moulded.length}→${after.moulded.length}, chiffres inventés ${before.fabricatedNumbers.length}→${after.fabricatedNumbers.length}, durées contradictoires ${before.durationConflicts.length}→${after.durationConflicts.length}, recopie fiche marque ${before.brandCopyOverlap.length}→${after.brandCopyOverlap.length}, hashtags ${before.hashtagsCount}→${Math.min(before.hashtagsCount, opts.isLinkedIn ? 2 : 3)}, re-passe=${repassed}${opts.captionEnding ? `, chute caption ${endingViolatedBefore ? "NON CONFORME" : "ok"}→${captionEndingViolated(finalDoc.parsed, opts.captionEnding) ? "NON CONFORME" : "ok"} (forme ${opts.captionEnding.requiresQuestion ? "question" : "non-question"})` : ""}`,
  );

  return { content: out, repassed, before, after, score: redacScore(after), violations: redacViolations(after) };
}

function emptyAnalysis(): RedacAnalysis {
  return { reversals: [], overlongSlides: [], overlongOverlays: [], ctaDuplicated: false, moulded: [], hashtagsCount: 0, fabricatedNumbers: [], durationConflicts: [], brandCopyOverlap: [] };
}

// ── Variante TEXTE (lot 4) : LinkedIn et newsletter ──
// Mêmes mesures que le gate carrousel, sur un texte brut. Le résultat s'injecte
// en `extraInstructions` dans la passe de correction DÉJÀ existante de
// creative-flow (aucun appel IA supplémentaire).

export interface TextRedacAnalysis {
  reversals: string[];
  moulded: string[];
  fabricatedNumbers: string[];
  /** Passages qui recopient quasi mot pour mot un champ de la fiche de marque. */
  brandCopyOverlap: string[];
}

export function analyzeTextRedac(text: string, allowedNumbers?: Set<string>, brandGuardText?: string): TextRedacAnalysis {
  const reversals = findReversals(text || "");
  const moulded = MOULDED_VERBATIMS.map((re) => (text || "").match(re)?.[0]).filter(Boolean) as string[];
  const fabricatedNumbers = allowedNumbers ? findFabricatedNumbers(text || "", allowedNumbers) : [];
  const brandCopyOverlap = findBrandCopyOverlap(text || "", brandGuardText);
  return { reversals, moulded, fabricatedNumbers, brandCopyOverlap };
}

/** Nombre de violations — même formule que redacViolations, pour la variante texte. */
export function textRedacViolations(a: TextRedacAnalysis): number {
  return (
    Math.max(0, a.reversals.length - 1) +
    a.moulded.length +
    Math.min(3, a.fabricatedNumbers.length) +
    Math.min(3, a.brandCopyOverlap.length)
  );
}

/**
 * Élisions françaises manquantes — correction DÉTERMINISTE, classe non ambiguë
 * uniquement : « le avant/après » → « l'avant/après », « de avant » → « d'avant »,
 * « que après » → « qu'après » (vu au re-test du 21/07 : post LinkedIn « On
 * montre le avant/après qui brille »). Volontairement étroit : pas de règle
 * générale déterminant+voyelle (« le onze », « la ouate » sont légitimes), et
 * « qu'on + nom » (→ « qu'un ») reste à la passe de correction probabiliste —
 * indécidable sans lexique (« qu'on rénove » est correct).
 */
export function fixFrenchElisions(text: string): string {
  if (!text) return text;
  return text
    .replace(/\b([Ll])e (?=(?:avant|après)\b)/g, (_m, l) => `${l}'`)
    .replace(/\b([Dd])e (?=(?:avant|après)\b)/g, (_m, d) => `${d}'`)
    .replace(/\b([Qq])ue (?=(?:avant|après)\b)/g, (_m, q) => `${q}u'`)
    // Variantes tout-en-majuscules (overlays de reels, covers)
    .replace(/\bLE (?=(?:AVANT|APRÈS)\b)/g, "L'")
    .replace(/\bDE (?=(?:AVANT|APRÈS)\b)/g, "D'")
    .replace(/\bQUE (?=(?:AVANT|APRÈS)\b)/g, "QU'");
}

/** Applique fixFrenchElisions à une liste de champs texte d'un objet (mutation en place). */
export function fixElisionsInFields(obj: Record<string, unknown> | null | undefined, fields: string[]): void {
  if (!obj || typeof obj !== "object") return;
  for (const f of fields) {
    if (typeof obj[f] === "string") obj[f] = fixFrenchElisions(obj[f] as string);
  }
}

// ── Mesure seule (audit slop 18/08/2026, lot 5) ──
// 6 familles de tics mesurées dans le corpus mais AUCUNE encore détectée en
// code. Compteurs PURS (aucun effet de bord, aucune re-passe déclenchée) :
// branchés en télémétrie (`content-quality.ts`) pour calibrer des seuils sur
// des vraies données avant d'activer quoi que ce soit. Un mot comme
// « authentique » est parfois juste — on mesure une FRÉQUENCE, pas une
// interdiction.

/** Corps mesurable d'une slide pour les familles inter-slides (mêmes champs que slideTexts). */
function slideTextForSlop(s: any): string {
  return slideTexts(s);
}

/**
 * Rafales de 3+ slides CONSÉCUTIVES courtes (≤ maxWords mots chacune) — le
 * rythme ternaire/staccato qui ne se voit qu'en enchaînant les slides, jamais
 * à l'intérieur d'un seul champ (angle mort de `analyzeCarouselRedac`).
 */
export function countStaccatoAcrossSlides(slides: any[], maxWords = 6): number {
  let bursts = 0;
  let run = 0;
  for (const s of slides || []) {
    const words = wordCount(slideTextForSlop(s));
    if (words > 0 && words <= maxWords) {
      run++;
      if (run === 3) bursts++;
    } else {
      run = 0;
    }
  }
  return bursts;
}

/**
 * Rafales de 3+ slides CONSÉCUTIVES qui démarrent par le même mot — anaphore
 * vue seulement en enchaînant les slides (même angle mort que le staccato).
 */
export function countAnaphoraAcrossSlides(slides: any[]): number {
  const firstWords = (slides || []).map((s) => {
    const m = slideTextForSlop(s).trim().match(/^\p{L}+/u);
    return m ? m[0].toLowerCase() : "";
  });
  let bursts = 0;
  let run = 1;
  for (let i = 1; i <= firstWords.length; i++) {
    if (i < firstWords.length && firstWords[i] && firstWords[i] === firstWords[i - 1]) {
      run++;
    } else {
      if (run >= 3) bursts++;
      run = 1;
    }
  }
  return bursts;
}

// « Résultat : » / « Conclusion : » EN DÉBUT DE PHRASE uniquement — l'usage
// courant du nom commun (« Le résultat de l'enquête… ») n'est pas un tic.
const RESULT_CONCLUSION_OPENER_RE = /(?:^|[.!?]\s+|\n)(?:Résultat|Conclusion)\s*[:.]/gi;

/** Occurrences de « Résultat : » / « Conclusion : » en ouverture de phrase. */
export function countResultConclusionOpeners(text: string): string[] {
  return [...(text || "").matchAll(RESULT_CONCLUSION_OPENER_RE)].map((m) => m[0].trim());
}

/** La 1re phrase du texte se termine-t-elle par « ? » (question rhétorique d'ouverture) ? */
export function isOpeningRhetoricalQuestion(text: string): boolean {
  const first = (text || "").trim().split(/(?<=[.!?])\s+/)[0] || "";
  return /\?\s*$/.test(first.trim());
}

// Adjectifs vides candidats (audit 18/08) : SEUIL à calibrer, pas une liste
// noire — « authentique »/« aligné »/« puissant » sont parfois le mot juste.
// \b évite les faux positifs sur les mots composés/apparentés
// (« désaligné », « impuissant », « alignement » ne matchent PAS).
// \b est ASCII-only en JS/Deno : « é » n'est pas un \w, donc \b après
// « aligné » échoue silencieusement (transition non-mot → non-mot). On
// utilise des frontières Unicode explicites (lookaround sur \p{L}) à la place.
const EMPTY_ADJECTIVES: Record<string, RegExp> = {
  authentique: /(?<![\p{L}])authentiques?(?![\p{L}])/giu,
  aligné: /(?<![\p{L}])aligné(?:e|es|s)?(?![\p{L}])/giu,
  puissant: /(?<![\p{L}])puissante?s?(?![\p{L}])/giu,
};

/** Occurrences par adjectif vide candidat (fréquence brute, pas de blocage). */
export function countEmptyAdjectives(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, re] of Object.entries(EMPTY_ADJECTIVES)) {
    out[name] = ((text || "").match(re) || []).length;
  }
  return out;
}

/**
 * Similarité lexicale entre l'ouverture (hook) et la chute d'un même contenu
 * — la même mesure que `tokenSimilarity` (déjà appliquée au CTA↔dernière
 * slide), ici sur hook↔chute, jamais comparés jusqu'ici.
 */
export function hookEndingSimilarity(hookText: string, endingText: string): number {
  return tokenSimilarity(hookText, endingText);
}

export interface SlopSignals {
  staccato_inter_slides: number;
  anaphora_inter_slides: number;
  result_conclusion_openers: number;
  opening_rhetorical_question: boolean;
  empty_adjectives: Record<string, number>;
  hook_ending_similarity: number;
}

/** Agrège les 6 familles en un objet consultable (télémétrie, aucun calcul de score). */
export function measureSlopSignals(params: {
  fullText: string;
  hookText?: string;
  endingText?: string;
  slides?: any[];
}): SlopSignals {
  const { fullText, hookText = "", endingText = "", slides } = params;
  return {
    staccato_inter_slides: slides ? countStaccatoAcrossSlides(slides) : 0,
    anaphora_inter_slides: slides ? countAnaphoraAcrossSlides(slides) : 0,
    result_conclusion_openers: countResultConclusionOpeners(fullText).length,
    opening_rhetorical_question: isOpeningRhetoricalQuestion(hookText || fullText),
    empty_adjectives: countEmptyAdjectives(fullText),
    hook_ending_similarity: hookText && endingText ? hookEndingSimilarity(hookText, endingText) : 0,
  };
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
  if (a.brandCopyOverlap.length) {
    lines.push(
      `PASSAGES RECOPIÉS DE LA FICHE DE MARQUE : ces extraits reprennent quasi mot pour mot un champ de la fiche de marque de l'utilisatrice (combat, mission, ton, expressions, convictions) :\n${a.brandCopyOverlap.map((o) => `- « ${o} »`).join("\n")}\nCette fiche est la MATIÈRE de l'utilisatrice, jamais son texte final. Reformule CHAQUE extrait avec des mots neufs, garde le sens et l'intensité, mais ne recopie plus la fiche de marque telle quelle.`,
    );
  }
  return lines.join("\n\n");
}
