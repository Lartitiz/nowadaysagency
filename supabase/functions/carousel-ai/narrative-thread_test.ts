// Fil du récit continu lu à voix haute (14/11/2026, carrousel photo « fatigue
// synthétique » : slides qui commencent à froid, « Pour moi » deux fois,
// revue de presse en slide 2, fin « oui ou non ? »).
//   deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/carousel-ai/narrative-thread_test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  narrativeNewsWriting, narrativeThreadDefects, narrativeThreadFix, RECIT_ACTU_SUR_SLIDE, RECIT_FIL_A_VOIX_HAUTE, threadDefectCount,
} from "./narrative-thread.ts";
import { createContinuousNarrative } from "./continuous-narrative.ts";
import { briefExamples, briefExamplesPrompt, closingAside, RECIT_RELECTURE_CARROUSEL } from "./narrative-thread.ts";

// Le carrousel réel jugé « incompréhensible à voix haute » (slides 2 à 6).
const REEL = [
  "Des analyses de tendances com' 2026 relayées par CBC 35 décrivent une « fatigue synthétique » : on se lasserait des contenus trop lisses et automatisés, au profit des coulisses sans filtre.",
  "Pour moi, se montrer authentique et vulnérable, c'est important, parce que dans la vie de tous les jours, ce sont ces personnes-là auxquelles on fait confiance, finalement.",
  "Le lisse, ce n'est pas qu'un visuel trop parfait, c'est aussi la phrase pour tout le monde.",
  "Cette phrase ne décrit aucun moment vécu, alors personne ne s'y reconnaît.",
  "Pour moi, ne pas être synthétique, c'est nommer un moment que quelqu'un vit vraiment. Votre dernier post nommait-il une situation précise, oui ou non ?",
];

Deno.test("fil : le carrousel réel est mesuré (amorce répétée, fin en sondage)", () => {
  const d = narrativeThreadDefects(REEL);
  assertEquals(d.repeatedOpeners, [{ opener: "pour moi", paragraphs: [2, 5] }]);
  assertEquals(d.yesNoEnding, true);
  assertEquals(d.pressSources, [1], "« relayées par » : revue de presse sur la slide");
  assertEquals(d.slogans, [3], "« ce n'est pas qu'un visuel…, c'est aussi… »");
  assertEquals(threadDefectCount(d), 4);
  const fix = narrativeThreadFix(d);
  assert(fix.includes("« pour moi » ouvre les paragraphes 2, 5"), fix);
  assert(fix.includes("sondage « oui ou non ? »"), fix);
});

Deno.test("fil : un texte relié, sans répétition ni sondage, n'a aucun défaut", () => {
  const d = narrativeThreadDefects([
    "Je suis tombée sur ce mot en lisant les tendances de l'année.",
    "Et j'ai souri, parce que je le dis depuis longtemps.",
    "Le lisse, ce n'est pas qu'une photo trop parfaite.",
    "Alors je préfère montrer mes coulisses, et je trouve ça plutôt rassurant.",
  ]);
  assertEquals(threadDefectCount(d), 0);
  assertEquals(narrativeThreadFix(d), "");
});

Deno.test("fil : même mot de liaison deux paragraphes de suite, pas à distance", () => {
  assertEquals(narrativeThreadDefects(["Et un.", "Et deux.", "Mais trois.", "Et quatre."]).sameLiaison, [2]);
  assertEquals(narrativeThreadDefects(["Mais un.", "Alors deux.", "Mais trois."]).sameLiaison, []);
});

Deno.test("actu du récit continu : plus de sondage oui/non, source dite simplement", () => {
  const news = narrativeNewsWriting({ carousel_type: "photo", news_context: "Étude" });
  assert(!news.includes("un oui ou non, un choix entre deux"), news);
  assert(news.includes("jamais un sondage « oui ou non ? »"));
  assert(news.endsWith(RECIT_ACTU_SUR_SLIDE));
});

const draft = (paragraphs: string[]) => ({
  idea: "Le lisse ne crée pas de confiance",
  hook: "« Fatigue synthétique » : on l'appelle comme ça maintenant ?",
  paragraphs,
  caption: { hook: "", body: "", cta: "", hashtags: [] },
});
const base = {
  body: { carousel_type: "photo", scenario_origin: "automatic", slide_count: 6, photo_contexts: [{ context: "Bureau" }] },
  brandingContext: "Je suis communicante.",
  photoContext: "Bureau",
  newsContext: "",
  authoredText: "",
  startedAt: Date.now(),
  usage: {},
  emitStatus: () => {},
};

Deno.test("récit continu : la consigne du fil est dans le système, en photo comme en mixte", async () => {
  for (const carousel_type of ["photo", "mix"]) {
    let system = "";
    await createContinuousNarrative({ ...base, body: { ...base.body, carousel_type }, write: async (o) => { system ||= o.system || ""; return JSON.stringify(draft(["Un.", "Et deux.", "Mais trois.", "Alors quatre.", "Du coup cinq."])); } });
    assert(system.includes(RECIT_FIL_A_VOIX_HAUTE), carousel_type);
    assert(!system.includes("ACTU DITE SIMPLEMENT"), "sans actu, pas de consigne d'actu");
  }
});

Deno.test("récit continu : fil cassé → UNE réécriture, gardée si elle fait mieux", async () => {
  const feedbacks: string[] = [];
  let writes = 0;
  const fixed = ["Je suis tombée sur ce mot.", "Et j'ai souri.", "Mais le lisse, c'est aussi une phrase.", "Alors personne ne s'y reconnaît.", "Du coup, je préfère nommer un moment vécu. Et vous ?"];
  const result = await createContinuousNarrative({
    ...base,
    write: async (o) => {
      writes++;
      const sent = JSON.parse((o.messages[0].content as any)[0].text);
      if (sent.feedback) feedbacks.push(sent.feedback);
      return JSON.stringify(draft(writes === 1 ? REEL : fixed));
    },
  });
  assertEquals(writes, 2);
  assert(feedbacks[0].startsWith("Fil à voix haute :") || feedbacks[0].includes("Fil à voix haute :"), feedbacks[0]);
  const texts = result!.doc.slides.map((s: any) => s.overlay_text || "").join(" ");
  assert(!/oui ou non/.test(texts), texts);
});

Deno.test("récit continu : réécriture qui ne répare pas le fil → texte d'origine gardé", async () => {
  let writes = 0;
  const result = await createContinuousNarrative({
    ...base,
    write: async () => { writes++; return JSON.stringify(draft(REEL)); },
  });
  assertEquals(writes, 2);
  assertEquals(result!.doc.narrative_draft.paragraphs, REEL);
});

// Relecture du 15/11/2026 (méthode carrousel) : la version refaite par l'app.
const REFAIT = [
  "CBC 35 parle d'une « fatigue synthétique », repérée dans des analyses de tendances com' pour 2026 : on saturerait des posts sans aspérité, faits à la chaîne.",
  "Et ce qui reprendrait de la valeur, c'est l'inverse : les coulisses sans filtre, les témoignages spontanés, la signature humaine qu'on sent derrière une marque.",
  "Alors le mot est neuf, mais l'idée, elle, ne l'est pas du tout. Un discours trop parfait pour être vrai, on l'a toujours senti venir.",
  "Mais se montrer, ça fait peur. Du coup, on gomme ce qui dépasse pour se protéger.",
  "Et c'est là que je tiens bon : votre voix mérite d'être amplifiée, pas déformée. Vos mots valent mieux qu'un template.",
  "Finalement, ce mot, je l'appelle la confiance. Qu'avez-vous déjà gommé de vos posts par peur de ne pas faire assez pro ?",
];

Deno.test("relecture : triplet, slogan « X, pas Y » et question finale mesurés sur la version refaite", () => {
  const d = narrativeThreadDefects(REFAIT);
  assertEquals(d.triplets, [2]);
  assertEquals(d.slogans, [5]);
  assertEquals(d.questionEnding, true);
  assertEquals(d.yesNoEnding, false);
  const fix = narrativeThreadFix(d);
  assert(fix.includes("caption.cta"), fix);
  assert(fix.includes("dis directement ce qui est"), fix);
});

Deno.test("relecture : les autres slogans, et pas de fausse alerte sur une phrase simple", () => {
  assertEquals(narrativeThreadDefects(["Ce n'est pas une question de photo, c'est une question de phrase.", "Pas besoin de tout dire. Juste de nommer un moment.", "Je ne le savais pas, et ça m'a surprise.", "Selon une étude, les gens lisent moins."]).slogans, [1, 2]);
  assertEquals(narrativeThreadDefects(["On en parle souvent avec mes clientes.", "Le lundi, la lumière et le café.", "Elle sort de la pharmacie, un peu perdue."]).triplets, []);
  assertEquals(narrativeThreadDefects(["15 000 selon les syndicats.", "Selon une étude, les gens lisent moins."]).pressSources, [2]);
});

Deno.test("relecture : la consigne est dans le système, la ligne d'humour finit en petit sous la dernière slide photo", async () => {
  let system = "";
  const fin = ["Je suis tombée sur ce mot.", "Et j'ai souri.", "Mais le lisse, c'est aussi une phrase.", "Alors personne ne s'y reconnaît.", "Du coup, je préfère nommer un moment vécu."];
  const result = await createContinuousNarrative({ ...base, write: async (o) => { system ||= o.system || ""; return JSON.stringify({ ...draft(fin), closing_aside: "La pharmacie, elle, l'a compris depuis longtemps." }); } });
  assert(system.includes(RECIT_RELECTURE_CARROUSEL));
  assert(system.includes("La question simple pour les commentaires va dans caption.cta, jamais sur la dernière slide"));
  const slides = result!.doc.slides;
  assertEquals((slides[slides.length - 1] as any).detail, "La pharmacie, elle, l'a compris depuis longtemps.");
  assert(slides.slice(0, -1).every((s: any) => !s.detail));
  assertEquals(closingAside("Une ligne bien trop longue pour tenir en petit sous la dernière slide du carrousel photo."), "");
  assertEquals(closingAside("Vraiment ?"), "");
});

Deno.test("actu du récit continu : source en légende, question de fin dans caption.cta", () => {
  for (const body of [{ carousel_type: "photo" }, { carousel_type: "photo", deepening_answers: { feeling: "Ça m'agace" } }]) {
    const news = narrativeNewsWriting(body);
    assert(!news.includes("et sa source comme point d'entrée visible"), news);
    assert(news.includes("sa source se nomme dans caption.body"), news);
    assert(news.includes("va dans caption.cta"), news);
  }
});

// Essai réel du 15/11/2026 : l'angle donnait la vitrine de pharmacie, le texte l'a laissée tomber.
const ANGLE = "Distinguer la cible de l'activité et la situation nommée dans chaque post\n\nIdée centrale : Beaucoup refusent de « choisir une cible » par peur d'exclure des client·es. On ne s'arrête pas devant « Prenez soin de vous ». On s'arrête devant « Piqûres de moustiques ? ». Deuxième étape : « J'accompagne toutes les personnes qui veulent prendre soin d'elles » ne décrit aucun moment vécu.";

Deno.test("exemple de l'angle : absent des slides → défaut, repris → rien", () => {
  const ex = briefExamples({ editorial_angle: ANGLE });
  assertEquals(ex.length, 4);
  const sans = ["On se lasse des posts trop parfaits.", "Et on l'appelle comme ça maintenant ?", "Alors relisez votre post à voix haute."];
  const d = narrativeThreadDefects(sans, ex);
  assertEquals(d.missingExample.length, 4);
  assert(narrativeThreadFix(d).includes("« Prenez soin de vous »"));
  const avec = [...sans, "Dans une vitrine de pharmacie, entre « Prenez soin de vous » et « Piqûres de moustiques ? », laquelle vous arrête ?"];
  assertEquals(narrativeThreadDefects(avec, ex).missingExample, []);
  assertEquals(narrativeThreadDefects(sans, []).missingExample, []);
  assertEquals(briefExamples({ editorial_angle: undefined }), []);
});

Deno.test("exemple de l'angle : le récit continu réécrit une fois quand il manque", async () => {
  let writes = 0;
  const avec = ["Je suis tombée sur ce mot.", "Et entre « Prenez soin de vous » et « Piqûres de moustiques ? », on s'arrête devant la seconde.", "Mais c'est une phrase.", "Alors on s'y reconnaît.", "Du coup, je nomme un moment vécu."];
  const sans = ["Je suis tombée sur ce mot.", "Et j'ai souri.", "Mais le lisse, c'est aussi une phrase.", "Alors personne ne s'y reconnaît.", "Du coup, je préfère nommer un moment vécu."];
  const result = await createContinuousNarrative({ ...base, body: { ...base.body, editorial_angle: ANGLE }, write: async () => JSON.stringify(draft(++writes === 1 ? sans : avec)) });
  assertEquals(writes, 2);
  assertEquals(result!.doc.narrative_draft.paragraphs, avec);
  const receipt = (result!.doc.narrative_draft as any).thread_rewrite;
  assertEquals(receipt.accepted, true);
  assertEquals(receipt.reason, "accepted");
  assertEquals([receipt.missing_example_before, receipt.missing_example_after], [true, false]);
});

Deno.test("exemple de l'angle : nommé dans le système dès la 1re rédaction, rien sans exemple", async () => {
  let system = "";
  await createContinuousNarrative({ ...base, body: { ...base.body, editorial_angle: ANGLE }, write: async (o) => { system ||= o.system || ""; return JSON.stringify(draft(["Un.", "Et deux « Prenez soin de vous ».", "Mais trois.", "Alors quatre.", "Du coup cinq."])); } });
  assert(system.includes("EXEMPLE À REPRENDRE SUR LES SLIDES"), "exemples nommés");
  assert(system.includes("« Piqûres de moustiques ? »"));
  assertEquals(briefExamplesPrompt([]), "");
});

Deno.test("réécriture du fil refusée : le reçu dit pourquoi (slides plus longues)", async () => {
  let writes = 0;
  const sans = ["Je suis tombée sur ce mot.", "Et j'ai souri.", "Mais le lisse, c'est aussi une phrase.", "Alors personne ne s'y reconnaît.", "Du coup, je préfère nommer un moment vécu."];
  const long = Array.from({ length: 45 }, () => "mot").join(" ");
  const plusLong = [...sans.slice(0, 4), `Du coup, entre « Prenez soin de vous » et « Piqûres de moustiques ? », ${long}.`];
  const result = await createContinuousNarrative({ ...base, body: { ...base.body, editorial_angle: ANGLE }, write: async () => JSON.stringify(draft(++writes === 1 ? sans : plusLong)) });
  const receipt = (result!.doc.narrative_draft as any).thread_rewrite;
  assertEquals(receipt.accepted, false);
  assertEquals(receipt.reason, "longer");
  assertEquals(result!.doc.narrative_draft.paragraphs, sans);
});

Deno.test("exemple de l'angle : lu aussi dans le brief d'idée envoyé par l'app (deepening_answers)", () => {
  // withIdeaBrief (src/lib/idea-brief-request.ts) : l'angle garde son titre, le brief part dans les réponses.
  const material = "MATIÈRE ÉDITORIALE CHOISIE (proposition, pas un témoignage personnel, sauf « Sa réponse », fait réel donné par la cliente).\n" + ANGLE;
  const ex = briefExamples({ editorial_angle: "Distinguer la cible de l'activité", deepening_answers: { q_0: "Ma réponse", "Brief éditorial choisi": material } });
  assert(ex.includes("Prenez soin de vous"), JSON.stringify(ex));
  assert(!ex.includes("Sa réponse"), "l'en-tête de la matière n'est pas un exemple");
  assertEquals(briefExamples({ deepening_answers: { q_0: "« un mot » seul" } }), []);
});

// ─── Règles du carrousel texte portées sur le photo et le mixte (26/11/2026) ───
import { captionDefectCount, narrativeCaptionDefects, narrativeCaptionFix } from "./narrative-thread.ts";
import { CAROUSEL_CONTINUITY, FIL_NE_PAS_DECROCHER, FIL_RAISON_DE_GLISSER, FIL_TEST_ENVOI, CAROUSEL_CAPTION_WRITING, CAROUSEL_FACTS, buildCarouselWritingSystem } from "./writing-contract.ts";
import { numbersIn } from "../_shared/redac-gate.ts";

const SAIN = ["Je suis tombée sur ce mot.", "Et j'ai souri.", "Le lisse, c'est aussi une phrase.", "Personne ne s'y reconnaît.", "Du coup, je préfère nommer un moment vécu."];
const withCaption = (paragraphs: string[], caption: any) => ({ ...draft(paragraphs), caption: { hook: "", body: "", cta: "", hashtags: [], ...caption } });

Deno.test("fil partagé : le photo et le mixte reçoivent les mêmes phrases que le carrousel texte", async () => {
  for (const rule of [FIL_TEST_ENVOI, FIL_RAISON_DE_GLISSER, FIL_NE_PAS_DECROCHER]) assert(CAROUSEL_CONTINUITY.includes(rule), rule.slice(0, 40));
  assert(buildCarouselWritingSystem("", false, "", "").includes(CAROUSEL_CAPTION_WRITING));
  for (const carousel_type of ["photo", "mix"]) {
    let system = "";
    await createContinuousNarrative({ ...base, body: { ...base.body, carousel_type }, write: async (o) => { system ||= o.system || ""; return JSON.stringify(draft(["Un.", "Et deux.", "Mais trois.", "Alors quatre.", "Du coup cinq."])); } });
    for (const rule of [FIL_TEST_ENVOI, FIL_RAISON_DE_GLISSER, FIL_NE_PAS_DECROCHER, CAROUSEL_FACTS, CAROUSEL_CAPTION_WRITING]) assert(system.includes(rule), `${carousel_type} : ${rule.slice(0, 40)}`);
    assert(system.includes("jamais une question qui se répond par oui ou non"), carousel_type);
    assert(!system.includes("Caption résume fidèlement"), "l'ancienne consigne de légende est partie");
  }
  // Le repère de longueur propre à la photo reste.
  let photo = "";
  await createContinuousNarrative({ ...base, write: async (o) => { photo ||= o.system || ""; return JSON.stringify(draft(SAIN)); } });
  assert(photo.includes("25 à 40 mots"), "repère photo gardé");
});

Deno.test("légende du récit continu : recopie, durée d'exemple non annoncée, question fermée mesurées sans IA", () => {
  const slides = ["Je prépare chaque commande à la main dans mon atelier de Rennes.", "Et chaque colis part avec un petit mot écrit pour la cliente.", "Mais ce geste rend la marque rentable sur six mois."];
  const n = withCaption(slides, { hook: "Je prépare chaque commande à la main dans mon atelier de Rennes.", body: "Chaque colis part avec un petit mot écrit pour la cliente.", cta: "Est-ce que tu écris un mot dans tes colis ?" });
  const d = narrativeCaptionDefects(n, numbersIn("Atelier à Rennes."));
  assertEquals(d.copied.length, 2);
  assertEquals(d.durations.length, 1);
  assertEquals(d.closedQuestion, true);
  assertEquals(captionDefectCount(d), 3);
  const fix = narrativeCaptionFix(d);
  assert(fix.includes("LÉGENDE QUI RECOPIE LES SLIDES") && fix.includes("DURÉE D'EXEMPLE NON ANNONCÉE") && fix.includes("question OUVERTE"), fix);
  const sain = narrativeCaptionDefects(withCaption(SAIN, { hook: "Pourquoi j'en parle.", body: "Une précision.", cta: "Qu'est-ce qui te fait t'arrêter sur un post ?" }), numbersIn(""));
  assertEquals(captionDefectCount(sain), 0);
  assertEquals(narrativeCaptionFix(sain), "");
  // Sans texte d'entrée connu, les durées ne sont pas mesurées.
  assertEquals(narrativeCaptionDefects(n).durations, []);
});

Deno.test("légende du récit continu : question fermée → la réécriture unique, gardée si elle la rouvre", async () => {
  const feedbacks: string[] = [];
  let writes = 0;
  const result = await createContinuousNarrative({
    ...base, allowedNumbers: numbersIn(""),
    write: async (o) => {
      const sent = JSON.parse((o.messages[0].content as any)[0].text);
      if (sent.feedback) feedbacks.push(sent.feedback);
      return JSON.stringify(withCaption(SAIN, { cta: ++writes === 1 ? "Est-ce que tu relis tes légendes ?" : "Qu'est-ce qui te fait relire une légende ?" }));
    },
  });
  assertEquals(writes, 2);
  assert(feedbacks[0].includes("question OUVERTE"), feedbacks[0]);
  assertEquals(result!.doc.caption.cta, "Qu'est-ce qui te fait relire une légende ?");
  const receipt = (result!.doc.narrative_draft as any).thread_rewrite;
  assertEquals([receipt.accepted, receipt.caption_before, receipt.caption_after], [true, 1, 0]);
});

Deno.test("légende du récit continu : sans défaut, aucune réécriture en plus", async () => {
  let writes = 0;
  await createContinuousNarrative({ ...base, allowedNumbers: numbersIn(""), write: async () => { writes++; return JSON.stringify(withCaption(SAIN, { hook: "Pourquoi j'en parle.", body: "Une précision.", cta: "Qu'est-ce qui te fait t'arrêter sur un post ?" })); } });
  assertEquals(writes, 1);
});

Deno.test("mixte hors LinkedIn : le récit continu reçoit le repère de longueur du carrousel texte, pas le photo ni LinkedIn", async () => {
  const systemOf = async (body: any) => { let system = ""; await createContinuousNarrative({ ...base, body: { ...base.body, ...body }, write: async (o) => { system ||= o.system || ""; return JSON.stringify(draft(SAIN)); } }); return system; };
  const mix = await systemOf({ carousel_type: "mix" });
  assert(mix.includes("CARROUSEL MIXTE : vise environ 20 à 45 mots par paragraphe, 50 au plus"), "repère mixte");
  assert(!(await systemOf({ carousel_type: "photo" })).includes("CARROUSEL MIXTE :"));
  const linkedin = await systemOf({ carousel_type: "mix", channel: "linkedin" });
  assert(!linkedin.includes("CARROUSEL MIXTE : vise") && linkedin.includes("LINKEDIN, CARROUSEL MIXTE"));
});

// ─── Relecture de Laetitia du 26/11/2026 au soir : liaisons, rythme, slide 2, ligne d'humour ───
import { RECIT_RYTHME, SHORT_SLIDE_WORDS } from "./narrative-thread.ts";

const LONG = (debut: string) => `${debut} ${Array.from({ length: 30 }, () => "mot").join(" ")}.`;

Deno.test("liaisons : plus d'un paragraphe sur deux qui commence par un mot de liaison = un tic à réécrire", () => {
  const tic = narrativeThreadDefects(["Je pars de là.", "Et j'ajoute ceci.", "Mais il y a une limite.", "Alors je tranche.", "Du coup, je conclus."]);
  assertEquals(tic.liaisonTic, true);
  assert(narrativeThreadFix(tic).includes("un sur deux au plus"));
  const sain = narrativeThreadDefects(["Je pars de là.", "Et j'ajoute ceci.", "Cette limite existe.", "Elle se contourne.", "Du coup, je conclus."]);
  assertEquals(sain.liaisonTic, false);
  assert(RECIT_FIL_A_VOIX_HAUTE.includes("Au plus un paragraphe sur deux commence par un mot de liaison"));
});

Deno.test("rythme : aucun paragraphe d'une phrase courte, ou slide 2 trop chargée, seulement quand le rythme est demandé", () => {
  const plat = [LONG("Je pars de là"), LONG("Cette idée tient"), LONG("Ce point compte"), LONG("La fin arrive")];
  assertEquals(narrativeThreadDefects(plat).flatRhythm, false, "sans demande, pas de mesure");
  const d = narrativeThreadDefects(plat, [], { rhythm: true });
  assertEquals([d.flatRhythm, d.heavySecond], [true, false]);
  assert(narrativeThreadFix(d).includes(`UNE seule phrase de ${SHORT_SLIDE_WORDS} mots au plus`));
  const avecCourte = narrativeThreadDefects([plat[0], "Mon visage, c'est ma façon de signer.", plat[2], plat[3]], [], { rhythm: true });
  assertEquals(avecCourte.flatRhythm, false);
  // Deux phrases courtes ne font pas une slide « d'une phrase ».
  assertEquals(narrativeThreadDefects([plat[0], "Oui. Non.", plat[2], plat[3]], [], { rhythm: true }).flatRhythm, true);
  const lourde = narrativeThreadDefects([`${plat[0]} ${plat[1]}`, "Une phrase courte.", plat[2], plat[3]], [], { rhythm: true });
  assertEquals(lourde.heavySecond, true);
  assert(narrativeThreadFix(lourde).includes("slide 2"));
});

Deno.test("rythme : consigne donnée au récit qui raconte, pas à une liste ; texte plat → la réécriture unique", async () => {
  const plat = [LONG("Je pars de là"), LONG("Cette idée tient"), LONG("Ce point compte"), LONG("Celle-ci aussi"), LONG("La fin arrive")];
  const rythme = [plat[0], "Mon visage, c'est ma façon de signer.", plat[2], plat[3], plat[4]];
  let system = "", writes = 0; const feedbacks: string[] = [];
  const result = await createContinuousNarrative({ ...base, body: { ...base.body, carousel_type: "mix" }, write: async (o) => {
    system ||= o.system || "";
    const sent = JSON.parse((o.messages[0].content as any)[0].text); if (sent.feedback) feedbacks.push(sent.feedback);
    return JSON.stringify(draft(++writes === 1 ? plat : rythme));
  } });
  assert(system.includes(RECIT_RYTHME));
  assertEquals(writes, 2);
  assert(feedbacks[0].includes("même poids"), feedbacks[0]);
  assertEquals(result!.doc.narrative_draft.paragraphs, rythme);
  // Liste demandée (famille E) : ni consigne ni mesure.
  let liste = "", n = 0;
  await createContinuousNarrative({ ...base, body: { ...base.body, carousel_type: "mix", editorial_angle: "tips" }, write: async (o) => { liste ||= o.system || ""; n++; return JSON.stringify(draft(plat)); } });
  assert(!liste.includes("RYTHME (sauf liste"), "pas de rythme imposé à une liste");
  assertEquals(n, 1);
});

Deno.test("ligne d'humour : un vécu au passé est retiré, une remarque reste", () => {
  assertEquals(closingAside("J'ai retourné pas mal de savons avant d'en fabriquer."), "");
  assertEquals(closingAside("On a tous un savon qui traîne au fond du placard."), "");
  assertEquals(closingAside("Je sais, je fais des listes pour tout."), "Je sais, je fais des listes pour tout.");
  assertEquals(closingAside("Promis, la liste d'ingrédients mord moins qu'elle en a l'air."), "Promis, la liste d'ingrédients mord moins qu'elle en a l'air.");
  assert(RECIT_RELECTURE_CARROUSEL.includes("une remarque et jamais un souvenir"));
});
