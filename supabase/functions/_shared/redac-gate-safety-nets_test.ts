// Filets de _shared/redac-gate.ts sans test direct, posés AVANT son découpage
// (docs/robustesse/gros-fichiers.md, fiche 7, lot 0, tests 3 à 5) :
//   3. les retraits EN CODE de runRedacGate (schéma, big_number, points, CTA dupliqué) ;
//   4. la garde d'enforceResearchNumberSources (source inventée refusée) ;
//   5. protectOrderPrefixes champ par champ.
//
// Lancer : deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/_shared/redac-gate-safety-nets_test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { anthropicTextSuccess, installFetchMock, setTestEnv } from "./test-edge-harness.ts";
import { analyzeTextRedac, enforceResearchNumberSources, numbersIn, protectOrderPrefixes, researchNumbers, runRedacGate } from "./redac-gate.ts";

setTestEnv();

// ── 3. Filets en code de runRedacGate ─────────────────────────────────────
// Correction désactivée : aucun appel IA, seuls les retraits en code agissent.
const INPUT = "Brief : un atelier de céramique, des bols tournés à la main. Prix : 35 euros.";
const gateOpts = { isLinkedIn: false, inputText: INPUT, correction: { enabled: false } };

Deno.test("runRedacGate : un visual_schema qui porte un chiffre inventé est retiré", async () => {
  const doc = { slides: [
    { slide_number: 1, title: "Le bol", body: "Un bol à 35 euros.", visual_schema: { type: "stats", items: [{ value: "85 %", label: "de clientes ravies" }] } },
    { slide_number: 2, title: "Le prix", body: "Toujours 35 euros.", visual_schema: { type: "stats", items: [{ value: "35 €", label: "le bol" }] } },
  ], caption: { hook: "", body: "", cta: "", hashtags: [] } };
  const out = JSON.parse((await runRedacGate(JSON.stringify(doc), gateOpts)).content);
  assertEquals(out.slides[0].visual_schema, null);
  assertEquals(out.slides[1].visual_schema, { type: "stats", items: [{ value: "35 €", label: "le bol" }] });
});

Deno.test("runRedacGate : big_number inventé retiré, gabarit « chiffre » retiré avec lui", async () => {
  const doc = { slides: [
    { slide_number: 1, title: "Le chiffre", body: "Un vrai savoir-faire.", big_number: "73 %", template: "chiffre" },
    { slide_number: 2, title: "Le prix", body: "Le bol.", big_number: "35 €", template: "chiffre" },
  ], caption: { hook: "", body: "", cta: "", hashtags: [] } };
  const out = JSON.parse((await runRedacGate(JSON.stringify(doc), gateOpts)).content);
  assertEquals([out.slides[0].big_number, out.slides[0].template], [null, null]);
  assertEquals([out.slides[1].big_number, out.slides[1].template], ["35 €", "chiffre"]);
});

Deno.test("runRedacGate : points porteurs de chiffres inventés retirés ; moins de 2 restants = liste retirée", async () => {
  const doc = { slides: [
    { slide_number: 1, title: "Liste A", body: "Trois points.", points: ["12 clientes par mois", "un tour à pédale", "un four à gaz"], template: "liste" },
    { slide_number: 2, title: "Liste B", body: "Trois points.", points: ["8 heures de tournage", "48 heures de séchage", "un émail maison"], template: "liste" },
  ], caption: { hook: "", body: "", cta: "", hashtags: [] } };
  const out = JSON.parse((await runRedacGate(JSON.stringify(doc), gateOpts)).content);
  assertEquals(out.slides[0].points, ["un tour à pédale", "un four à gaz"]);
  assertEquals(out.slides[0].template, "liste");
  assertEquals([out.slides[1].points, out.slides[1].template], [null, null]);
});

Deno.test("runRedacGate : CTA de légende encore dupliqué après la re-passe = vidé", async () => {
  const cta = "Dis-moi en commentaire ce que tu en penses.";
  const doc = { slides: [
    { slide_number: 1, title: "Mes prix", body: "Un bol à 35 euros." },
    { slide_number: 2, title: "À toi", body: cta },
  ], caption: { hook: "Mes prix", body: "Un bol, un prix juste.", cta, hashtags: ["#ceramique"] } };
  const result = await runRedacGate(JSON.stringify(doc), gateOpts);
  const out = JSON.parse(result.content);
  assertEquals(result.before.ctaDuplicated, true);
  assertEquals(out.caption.cta, "");
  assertEquals(result.after.ctaDuplicated, false);
  assertEquals(out.caption.body, "Un bol, un prix juste.");
});

// ── 4. enforceResearchNumberSources : garde contre les sources inventées ───
const BASE = "Brief : vendre en direct quand on est artisane.";
const RESEARCH = "Selon l'Insee (2023), 42 % des artisans d'art vendent en direct.";
const research = researchNumbers(numbersIn(BASE), RESEARCH, BASE)!;
const allowed = new Set([...numbersIn(BASE), ...numbersIn(RESEARCH)]);
const analyze = (t: string) => analyzeTextRedac(t, allowed, undefined, undefined, research);
const TEXT = "Vendre en direct, c'est possible. 42 % des artisans d'art le font déjà, et leurs clientes reviennent.";

async function sourcing(candidate: string) {
  const mock = installFetchMock({ anthropic: () => anthropicTextSuccess(candidate) });
  try {
    return { result: await enforceResearchNumberSources(TEXT, analyze, research, { logger: () => {} }), calls: mock.anthropicRequests.length };
  } finally {
    mock.restore();
  }
}

Deno.test("enforceResearchNumberSources : le fixture a bien un chiffre de recherche sans source", () => {
  assertEquals(analyze(TEXT).unsourcedResearchNumbers?.length, 1);
});

Deno.test("enforceResearchNumberSources : une source absente de la recherche (nom, année) est refusée", async () => {
  const { result, calls } = await sourcing("Vendre en direct, c'est possible. Selon Bpifrance (2021), 42 % des artisans d'art le font déjà, et leurs clientes reviennent.");
  assertEquals(calls, 1);
  assertEquals(result.applied, false);
  assertEquals(result.content, TEXT);
});

Deno.test("enforceResearchNumberSources : la source de la recherche recopiée est gardée", async () => {
  const sourced = "Vendre en direct, c'est possible. Selon l'Insee (2023), 42 % des artisans d'art le font déjà, et leurs clientes reviennent.";
  const { result } = await sourcing(sourced);
  assertEquals(result.applied, true);
  assertEquals(result.content, sourced);
  assertEquals(result.analysis.unsourcedResearchNumbers?.length ?? 0, 0);
});

// Constat (fiche 7) : inventedSourceTokens prend tout mot à majuscule ajouté
// pour un nom de source. « … possible. Une bonne partie… » est donc refusé à
// cause de « Une » en début de phrase. Le cas ci-dessous garde la phrase en
// minuscules ; la correction du constat est un changement de code, hors de ce lot.
Deno.test("enforceResearchNumberSources : un chiffre passé en formulation qualitative est gardé", async () => {
  const qualitative = "Vendre en direct, c'est possible, et une bonne partie des artisans d'art le font déjà, et leurs clientes reviennent.";
  const { result } = await sourcing(qualitative);
  assertEquals(result.applied, true);
  assertEquals(result.content, qualitative);
});

Deno.test("enforceResearchNumberSources : une correction qui ajoute un autre défaut est refusée", async () => {
  // Aucun mot à majuscule ajouté : seul le retournement ajouté peut la faire refuser.
  const worse = "Vendre en direct, c'est possible, et une bonne partie des artisans d'art le font déjà : ce n'est pas un choix facile, c'est une conviction.";
  assertEquals(analyze(worse).reversals.length, 1);
  const { result } = await sourcing(worse);
  assertEquals(result.applied, false);
  assertEquals(result.content, TEXT);
});

Deno.test("enforceResearchNumberSources : sans chiffre de recherche à sourcer, aucun appel", async () => {
  const mock = installFetchMock({ anthropic: () => anthropicTextSuccess("x") });
  try {
    const r = await enforceResearchNumberSources("Vendre en direct, c'est possible.", analyze, research, {});
    assertEquals([r.applied, mock.anthropicRequests.length], [false, 0]);
    const r2 = await enforceResearchNumberSources(TEXT, analyze, undefined, {});
    assertEquals([r2.applied, mock.anthropicRequests.length], [false, 0]);
  } finally {
    mock.restore();
  }
});

// ── 5. protectOrderPrefixes ────────────────────────────────────────────────
Deno.test("protectOrderPrefixes : « 2. », « 3) » et « Étape 4 » restaurés champ par champ, le reste gardé", () => {
  const original = { slides: [
    { slide_number: 1, title: "Pourquoi j'ai changé", body: "Intro." },
    { slide_number: 2, title: "2. Fixer un prix", body: "Le corps d'origine." },
    { slide_number: 3, hook: "3) Le tenir", body: "Corps." },
    { slide_number: 4, title: "Étape 4 : l'annoncer", body: "Corps." },
    { slide_number: 5, title: "5. Garder le cap", body: "Corps." },
  ] };
  const candidate = structuredClone(original);
  candidate.slides[1].title = "Fixer un prix juste";
  candidate.slides[1].body = "Le corps corrigé.";
  (candidate.slides[2] as any).hook = "Le tenir dans la durée";
  candidate.slides[3].title = "Étape 5 : l'annoncer";
  candidate.slides[4].title = "5. Garder le cap, toujours";
  const restored = protectOrderPrefixes(original, candidate);
  assertEquals(restored.length, 3);
  assertEquals(candidate.slides[1].title, "2. Fixer un prix");
  assertEquals(candidate.slides[1].body, "Le corps corrigé.");
  assertEquals((candidate.slides[2] as any).hook, "3) Le tenir");
  assertEquals(candidate.slides[3].title, "Étape 4 : l'annoncer");
  // Numéro conservé par la correction : le reste de la retouche est gardé.
  assertEquals(candidate.slides[4].title, "5. Garder le cap, toujours");
});

Deno.test("protectOrderPrefixes : ni le corps, ni un visual_schema, ni un titre sans numéro ne sont protégés", () => {
  const original = { slides: [
    { slide_number: 1, title: "Sans numéro", body: "2. Une étape dans le corps.", visual_schema: { title: "1. Étape du schéma" } },
  ] };
  const candidate = structuredClone(original);
  candidate.slides[0].title = "Titre corrigé";
  candidate.slides[0].body = "Une étape dans le corps.";
  candidate.slides[0].visual_schema.title = "Étape du schéma";
  assertEquals(protectOrderPrefixes(original, candidate), []);
  assertEquals(candidate.slides[0].body, "Une étape dans le corps.");
  assertEquals(candidate.slides[0].visual_schema.title, "Étape du schéma");
  assert(candidate.slides[0].title === "Titre corrigé");
});
