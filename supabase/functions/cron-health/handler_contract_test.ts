// Contrat du handler de cron-health (fiche 18, lot T, 15/10/2026).
// Fait tourner le VRAI handler (handleCronHealthRequest d'index.ts) sur une base
// en mémoire (contract_donnees.ts) et fige le JSON entier des deux scopes, ainsi
// que la liste des requêtes envoyées. C'est le filet du découpage d'index.ts :
// un lot qui déplace du code à l'identique ne doit changer AUCUN snapshot.
//
// Lancer : deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/cron-health/handler_contract_test.ts
// Régénérer (seulement si le changement de sortie est voulu) : ajouter `-- --update`.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertSnapshot } from "../../edge-tests/snapshot.ts";
import { handleCronHealthRequest as handler } from "./index.ts";
import { figerHeure, installerFauxFetch, poserEnv, requeteCron, type FauxMonde } from "./contract_harness.ts";
import { ilYa, MAINTENANT, mondeComplet } from "./contract_donnees.ts";

interface Resultat {
  status: number;
  // deno-lint-ignore no-explicit-any
  body: any;
  requetes: string[];
}

async function appeler(
  monde: FauxMonde,
  corps: unknown,
  opts: { env?: Parameters<typeof poserEnv>[0]; secret?: string | null; methode?: string } = {},
): Promise<Resultat> {
  const remettreEnv = poserEnv(opts.env);
  const remettreHeure = figerHeure(MAINTENANT);
  const faux = installerFauxFetch(monde);
  try {
    const req = opts.methode
      ? new Request("http://localhost/cron-health", { method: opts.methode })
      : requeteCron(corps, opts.secret === undefined ? undefined : opts.secret);
    const res: Response = await handler(req);
    const texte = await res.text();
    return { status: res.status, body: texte ? JSON.parse(texte) : null, requetes: faux.requetes };
  } finally {
    faux.restore();
    remettreHeure();
    remettreEnv();
  }
}

// Les lectures partent en parallèle (Promise.all) : l'ordre d'arrivée n'est pas
// garanti, on fige donc la liste TRIÉE.
const triees = (r: string[]) => [...r].sort();

// ── 1. Scope daily ─────────────────────────────────────────────────────────

Deno.test("daily : JSON complet sur la base de référence", async (t) => {
  const r = await appeler(mondeComplet(), { scope: "daily" });
  assertEquals(r.status, 200);
  assertEquals(r.body.scope, "daily");
  // Quelques repères lisibles, en plus du snapshot :
  assertEquals(r.body.failed_48h.count, 2, "échec récent cliente + échec de l'admin (gardée en daily), pas le compte de test");
  assertEquals(r.body.stuck_publishing, 1);
  assertEquals(r.body.overdue_scheduled, 1);
  assertEquals(r.body.published_24h, 1);
  assertEquals(r.body.feedback_24h.items[0].severite, "blocking");
  assertEquals(r.body.facturation.payantes_sans_acces.count, 1, "l'abonnement Binôme sans metadata.user_id n'est pas compté");
  assertEquals(r.body.studio_images_bloquees, { count: 1 });
  await assertSnapshot(t, r.body);
});

Deno.test("daily : liste des requêtes (tables, colonnes, filtres)", async (t) => {
  const r = await appeler(mondeComplet(), { scope: "daily" });
  await assertSnapshot(t, triees(r.requetes));
});

// ── 2. Daily en mode dégradé : toujours 200, l'erreur reste dans son bloc ───

Deno.test("daily dégradé : sans clés Photoroom/Stripe, RPC des crons en erreur, plafond Higgsfield absent", async (t) => {
  const monde = mondeComplet();
  monde.cronJobs = { status: 500, body: { message: "function cron_jobs_health() does not exist", code: "42883" } };
  const r = await appeler(monde, { scope: "daily" }, {
    env: { PHOTOROOM_API_KEY: null, STRIPE_SECRET_KEY: null, HIGGSFIELD_IMAGE_MONTHLY_LIMIT_USD: null },
  });
  assertEquals(r.status, 200);
  assertEquals(r.body.photoroom_credits, { erreur: "PHOTOROOM_API_KEY absent" });
  assertEquals(typeof r.body.facturation.erreur_stripe, "string");
  assertEquals(r.requetes.filter((q) => q.startsWith("stripe") || q.startsWith("photoroom")), []);
  await assertSnapshot(t, r.body);
});

Deno.test("daily dégradé : Stripe et Photoroom en erreur HTTP", async (t) => {
  const monde = mondeComplet();
  monde.stripeEvents = { status: 500, body: { error: { message: "panne Stripe" } } };
  monde.stripeSubscriptions = { status: 401, body: { error: { message: "clé invalide" } } };
  monde.photoroom = { status: 402, body: { detail: "plus de crédits" } };
  const r = await appeler(monde, { scope: "daily" });
  assertEquals(r.status, 200);
  assertEquals(typeof r.body.facturation.livraisons_en_echec.erreur, "string");
  assertEquals(typeof r.body.facturation.payantes_sans_acces.erreur, "string");
  await assertSnapshot(t, { photoroom_credits: r.body.photoroom_credits, facturation: r.body.facturation });
});

Deno.test("daily dégradé : tables en erreur (studio, e-mails, abonnements)", async (t) => {
  const monde = mondeComplet();
  const panne = { status: 500, body: { message: "relation en panne", code: "XX000" } };
  monde.tables.visual_studio_versions = panne;
  monde.tables.email_sends = panne;
  monde.tables.subscriptions = panne;
  monde.tables.webhook_events = panne;
  monde.tables.higgsfield_image_spend = panne;
  const r = await appeler(monde, { scope: "daily" });
  assertEquals(r.status, 200);
  await assertSnapshot(t, {
    studio_images_bloquees: r.body.studio_images_bloquees,
    emails_24h: r.body.emails_24h,
    facturation: r.body.facturation,
    higgsfield: r.body.higgsfield,
  });
});

// ── 3. Scope weekly ────────────────────────────────────────────────────────

Deno.test("weekly : JSON complet sur la base de référence", async (t) => {
  const r = await appeler(mondeComplet(), { scope: "weekly" });
  assertEquals(r.status, 200);
  assertEquals(r.body.scope, "weekly");
  const nonTarifes = r.body.ia_7j.modeles_non_tarifes.map((m: { modele: string }) => m.modele);
  assertEquals(nonTarifes.includes("modele-mystere"), true, "un modèle inconnu doit crier");
  assertEquals(nonTarifes.includes("relecteur-inconnu (relecture)"), true);
  assertEquals(nonTarifes.includes("composition-code"), false, "composition-code est tarifé à 0, pas inconnu");
  assertEquals(r.body.ia_7j.cout_incomplet, true);
  assertEquals(r.body.qualite.score_gate.source, "events");
  assertEquals(r.body.espaces_owner_multiples.comptes, 2, "deux comptes à 2 espaces owner, admin compris");
  await assertSnapshot(t, r.body);
});

Deno.test("weekly : liste des requêtes (tables, colonnes, filtres)", async (t) => {
  const r = await appeler(mondeComplet(), { scope: "weekly" });
  await assertSnapshot(t, triees(r.requetes));
});

// ── 4. Les trois chemins de la qualité ─────────────────────────────────────

Deno.test("weekly qualité : colonne content_preview absente → relecture sans elle", async (t) => {
  const monde = mondeComplet();
  const complet = monde.tables.content_quality_events as Record<string, unknown>[];
  monde.tables.content_quality_events = (select: string) =>
    select.includes("content_preview")
      ? { status: 400, body: { code: "42703", message: "column content_quality_events.content_preview does not exist" } }
      : complet.map(({ content_preview: _c, ...reste }) => reste);
  const r = await appeler(monde, { scope: "weekly" });
  assertEquals(r.status, 200);
  assertEquals(r.requetes.filter((q) => q.includes("content_quality_events")).length, 2);
  assertEquals(r.body.qualite.score_gate.source, "events");
  await assertSnapshot(t, { ia_7j: r.body.ia_7j, comptes_internes_7j: r.body.comptes_internes_7j, qualite: r.body.qualite });
});

Deno.test("weekly qualité : table content_quality_events absente → repli sur les brouillons", async (t) => {
  const monde = mondeComplet();
  monde.tables.content_quality_events = {
    status: 404,
    body: { code: "PGRST205", message: "Could not find the table 'public.content_quality_events' in the schema cache" },
  };
  const r = await appeler(monde, { scope: "weekly" });
  assertEquals(r.status, 200);
  assertEquals(r.body.qualite.score_gate.source, "brouillons");
  assertEquals(r.body.qualite.garde_anti_redite, null);
  assertEquals(r.body.qualite.fil_carrousels, null);
  assertEquals(r.body.qualite.durees_carrousels, null);
  assertEquals(r.body.qualite.plan_carrousels, null);
  await assertSnapshot(t, { ia_7j: r.body.ia_7j, qualite: r.body.qualite });
});

Deno.test("weekly qualité : table complète sans aucun événement", async (t) => {
  const monde = mondeComplet();
  monde.tables.content_quality_events = [];
  const r = await appeler(monde, { scope: "weekly" });
  assertEquals(r.status, 200);
  assertEquals(r.body.qualite.score_gate.source, "brouillons", "0 événement : on retombe sur les brouillons");
  await assertSnapshot(t, { qualite: r.body.qualite });
});

// ── 5. Pagination (plafond silencieux de 1000 lignes de PostgREST) ─────────

Deno.test("pagination : ai_usage à 2 345 lignes et profiles à 1 001 lignes, totaux exacts", async () => {
  const monde = mondeComplet();
  const profils = [...(monde.tables.profiles as Record<string, unknown>[])];
  for (let i = 0; profils.length < 1001; i++) {
    profils.push({ user_id: `u-masse-${i}`, email: `masse${i}@client.fr`, created_at: ilYa(60 * 24 * 3600000) });
  }
  monde.tables.profiles = profils;
  const ia = [];
  for (let i = 0; i < 2345; i++) {
    ia.push({ user_id: `u-masse-${i % 900}`, created_at: ilYa(3600000 + i * 1000), action_type: "generate_post", model_used: "claude-haiku-4-5", tokens_used: 10 });
  }
  monde.tables.ai_usage = ia;
  const r = await appeler(monde, { scope: "weekly" });
  assertEquals(r.status, 200);
  assertEquals(r.body.ia_7j.appels, 2345);
  assertEquals(r.body.ia_7j.tokens, 23450);
  assertEquals(r.body.ia_7j.utilisatrices, 900);
  const pages = (table: string) =>
    r.requetes.filter((q) => q.startsWith(`GET ${table} `)).map((q) => q.match(/\[(\d+)\+/)?.[1]);
  assertEquals(pages("ai_usage"), ["0", "1000", "2000"]);
  assertEquals(pages("profiles"), ["0", "1000"]);
});

// ── 6. Entrée ──────────────────────────────────────────────────────────────

Deno.test("entrée : OPTIONS répond le CORS sans rien lire", async () => {
  const r = await appeler(mondeComplet(), null, { methode: "OPTIONS" });
  assertEquals(r.status, 200);
  assertEquals(r.requetes, []);
});

Deno.test("entrée : secret absent ou faux → 401 sans rien lire", async () => {
  const sans = await appeler(mondeComplet(), { scope: "daily" }, { secret: null });
  assertEquals(sans.status, 401);
  assertEquals(sans.body, { error: "Unauthorized" });
  assertEquals(sans.requetes, []);
  const faux = await appeler(mondeComplet(), { scope: "weekly" }, { secret: "pas-le-bon" });
  assertEquals(faux.status, 401);
  assertEquals(faux.requetes, []);
  const sansSecretServeur = await appeler(mondeComplet(), { scope: "daily" }, { env: { CRON_STATS_SECRET: null } });
  assertEquals(sansSecretServeur.status, 401);
});

Deno.test("entrée : corps illisible ou scope inconnu → scope daily", async () => {
  const illisible = await appeler(mondeComplet(), "pas du json");
  assertEquals(illisible.status, 200);
  assertEquals(illisible.body.scope, "daily");
  const inconnu = await appeler(mondeComplet(), { scope: "mensuel" });
  assertEquals(inconnu.body.scope, "daily");
});

Deno.test("entrée : profiles en erreur → 500 { error }", async () => {
  const monde = mondeComplet();
  monde.tables.profiles = { status: 500, body: { message: "profiles en panne", code: "XX000" } };
  const r = await appeler(monde, { scope: "weekly" });
  assertEquals(r.status, 500);
  assertEquals(r.body, { error: "profiles en panne" });
});
