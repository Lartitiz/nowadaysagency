/** Length comes from the current brief, never from brand history. */
// ONE_IDEA_RULE et ses repères (règle « une_idee_par_unite » du socle commun)
// vivent dans socle.ts : réexportés ici à texte égal.
import { LONG_SLIDE_WORDS, ONE_IDEA_RULE, PHOTO_AUTO_MAX_SLIDES, TEXT_AUTO_MAX_SLIDES, TEXT_SLIDE_TARGET_WORDS } from "./socle.ts";
export { LONG_SLIDE_WORDS, ONE_IDEA_RULE, TEXT_AUTO_MAX_SLIDES, TEXT_SLIDE_TARGET_WORDS };
const numbers: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20 };
const numeral = "(\\d{1,2}|" + Object.keys(numbers).join("|") + ")";
const quantity = (value: string) => numbers[value.toLowerCase()] ?? Number(value);
export interface CarouselLength { exact?: number; items?: number; }
/** Longueur « Auto » des carrousels PHOTO et MIXTE : 10 slides au plus, la
 * limite de la publication directe sur Instagram (03/10/2026, vu en live :
 * 11 slides en Auto, non publiables directement). Un nombre demandé
 * explicitement (jusqu'à 20) prime. Valeur du socle (socle.ts). */
export const AUTO_MAX_SLIDES = PHOTO_AUTO_MAX_SLIDES;
export function carouselLength(body: any): CarouselLength {
  const subject = String(body.subject || "");
  const slideRequest = subject.match(new RegExp(`\\b${numeral}\\s+(?:slides?|diapositives?)\\b`, "i"));
  const list = subject.match(new RegExp(`\\b${numeral}\\s+(?:erreurs?|conseils?|astuces?|étapes?|etapes?|raisons?|points?|idées?|idees?|pièges?|pieges?)\\b`, "i"));
  const items = list ? quantity(list[1]) : undefined;
  const confirmed = body.confirmed_structure?.length || body.slide_structure?.length;
  const requested = confirmed || body.slide_count || (slideRequest ? quantity(slideRequest[1]) : undefined);
  return { exact: requested ? Math.min(20, Math.max(1, requested)) : undefined, items: items && items <= 20 ? items : undefined };
}
/** Carrousel texte (ni photo, ni mixte). */
export const isTextCarousel = (body: any) => !/photo|mix/i.test(String(body?.carousel_type || ""));
/** Plafond de la longueur « Auto » selon le type de carrousel. */
export const autoMaxSlides = (body: any) => isTextCarousel(body) ? TEXT_AUTO_MAX_SLIDES : AUTO_MAX_SLIDES;
export function carouselLengthPrompt(body: any): string {
  const { exact, items } = carouselLength(body);
  const text = isTextCarousel(body), max = autoMaxSlides(body);
  const auto = text
    ? items
      ? `Longueur automatique : au moins ${Math.min(max, items + 2)} slides pour développer les ${items} éléments, couverture et conclusion comprises ; un élément riche peut s'étendre sur plusieurs slides. ${max} slides au maximum.`
      : `Longueur automatique : le nombre de slides suit le découpage une idée par slide, de 4 à ${max} au maximum ; aucun nombre fixe à remplir.`
    : items
      ? `Longueur automatique : prévois ${Math.min(max, items + 2)} slides pour développer les ${items} éléments, couverture et conclusion comprises. ${max} slides au maximum (limite de la publication directe sur Instagram).`
      : `Longueur automatique : adapte le nombre de slides à la matière, de 4 à ${max} au maximum (limite de la publication directe sur Instagram) ; aucun nombre fixe à remplir.`;
  return `${exact ? `Nombre demandé : exactement ${exact} slides.` : auto}
${items ? `LISTE PROMISE : les ${items} éléments doivent tous être présents, distincts et expliqués. Numérote-les de 1 à ${items} dans les titres des slides de développement (ou dans le corps si plusieurs éléments partagent une slide). ${(exact && exact < items + 2) || (!exact && items + 2 > max) || items + 2 > 20 ? "Le nombre de slides prime : regroupe les éléments en gardant leurs explications, sans en omettre." : "Réserve une slide de développement par élément."} Pour chaque erreur, explique ce qui pose problème et comment agir autrement ; un exemple générique clairement présenté peut clarifier, sans inventer un vécu ni un résultat.` : ""}
${!exact && text ? `${ONE_IDEA_RULE}\n` : ""}Une seule couverture : évite une deuxième slide qui annonce seulement « Voici les erreurs/conseils ». Termine par une slide avec role:"conclusion", qui apporte une synthèse, la position assumée, une question simple à laquelle répondre en commentaire ou un prochain geste concret. Pas de devoir à faire pour conclure. Ne répète pas la couverture. Aucune invitation vague comme « N'hésitez pas » ; si une action sert le sujet, une seule, précise, sans destination inventée. Une structure explicitement confirmée prime sur cette répartition.`;
}
/** Texte visible d'une slide, quel que soit le type : carrousel texte
 * (title/body), photo (kicker/overlay_text/detail) ou slide de mixte (points). */
const TEXT_FIELDS = ["kicker", "title", "overlay_text", "body", "detail"] as const;
function slideText(slide: any): string {
  const points = Array.isArray(slide?.points) ? slide.points.map((p: any) => typeof p === "string" ? p : [p?.title, p?.text, p?.body, p?.label].filter(Boolean).join(" ")) : [];
  return [...TEXT_FIELDS.map((k) => slide?.[k]), ...points].filter((v) => typeof v === "string" && v.trim()).join("\n");
}
const NUMBERED_START = /^\s*(?:[-•]\s*)?\d{1,2}\s*[.):—–-]/;
/** La slide ne porte que le nom numéroté d'un élément dans son titre (title en
 * texte, kicker en photo : « 1. Poster sans stratégie ») et aucun autre texte.
 * Un overlay photo seul n'est pas jugé ici : c'est souvent toute la slide. */
function namesItemOnly(slide: any): boolean {
  const heading = [slide?.title, slide?.kicker].find((v) => typeof v === "string" && v.trim())?.trim() || "";
  if (!NUMBERED_START.test(heading) || slideText(slide).trim() !== heading) return false;
  const name = heading.replace(NUMBERED_START, "").trim().replace(/[.!…]+$/, "");
  return !/[.!?:;]\s+\S|\s[—–-]\s/.test(name);
}
/** Structural checks are distinct from semantic/editorial review. */
export function carouselStructureIssues(parsed: any, body: any): string[] {
  const slides = parsed?.slides;
  if (!Array.isArray(slides) || !slides.length) return [];
  const { exact, items } = carouselLength(body);
  const issues: string[] = [];
  if (exact && slides.length !== exact) issues.push(`${slides.length} slides reçues, exactement ${exact} demandées.`);
  const max = autoMaxSlides(body);
  if (!exact && slides.length > max) issues.push(`${slides.length} slides reçues : ${max} au maximum en longueur automatique. Regroupe sans retirer d'idée.`);
  // Custom plans may intentionally end in a different role or use unnumbered copy.
  if (body.confirmed_structure?.length || body.slide_structure?.length) return issues;
  if (items) {
    const scope = slides.slice(slides.length > 1 ? 1 : 0, exact && exact < items + 2 ? undefined : -1);
    const text = scope.map(slideText).join("\n");
    const missing = Array.from({ length: items }, (_, i) => i + 1).filter(n => !new RegExp(`(?:^|\\n)\\s*(?:[-•]\\s*)?(?:(?:erreur|conseil|astuce|étape|etape|point|raison|idée|idee|piège|piege)\\s*(?:n[°ºo]\\s*)?)?${n}\\s*[.):—–-]`, "i").test(text));
    // Une slide « 1. Poster sans stratégie » seule est permise par ONE_IDEA_RULE
    // quand la slide suivante porte son explication sans numéro propre.
    for (let i = 1; i < slides.length - 1; i++) {
      if (!namesItemOnly(slides[i])) continue;
      const next = slides[i + 1];
      const explainedNext = i + 1 < slides.length - 1 && slideText(next).trim() && !NUMBERED_START.test(slideText(next));
      if (!explainedNext) issues.push(`La slide ${slides[i].slide_number || i + 1} nomme un élément sans l'expliquer.`);
    }
    if (missing.length) issues.push(`Éléments de la liste non repérés : ${missing.join(", ")}. Numérote et explique chaque élément.`);
  }
  const last = slides.at(-1);
  if (slides.length > 1 && ![last?.title, last?.body, last?.overlay_text, last?.kicker, last?.detail, ...(last?.points || []), last?.visual_schema ? JSON.stringify(last.visual_schema) : ""].filter(Boolean).join(" " ).trim()) issues.push("La dernière slide est vide : complète la conclusion.");
  if (slides.length > 1 && !/conclu|final|synth|closing|cta|fin\b/i.test(String(slides.at(-1)?.role || ""))) issues.push("La dernière slide doit conclure le propos (role:conclusion).");
  return issues;
}

/** Slides de développement du carrousel TEXTE au-delà de LONG_SLIDE_WORDS mots
 * (mesure seulement : le code ne coupe jamais le texte). */
export function longTextSlides(parsed: any, body: any): number[] {
  const slides = parsed?.slides;
  if (!Array.isArray(slides) || !isTextCarousel(body) || carouselLength(body).exact) return [];
  const words = (s: any) => `${s?.title || ""} ${s?.body || ""}`.trim().split(/\s+/).filter(Boolean).length;
  return slides.flatMap((s: any, i: number) => i > 0 && words(s) > LONG_SLIDE_WORDS ? [Number(s?.slide_number) || i + 1] : []);
}

/** Consigne de réparation adaptée aux défauts relevés par
 * carouselStructureIssues (un défaut de liste ou de conclusion n'est pas un
 * défaut de nombre). */
export function structureRepairInstruction(issues: string[]): string {
  const all = issues.join("\n");
  const asks: string[] = [];
  if (/slides reçues/.test(all)) asks.push("Corrige le nombre de slides demandé, en regroupant ou en découpant sans retirer d'idée.");
  if (/non repérés/.test(all)) asks.push("Fais apparaître chaque élément manquant de la liste promise, numéroté et expliqué.");
  if (/nomme un élément sans l'expliquer/.test(all)) asks.push("Explique chaque élément nommé, sur sa slide ou sur la slide qui suit.");
  if (/dernière slide/i.test(all)) asks.push("Termine par une slide de conclusion (role:conclusion) qui conclut vraiment.");
  if (!asks.length) asks.push("Corrige ces défauts.");
  return asks.join("\n") + "\nN'invente aucun fait et ne change pas les choix validés.";
}
