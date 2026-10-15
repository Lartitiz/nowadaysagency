// Snapshots des prompts, de l'outil, du repli et de la lecture des réponses de
// deep-diagnostic (fiche 12, lot T, 15/10/2026). Ce que Claude reçoit (prompt
// système, outil `rendre_diagnostic`, prompt utilisateur selon le profil) et
// le diagnostic de repli servi quand Claude échoue, figés AVANT le découpage
// d'index.ts : un lot qui déplace du code à l'identique ne change aucun .snap.
//
// Avant le lot 2, les prompts passent par le vrai handler (handleDeepDiagnostic).
// Depuis le lot 1, outil, lecture et repli sont importés de leurs fichiers.
//
// Lancer : deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/deep-diagnostic/prompts_snapshot_test.ts
// Régénérer (seulement si le changement est voulu) : ajouter --allow-write et `-- --update`, puis relire le diff du .snap.
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertSnapshot } from "../../edge-tests/snapshot.ts";
import { setTestEnv } from "../_shared/test-edge-harness.ts";
import { handleDeepDiagnostic as handler } from "./index.ts";
import { installerFauxFetch, requeteDiagnostic } from "./contract_harness.ts";
import { DIAGNOSTIC_TOOL } from "./tool.ts";
import { isDegenerateDiagnostic, robustJsonParse, stripMarkupFromSummary } from "./parse.ts";
import { buildFallbackDiagnostic } from "./fallback.ts";
import { buildDiagnosticUserPrompt, DIAGNOSTIC_SYSTEM_PROMPT } from "./prompts.ts";

setTestEnv();

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const DIAGNOSTIC = {
  summary: "Résumé.",
  strengths: [{ title: "Force", detail: "Détail.", source: "profile" }],
  weaknesses: [{ title: "Faiblesse", detail: "Détail.", source: "profile" }],
  scores: { total: 50, branding: 50, instagram: null, website: null, linkedin: null },
  priorities: [],
};

let n = 0;
/** Une requête au vrai handler (onboarding, sans crédit) ; renvoie la 1re requête envoyée à Claude. */
async function premiereRequeteClaude(corps: Row): Promise<Row> {
  const userId = `u-prompt-${++n}`;
  const faux = installerFauxFetch({
    userId,
    claude: [DIAGNOSTIC],
    tables: { workspace_members: [{ workspace_id: "espace", user_id: userId, role: "owner" }] },
  });
  try {
    const res: Response = await handler(requeteDiagnostic({ isOnboarding: true, ...corps }));
    await res.text();
    return faux.claude[0];
  } finally {
    faux.restore();
  }
}
const texteUtilisateur = (r: Row) => r.messages[0].content[0].text as string;

// ── 1. Prompt système et outil ──────────────────────────────────────────────

Deno.test("prompt système, outil rendre_diagnostic et réglages de l'appel", async (t) => {
  const r = await premiereRequeteClaude({ profile: { activity: "céramiste" } });
  const { messages: _m, ...reglages } = r;
  await assertSnapshot(t, reglages);
  assertEquals(r.tools[0], JSON.parse(JSON.stringify(DIAGNOSTIC_TOOL)), "l'outil envoyé est DIAGNOSTIC_TOOL tel quel");
});

// ── 2. Prompt utilisateur selon le profil ───────────────────────────────────

Deno.test("prompt utilisateur : profil complet avec libellés et réponses libres complètes", async (t) => {
  const r = await premiereRequeteClaude({
    profile: {
      activity: "céramiste", activityType: "artisane", activityTypeLabel: "Artisan·e / créatrice",
      objective: "vendre en ligne", blocker: "invisible", blockerLabel: "Je me sens invisible", weeklyTime: "2h",
      channels: ["instagram", "site"],
    },
    freeformAnswers: {
      change_priority: "être visible", product_or_service: "bols et tasses", activity_detail: "atelier à Lyon",
      uniqueness: "pièces uniques", positioning: "céramique utilitaire", mission: "ralentir", target_description: "familles",
      desired_channels: ["newsletter", "pinterest"],
    },
  });
  await assertSnapshot(t, texteUtilisateur(r));
});

Deno.test("prompt utilisateur : profil avec clés seules (sans *Label), canaux en texte, sans réponses libres", async (t) => {
  const r = await premiereRequeteClaude({
    profile: { activity: "coach", activityType: "coach", blocker: "temps", canaux: "ignoré" },
    freeformAnswers: { canaux: "linkedin, instagram" },
  });
  await assertSnapshot(t, texteUtilisateur(r));
});

Deno.test("prompt utilisateur : ni profil ni réponses libres", async (t) => {
  await assertSnapshot(t, texteUtilisateur(await premiereRequeteClaude({})));
});

Deno.test("prompt système envoyé = DIAGNOSTIC_SYSTEM_PROMPT (prompts.ts, lot 2)", async () => {
  const r = await premiereRequeteClaude({ profile: { activity: "céramiste" } });
  const texte = typeof r.system === "string" ? r.system : r.system.map((b: Row) => b.text).join("");
  assertEquals(texte, DIAGNOSTIC_SYSTEM_PROMPT);
});

Deno.test("prompt utilisateur (direct) : 4 sources fixées à la main, dans l'ordre d'insertion", async (t) => {
  await assertSnapshot(t, buildDiagnosticUserPrompt({
    profile: { activity: "céramiste" },
    freeformAnswers: null,
    scrapedContent: {
      website: "Atelier de céramique à Lyon. Réserver un atelier.",
      about: "À propos (texte fourni) : je façonne des bols.",
      instagram_public: "@atelier_test — céramique utilitaire",
      connected_social: "Compte : @atelier_test\nBio : bols et tasses",
    },
    sourcesUsed: ["website", "about", "instagram_public", "instagram_connected"],
    sourcesFailed: [],
    instagramScreenshots: [],
  }));
});

Deno.test("prompt utilisateur (direct) : libellés des sources en échec, alerte « aucune source » selon les captures", async (t) => {
  const base = { profile: null, freeformAnswers: null, scrapedContent: {}, sourcesUsed: [], instagramHandle: "atelier_test", websiteUrl: "monsite.fr" };
  const echecs = buildDiagnosticUserPrompt({ ...base, sourcesFailed: ["website", "linkedin", "instagram_public", "instagram", "social_screenshot"], instagramScreenshots: [] });
  const avecCapture = buildDiagnosticUserPrompt({ ...base, sourcesFailed: [], instagramScreenshots: [{}] });
  assertEquals(avecCapture.includes("Aucune source en ligne"), false, "une capture reçue suffit à retirer l'alerte");
  await assertSnapshot(t, { echecs, avecCapture });
});

// ── 3. Repli quand Claude échoue ────────────────────────────────────────────

Deno.test("repli : une branche par cas", async (t) => {
  const cas: Array<[string, unknown, unknown, string[]]> = [
    ["rien du tout", null, null, []],
    ["activité + unicité, coach connu, sans présence web, invisible", { activity: "coach de vie", activityType: "coach", blocker: "invisible", objective: "signer" }, { uniqueness: "approche douce" }, []],
    ["type inconnu, présence web, autre blocage (filet : au moins une faiblesse)", { activity: "photographe", activityType: "inconnu", blocker: "temps" }, null, ["website"]],
    ["score plafonné et tous les points", { activity: "a", activityType: "artisane", blocker: "invisible", objective: "o" }, { uniqueness: "u" }, ["website", "about"]],
  ];
  for (const [nom, profil, reponses, sources] of cas) {
    await assertSnapshot(t, buildFallbackDiagnostic(profil, reponses, sources), { name: `repli — ${nom}` });
  }
});

// ── 4. Lecture de la réponse ────────────────────────────────────────────────

Deno.test("robustJsonParse : bloc ```json, virgule finale, caractère de contrôle, JSON coupé, texte sans JSON", () => {
  assertEquals(robustJsonParse("```json\n{\"summary\": \"ok\"}\n```"), { summary: "ok" });
  assertEquals(robustJsonParse("{\"a\": [1, 2,], \"b\": 3,}"), { a: [1, 2], b: 3 });
  // Caractère de contrôle dans une chaîne : le parseur partagé (tryParseAiJson) le garde tel quel.
  assertEquals(robustJsonParse("{\"summary\": \"un\u0001deux\"}"), { summary: "un\u0001deux" });
  assertEquals(robustJsonParse("{\"summary\": \"ok\", \"strengths\": [{\"title\": \"A\"}], \"weaknesses\": \"coupé au mil"),
    { summary: "ok", strengths: [{ title: "A" }] });
  assertThrows(() => robustJsonParse("Désolée, je ne peux pas."), Error, "impossible de parser le JSON");
});

Deno.test("isDegenerateDiagnostic : forces ET faiblesses vides (ou absentes) seulement", () => {
  assertEquals(isDegenerateDiagnostic({ strengths: [], weaknesses: [] }), true);
  assertEquals(isDegenerateDiagnostic({ summary: "<summary>…</summary>" }), true);
  assertEquals(isDegenerateDiagnostic({ strengths: [{}], weaknesses: [] }), false);
  assertEquals(isDegenerateDiagnostic({ strengths: [], weaknesses: [{}] }), false);
});

Deno.test("stripMarkupFromSummary : coupe à la première balise, sinon objet inchangé", () => {
  const sain = { summary: "Rien à couper.", x: 1 };
  assertEquals(stripMarkupFromSummary(sain) === sain, true);
  assertEquals(stripMarkupFromSummary({ summary: "Début. <strengths/> suite", x: 1 }), { summary: "Début.", x: 1 });
  assertEquals(stripMarkupFromSummary({ summary: "a < b et c > d" }).summary, "a < b et c > d", "pas une balise");
  assertEquals(stripMarkupFromSummary({ summary: 3 }).summary, 3);
});
