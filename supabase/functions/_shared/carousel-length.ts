/** Length comes from the current brief, never from brand history. */
const numbers: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20 };
const numeral = "(\\d{1,2}|" + Object.keys(numbers).join("|") + ")";
const quantity = (value: string) => numbers[value.toLowerCase()] ?? Number(value);
export interface CarouselLength { exact?: number; items?: number; }
/** Longueur « Auto » des carrousels PHOTO et MIXTE : 10 slides au plus, la
 * limite de la publication directe sur Instagram (03/10/2026, vu en live :
 * 11 slides en Auto, non publiables directement). Un nombre demandé
 * explicitement (jusqu'à 20) prime. */
export const AUTO_MAX_SLIDES = 10;
/** Longueur « Auto » du carrousel TEXTE : une idée par slide, jusqu'à 20
 * slides (04/10/2026, décision de Laetitia : « Jusqu'à 20 en texte »). Au-delà
 * de 10, l'appli le signale : publication depuis le téléphone, pas en direct. */
export const TEXT_AUTO_MAX_SLIDES = 20;
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
/** Rythme du carrousel TEXTE en longueur automatique (04/10/2026, carrousel de
 * référence de Laetitia : 16 slides, environ 25 mots par slide, de 4 à 48, une
 * idée par slide). Le texte n'est jamais raccourci : il est découpé. */
export const TEXT_SLIDE_TARGET_WORDS = { min: 15, max: 35 };
/** Au-delà, la slide est signalée dans les journaux (jamais coupée par le code). */
export const LONG_SLIDE_WORDS = 50;
export const ONE_IDEA_RULE = `DÉCOUPAGE : UNE IDÉE PAR SLIDE. Le carrousel se lit au rythme du pouce : chaque slide porte une seule idée, un seul pas du raisonnement, lisible d'un coup d'œil. Vise environ ${TEXT_SLIDE_TARGET_WORDS.min} à ${TEXT_SLIDE_TARGET_WORDS.max} mots par slide de développement (titre et texte compris), ${LONG_SLIDE_WORDS} au plus ; c'est un repère de découpage, pas un quota à remplir.
- Quand un passage porte deux idées, ou dépasse ce repère, découpe-le sur deux slides qui se suivent (ou plus), sans raccourcir ni résumer : tout le texte reste, il est seulement réparti. On ne retire jamais une phrase, un exemple ou une nuance pour tenir dans une slide.
- Une phrase forte, une question de relance ou un chiffre qui doit frapper peut avoir sa slide à lui seul, en une phrase (même de 4 ou 5 mots) : ces slides courtes donnent la respiration du carrousel. Une telle slide peut n'avoir que title (body vide) ou que body (title vide).
- Une phrase peut commencer sur une slide et se poursuivre sur la suivante (la slide se termine sur une virgule, « et », deux-points ou points de suspension, la suivante reprend sans majuscule ni titre). Utilise-le quand la phrase porte une montée ou un enchaînement, pas à chaque slide.
- Les titres ne sont pas obligatoires hors couverture : une slide de suite ou de respiration se passe de titre plutôt que d'en recevoir un artificiel.
- Ce découpage prime sur le test « fusionne-les » du fil : en carrousel texte, on ne fusionne que les redites ; deux idées distinctes gardent chacune leur slide. Le nombre de slides suit le découpage, de 4 à ${TEXT_AUTO_MAX_SLIDES} : n'ajoute aucune slide pour remplir, ne regroupe pas pour en avoir moins.
- La couverture (slide 1 : accroche seule) et la slide 2 (deuxième accroche) gardent leurs règles ; la dernière slide conclut, comme prévu.`;
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
    const text = slides.slice(slides.length > 1 ? 1 : 0, exact && exact < items + 2 ? undefined : -1).map((s: any) => `${s.title || ""}\n${s.body || ""}`).join("\n");
    const missing = Array.from({ length: items }, (_, i) => i + 1).filter(n => !new RegExp(`(?:^|\\n)\\s*(?:[-•]\\s*)?(?:(?:erreur|conseil|astuce|étape|etape|point|raison|idée|idee|piège|piege)\\s*(?:n[°ºo]\\s*)?)?${n}\\s*[.):—–-]`, "i").test(text));
    for (const slide of slides.slice(1, -1)) {
      if (/^\s*\d+\s*[.):—–-]/.test(String(slide.title || "")) && !String(slide.body || "").trim()) issues.push(`La slide ${slide.slide_number || ""} nomme un élément sans l'expliquer.`);
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
