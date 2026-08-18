import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { analyzeCarouselRedac, analyzeTextRedac, buildTextFixInstructions, normalizeCaptionHashtags, numbersIn } from "./redac-gate.ts";

// Cas réels de l'audit rédactionnel du 10/07 (carrousels 07 et 18).

Deno.test("analyzeCarouselRedac compte la famille des retournements par négation", () => {
  const parsed = {
    slides: [
      { slide_number: 1, title: "Hook", body: "" },
      { slide_number: 2, title: "", body: "Ce n'est pas de la maladresse : c'est la nature du matériau." },
      { slide_number: 3, title: "", body: "Le problème n'est pas le prix de l'artisanat. C'est le prix de référence qu'on a laissé s'installer." },
    ],
    caption: { hook: "", body: "Je ne dis pas ça pour me justifier. Je le dis parce que j'ai l'impression qu'on a accepté.", cta: "" },
  };
  const a = analyzeCarouselRedac(parsed);
  assertEquals(a.reversals.length >= 2, true);
  assertEquals(a.moulded.length, 1); // « Je ne dis pas ça pour me justifier »
});

Deno.test("analyzeCarouselRedac détecte le CTA de caption qui répète la slide finale", () => {
  const cta = "C'est quoi l'objet fait main qui t'a le plus surprise par son prix, en bien ou en mal ?";
  const parsed = {
    slides: [
      { slide_number: 1, title: "Hook", body: "" },
      { slide_number: 7, title: "La prochaine fois, pose la vraie question", body: `Quand le prix surprend, demande-toi ce qui a permis au prix d'en face de rester bas. ${cta}` },
    ],
    caption: { hook: "Autre chose", body: "Un corps différent.", cta },
  };
  assertEquals(analyzeCarouselRedac(parsed).ctaDuplicated, true);
});

Deno.test("analyzeCarouselRedac tolère un carrousel sain", () => {
  const parsed = {
    slides: [
      { slide_number: 1, title: "Une tasse met trois semaines à exister", body: "" },
      { slide_number: 2, title: "Le séchage décide", body: "La terre sèche à son rythme. On attend, on surveille, on retourne les pièces." },
    ],
    caption: { hook: "On me demande souvent le temps que ça prend.", body: "Trois semaines en moyenne.", cta: "Tu veux voir les étapes ? Dis-le moi." },
  };
  const a = analyzeCarouselRedac(parsed);
  assertEquals(a.reversals.length, 0);
  assertEquals(a.ctaDuplicated, false);
  assertEquals(a.moulded.length, 0);
  assertEquals(a.overlongSlides.length, 0);
});

Deno.test("normalizeCaptionHashtags : cap 3 IG, sans #, dédoublonnés", () => {
  const parsed = { caption: { hashtags: ["#ceramique", "ceramique", "#faitmain", "poterie", "slowmade", "atelier"] } };
  normalizeCaptionHashtags(parsed, false);
  assertEquals(parsed.caption.hashtags, ["ceramique", "faitmain", "poterie"]);
});

Deno.test("normalizeCaptionHashtags : cap 2 LinkedIn", () => {
  const parsed = { caption: { hashtags: ["artisanat", "ceramique", "entrepreneuriat"] } };
  normalizeCaptionHashtags(parsed, true);
  assertEquals(parsed.caption.hashtags, ["artisanat", "ceramique"]);
});


// ── Lot 3 : chiffres inventés (cas réels : « 10-20 % » / « 45 minutes » fabriqués) ──

Deno.test("les chiffres absents du brief sont détectés, ceux du brief sont autorisés", () => {
  const allowed = numbersIn("Pourquoi une tasse faite main coûte 35 euros (et pourquoi c'est normal)");
  const parsed = {
    slides: [
      { slide_number: 1, title: "35 euros pour une tasse ?", body: "" },
      { slide_number: 2, title: "", body: "On compte en moyenne 10 à 20% de pièces perdues, après 45 minutes de façonnage." },
    ],
    caption: { hook: "", body: "", cta: "" },
  };
  const a = analyzeCarouselRedac(parsed, allowed);
  const joined = a.fabricatedNumbers.join(" | ");
  assertEquals(a.fabricatedNumbers.length, 3); // 10, 20, 45 — mais pas 35
  assertEquals(joined.includes("35"), false);
});

Deno.test("les ordinaux ne comptent pas comme chiffres inventés", () => {
  const a = analyzeCarouselRedac(
    { slides: [{ slide_number: 1, title: "", body: "Ma 1re fournée, dès le 2e essai." }], caption: {} },
    new Set<string>(),
  );
  assertEquals(a.fabricatedNumbers.length, 0);
});

// ── Lot 4 : gate texte (LinkedIn/newsletter) ──

Deno.test("analyzeTextRedac attrape la variante moulée « Je ne dis pas ça pour dénigrer »", () => {
  const a = analyzeTextRedac("Je ne dis pas ça pour dénigrer qui achète en grande surface. Je dis juste qu'il faut comparer.");
  assertEquals(a.moulded.length, 1);
});

Deno.test("analyzeTextRedac attrape l'amorce moulée « Ce qui me dérange » (audit qualité 11/07)", () => {
  const a = analyzeTextRedac("Ce qui me dérange dans la façon dont on regarde la céramique, c'est qu'on la juge comme un produit.");
  assertEquals(a.moulded.length, 1);
});

Deno.test("analyzeTextRedac attrape la variante « Ce qui me gêne »", () => {
  const a = analyzeTextRedac("Ce qui me gêne, c'est le discours ambiant sur la régularité.");
  assertEquals(a.moulded.length, 1);
});

Deno.test("buildTextFixInstructions vide quand le texte est sain", () => {
  const a = analyzeTextRedac("Un bol met trois semaines à exister. Le séchage décide du rythme, pas moi.", new Set<string>());
  assertEquals(buildTextFixInstructions(a), "");
});

Deno.test("le gate texte compte les retournements au-delà de 1", () => {
  const t = "Ce n'est pas un saut vers la liberté. C'est un saut vers la contrainte. Ce qu'on gagne, ce n'est pas moins de contraintes. C'est des contraintes qui ont du sens.";
  const a = analyzeTextRedac(t);
  assertEquals(a.reversals.length >= 2, true);
  assertEquals(buildTextFixInstructions(a).includes("RETOURNEMENTS"), true);
});

Deno.test("les chiffres dupliqués comptent une fois (dédup par valeur)", () => {
  const parsed = {
    slides: [
      { slide_number: 1, title: "", body: "Le prix est de 42 euros. Oui, 42 euros. Je répète : 42." },
    ],
    caption: {},
  };
  const a = analyzeCarouselRedac(parsed, new Set<string>());
  assertEquals(a.fabricatedNumbers.length, 1);
});

Deno.test("la règle 50 mots mesure le corps, pas le titre", () => {
  const longTitle = "Un titre volontairement très long qui ne doit pas compter dans la mesure du corps de la slide du tout";
  const body = Array(40).fill("mot").join(" ");
  const a = analyzeCarouselRedac(
    { slides: [{ slide_number: 1, title: longTitle, body }], caption: {} },
    undefined,
  );
  assertEquals(a.overlongSlides.length, 0);
});

// ── Chute de caption imposée (caption v2, 12/07) ──
import { captionEndingViolated } from "./redac-gate.ts";

Deno.test("captionEndingViolated : question exigée mais absente", () => {
  const parsed = { caption: { hook: "h", body: "b", cta: "Écris BOL en commentaire." } };
  assertEquals(captionEndingViolated(parsed, { requiresQuestion: true, instruction: "une QUESTION" }), true);
});

Deno.test("captionEndingViolated : question exigée et présente", () => {
  const parsed = { caption: { hook: "h", body: "b", cta: "Tu gardes lequel chez toi ?" } };
  assertEquals(captionEndingViolated(parsed, { requiresQuestion: true, instruction: "une QUESTION" }), false);
});

Deno.test("captionEndingViolated : forme non-question mais cta en question", () => {
  const parsed = { caption: { hook: "h", body: "b", cta: "Et toi, tu justifies ou tu expliques ?" } };
  assertEquals(captionEndingViolated(parsed, { requiresQuestion: false, instruction: "une AFFIRMATION" }), true);
});

Deno.test("captionEndingViolated : forme non-question respectée (cta vide, body affirmatif)", () => {
  const parsed = { caption: { hook: "h", body: "Je préfère vendre moins vite, au juste prix.", cta: "" } };
  assertEquals(captionEndingViolated(parsed, { requiresQuestion: false, instruction: "une CHUTE SOBRE" }), false);
});

Deno.test("captionEndingViolated : sans règle, jamais de violation", () => {
  const parsed = { caption: { hook: "h", body: "b", cta: "Une question ?" } };
  assertEquals(captionEndingViolated(parsed, undefined), false);
});

// ── Overlays > 28 mots (audit carrousel photo 12/07, lot D) ──

Deno.test("analyzeCarouselRedac mesure les overlays photo trop longs (> 28 mots)", () => {
  const long = Array.from({ length: 30 }, (_, i) => `mot${i}`).join(" ");
  const parsed = {
    slides: [
      { slide_number: 1, overlay_text: "Une phrase courte qui tient sur la photo." },
      { slide_number: 2, overlay_text: long },
      { slide_number: 3, title: "t", body: "slide texte sans overlay" },
    ],
    caption: { hook: "h", body: "b", cta: "c" },
  };
  const a = analyzeCarouselRedac(parsed);
  assertEquals(a.overlongOverlays.length, 1);
  assertEquals(a.overlongOverlays[0].slide, 2);
  assertEquals(a.overlongOverlays[0].words, 30);
});

Deno.test("analyzeCarouselRedac : overlay à 25 mots = conforme (tolérance 28)", () => {
  const ok = Array.from({ length: 25 }, (_, i) => `mot${i}`).join(" ");
  const a = analyzeCarouselRedac({ slides: [{ slide_number: 1, overlay_text: ok }], caption: {} });
  assertEquals(a.overlongOverlays.length, 0);
});

// ── Élisions françaises (re-tests 21/07 : « le avant/après qui brille ») ──

Deno.test("fixFrenchElisions : le/de/que + avant/après", async () => {
  const { fixFrenchElisions } = await import("./redac-gate.ts");
  assertEquals(
    fixFrenchElisions("On montre le avant/après qui brille, jamais les factures."),
    "On montre l'avant/après qui brille, jamais les factures.",
  );
  assertEquals(fixFrenchElisions("Les photos de avant sont floues."), "Les photos d'avant sont floues.");
  assertEquals(fixFrenchElisions("Plus vite que avant."), "Plus vite qu'avant.");
  assertEquals(fixFrenchElisions("Le après est bluffant."), "L'après est bluffant.");
});

Deno.test("fixFrenchElisions : ne touche pas les formes légitimes", async () => {
  const { fixFrenchElisions } = await import("./redac-gate.ts");
  const ok = "Avant, c'était sombre. L'avant/après parle de lui-même. Le onze du mois. Je le veux avant demain.";
  assertEquals(fixFrenchElisions(ok), ok);
  // « le » élidé seulement devant avant/après, pas devant n'importe quelle voyelle
  assertEquals(fixFrenchElisions("le atelier"), "le atelier");
});

Deno.test("fixElisionsInFields : mutation en place des champs texte", async () => {
  const { fixElisionsInFields } = await import("./redac-gate.ts");
  const obj: Record<string, unknown> = { content: "le avant/après", accroche: null, autre: 3 };
  fixElisionsInFields(obj, ["content", "accroche", "absent"]);
  assertEquals(obj.content, "l'avant/après");
  assertEquals(obj.accroche, null);
});

// ── Cohérence des durées slides ↔ caption (bilan hebdo 17/08/2026) ──

Deno.test("durées : attrape le cas réel « trois semaines » vs « un mois »", async () => {
  const { analyzeCarouselRedac, redacViolations, redacScore } = await import("./redac-gate.ts");
  // Contenu RÉEL de la semaine du 17/08 (carrousel before_after), noté 100/100
  // par le gate alors que la slide 2 et la légende se contredisent.
  const doc = {
    slides: [
      { slide_number: 1, title: "La même pièce. Deux vérités." },
      { slide_number: 2, title: "Trois semaines sans visite, puis tout a changé" },
      { slide_number: 3, title: "Je n'ai rien décoré" },
    ],
    caption: { body: "Un mois entre les deux photos. Aucun mur déplacé, aucune rénovation." },
  };
  const a = analyzeCarouselRedac(doc);
  assertEquals(a.durationConflicts.length, 1);
  assertEquals(a.durationConflicts[0], 'slides « Trois semaines » vs légende « Un mois »');
  assertEquals(redacViolations(a), 1);
  assertEquals(redacScore(a), 90); // et non plus 100
});

Deno.test("durées : la même durée des deux côtés ne déclenche rien", async () => {
  const { analyzeCarouselRedac } = await import("./redac-gate.ts");
  const a = analyzeCarouselRedac({
    slides: [{ slide_number: 1, title: "Trois semaines de chantier" }],
    caption: { body: "3 semaines entre les deux photos, et un an de recul depuis." },
  });
  assertEquals(a.durationConflicts, []);
});

Deno.test("durées : ordres de grandeur éloignés = sujets différents, on se tait", async () => {
  const { analyzeCarouselRedac } = await import("./redac-gate.ts");
  const a = analyzeCarouselRedac({
    slides: [{ slide_number: 1, title: "Deux minutes pour comprendre" }],
    caption: { body: "Dix ans que je fais ce métier." },
  });
  assertEquals(a.durationConflicts, []);
});

Deno.test("durées : rien d'un seul côté = rien à comparer", async () => {
  const { analyzeCarouselRedac } = await import("./redac-gate.ts");
  assertEquals(
    analyzeCarouselRedac({
      slides: [{ slide_number: 1, title: "Deux semaines de chantier" }],
      caption: { body: "Aucun mur déplacé." },
    }).durationConflicts,
    [],
  );
  assertEquals(
    analyzeCarouselRedac({
      slides: [{ slide_number: 1, title: "Rien à signaler" }],
      caption: { body: "Un mois plus tard." },
    }).durationConflicts,
    [],
  );
});

Deno.test("durées : un écart chiffré/lettres est vu aussi dans l'autre sens", async () => {
  const { analyzeCarouselRedac } = await import("./redac-gate.ts");
  // Le nombre en LETTRES est le trou d'origine : NUMBER_TOKEN ne voit que \d.
  const a = analyzeCarouselRedac({
    slides: [{ slide_number: 1, title: "6 semaines de recul" }],
    caption: { body: "Deux mois après, le constat est le même." },
  });
  assertEquals(a.durationConflicts.length, 1);
});

// ── Mesure seule (audit slop 18/08/2026, lot 5) : 6 familles, calibrage avant activation ──
// Ces compteurs ne déclenchent AUCUNE re-passe : ils alimentent la
// télémétrie (content-quality.ts) pour calibrer des seuils sur des vraies
// données avant d'activer quoi que ce soit.

Deno.test("countStaccatoAcrossSlides : 3 slides courtes consécutives = 1 rafale", async () => {
  const { countStaccatoAcrossSlides } = await import("./redac-gate.ts");
  const slides = [
    { slide_number: 1, title: "Peu de mots ici" }, // 4 mots
    { slide_number: 2, title: "Encore moins que ça" }, // 4 mots
    { slide_number: 3, title: "Trois slides courtes" }, // 3 mots
    { slide_number: 4, title: "Une slide bien plus longue avec beaucoup de mots pour casser le rythme court" },
  ];
  assertEquals(countStaccatoAcrossSlides(slides), 1);
});

Deno.test("countStaccatoAcrossSlides : slides de longueur normale = 0 rafale", async () => {
  const { countStaccatoAcrossSlides } = await import("./redac-gate.ts");
  const slides = [
    { slide_number: 1, title: "Une phrase avec pas mal de mots pour ne pas être staccato" },
    { slide_number: 2, title: "Une autre phrase également assez longue pour ne pas compter" },
    { slide_number: 3, title: "Encore une troisième slide qui prend son temps pour dire les choses" },
  ];
  assertEquals(countStaccatoAcrossSlides(slides), 0);
});

Deno.test("countStaccatoAcrossSlides : seulement 2 slides courtes consécutives ne compte pas", async () => {
  const { countStaccatoAcrossSlides } = await import("./redac-gate.ts");
  const slides = [
    { slide_number: 1, title: "Deux slides courtes" },
    { slide_number: 2, title: "Puis ça s'arrête" },
    { slide_number: 3, title: "Une slide bien plus longue avec beaucoup de mots pour casser le rythme court" },
  ];
  assertEquals(countStaccatoAcrossSlides(slides), 0);
});

Deno.test("countAnaphoraAcrossSlides : 3 slides consécutives démarrant par le même mot = 1 rafale", async () => {
  const { countAnaphoraAcrossSlides } = await import("./redac-gate.ts");
  const slides = [
    { slide_number: 1, title: "Le prix grimpe chaque année." },
    { slide_number: 2, title: "Le temps presse pour tout le monde." },
    { slide_number: 3, title: "Le geste compte plus que le mot." },
    { slide_number: 4, title: "Un jour différent commence enfin." },
  ];
  assertEquals(countAnaphoraAcrossSlides(slides), 1);
});

Deno.test("countAnaphoraAcrossSlides : mots d'ouverture différents = 0 rafale", async () => {
  const { countAnaphoraAcrossSlides } = await import("./redac-gate.ts");
  const slides = [
    { slide_number: 1, title: "Le prix grimpe chaque année." },
    { slide_number: 2, title: "Un client m'a écrit hier." },
    { slide_number: 3, title: "Trois semaines plus tard, tout a changé." },
  ];
  assertEquals(countAnaphoraAcrossSlides(slides), 0);
});

Deno.test("countResultConclusionOpeners : « Résultat : » en début de phrase est compté", async () => {
  const { countResultConclusionOpeners } = await import("./redac-gate.ts");
  const text = "Elle a tout changé de méthode. Résultat : les ventes ont doublé en trois mois.";
  assertEquals(countResultConclusionOpeners(text).length, 1);
});

Deno.test("countResultConclusionOpeners : « Conclusion : » en début de phrase est compté", async () => {
  const { countResultConclusionOpeners } = await import("./redac-gate.ts");
  const text = "On a testé pendant six mois. Conclusion : la régularité compte plus que la perfection.";
  assertEquals(countResultConclusionOpeners(text).length, 1);
});

Deno.test("countResultConclusionOpeners : « résultat » en usage courant MI-PHRASE n'est pas compté", async () => {
  const { countResultConclusionOpeners } = await import("./redac-gate.ts");
  assertEquals(countResultConclusionOpeners("Le résultat de l'enquête est clair.").length, 0);
});

Deno.test("isOpeningRhetoricalQuestion : la 1re phrase se termine par « ? »", async () => {
  const { isOpeningRhetoricalQuestion } = await import("./redac-gate.ts");
  assertEquals(isOpeningRhetoricalQuestion("Et si tu arrêtais de t'excuser ? Ça changerait tout."), true);
});

Deno.test("isOpeningRhetoricalQuestion : ouverture affirmative = false", async () => {
  const { isOpeningRhetoricalQuestion } = await import("./redac-gate.ts");
  assertEquals(isOpeningRhetoricalQuestion("Le rythme change tout. Tu le sens dès la première semaine."), false);
});

Deno.test("isOpeningRhetoricalQuestion : texte vide = false", async () => {
  const { isOpeningRhetoricalQuestion } = await import("./redac-gate.ts");
  assertEquals(isOpeningRhetoricalQuestion(""), false);
});

Deno.test("countEmptyAdjectives : compte authentique/aligné/puissant", async () => {
  const { countEmptyAdjectives } = await import("./redac-gate.ts");
  const a = countEmptyAdjectives("Ce positionnement authentique et aligné est puissant.");
  assertEquals(a, { authentique: 1, aligné: 1, puissant: 1 });
});

Deno.test("countEmptyAdjectives : faux positifs évités (vocabulaire métier légitime)", async () => {
  const { countEmptyAdjectives } = await import("./redac-gate.ts");
  // « désaligné » (contraire), « impuissant » (contraire), « alignement » (nom,
  // pas l'adjectif) ne doivent PAS compter comme des occurrences de la famille.
  const a = countEmptyAdjectives(
    "Un discours désaligné, presque impuissant, loin de tout alignement des prix sur le marché.",
  );
  assertEquals(a, { authentique: 0, aligné: 0, puissant: 0 });
});

Deno.test("countEmptyAdjectives : formes féminines/plurielles comptées", async () => {
  const { countEmptyAdjectives } = await import("./redac-gate.ts");
  const a = countEmptyAdjectives("Des marques authentiques, alignées et puissantes.");
  assertEquals(a, { authentique: 1, aligné: 1, puissant: 1 });
});

Deno.test("hookEndingSimilarity : boucle accroche/chute détectée (reformulation quasi identique)", async () => {
  const { hookEndingSimilarity } = await import("./redac-gate.ts");
  const hook = "Le vrai changement commence quand tu arrêtes de t'excuser.";
  const ending = "Le vrai changement, c'est quand tu arrêtes de t'excuser.";
  const sim = hookEndingSimilarity(hook, ending);
  assertEquals(sim >= 0.7, true);
});

Deno.test("hookEndingSimilarity : accroche et chute sans rapport = similarité faible", async () => {
  const { hookEndingSimilarity } = await import("./redac-gate.ts");
  const hook = "Le vrai changement commence aujourd'hui.";
  const ending = "Un café renversé un mardi matin.";
  const sim = hookEndingSimilarity(hook, ending);
  assertEquals(sim <= 0.2, true);
});

Deno.test("measureSlopSignals : agrège les 6 familles sans modifier le contenu", async () => {
  const { measureSlopSignals } = await import("./redac-gate.ts");
  const slides = [
    { slide_number: 1, title: "Le prix grimpe." },
    { slide_number: 2, title: "Le temps presse." },
    { slide_number: 3, title: "Le geste compte." },
  ];
  const signals = measureSlopSignals({
    fullText: "Le prix grimpe. Le temps presse. Le geste compte. Résultat : tout s'accélère.",
    hookText: "Le prix grimpe.",
    endingText: "Résultat : tout s'accélère.",
    slides,
  });
  assertEquals(signals.staccato_inter_slides, 1);
  assertEquals(signals.anaphora_inter_slides, 1);
  assertEquals(signals.result_conclusion_openers, 1);
  assertEquals(typeof signals.opening_rhetorical_question, "boolean");
  assertEquals(signals.empty_adjectives, { authentique: 0, aligné: 0, puissant: 0 });
  assertEquals(typeof signals.hook_ending_similarity, "number");
});

Deno.test("measureSlopSignals : sans slides, les familles inter-slides restent à 0", async () => {
  const { measureSlopSignals } = await import("./redac-gate.ts");
  const signals = measureSlopSignals({ fullText: "Un texte libre, sans slides, tout simplement." });
  assertEquals(signals.staccato_inter_slides, 0);
  assertEquals(signals.anaphora_inter_slides, 0);
  assertEquals(signals.hook_ending_similarity, 0);
});
