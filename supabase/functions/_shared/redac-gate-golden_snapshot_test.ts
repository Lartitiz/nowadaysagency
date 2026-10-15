// Golden de bout en bout de _shared/redac-gate.ts, AVANT son découpage
// (docs/robustesse/gros-fichiers.md, fiche 7, lot 0, test 6) :
// runTextRedacGate et runRedacGate sur deux contenus de référence, avec un
// correcteur simulé déterministe. On fige le contenu final, le
// quality_check, les mesures avant / après et le nombre d'appels.
//
// Un test rouge ici n'est PAS forcément un bug : si le changement est VOULU,
// régénère et relis le diff du .snap :
//   deno test --no-check --allow-env --allow-read --allow-write --node-modules-dir=none supabase/functions/_shared/redac-gate-golden_snapshot_test.ts -- --update
//
// Lancer : deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/_shared/redac-gate-golden_snapshot_test.ts

import { assertSnapshot } from "../../edge-tests/snapshot.ts";
import { anthropicTextSuccess, installFetchMock, setTestEnv } from "./test-edge-harness.ts";
import { numbersIn, runRedacGate, runTextRedacGate } from "./redac-gate.ts";

setTestEnv();

async function withReplies<T>(replies: string[], run: () => Promise<T>): Promise<{ result: T; calls: number }> {
  let i = 0;
  const mock = installFetchMock({ anthropic: () => anthropicTextSuccess(replies[Math.min(i++, replies.length - 1)]) });
  try {
    return { result: await run(), calls: mock.anthropicRequests.length };
  } finally {
    mock.restore();
  }
}

// ── Texte : post LinkedIn ────────────────────────────────────────────────
const BRIEF = "Brief : pourquoi j'ai arrêté les remises. Réponses : depuis un an, mes clientes réservent quand même.";
const BRAND = "Je me bats pour que chaque artisane vive dignement de son savoir-faire";
const POST = `J'ai arrêté les remises il y a un an.

Ce n'est pas un choix esthétique. C'est une stratégie de survie.

Une cliente me disait récemment que mes prix l'avaient surprise. 70 % des artisanes baissent leurs prix au premier doute.

Je me bats pour que chaque artisane vive dignement de son savoir-faire, et ça commence par un prix tenu.`;
const POST_CORRIGE = `J'ai arrêté les remises il y a un an.

Tenir mes prix est devenu une condition pour continuer mon métier.

Beaucoup d'artisanes baissent leurs prix au premier doute, et je l'ai longtemps fait aussi.

Je veux que chaque artisane puisse vivre de ce qu'elle sait faire, et ça commence par un prix tenu.`;

Deno.test("golden runTextRedacGate : post LinkedIn corrigé en une passe", async (t) => {
  const { result, calls } = await withReplies([POST_CORRIGE], () =>
    runTextRedacGate(POST, {
      format: "linkedin",
      correction: { model: "claude-haiku-4-5", logger: () => {} },
      allowedNumbers: numbersIn(BRIEF),
      brandGuardText: BRAND,
      echo: { previousHooks: ["J'ai arrêté les remises il y a un an"], subject: "les remises" },
      testimonySource: BRIEF,
    }));
  await assertSnapshot(t, { calls, ...result });
});

Deno.test("golden runTextRedacGate : correction qui dérive = meilleure version gardée", async (t) => {
  const DERIVE = `${POST}\n\nCe n'est pas une mode. C'est un choix. Ce n'est pas facile. C'est nécessaire.`;
  const { result, calls } = await withReplies([DERIVE], () =>
    runTextRedacGate(POST, {
      format: "linkedin",
      correction: { model: "claude-haiku-4-5", logger: () => {} },
      allowedNumbers: numbersIn(BRIEF),
      testimonySource: BRIEF,
    }));
  await assertSnapshot(t, { calls, content: result.content, repassed: result.repassed, reverted: result.reverted, score: result.score, violations: result.violations });
});

// ── Carrousel ────────────────────────────────────────────────────────────
const INPUT = "Brief : mes prix de céramiste. Un bol coûte 35 euros. Réponses : plus aucune remise.";
const CAROUSEL = {
  slides: [
    { slide_number: 1, title: "Mes prix", body: "Un bol coûte 35 euros, et je ne fais plus de remise depuis que j'ai compris ce que vaut mon travail." },
    { slide_number: 2, title: "Pourquoi", body: "Ce n'est pas un caprice. C'est le cœur du métier, celui que je défends chaque jour à l'atelier." },
    { slide_number: 3, title: "Le constat", body: "70 % des clientes ne savent pas combien de temps demande un bol tourné à la main." },
    { slide_number: 4, title: "À toi", body: "Dis-moi en commentaire ce que tu en penses." },
  ],
  caption: { hook: "Mes prix", body: "Un bol, un prix juste.", cta: "Dis-moi en commentaire ce que tu en penses.", hashtags: ["#ceramique", "#atelier", "#fait-main", "#prix"] },
  quality_check: { score: 100 },
};
const CORRECTED_BLOCK = `[SLIDE 2 - BODY] Je tiens ce prix parce qu'il fait vivre le métier que je défends chaque jour à l'atelier.
[SLIDE 3 - BODY] Peu de clientes savent combien de temps demande un bol tourné à la main.
[CAPTION - CTA] Et toi, comment présentes-tu tes prix ?`;

Deno.test("golden runRedacGate : carrousel corrigé, quality_check calculé par le code", async (t) => {
  const { result, calls } = await withReplies([CORRECTED_BLOCK], () =>
    runRedacGate(JSON.stringify(CAROUSEL), {
      isLinkedIn: false,
      inputText: INPUT,
      correction: { enabled: true, skipIfShorterThan: 0, logger: () => {} },
    }));
  await assertSnapshot(t, {
    calls,
    repassed: result.repassed,
    score: result.score,
    violations: result.violations,
    before: result.before,
    after: result.after,
    content: JSON.parse(result.content),
  });
});

Deno.test("golden runRedacGate : LinkedIn, correction refusée (chiffre inventé ajouté)", async (t) => {
  const WORSE = `[SLIDE 2 - BODY] Je tiens ce prix : 9 clientes sur 10 l'acceptent sans discuter, à l'atelier comme en ligne.`;
  const { result, calls } = await withReplies([WORSE], () =>
    runRedacGate(JSON.stringify(CAROUSEL), {
      isLinkedIn: true,
      inputText: INPUT,
      correction: { enabled: true, skipIfShorterThan: 0, logger: () => {} },
    }));
  await assertSnapshot(t, { calls, repassed: result.repassed, score: result.score, violations: result.violations, content: JSON.parse(result.content) });
});
