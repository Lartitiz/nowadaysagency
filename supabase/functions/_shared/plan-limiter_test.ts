// Tests des gardes de quota / crédits (logique facturation = la plus sensible).
// On injecte un faux client Supabase via le param `sbOverride` de checkQuota/logUsage
// pour tester le comportement réel des fonctions, sans DB ni réseau.
//
// Lancer : deno test supabase/functions/_shared/plan-limiter_test.ts --allow-all

import {
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { checkQuota, logUsage, quotaDeniedResponse } from "./plan-limiter.ts";

// SUPABASE_URL / SERVICE_ROLE_KEY ne sont jamais lus car on injecte toujours sbOverride,
// mais getServiceClient() pourrait s'exécuter si un test oubliait l'override → on évite
// les surprises en posant des valeurs factices.
Deno.env.set("SUPABASE_URL", "http://localhost");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "test");

interface FakeConfig {
  isAdmin?: boolean;
  userPlan?: string;
  workspacePlan?: string;
  coaching?: boolean;
  bonusCredits?: number;
  usage?: { category: string }[];
  usageError?: boolean;
  /** L'utilisateur est-il membre du workspace passé en paramètre ? (resolveBillingWorkspaceId) */
  member?: boolean;
  /** Workspace propre (owner) résolu quand aucun workspace valide n'est fourni. */
  ownWorkspaceId?: string;
}

interface FakeClient {
  from: (table: string) => unknown;
  rpc: (name: string, args?: unknown) => Promise<{ data: unknown; error: null }>;
  _inserted: Record<string, unknown>[];
  _profileUpdates: Record<string, unknown>[];
  _rpcCalls: { name: string; args: unknown }[];
}

/**
 * Faux client Supabase chainable (.select().eq().gte()…), conscient de la table.
 * - .single()/.maybeSingle() → renvoie la ligne configurée pour la table
 * - await builder (thenable) → renvoie la liste configurée (ai_usage)
 * - .insert()/.update().eq() → enregistre l'écriture pour vérification
 */
function fakeClient(cfg: FakeConfig): FakeClient {
  const inserted: Record<string, unknown>[] = [];
  const profileUpdates: Record<string, unknown>[] = [];
  const rpcCalls: { name: string; args: unknown }[] = [];

  function builderFor(table: string) {
    // deno-lint-ignore no-explicit-any
    const b: any = {};
    // Trace des .eq() : permet de distinguer les deux requêtes workspace_members
    // (check d'adhésion filtré par workspace_id vs lookup du workspace propre).
    const eqCols: string[] = [];
    b.select = () => b;
    b.eq = (col: string) => {
      eqCols.push(col);
      return b;
    };
    b.gte = () => b;
    b.order = () => b;
    b.limit = () => b;
    b.single = () => {
      if (table === "subscriptions") {
        return Promise.resolve({ data: cfg.userPlan ? { plan: cfg.userPlan } : null, error: null });
      }
      if (table === "workspaces") {
        return Promise.resolve({ data: cfg.workspacePlan ? { plan: cfg.workspacePlan } : null, error: null });
      }
      if (table === "profiles") {
        return Promise.resolve({ data: { bonus_credits: cfg.bonusCredits ?? 0 }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    };
    b.maybeSingle = () => {
      if (table === "subscriptions" || table === "workspaces") return b.single();
      // getBonusCredits lit profiles via .maybeSingle() depuis le 26/07 (799ffe9d,
      // hygiène .single() → .maybeSingle()) : le fake doit servir la ligne dans
      // les deux variantes, comme un vrai client PostgREST.
      if (table === "profiles") {
        return Promise.resolve({ data: { bonus_credits: cfg.bonusCredits ?? 0 }, error: null });
      }
      if (table === "coaching_programs") {
        return Promise.resolve({ data: cfg.coaching ? { id: "c1" } : null, error: null });
      }
      if (table === "workspace_members") {
        // Check d'adhésion (filtré par workspace_id) vs lookup workspace propre.
        if (eqCols.includes("workspace_id")) {
          return Promise.resolve({ data: cfg.member ? { role: "member" } : null, error: null });
        }
        return Promise.resolve({
          data: cfg.ownWorkspaceId ? { workspace_id: cfg.ownWorkspaceId } : null,
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    };
    b.insert = (row: Record<string, unknown>) => {
      inserted.push({ _table: table, ...row });
      return Promise.resolve({ data: null, error: null });
    };
    b.update = (patch: Record<string, unknown>) => ({
      eq: () => {
        profileUpdates.push({ _table: table, ...patch });
        return Promise.resolve({ data: null, error: null });
      },
    });
    // Awaited list query (ai_usage). thenable.
    b.then = (resolve: (v: unknown) => void) => {
      if (table === "ai_usage") {
        if (cfg.usageError) return resolve({ data: null, error: { message: "db down" } });
        return resolve({ data: cfg.usage ?? [], error: null });
      }
      return resolve({ data: [], error: null });
    };
    return b;
  }

  return {
    from: (t: string) => builderFor(t),
    rpc: (name: string, args?: unknown) => {
      rpcCalls.push({ name, args });
      if (name === "record_ai_usage") {
        const a = args as any;
        inserted.push({ user_id: a.p_user_id, category: a.p_category, workspace_id: a.p_workspace_id,
          action_type: a.p_action, tokens_used: a.p_tokens, model_used: a.p_model });
        if (a.p_charge_bonus && (cfg.usage?.length || 0) >= a.p_base_total && (cfg.bonusCredits || 0) > 0) cfg.bonusCredits!--;
        (cfg.usage ||= []).push({ category: a.p_category });
      }
      return Promise.resolve({ data: name === "has_role" ? !!cfg.isAdmin : null, error: null });
    },
    _inserted: inserted,
    _profileUpdates: profileUpdates,
    _rpcCalls: rpcCalls,
  };
}

// deno-lint-ignore no-explicit-any
const sb = (cfg: FakeConfig) => fakeClient(cfg) as any;

const rows = (n: number, category: string) =>
  Array.from({ length: n }, () => ({ category }));

// ---------- checkQuota ----------

Deno.test("admin: bypass illimité quel que soit l'usage", async () => {
  const r = await checkQuota("u1", "content", undefined, sb({ isAdmin: true, usage: rows(999, "content") }));
  assertEquals(r.allowed, true);
  assertEquals(r.plan, "admin");
});

Deno.test("free: catégorie quality_max (limite 0) → not_available", async () => {
  const r = await checkQuota("u1", "quality_max", undefined, sb({ userPlan: "free" }));
  assertEquals(r.allowed, false);
  assertEquals(r.reason, "not_available");
});

Deno.test("free: usage sous les plafonds → autorisé + remaining correct", async () => {
  const r = await checkQuota("u1", "content", undefined, sb({ userPlan: "free", usage: rows(5, "content") }));
  assertEquals(r.allowed, true);
  // free.total = 23, 5 utilisés, -1 pour la création en cours
  assertEquals(r.remaining_total, 23 - 5 - 1);
});

Deno.test("free: plafond TOTAL atteint → bloqué (reason total)", async () => {
  const r = await checkQuota("u1", "content", undefined, sb({ userPlan: "free", usage: rows(23, "content") }));
  assertEquals(r.allowed, false);
  assertEquals(r.reason, "total");
  assertEquals(r.remaining_total, 0);
});

Deno.test("free: plafond CATÉGORIE atteint avant le total → bloqué (reason category)", async () => {
  // audit limité à 3 ; 3 audits utilisés mais total (3) bien < 23
  const r = await checkQuota("u1", "audit", undefined, sb({ userPlan: "free", usage: rows(3, "audit") }));
  assertEquals(r.allowed, false);
  assertEquals(r.reason, "category");
});

Deno.test("free: les crédits bonus étendent le plafond total", async () => {
  // 23 utilisés (catégorie content) = plafond de base atteint, mais +5 bonus → 28 effectif.
  // On demande une AUTRE catégorie (dm_comment, cap propre non atteint) pour isoler
  // l'effet du bonus sur le total : le cap par catégorie n'est pas étendu par le bonus.
  const r = await checkQuota("u1", "dm_comment", undefined, sb({ userPlan: "free", usage: rows(23, "content"), bonusCredits: 5 }));
  assertEquals(r.allowed, true);
  assertEquals(r.remaining_total, 28 - 23 - 1);
});

Deno.test("free: tant qu'il reste des bonus, le cap catégorie ne bloque pas (content au-delà de 23)", async () => {
  // Renversement assumé du comportement pré-05/07 : content a un cap = total de
  // base (23) → sans ce fix, les bonus ne pouvaient JAMAIS servir à générer du
  // contenu sur plan free (vécu : compte recrédité de 190 bonus, génération
  // refusée pendant que le header affichait « 190 restants »). Les bonus sont un
  // dépassement toutes-catégories, cohérent avec leur consommation dans logUsage.
  const r = await checkQuota("u1", "content", undefined, sb({ userPlan: "free", usage: rows(23, "content"), bonusCredits: 5 }));
  assertEquals(r.allowed, true);
  assertEquals(r.remaining, 0); // cap catégorie dépassé → clamp, pas de négatif
  assertEquals(r.remaining_total, 28 - 23 - 1);
});

Deno.test("free: bonus épuisés (0) → le cap catégorie bloque comme avant", async () => {
  const r = await checkQuota("u1", "content", undefined, sb({ userPlan: "free", usage: rows(23, "content"), bonusCredits: 0 }));
  assertEquals(r.allowed, false);
  // total de base atteint aussi (23 content = 23 total) → c'est le total qui répond
  assertEquals(r.allowed, false);
});

Deno.test("free: quality_max reste indisponible même avec des bonus", async () => {
  const r = await checkQuota("u1", "quality_max", undefined, sb({ userPlan: "free", bonusCredits: 50 }));
  assertEquals(r.allowed, false);
  assertEquals(r.reason, "not_available");
});

// Grille du 01/10/2026 : carrousels, images et vidéos sont des plafonds DURS.
// Avant, un seul crédit bonus suffisait à lever le plafond carrousels/images
// d'une abonnée Premium (le cap catégorie sautait dès que bonus > 0).
for (const [cat, cap] of [["carousel", 20], ["photo_retouch", 30], ["video", 3]] as const) {
  Deno.test(`outil: ${cat} bloque à ${cap} MÊME avec des crédits bonus`, async () => {
    const r = await checkQuota("u1", cat, undefined, sb({ userPlan: "outil", usage: rows(cap, cat), bonusCredits: 50 }));
    assertEquals(r.allowed, false);
    assertEquals(r.reason, "category");
  });
  Deno.test(`outil: ${cat} autorisé sous le plafond (${cap - 1}/${cap})`, async () => {
    const r = await checkQuota("u1", cat, undefined, sb({ userPlan: "outil", usage: rows(cap - 1, cat) }));
    assertEquals(r.allowed, true);
  });
}

Deno.test("outil: garde-fou d'usage raisonnable à 200 générations, levé par les bonus", async () => {
  const blocked = await checkQuota("u1", "content", undefined, sb({ userPlan: "outil", usage: rows(200, "content") }));
  assertEquals(blocked.allowed, false);
  assertEquals(blocked.reason, "total");
  const withBonus = await checkQuota("u1", "content", undefined, sb({ userPlan: "outil", usage: rows(200, "content"), bonusCredits: 10 }));
  assertEquals(withBonus.allowed, true);
});

Deno.test("free: vidéo indisponible, carrousels plafonnés à 3", async () => {
  const video = await checkQuota("u1", "video", undefined, sb({ userPlan: "free" }));
  assertEquals(video.reason, "not_available");
  const carousel = await checkQuota("u1", "carousel", undefined, sb({ userPlan: "free", usage: rows(3, "carousel"), bonusCredits: 10 }));
  assertEquals(carousel.allowed, false);
  assertEquals(carousel.reason, "category");
});

Deno.test("erreur de lecture usage → fail-closed (bloqué, reason error)", async () => {
  const r = await checkQuota("u1", "content", undefined, sb({ userPlan: "free", usageError: true }));
  assertEquals(r.allowed, false);
  assertEquals(r.reason, "error");
});

Deno.test("plan workspace upgrade le plan perso (free + workspace binome → binome)", async () => {
  // quality_max indisponible en free mais dispo en binome
  const r = await checkQuota("u1", "quality_max", "ws1", sb({ userPlan: "free", workspacePlan: "binome", member: true }));
  assertEquals(r.allowed, true);
  assertEquals(r.plan, "binome");
});

Deno.test("workspace fourni mais NON membre → ignoré (pas d'héritage de plan, périmètre propre)", async () => {
  // Un client (ou un bug front) qui passe le workspace_id d'autrui ne doit ni
  // hériter de son plan ni compter/facturer dans son périmètre.
  const r = await checkQuota("u1", "quality_max", "ws-autrui", sb({ userPlan: "free", workspacePlan: "binome", member: false }));
  assertEquals(r.allowed, false);
  assertEquals(r.reason, "not_available"); // plan resté free : quality_max indisponible
});

Deno.test("programme d'accompagnement actif upgrade en binome", async () => {
  const r = await checkQuota("u1", "quality_max", undefined, sb({ userPlan: "free", coaching: true }));
  assertEquals(r.allowed, true);
  assertEquals(r.plan, "binome");
});

// ---------- logUsage ----------

Deno.test("logUsage: insère bien une ligne ai_usage avec les bons champs", async () => {
  const client = fakeClient({ userPlan: "free", usage: rows(5, "content"), member: true });
  // deno-lint-ignore no-explicit-any
  await logUsage("u1", "content", "create", 1234, "claude-opus", "ws1", client as any);
  assertEquals(client._inserted.length, 1);
  const row = client._inserted[0];
  assertEquals(row.user_id, "u1");
  assertEquals(row.category, "content");
  assertEquals(row.tokens_used, 1234);
  assertEquals(row.workspace_id, "ws1");
});

Deno.test("logUsage: workspace omis → la ligne est rattachée au workspace PROPRE", async () => {
  // Le bug du 10/07/2026 : des edges appelés sans workspace_id écrivaient des
  // lignes NULL qui échappaient au comptage par workspace (carrousel facturé
  // 1 unité au lieu de 3 dans le périmètre workspace).
  const client = fakeClient({ userPlan: "free", usage: rows(5, "content"), ownWorkspaceId: "ws-own" });
  // deno-lint-ignore no-explicit-any
  await logUsage("u1", "content", "create", undefined, undefined, undefined, client as any);
  assertEquals(client._inserted.length, 1);
  assertEquals(client._inserted[0].workspace_id, "ws-own");
});

Deno.test("logUsage: compte legacy sans aucun workspace → périmètre user préservé (NULL)", async () => {
  const client = fakeClient({ userPlan: "free", usage: rows(5, "content") });
  // deno-lint-ignore no-explicit-any
  await logUsage("u1", "content", "create", undefined, undefined, undefined, client as any);
  assertEquals(client._inserted.length, 1);
  assertEquals(client._inserted[0].workspace_id, null);
});

Deno.test("logUsage: workspace d'autrui (non membre) → retombe sur le workspace propre", async () => {
  const client = fakeClient({ userPlan: "free", usage: rows(5, "content"), member: false, ownWorkspaceId: "ws-own" });
  // deno-lint-ignore no-explicit-any
  await logUsage("u1", "content", "create", undefined, undefined, "ws-autrui", client as any);
  assertEquals(client._inserted.length, 1);
  assertEquals(client._inserted[0].workspace_id, "ws-own");
});

Deno.test("logUsage: transaction unique avec le plafond effectif et bypass admin", async () => {
  for (const cfg of [
    {userPlan:"free",bonusCredits:5,usage:rows(23,"content")},
    {userPlan:"free",workspacePlan:"binome",member:true,bonusCredits:5,usage:rows(50,"content")},
    {isAdmin:true,bonusCredits:5,usage:rows(999,"content")},
  ]) {
    const client = fakeClient(cfg);
    await logUsage("u1","content","create",undefined,undefined,"ws1",client);
    const call = client._rpcCalls.find(c=>c.name==="record_ai_usage")!;
    assertEquals(!!call,true);
    assertEquals((call.args as any).p_base_total,cfg.workspacePlan || cfg.isAdmin ? 400 : 23);
    assertEquals((call.args as any).p_charge_bonus,!cfg.isAdmin);
    assertEquals(cfg.bonusCredits,cfg.workspacePlan || cfg.isAdmin ? 5 : 4);
    assertEquals(client._rpcCalls.some(c=>c.name==="consume_bonus_credit"),false);
  }
});

Deno.test("dix bonus autorisent dix actions après le mensuel, puis bloquent", async()=>{
 const cfg={userPlan:"free",bonusCredits:10,usage:rows(23,"content")}; const db=sb(cfg);
 for(let i=0;i<10;i++){
   const q=await checkQuota("u1","content",undefined,db);
   assertEquals(q.allowed,true); assertEquals(q.available_total,10-i);
   await logUsage("u1","content","create",undefined,undefined,undefined,db);
 }
 assertEquals(cfg.bonusCredits,0);
 assertEquals((await checkQuota("u1","content",undefined,db)).reason,"total");
});
Deno.test("erreur de lecture abonnement ou rôle : technique, jamais Premium",async()=>{
 for(const table of ["subscriptions","role"]){
  const db=sb({}), from=db.from.bind(db), rpc=db.rpc.bind(db);
  db.from=(t:string)=>{const b=from(t); if(t===table)b.maybeSingle=async()=>({data:null,error:{code:"XX000"}});return b;};
  if(table==="role")db.rpc=async()=>({data:null,error:{code:"XX000"}});
  const q=await checkQuota("u1","quality_max",undefined,db);
  assertEquals(q.reason,"error"); assertEquals(q.eligible_solutions,[]);
 }
});
Deno.test("abonnement annulé sans autre droit ne reste pas Premium",async()=>{
 const db=sb({}),from=db.from.bind(db);
 db.from=(t:string)=>{const b=from(t);if(t==="subscriptions") b.maybeSingle=async()=>({data:{plan:"outil",source:"stripe",status:"canceled",current_period_end:"2020-01-01"},error:null});return b;};
 assertEquals((await checkQuota("u1","quality_max",undefined,db)).allowed,false);
});
Deno.test("Premium personnel et Binôme espace gardent les droits les plus élevés",async()=>{
 assertEquals((await checkQuota("u1","photo_retouch","ws",sb({userPlan:"outil",workspacePlan:"binome",member:true}))).plan,"binome");
});

// ---------- bypass compte QA (déterministe, par UUID) ----------

// UUID réel de laetitiatest@nowadaysagency.com (Camille), cf. QA_TEST_USER_IDS.
const QA_UUID = "52e6c03c-a7de-4c20-9b4a-276751f976e8";

Deno.test("checkQuota: compte QA → autorisé même au-delà des limites, avec son plan RÉEL", async () => {
  // Régression 10/07/2026 : le bypass par email (lookup auth.admin réseau +
  // catch silencieux) échouait par intermittence → générations QA facturées.
  // Le bypass par UUID ne dépend d'aucun appel réseau : toujours déterministe.
  const r = await checkQuota(QA_UUID, "content", undefined, sb({ userPlan: "free", usage: rows(999, "content") }));
  assertEquals(r.allowed, true);
  assertEquals(r.plan, "free"); // plan réel conservé (gating UI d'une vraie cliente free)
  assertEquals(r.remaining_total, 9999);
});

Deno.test("logUsage: compte QA → aucune écriture ai_usage, aucun bonus consommé", async () => {
  const client = fakeClient({ userPlan: "free", usage: rows(50, "content"), bonusCredits: 5 });
  // deno-lint-ignore no-explicit-any
  await logUsage(QA_UUID, "content", "create", undefined, undefined, undefined, client as any);
  assertEquals(client._inserted.length, 0);
  assertEquals(client._rpcCalls.filter((c) => c.name === "consume_bonus_credit").length, 0);
});

Deno.test("checkQuota: un UUID non-QA au plafond reste bloqué (pas d'élargissement du bypass)", async () => {
  const r = await checkQuota("un-autre-uuid", "content", undefined, sb({ userPlan: "free", usage: rows(23, "content") }));
  assertEquals(r.allowed, false);
});

// ---------- quotaDeniedResponse ----------

Deno.test("quotaDeniedResponse: quota épuisé → 429 limit_reached", async () => {
  const res = quotaDeniedResponse({ allowed: false, plan: "free", reason: "total", message: "plus de crédits" }, {});
  assertEquals(res.status, 429);
  const body = await res.json();
  assertEquals(body.error, "limit_reached");
});

Deno.test("quotaDeniedResponse: panne de vérification (fail-closed) → 503 quota_check_failed, PAS limit_reached", async () => {
  // Une panne ai_usage ne doit JAMAIS afficher « tu as utilisé tous tes crédits »
  // (upsell mensonger) : code distinct → le front traite comme erreur passagère.
  const res = quotaDeniedResponse({ allowed: false, plan: "free", reason: "error", message: "Impossible de vérifier ton abonnement pour le moment. Réessaie dans un instant." }, {});
  assertEquals(res.status, 503);
  const body = await res.json();
  assertEquals(body.error, "quota_check_failed");
});
