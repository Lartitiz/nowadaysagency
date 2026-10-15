// Contrat du handler de deep-diagnostic (fiche 12, lot T, 15/10/2026).
// Fait tourner le VRAI handler (serve() capté par captureStdServeHandler) sur
// une base en mémoire (contract_harness.ts) et fige, pour chaque cas : statut,
// réponse JSON, chaque appel à Claude, corps envoyé à diagnostic-enrichment,
// lignes insérées par table, crédits et liste des requêtes. C'est le filet du
// découpage d'index.ts : un lot qui déplace du code à l'identique ne doit
// changer AUCUN snapshot.
//
// Lancer : deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/deep-diagnostic/handler_contract_test.ts
// Régénérer (seulement si le changement de sortie est voulu) : ajouter --allow-write et `-- --update`, puis relire le diff du .snap.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertSnapshot } from "../../edge-tests/snapshot.ts";
import { captureStdServeHandler, setTestEnv } from "../_shared/test-edge-harness.ts";
import { installerFauxFetch, requeteDiagnostic, type FauxMonde } from "./contract_harness.ts";

setTestEnv();
const handler = await captureStdServeHandler(new URL("./index.ts", import.meta.url).href);

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

const ESPACE_PROPRE = "espace-propre";
const ESPACE_CLIENTE = "espace-cliente";
const CLIENTE = "cliente-proprietaire";

/** Base de référence pour une utilisatrice : son espace (propriétaire) et l'espace d'une cliente (manager). */
function monde(userId: string, extra: Partial<FauxMonde> & { tables?: Record<string, Row[]> } = {}): FauxMonde {
  const tables: Record<string, Row[]> = {
    workspace_members: [
      { workspace_id: ESPACE_PROPRE, user_id: userId, role: "owner" },
      { workspace_id: ESPACE_CLIENTE, user_id: userId, role: "manager" },
      { workspace_id: ESPACE_CLIENTE, user_id: CLIENTE, role: "owner" },
    ],
    workspaces: [{ id: ESPACE_PROPRE, plan: "free" }, { id: ESPACE_CLIENTE, plan: "free" }],
    ...extra.tables,
  };
  return { userId, ...extra, tables };
}

const PROFIL = {
  activity: "céramiste",
  activityType: "artisane",
  activityTypeLabel: "Artisan·e / créatrice",
  objective: "vendre en ligne",
  blocker: "invisible",
  blockerLabel: "Je me sens invisible",
  weeklyTime: "2h",
  channels: ["instagram"],
};
const REPONSES = { uniqueness: "pièces uniques faites main", change_priority: "être visible" };

// Diagnostic valide (forces et faiblesses non vides).
const DIAGNOSTIC = {
  summary: "Tu crées des « pièces uniques faites main » et tu veux « être visible ».",
  strengths: [{ title: "Pièces uniques", detail: "Tu parles de « pièces uniques faites main ».", source: "profile" }],
  weaknesses: [{ title: "Visibilité", detail: "Tu dis te sentir invisible.", source: "profile", fix_hint: "Publie une pièce par semaine." }],
  scores: { total: 52, branding: 55, instagram: 40, website: 30, linkedin: null },
  priorities: [
    { title: "Écris ta promesse", why: "Tes mots sont déjà là.", first_step: "Écris une phrase.", example: "J'aide [public]…", time: "15 min", route: "/persona", impact: "high", source: "profile" },
    { title: "Montre l'atelier", why: "Le fait-main se raconte.", first_step: "Photographie une pièce.", example: "[pièce] en cours", time: "10 min", route: "/route-inventee", impact: "medium" },
  ],
  branding_prefill: { positioning: "céramique", mission: null, target_description: null, tone_keywords: [], values: [], offers: [] },
};
const VIDE = { ...DIAGNOSTIC, summary: "<strengths></strengths>", strengths: [], weaknesses: [] };

interface Resultat {
  status: number;
  // deno-lint-ignore no-explicit-any
  body: any;
  claude: Row[];
  enrichissement: Row[];
  insertions: Record<string, Row[]>;
  credits: Row[];
  requetes: string[];
}

/** Prompt système et schéma de l'outil : figés en entier une seule fois, dans prompts_snapshot_test.ts. Ici, un repère. */
function compacter(requete: Row): Row {
  const { system, tools, ...reste } = requete;
  return {
    ...reste,
    system: `<prompt système : ${JSON.stringify(system).length} car., voir prompts_snapshot_test.ts>`,
    tools: (tools ?? []).map((o: Row) => `<outil ${o.name} : ${JSON.stringify(o).length} car.>`),
  };
}

async function appeler(m: FauxMonde, corps: unknown, authentifiee = true): Promise<Resultat> {
  const faux = installerFauxFetch(m);
  try {
    const res: Response = await handler(requeteDiagnostic(corps, authentifiee));
    const texte = await res.text();
    // L'appel à diagnostic-enrichment part sans être attendu : on laisse filer
    // les tâches en cours avant de lire ce qui a été capté.
    await new Promise((r) => setTimeout(r, 0));
    return {
      status: res.status,
      body: texte ? JSON.parse(texte) : null,
      claude: faux.claude.map(compacter),
      enrichissement: faux.enrichissement,
      insertions: faux.insertions,
      credits: faux.credits,
      // Les lectures partent en parallèle : on fige la liste TRIÉE.
      requetes: [...faux.requetes].sort(),
    };
  } finally {
    faux.restore();
  }
}

// ── 1. Onboarding ───────────────────────────────────────────────────────────

Deno.test("onboarding, profil seul, sans source : diagnostic, espace propre, aucun crédit", async (t) => {
  const r = await appeler(monde("u-onb-profil", { claude: [DIAGNOSTIC] }), { profile: PROFIL, freeformAnswers: REPONSES, isOnboarding: true });
  assertEquals(r.status, 200);
  assertEquals(r.body.success, true);
  assertEquals(r.claude.length, 1);
  assertEquals(r.credits, []);
  assertEquals(r.body.diagnostic.scores.instagram, null, "aucun canal lu : score Instagram retiré");
  assertEquals(r.body.diagnostic.priorities.map((p: Row) => p.route), ["/branding", "/branding"], "routes normalisées");
  assertEquals(r.insertions.diagnostic_results[0].workspace_id, ESPACE_PROPRE);
  assertEquals(r.enrichissement.length, 1);
  await assertSnapshot(t, r);
});

Deno.test("onboarding avec « À propos » rempli : source about, pas de lecture LinkedIn", async (t) => {
  const r = await appeler(monde("u-onb-about", { claude: [DIAGNOSTIC] }), {
    profile: PROFIL, isOnboarding: true, linkedinUrl: "https://www.linkedin.com/in/test",
    freeformAnswers: { ...REPONSES, linkedin_summary: "Je façonne des bols et des tasses en grès dans mon atelier à Lyon." },
  });
  assertEquals(r.status, 200);
  assertEquals(r.body.sources_used, ["about"]);
  assert(!r.requetes.some((q) => q.includes("linkedin.com")), "« À propos » rempli : LinkedIn n'est pas lu");
  await assertSnapshot(t, r);
});

// ── 2. Hors onboarding : crédits ────────────────────────────────────────────

Deno.test("hors onboarding, succès : un crédit audit / deep_diagnostic", async (t) => {
  const r = await appeler(monde("u-hors-ok", { claude: [DIAGNOSTIC] }), { profile: PROFIL, freeformAnswers: REPONSES });
  assertEquals(r.status, 200);
  assertEquals(r.credits.length, 1);
  assertEquals([r.credits[0].category, r.credits[0].action_type, r.credits[0].workspace_id], ["audit", "deep_diagnostic", ESPACE_PROPRE]);
  await assertSnapshot(t, r);
});

Deno.test("hors onboarding, Claude en échec : repli, zéro crédit", async (t) => {
  const r = await appeler(monde("u-hors-echec", { claude: ["echec"] }), { profile: PROFIL, freeformAnswers: REPONSES });
  assertEquals(r.status, 200);
  assertEquals(r.body.diagnostic._fallback, true);
  assertEquals(r.credits, []);
  await assertSnapshot(t, r);
});

Deno.test("hors onboarding, quota épuisé : 429, ni Claude, ni enrichissement, ni insertion", async (t) => {
  const usage = Array.from({ length: 23 }, () => ({ category: "content", workspace_id: ESPACE_PROPRE }));
  const r = await appeler(monde("u-hors-quota", { claude: [], tables: { ai_usage: usage } }), { profile: PROFIL, freeformAnswers: REPONSES });
  assertEquals(r.status, 429);
  assertEquals(r.claude, []);
  assertEquals(r.enrichissement, []);
  assertEquals(r.insertions, {});
  assertEquals(r.credits, []);
  assertEquals(r.body.quota.reason, "total");
  // Date de renouvellement et mois cité : dépendent du jour, retirés du snapshot.
  const { renews_at: _r, ...quota } = r.body.quota;
  await assertSnapshot(t, { ...r, body: { error: r.body.error.replace(/le \d+ \S+/, "le <date>"), quota: { ...quota, message: quota.message.replace(/le \d+ \S+/, "le <date>") } } });
});

// ── 3. Réponse de Claude ────────────────────────────────────────────────────

Deno.test("réponse vide puis bonne : 2 appels, le 2e avec la consigne corrective", async (t) => {
  const r = await appeler(monde("u-vide-bonne", { claude: [VIDE, DIAGNOSTIC] }), { profile: PROFIL, freeformAnswers: REPONSES, isOnboarding: true });
  assertEquals(r.claude.length, 2);
  const derniers = r.claude[1].messages[0].content;
  assert(String(derniers[derniers.length - 1].text).startsWith("⚠️ ATTENTION : ta précédente réponse était invalide."));
  assertEquals(r.body.diagnostic._fallback, undefined);
  await assertSnapshot(t, { status: r.status, body: r.body, consigne: derniers[derniers.length - 1] });
});

Deno.test("réponse vide deux fois : repli _fallback", async (t) => {
  const r = await appeler(monde("u-vide-vide", { claude: [VIDE, VIDE] }), { profile: PROFIL, freeformAnswers: REPONSES, isOnboarding: true });
  assertEquals(r.claude.length, 2);
  assertEquals(r.body.diagnostic._fallback, true);
  await assertSnapshot(t, { status: r.status, body: r.body, insertions: r.insertions });
});

Deno.test("résumé avec une balise </summary> : coupé avant la balise", async () => {
  const r = await appeler(monde("u-balise", { claude: [{ ...DIAGNOSTIC, summary: "Tu crées des pièces uniques. </summary><strengths>…" }] }),
    { profile: PROFIL, freeformAnswers: REPONSES, isOnboarding: true });
  assertEquals(r.body.diagnostic.summary, "Tu crées des pièces uniques.");
  assertEquals(r.insertions.diagnostic_results[0].summary, "Tu crées des pièces uniques.");
});

// ── 4. Espace de travail ────────────────────────────────────────────────────

Deno.test("espace d'une cliente envoyé EN onboarding : tout part dans l'espace propre", async (t) => {
  const r = await appeler(monde("u-espace-onb", { claude: [DIAGNOSTIC] }), {
    profile: PROFIL, freeformAnswers: REPONSES, isOnboarding: true, workspace_id: ESPACE_CLIENTE,
  });
  assertEquals(r.status, 200);
  assertEquals(r.insertions.diagnostic_results[0].workspace_id, ESPACE_PROPRE);
  assert(r.insertions.audit_recommendations.every((l) => l.workspace_id === ESPACE_PROPRE));
  assertEquals(r.enrichissement[0].workspaceId, ESPACE_PROPRE);
  await assertSnapshot(t, { insertions: r.insertions, enrichissement: r.enrichissement, requetes: r.requetes });
});

Deno.test("espace d'une cliente HORS onboarding : l'espace demandé est respecté (crédit compris)", async (t) => {
  const r = await appeler(monde("u-espace-hors", { claude: [DIAGNOSTIC] }), {
    profile: PROFIL, freeformAnswers: REPONSES, workspace_id: ESPACE_CLIENTE,
  });
  assertEquals(r.status, 200);
  assertEquals(r.insertions.diagnostic_results[0].workspace_id, ESPACE_CLIENTE);
  assertEquals(r.enrichissement[0].workspaceId, ESPACE_CLIENTE);
  assertEquals(r.credits[0].workspace_id, ESPACE_CLIENTE);
  await assertSnapshot(t, { insertions: r.insertions, enrichissement: r.enrichissement, credits: r.credits, requetes: r.requetes });
});

Deno.test("espace dont l'utilisatrice n'est pas membre : 403, rien d'autre", async (t) => {
  const r = await appeler(monde("u-espace-refus", { claude: [] }), { profile: PROFIL, isOnboarding: true, workspace_id: "espace-inconnu" });
  assertEquals(r.status, 403);
  assertEquals([r.claude, r.enrichissement, r.insertions], [[], [], {}]);
  await assertSnapshot(t, { status: r.status, body: r.body, requetes: r.requetes });
});

Deno.test("non authentifiée : 401 de l'AuthError (sans en-tête, puis jeton refusé)", async () => {
  const sansEntete = await appeler(monde("u-anonyme"), { profile: PROFIL }, false);
  assertEquals([sansEntete.status, sansEntete.body], [401, { error: "Non autorisé" }]);
  const refuse = await appeler({ userId: null }, { profile: PROFIL });
  assertEquals([refuse.status, refuse.body], [401, { error: "Non autorisé" }]);
  assertEquals(refuse.claude, []);
});

// ── 5. Sources ──────────────────────────────────────────────────────────────

Deno.test("site en cache avec indices de style : source website, indices transmis à l'enrichissement", async (t) => {
  const site = "monsite.fr";
  const r = await appeler(monde("u-site-cache", {
    claude: [DIAGNOSTIC],
    tables: { scrape_cache: [{ user_id: "u-site-cache", url: site, content: "Atelier de céramique à Lyon. Réserver un atelier.", style_hints: "Couleurs : #FB3D80" }] },
  }), { profile: PROFIL, freeformAnswers: REPONSES, isOnboarding: true, websiteUrl: site, allowOverwrite: true });
  assertEquals(r.body.sources_used, ["website"]);
  assertEquals(r.body.diagnostic.scores.website, 30, "site lu : score gardé");
  assertEquals(r.enrichissement[0].websiteStyleHints, "Couleurs : #FB3D80");
  assertEquals(r.enrichissement[0].allowOverwrite, true);
  assert(!r.requetes.some((q) => q.startsWith("externe")), "cache avec style : aucun appel au site");
  await assertSnapshot(t, { body: r.body, enrichissement: r.enrichissement, requetes: r.requetes, prompt: r.claude[0].messages[0].content[0].text });
});

Deno.test("site en cache SANS indices de style : relecture du site pour les styles (404 → aucun indice)", async (t) => {
  const site = "monsite.fr";
  const r = await appeler(monde("u-site-sans-style", {
    claude: [DIAGNOSTIC],
    tables: { scrape_cache: [{ user_id: "u-site-sans-style", url: site, content: "Atelier de céramique à Lyon.", style_hints: null }] },
  }), { profile: PROFIL, freeformAnswers: REPONSES, isOnboarding: true, websiteUrl: site, allowOverwrite: "oui" });
  assertEquals(r.body.sources_used, ["website"]);
  assertEquals(r.enrichissement[0].websiteStyleHints, "");
  assertEquals(r.enrichissement[0].allowOverwrite, false, "comparaison stricte à true");
  assert(r.requetes.includes("externe GET https://monsite.fr/"));
  await assertSnapshot(t, { enrichissement: r.enrichissement, requetes: r.requetes });
});

Deno.test("capture lisible : instagram_screenshot ajouté à sources_used DANS la réponse (provenance sans copie)", async (t) => {
  const userId = "u-capture";
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const avecCapture = {
    ...DIAGNOSTIC,
    screenshot_readable: true,
    strengths: [{ title: "Bio lisible", detail: "La bio affiche « céramique peinte à la main » et un lien.", source: "instagram_screenshot" }],
  };
  const r = await appeler(monde(userId, {
    claude: [avecCapture],
    tables: { user_documents: [{ id: "doc-1", user_id: userId, file_name: "bio.png", file_url: "bio.png", file_type: "png" }] },
    fichiers: { [`onboarding-uploads/${userId}/bio.png`]: png },
  }), { profile: PROFIL, freeformAnswers: REPONSES, isOnboarding: true, documentIds: ["doc-1"] });
  assertEquals(r.status, 200);
  assertEquals(r.body.sources_used, ["instagram_screenshot"]);
  assertEquals(r.insertions.diagnostic_results[0].sources_used, ["instagram_screenshot"]);
  assertEquals(r.claude[0].temperature, 0.6, "avec capture : température 0,6");
  await assertSnapshot(t, { body: r.body, messages: r.claude[0].messages, requetes: r.requetes });
});

Deno.test("sources en échec (site, Instagram public, LinkedIn, capture) : listées et signalées au prompt", async (t) => {
  const r = await appeler(monde("u-echecs", { claude: [DIAGNOSTIC] }), {
    profile: PROFIL, freeformAnswers: REPONSES, isOnboarding: true,
    websiteUrl: "monsite.fr", instagramHandle: "atelier_test", linkedinUrl: "https://www.linkedin.com/in/test", documentIds: ["doc-absent"],
  });
  assertEquals(r.status, 200);
  assertEquals(r.body.sources_used, []);
  assertEquals([...r.body.sources_failed].sort(), ["instagram_public", "linkedin", "social_screenshot", "website"]);
  await assertSnapshot(t, { sources_failed: r.body.sources_failed, prompt: r.claude[0].messages[0].content[0].text, requetes: r.requetes });
});
