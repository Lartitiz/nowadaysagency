// Tests des gardes de quota / crédits (logique facturation = la plus sensible).
// On injecte un faux client Supabase via le param `sbOverride` de checkQuota/logUsage
// pour tester le comportement réel des fonctions, sans DB ni réseau.
//
// Lancer : deno test supabase/functions/_shared/plan-limiter_test.ts --allow-all

import {
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { checkQuota, logUsage } from "./plan-limiter.ts";

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
    b.select = () => b;
    b.eq = () => b;
    b.gte = () => b;
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
      if (table === "coaching_programs") {
        return Promise.resolve({ data: cfg.coaching ? { id: "c1" } : null, error: null });
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

Deno.test("free: le bonus n'étend PAS le cap par catégorie (content reste bloqué à 23)", async () => {
  // Comportement réel à connaître : content a un cap catégorie = total = 23.
  // Même avec du bonus (total → 28), un usage 100% content est bloqué à 23 par le cap catégorie.
  const r = await checkQuota("u1", "content", undefined, sb({ userPlan: "free", usage: rows(23, "content"), bonusCredits: 5 }));
  assertEquals(r.allowed, false);
  assertEquals(r.reason, "category");
});

Deno.test("erreur de lecture usage → fail-closed (bloqué, reason error)", async () => {
  const r = await checkQuota("u1", "content", undefined, sb({ userPlan: "free", usageError: true }));
  assertEquals(r.allowed, false);
  assertEquals(r.reason, "error");
});

Deno.test("plan workspace upgrade le plan perso (free + workspace binome → binome)", async () => {
  // quality_max indisponible en free mais dispo en binome
  const r = await checkQuota("u1", "quality_max", "ws1", sb({ userPlan: "free", workspacePlan: "binome" }));
  assertEquals(r.allowed, true);
  assertEquals(r.plan, "binome");
});

Deno.test("programme d'accompagnement actif upgrade en binome", async () => {
  const r = await checkQuota("u1", "quality_max", undefined, sb({ userPlan: "free", coaching: true }));
  assertEquals(r.allowed, true);
  assertEquals(r.plan, "binome");
});

// ---------- logUsage ----------

Deno.test("logUsage: insère bien une ligne ai_usage avec les bons champs", async () => {
  const client = fakeClient({ userPlan: "free", usage: rows(5, "content") });
  // deno-lint-ignore no-explicit-any
  await logUsage("u1", "content", "create", 1234, "claude-opus", "ws1", client as any);
  assertEquals(client._inserted.length, 1);
  const row = client._inserted[0];
  assertEquals(row.user_id, "u1");
  assertEquals(row.category, "content");
  assertEquals(row.tokens_used, 1234);
  assertEquals(row.workspace_id, "ws1");
});

Deno.test("logUsage: au-delà du plafond de base, décrémente les crédits bonus (RPC atomique)", async () => {
  // 24 lignes ai_usage (> free.total=23) → appelle la RPC atomique consume_bonus_credit.
  const client = fakeClient({ userPlan: "free", usage: rows(24, "content"), bonusCredits: 5 });
  // deno-lint-ignore no-explicit-any
  await logUsage("u1", "content", "create", undefined, undefined, undefined, client as any);
  const consumeCalls = client._rpcCalls.filter((c) => c.name === "consume_bonus_credit");
  assertEquals(consumeCalls.length, 1);
  assertEquals(consumeCalls[0].args, { p_user_id: "u1" });
});

Deno.test("logUsage: sous le plafond de base, ne touche pas aux crédits bonus", async () => {
  const client = fakeClient({ userPlan: "free", usage: rows(10, "content"), bonusCredits: 5 });
  // deno-lint-ignore no-explicit-any
  await logUsage("u1", "content", "create", undefined, undefined, undefined, client as any);
  assertEquals(client._rpcCalls.filter((c) => c.name === "consume_bonus_credit").length, 0);
});

Deno.test("logUsage: plan workspace binome → ne consomme JAMAIS de bonus (même > 23 usages)", async () => {
  // Le bug corrigé : logUsage lisait le plan PERSO (free, total=23) au lieu du plan
  // effectif (workspace binome, total=9999) → les bonus d'une cliente Binôme fondaient à tort.
  const client = fakeClient({ userPlan: "free", workspacePlan: "binome", usage: rows(50, "content"), bonusCredits: 5 });
  // deno-lint-ignore no-explicit-any
  await logUsage("u1", "content", "create", undefined, undefined, "ws1", client as any);
  assertEquals(client._rpcCalls.filter((c) => c.name === "consume_bonus_credit").length, 0);
});

Deno.test("logUsage: programme d'accompagnement actif → ne consomme pas de bonus", async () => {
  const client = fakeClient({ userPlan: "free", coaching: true, usage: rows(50, "content"), bonusCredits: 5 });
  // deno-lint-ignore no-explicit-any
  await logUsage("u1", "content", "create", undefined, undefined, undefined, client as any);
  assertEquals(client._rpcCalls.filter((c) => c.name === "consume_bonus_credit").length, 0);
});

Deno.test("logUsage: admin → journalise l'usage mais ne consomme pas de bonus", async () => {
  // checkQuota bypass les admins ; logUsage doit faire pareil pour le décompte bonus
  // (sinon les bonus du compte admin fondent alors qu'aucun quota ne s'applique à lui).
  const client = fakeClient({ isAdmin: true, userPlan: "free", usage: rows(50, "content"), bonusCredits: 5 });
  // deno-lint-ignore no-explicit-any
  await logUsage("u1", "content", "create", undefined, undefined, undefined, client as any);
  assertEquals(client._inserted.length, 1);
  assertEquals(client._rpcCalls.filter((c) => c.name === "consume_bonus_credit").length, 0);
});
