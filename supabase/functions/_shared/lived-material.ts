// Matière vécue retrouvée (décision de Laetitia, 26/11/2026).
//
// Constat : sans réponse aux questions, les contenus sonnaient creux alors que
// la personne avait déjà raconté du vécu à l'outil (son histoire, des phrases
// de clientes, des témoignages, ses réponses à d'anciennes questions). Sa
// crainte : que l'outil « se force à aller trouver des trucs et que ça colle
// pas ». Les anciennes réponses avaient d'ailleurs été coupées pour ça
// (recent-briefs.ts : un ancien vécu se mélangeait au sujet courant).
//
// Réponse : un TRI PAR LE CODE, avant l'écriture, sans appel à l'IA. Seuls les
// passages qui partagent assez de mots avec le sujet partent à la rédaction
// (deux au plus) ; sinon rien ne part et l'écriture reste celle d'avant. Un
// passage raté parce qu'il est dit avec d'autres mots est le défaut accepté :
// il va dans le sens sûr.
//
// Jamais de matière déduite par l'IA : l'histoire pré-remplie depuis le site à
// l'inscription (`source: "diagnostic_prefill"`) est écartée.
//
// La matière retenue voyage dans `body.lived_material` (posé par le serveur,
// jamais lu du client) : la consigne (`livedMaterialPrompt`), la source des
// témoignages et du vécu (`editorial-voice.ts`) et les listes de chiffres
// autorisés la lisent de là.

import { userAnswerTexts } from "./lived-case.ts";
import { sentencesOf } from "./redac-gate/text-utils.ts";
import { sharedStems, significantStems } from "./redac-gate/material-match.ts";

export type MaterialOrigin = "reponse" | "phrase_cliente" | "temoignage" | "histoire";

export interface MaterialCandidate {
  origin: MaterialOrigin;
  /** D'où vient le passage, dit à la rédaction. */
  label: string;
  /** Le passage tel que la personne l'a écrit. */
  text: string;
  /** Texte en plus pour le rapprochement seulement (sujet de l'ancien brief). */
  matchExtra?: string;
}

export interface SelectedMaterial extends MaterialCandidate {
  shared: string[];
}

/** Passages retenus au plus : assez pour nourrir, trop peu pour prendre la place du sujet. */
export const MAX_PASSAGES = 2;
const PASSAGE_MAX_CHARS = 450;
const MIN_WORDS = 8;
const PAST_BRIEFS = 40;
/** Mots de sens communs exigés entre le sujet et un passage. */
const MIN_SHARED = 3;

const clean = (s: unknown): string => typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;
const clip = (s: string) => s.length > PASSAGE_MAX_CHARS ? s.slice(0, PASSAGE_MAX_CHARS - 1).trimEnd() + "…" : s;

/** Découpe un texte long en passages courts (paragraphe, sinon phrases par deux). */
function passagesOf(text: string): string[] {
  const out: string[] = [];
  for (const paragraph of (text || "").split(/\n+/).map(clean).filter(Boolean)) {
    if (paragraph.length <= PASSAGE_MAX_CHARS) { out.push(paragraph); continue; }
    const sentences = sentencesOf(paragraph).map(clean).filter(Boolean);
    for (let i = 0; i < sentences.length; i += 2) out.push(sentences.slice(i, i + 2).join(" "));
  }
  return out.filter((p) => words(p) >= MIN_WORDS);
}

/**
 * Tout ce que la personne a écrit elle-même et qui peut porter du vécu.
 * `ctx` : résultat de getUserContext ; `briefs` : lignes de content_briefs.
 */
export function buildMaterialCandidates(ctx: any, briefs: any[] = []): MaterialCandidate[] {
  const out: MaterialCandidate[] = [];

  for (const b of Array.isArray(briefs) ? briefs : []) {
    const subject = clean(b?.subject);
    for (const answer of userAnswerTexts(b?.answers)) {
      const text = clean(answer);
      if (words(text) < MIN_WORDS) continue;
      out.push({ origin: "reponse", label: `Sa réponse quand elle préparait « ${subject.slice(0, 80)} »`, text: clip(text), matchExtra: subject });
    }
  }

  const tone = ctx?.tone;
  for (const p of passagesOf(clean(tone?.conviction_verbatims) ? String(tone.conviction_verbatims) : "")) {
    out.push({ origin: "phrase_cliente", label: "Phrase de cliente qui lui est restée", text: clip(p) });
  }
  for (const p of passagesOf(clean(tone?.conviction_shift) ? String(tone.conviction_shift) : "")) {
    out.push({ origin: "histoire", label: "Ce qu'elle croyait à ses débuts", text: clip(p) });
  }

  for (const offer of Array.isArray(ctx?.offers) ? ctx.offers : []) {
    for (const t of Array.isArray(offer?.testimonials) ? offer.testimonials : []) {
      const quote = clean(t?.quote);
      if (!quote) continue;
      const who = [clean(t?.name), clean(t?.sector)].filter(Boolean).join(", ");
      const result = clean(t?.result);
      const text = `${who ? `${who} : ` : ""}« ${quote} »${result ? ` Résultat : ${result}` : ""}`;
      if (words(text) < MIN_WORDS) continue;
      out.push({ origin: "temoignage", label: `Témoignage reçu${clean(offer?.name) ? ` (${clean(offer.name).slice(0, 60)})` : ""}`, text: clip(text) });
    }
  }

  const st = ctx?.storytelling;
  const story = st?.step_7_polished || st?.step_6_full_story || st?.imported_text;
  // Histoire pré-remplie par l'IA à l'inscription : pas ses mots, pas un vécu sûr.
  const aiDraft = !st?.step_7_polished && !st?.step_6_full_story && st?.source === "diagnostic_prefill";
  if (typeof story === "string" && !aiDraft) {
    for (const p of passagesOf(story)) out.push({ origin: "histoire", label: "Son histoire", text: clip(p) });
  }
  return out;
}

/**
 * Le tri. Un passage est retenu s'il partage avec le sujet au moins 3 mots de
 * sens, dont 2 dans le passage lui-même (pas seulement dans le sujet de
 * l'ancien brief), ou si l'ancien brief portait le même sujet. Un mot présent
 * dans plus de la moitié des passages de la personne ne distingue rien (son
 * métier, son produit) : il ne compte pas.
 * Seuil relevé de 2 à 3 après mesure sur un compte réel (26/11/2026) : à 2,
 * « Les 3 erreurs d'une première opération » ramenait « Une erreur fréquente
 * dans mon domaine » ; à 3, seuls les sujets vraiment voisins passent.
 */
export function selectLivedMaterial(subjectText: string, candidates: MaterialCandidate[], alreadyGiven = ""): SelectedMaterial[] {
  const subject = significantStems(subjectText);
  if (subject.size < MIN_SHARED || !candidates.length) return [];
  const given = clean(alreadyGiven).toLowerCase();
  const seen = new Set<string>();
  const pool = candidates
    // Déjà donné pour CE contenu (réponses du jour) : inutile de le resservir.
    .filter((c) => { const k = c.text.toLowerCase(); if (seen.has(k) || (given && given.includes(k.replace(/…$/, "")))) return false; seen.add(k); return true; })
    .map((c) => ({ c, own: significantStems(c.text), extra: significantStems(c.matchExtra || "") }));

  const frequency = new Map<string, number>();
  for (const p of pool) for (const s of new Set([...p.own, ...p.extra])) frequency.set(s, (frequency.get(s) || 0) + 1);
  const common = (s: string) => pool.length >= 6 && (frequency.get(s) || 0) > pool.length / 2;

  const scored: SelectedMaterial[] = [];
  for (const p of pool) {
    const inText = sharedStems(subject, p.own).filter((s) => !common(s));
    const inSubject = sharedStems(subject, p.extra);
    const shared = [...new Set([...inText, ...inSubject.filter((s) => !common(s))])];
    // Même sujet qu'un ancien brief : sa réponse d'alors est la matière la plus sûre.
    const sameSubject = inSubject.length >= MIN_SHARED && inSubject.length >= subject.size * 0.8;
    if (sameSubject || (shared.length >= MIN_SHARED && inText.length >= 2)) scored.push({ ...p.c, shared: sameSubject ? inSubject : shared });
  }
  return scored.sort((a, b) => b.shared.length - a.shared.length).slice(0, MAX_PASSAGES);
}

/** Lignes posées dans `body.lived_material` (chaîne vide = rien de retenu). */
export function livedMaterialText(selected: SelectedMaterial[]): string {
  return selected.map((s) => `- [${s.label}] ${s.text}`).join("\n");
}

/** Matière retenue pour cette demande (posée par le serveur). */
export function livedMaterialOf(body: any): string {
  return typeof body?.lived_material === "string" ? body.lived_material.trim() : "";
}

/** Consigne donnée à la rédaction. Chaîne vide quand rien n'est retenu : le prompt reste celui d'avant. */
export function livedMaterialPrompt(body: any): string {
  const material = livedMaterialOf(body);
  if (!material) return "";
  return `MATIÈRE VÉCUE DÉJÀ DONNÉE PAR LA PERSONNE, PROCHE DE CE SUJET (ses mots, écrits à une autre occasion) :
${material}
C'est du vrai, donné par elle : tu peux t'y appuyer (une phrase, un exemple, en première personne pour ce qu'elle a vécu, à la troisième pour une cliente) SEULEMENT si cela sert le propos de CE contenu. Sa présence n'est pas une demande : si elle ne sert pas le propos, écris sans, comme si elle n'était pas là. N'y ajoute aucun fait, date, lieu, chiffre ni détail ; ne la date pas (« hier », « la semaine dernière ») ; une parole de cliente ne se rapporte que si elle figure ci-dessus, sans lui prêter d'autres mots (un court extrait entre guillemets ou son idée reformulée, jamais la fiche recopiée en entier). Tout autre vécu ou témoignage reste interdit.`;
}

/** Lecture best-effort des anciens briefs (sujet + réponses). Toute erreur renvoie []. */
export async function fetchPastBriefs(supabase: any, userId: string, workspaceId?: string | null): Promise<any[]> {
  try {
    let query = supabase.from("content_briefs").select("subject, answers, created_at")
      .order("created_at", { ascending: false }).limit(PAST_BRIEFS);
    // Même périmètre que getUserContext : l'espace, sinon le personnel seul.
    query = workspaceId ? query.eq("workspace_id", workspaceId) : query.eq("user_id", userId).is("workspace_id", null);
    const { data, error } = await query;
    return error || !Array.isArray(data) ? [] : data;
  } catch {
    return [];
  }
}

/**
 * Pose `body.lived_material` pour une génération. Ne lève jamais : une erreur
 * laisse la génération exactement comme avant.
 * `enabled` : faux quand la personne raconte déjà son cas ou réagit à une actu
 * (son récit du jour porte le contenu, on n'y mêle pas un ancien vécu).
 */
export async function attachLivedMaterial(params: {
  body: any; ctx: any; supabase: any; userId: string; workspaceId?: string | null;
  enabled: boolean; subjectText: string; alreadyGiven?: string; tag: string;
  fetchBriefs?: typeof fetchPastBriefs;
}): Promise<void> {
  const { body, ctx, enabled, subjectText, tag } = params;
  // Jamais la valeur envoyée par le navigateur.
  if (body && typeof body === "object") delete body.lived_material;
  if (!enabled || !body || !subjectText.trim()) return;
  try {
    const briefs = await (params.fetchBriefs ?? fetchPastBriefs)(params.supabase, params.userId, params.workspaceId);
    const candidates = buildMaterialCandidates(ctx, briefs);
    const selected = selectLivedMaterial(subjectText, candidates, params.alreadyGiven);
    // Compteur de suivi : combien de sujets trouvent une matière, et d'où.
    console.log(`[${tag}] matière vécue : ${candidates.length} passage(s) lus, ${selected.length} retenu(s)${selected.length ? ` (${selected.map((s) => `${s.origin}:${s.shared.length}`).join(", ")})` : ""}`);
    if (selected.length) body.lived_material = livedMaterialText(selected);
  } catch (e) {
    console.error(`[${tag}] matière vécue ignorée :`, e instanceof Error ? e.message : e);
  }
}
