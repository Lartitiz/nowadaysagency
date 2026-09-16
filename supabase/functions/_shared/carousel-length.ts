/** Length comes from the current brief, never from brand history. */
const numbers: Record<string, number> = { un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20 };
const numeral = "(\\d{1,2}|" + Object.keys(numbers).join("|") + ")";
const quantity = (value: string) => numbers[value.toLowerCase()] ?? Number(value);
export interface CarouselLength { exact?: number; items?: number; }
export function carouselLength(body: any): CarouselLength {
  const subject = String(body.subject || "");
  const slideRequest = subject.match(new RegExp(`\\b${numeral}\\s+(?:slides?|diapositives?)\\b`, "i"));
  const list = subject.match(new RegExp(`\\b${numeral}\\s+(?:erreurs?|conseils?|astuces?|étapes?|etapes?|raisons?|points?|idées?|idees?|pièges?|pieges?)\\b`, "i"));
  const items = list ? quantity(list[1]) : undefined;
  const confirmed = body.confirmed_structure?.length || body.slide_structure?.length;
  const requested = confirmed || body.slide_count || (slideRequest ? quantity(slideRequest[1]) : undefined);
  return { exact: requested ? Math.min(20, Math.max(1, requested)) : undefined, items: items && items <= 20 ? items : undefined };
}
export function carouselLengthPrompt(body: any): string {
  const { exact, items } = carouselLength(body);
  return `${exact ? `Nombre demandé : exactement ${exact} slides.` : items ? `Longueur automatique : prévois ${Math.min(20, items + 2)} slides pour développer les ${items} éléments, couverture et conclusion comprises. Adapte si une explication exige davantage de place, jusqu'à 20 slides.` : "Longueur automatique : adapte le nombre de slides à la matière, de 4 à 20 ; aucun nombre fixe à remplir."}
${items ? `LISTE PROMISE : les ${items} éléments doivent tous être présents, distincts et expliqués. Numérote-les de 1 à ${items} dans les titres des slides de développement (ou dans le corps si plusieurs éléments partagent une slide). ${(exact && exact < items + 2) || items + 2 > 20 ? "Le nombre exact prime : regroupe les éléments en gardant leurs explications, sans en omettre." : "Réserve une slide de développement par élément."} Pour chaque erreur, explique ce qui pose problème et comment agir autrement ; un exemple générique clairement présenté peut clarifier, sans inventer un vécu ni un résultat.` : ""}
Une seule couverture : évite une deuxième slide qui annonce seulement « Voici les erreurs/conseils ». Termine par une slide avec role:"conclusion", qui apporte une synthèse utile ou un prochain geste concret. Ne répète pas la couverture. Aucune invitation vague comme « N'hésitez pas » ; si une action sert le sujet, une seule, précise, sans destination inventée. Une structure explicitement confirmée prime sur cette répartition.`;
}
/** Structural checks are distinct from semantic/editorial review. */
export function carouselStructureIssues(parsed: any, body: any): string[] {
  const slides = parsed?.slides;
  if (!Array.isArray(slides) || !slides.length) return [];
  const { exact, items } = carouselLength(body);
  const issues: string[] = [];
  if (exact && slides.length !== exact) issues.push(`${slides.length} slides reçues, exactement ${exact} demandées.`);
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
  if (slides.length > 1 && ![last?.title, last?.body].filter(Boolean).join(" " ).trim()) issues.push("La dernière slide est vide : complète la conclusion.");
  if (slides.length > 1 && !/conclu|final|synth|closing|cta|fin\b/i.test(String(slides.at(-1)?.role || ""))) issues.push("La dernière slide doit conclure le propos (role:conclusion).");
  return issues;
}
