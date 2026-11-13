// Faits et dates sourcés, aucune règle juridique ajoutée (décisions de Laetitia
// du 13/11/2026, QA marchandes de biens du 12/11). Pour tous les formats.
// Lancer : deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/_shared/redac-gate-faits-sources_test.ts

import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { installFetchMock, setTestEnv } from "./test-edge-harness.ts";
import {
  analyzeTextRedac,
  enforceNoAddedLegalRules,
  findAddedLegalRules,
  findResearchNumbersUsed,
  findUnsourcedResearchNumbers,
  numbersIn,
  researchNumbers,
  runTextRedacGate,
} from "./redac-gate.ts";
import { LEGAL_RULE_REMOVAL_PROMPT } from "./correction-pass.ts";
import { isSaleListing } from "./sale-listing.ts";

setTestEnv();

const anthropicText = (text: string) => ({
  status: 200,
  body: { content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 100, output_tokens: 100 } },
});

// ── Règle 3 : aucune règle juridique ajoutée ──

const BRIEF_APPORTEURS = "je cherche des apporteurs d'affaires pour trouver des biens hors marché, je rémunère la mise en relation";
const HOGUET = "Un point important : la mise en relation relève de l'entremise immobilière au sens de la loi Hoguet, qu'il y ait rémunération ou non.";
const JURIS = "La jurisprudence est constante sur ce point depuis 2012.";
const CLEAN = "Vous connaissez un immeuble dont le propriétaire pense à vendre ? Écrivez-moi en message privé.";

Deno.test("règle juridique : le cas du QA (loi Hoguet, jurisprudence) est repéré", () => {
  const found = findAddedLegalRules(`${HOGUET} ${JURIS}\n\n${CLEAN}`, BRIEF_APPORTEURS);
  assertEquals(found.length, 2);
  assertEquals(found[0].includes("loi Hoguet"), true);
});

Deno.test("règle juridique : d'autres formes repérées (article, code, obligation légale, la loi impose)", () => {
  for (const s of [
    "L'article L. 221-18 du code de la consommation te donne 14 jours.",
    "Le Code du travail encadre ce point.",
    "C'est une obligation légale pour toute boutique en ligne.",
    "Depuis le RGPD, la réglementation impose le double consentement.",
    "Légalement, tu dois afficher tes prix.",
    "Tu es passible d'une amende si tu oublies.",
  ]) assertEquals(findAddedLegalRules(s, "un post sur ma nouvelle collection de bijoux").length, 1, s);
});

Deno.test("règle juridique : rien quand l'utilisatrice évoque elle-même le droit", () => {
  for (const source of [
    "un post sur la loi Hoguet et les apporteurs",
    "ce qui est légal ou pas quand on paie un apporteur",
    "mes CGV et le droit de rétractation",
    "je suis avocate en droit du travail, post sur le licenciement",
  ]) assertEquals(findAddedLegalRules(`${HOGUET} ${JURIS}`, source), [], source);
});

Deno.test("règle juridique : pas de faux positif sur le langage courant", () => {
  for (const s of [
    "Selon la loi de Pareto, 20 % de tes clientes font 80 % de ton chiffre.",
    "La loi de l'attraction, très peu pour moi.",
    "Je m'interdis de travailler le dimanche.",
    "J'ai signé le compromis chez le notaire mardi.",
    "Mon code couleur impose du rose partout.",
  ]) assertEquals(findAddedLegalRules(s, "un post sur ma semaine"), [], s);
  // Source inconnue : pas de mesure.
  assertEquals(findAddedLegalRules(HOGUET, undefined), []);
});

Deno.test("règle juridique : passe gardée si la règle disparaît, rejetée sinon", async () => {
  const text = `${HOGUET} ${JURIS}\n\n${CLEAN}`;
  let mock = installFetchMock({ anthropic: () => anthropicText(`Mettons-nous d'accord par écrit avant toute mise en relation.\n\n${CLEAN}`) });
  try {
    const out = await enforceNoAddedLegalRules(text, BRIEF_APPORTEURS);
    assertEquals(out.applied, true);
    assertEquals(out.content.includes("Hoguet"), false);
  } finally {
    mock.restore();
  }
  mock = installFetchMock({ anthropic: () => anthropicText(`${HOGUET} ${JURIS} Bref.\n\n${CLEAN}`) });
  try {
    const out = await enforceNoAddedLegalRules(text, BRIEF_APPORTEURS);
    assertEquals(out.applied, false);
    assertEquals(out.content, text);
  } finally {
    mock.restore();
  }
});

Deno.test("règle juridique : la correction qui dégrade un autre compteur est rejetée", async () => {
  const text = `${HOGUET}\n\n${CLEAN}`;
  const analyze = (t: string) => analyzeTextRedac(t, numbersIn(BRIEF_APPORTEURS), undefined, undefined, undefined, BRIEF_APPORTEURS);
  const mock = installFetchMock({ anthropic: () => anthropicText(`Dans 73 % des cas, un accord écrit évite les litiges.\n\n${CLEAN}`) });
  try {
    const out = await enforceNoAddedLegalRules(text, BRIEF_APPORTEURS, {
      analyze, otherCount: (a) => a.fabricatedNumbers.length,
    });
    assertEquals(out.applied, false);
  } finally {
    mock.restore();
  }
});

Deno.test("gate texte : la règle juridique ajoutée est retirée par la passe dédiée", async () => {
  const text = `${HOGUET}\n\n${CLEAN}`;
  let call = 0;
  const mock = installFetchMock({
    anthropic: () => {
      call++;
      // 1re réponse : relecture générale qui laisse la loi ; 2e : passe juridique.
      return anthropicText(call === 1 ? text : `Mettons-nous d'accord par écrit avant toute mise en relation.\n\n${CLEAN}`);
    },
  });
  try {
    const gate = await runTextRedacGate(text, {
      format: "linkedin", correction: { model: "claude-haiku-4-5" }, testimonySource: BRIEF_APPORTEURS, maxPasses: 1,
    });
    assertEquals(gate.content.includes("Hoguet"), false);
  } finally {
    mock.restore();
  }
});

Deno.test("règle juridique : le prompt de retrait n'invente ni règle ni source", () => {
  assertEquals(LEGAL_RULE_REMOVAL_PROMPT.includes("N'ajoute aucune autre règle, aucune date, aucun chiffre, aucune source."), true);
  assertEquals(LEGAL_RULE_REMOVAL_PROMPT.includes("conserve TOUS les marqueurs"), true);
});

// ── Règle 2 : une source pour toute date reprise de la recherche ──

const RESEARCH_JURIS = "La Cour de cassation juge depuis 2012 que l'apporteur sans mandat n'a droit à rien (Cass. civ. 1re, 2012). Le marché des biens hors marché représente 30 % des ventes (Notaires de France, 2025).";

Deno.test("dates : une année que seule la recherche fournit doit porter sa source", () => {
  const research = researchNumbers(numbersIn(BRIEF_APPORTEURS), RESEARCH_JURIS, BRIEF_APPORTEURS);
  const found = findUnsourcedResearchNumbers(JURIS, research);
  assertEquals(found.length, 1);
  assertEquals(found[0].startsWith("2012"), true);
});

Deno.test("dates : l'année sourcée dans la phrase passe", () => {
  const research = researchNumbers(numbersIn(BRIEF_APPORTEURS), RESEARCH_JURIS, BRIEF_APPORTEURS);
  for (const s of [
    "Les biens hors marché pèsent 30 % des ventes (Notaires de France, 2025).",
    "Selon les Notaires de France, en 2025, 30 % des ventes se font hors marché.",
    "L'étude Ifop de 2025 le confirme.",
  ]) assertEquals(findUnsourcedResearchNumbers(s, researchNumbers(numbersIn(BRIEF_APPORTEURS), RESEARCH_JURIS + " Ifop 2025.", BRIEF_APPORTEURS)), [], s);
  assertEquals(findUnsourcedResearchNumbers("Je cherche depuis 2012.", undefined), []);
  void research;
});

Deno.test("dates : les années de l'utilisatrice restent libres (« depuis 2015 »)", () => {
  const brief = "je suis marchande de biens depuis 2015, post sur mes apporteurs";
  const research = researchNumbers(numbersIn(brief), "Le statut existe depuis 2015 selon la loi (Légifrance, 2015). Il a changé en 2019.", brief);
  assertEquals(findUnsourcedResearchNumbers("Je fais ce métier depuis 2015.", research), []);
  assertEquals(findUnsourcedResearchNumbers("Tout a changé en 2019.", research).length, 1);
});

Deno.test("dates : l'année d'une source ne compte pas dans le plafond « ton cas d'abord »", () => {
  const research = researchNumbers(numbersIn(BRIEF_APPORTEURS), RESEARCH_JURIS, BRIEF_APPORTEURS);
  const used = findResearchNumbersUsed(["Les biens hors marché pèsent 30 % des ventes (Notaires de France, 2025)."], research);
  assertEquals(used.length, 1);
  assertEquals(used[0].startsWith("30"), true);
});

// ── Règle 1 : pas de fait du web dans une annonce de vente ──

Deno.test("annonce de vente : reconnue quel que soit le métier", () => {
  for (const s of [
    "annonce : T3 a vendre Lyon 7e, 68 m², 289 000 € FAI, contact en MP",
    "Mise en vente de mon appartement rue Garibaldi",
    "Je vends mon vélo cargo, très bon état",
    "Ma nouvelle collection de bougies est en vente dès vendredi",
    "Annonce de vente : canapé 3 places",
    "Maison à vendre à Nantes",
    "Nouveau bien en vente : un T2 lumineux",
    "Mes céramiques sont disponibles à la vente sur ma boutique",
  ]) assertEquals(isSaleListing(s), true, s);
});

Deno.test("annonce de vente : pas sur les autres sujets", () => {
  for (const s of [
    "J'annonce mon nouvel atelier d'écriture",
    "Bilan de mon opération rue des Tanneurs, vendue 312 000 €",
    "Pourquoi je ne fais pas de soldes",
    "Comment j'ai appris à vendre sans forcer",
    "La vente à domicile, mon avis",
    "Point chantier de la semaine à Villeurbanne",
    "Je cherche des apporteurs d'affaires",
    "",
  ]) assertEquals(isSaleListing(s), false, s);
});
