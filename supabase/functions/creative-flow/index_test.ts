// Tests du contrat checkQuota→IA→logUsage de creative-flow, via le seam
// d'injection `_deps` (cf. index.ts). On ne teste PAS le contenu métier des
// prompts : juste l'ORDRE et les CONDITIONS d'appel (quota bloque avant l'IA,
// logUsage seulement sur les steps facturés et seulement après succès IA).
//
// Lancer : deno test --allow-env --allow-read supabase/functions/creative-flow/index_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleRequest, _deps } from "./index.ts";
import { AnthropicError } from "../_shared/anthropic.ts";

/** Faux client Supabase permissif et générique : suffisant pour laisser
 * getUserContext / getRecentBriefsContext traverser sans throw (toutes les
 * requêtes retombent sur "aucune donnée"), ce qui est le comportement normal
 * pour un compte de test sans branding rempli. */
function makeFakeSupabase() {
  function builder(): any {
    const b: any = {};
    b.select = () => b; b.eq = () => b; b.neq = () => b; b.gte = () => b; b.lte = () => b;
    b.order = () => b; b.limit = () => b; b.in = () => b; b.is = () => b; b.contains = () => b;
    b.single = () => Promise.resolve({ data: null, error: null });
    b.maybeSingle = () => Promise.resolve({ data: null, error: null });
    b.insert = () => Promise.resolve({ data: null, error: null });
    b.update = () => b;
    b.delete = () => b;
    b.then = (resolve: any) => resolve({ data: [], error: null });
    return b;
  }
  return { from: () => builder(), rpc: () => Promise.resolve({ data: null, error: null }) };
}

function resetDeps() {
  _deps.runPipeline = async () => {
    throw new Error("_deps.runPipeline non mocké dans ce test");
  };
  _deps.checkQuota = async () => {
    throw new Error("_deps.checkQuota non mocké dans ce test");
  };
  _deps.logUsage = async () => {
    throw new Error("_deps.logUsage non mocké dans ce test");
  };
  _deps.callAnthropic = async () => {
    throw new Error("_deps.callAnthropic non mocké dans ce test");
  };
  _deps.callAnthropicSimple = async () => {
    throw new Error("_deps.callAnthropicSimple non mocké dans ce test");
  };
}

function jsonRequest(body: unknown): Request {
  return new Request("http://localhost/creative-flow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

Deno.test("step facturé (adjust) + quota épuisé : runPipeline bloque avant l'IA, logUsage jamais appelé", async () => {
  resetDeps();

  // La doublure de runPipeline se comporte comme le VRAI runPipeline vis-à-vis
  // de `skipQuota` : si creative-flow ne demande PAS skipQuota (donc quota
  // réellement vérifié) pour un step facturé, elle refuse. Ça vérifie que
  // "adjust" est bien passé en isBilledStep=true → skipQuota=false.
  _deps.runPipeline = async (_req: Request, options: any) => {
    if (!options.skipQuota) {
      return {
        ok: false,
        response: new Response(
          JSON.stringify({ error: "limit_reached", message: "quota épuisé", remaining: 0, category: "total", quota: { allowed: false } }),
          { status: 429, headers: { "Content-Type": "application/json" } },
        ),
      };
    }
    return { ok: true, userId: "test-user-1", supabase: makeFakeSupabase(), corsHeaders: {}, quota: null };
  };
  _deps.callAnthropic = async () => {
    throw new Error("IA ne doit pas être appelée si le pipeline bloque");
  };
  _deps.callAnthropicSimple = async () => {
    throw new Error("IA ne doit pas être appelée si le pipeline bloque");
  };
  let logUsageCalled = false;
  _deps.logUsage = async () => {
    logUsageCalled = true;
  };

  const req = jsonRequest({ step: "adjust", content: "texte existant", adjustment: "raccourcis" });
  const res = await handleRequest(req);
  const body = await res.json();

  assertEquals(res.status, 429);
  assertEquals(body.error, "limit_reached");
  assertEquals(logUsageCalled, false);
});

Deno.test("step facturé (adjust) + quota disponible : appelle l'IA puis logUsage, réponse = objet JSON direct", async () => {
  resetDeps();

  _deps.runPipeline = async () => ({
    ok: true, userId: "test-user-1", supabase: makeFakeSupabase(), corsHeaders: {}, quota: null,
  });
  // "adjust" n'a pas de tool structuré → passe par callAnthropicSimple.
  _deps.callAnthropicSimple = async (...args: any[]) => {
    const usageOut = args[5];
    if (usageOut) {
      usageOut.total_tokens = 123;
      usageOut.model = "claude-sonnet-4-6";
    }
    return JSON.stringify({ content: "Contenu ajusté de test" });
  };
  let logUsageArgs: any[] | null = null;
  _deps.logUsage = async (...args: any[]) => {
    logUsageArgs = args;
  };

  const req = jsonRequest({ step: "adjust", content: "texte existant", adjustment: "raccourcis" });
  const res = await handleRequest(req);
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(body.content, "Contenu ajusté de test");
  assertEquals(logUsageArgs !== null, true);
  assertEquals(logUsageArgs![0], "test-user-1");
  assertEquals(logUsageArgs![1], "content");
  assertEquals(logUsageArgs![2], "creative_flow");
});

Deno.test("step gratuit (questions) + quota disponible : pas d'appel à logUsage même en succès", async () => {
  resetDeps();

  _deps.runPipeline = async () => ({
    ok: true, userId: "test-user-1", supabase: makeFakeSupabase(), corsHeaders: {}, quota: null,
  });
  // "questions" a un tool structuré (QUESTIONS_TOOL) → passe par callAnthropic, pas Simple.
  _deps.callAnthropic = async (_options: any, usageOut?: any) => {
    if (usageOut) {
      usageOut.total_tokens = 50;
      usageOut.model = "claude-haiku-4-5";
    }
    return JSON.stringify({ questions: [{ question: "Quelle est ta cible ?", placeholder: "Réponds ici" }] });
  };
  let logUsageCalled3 = false;
  _deps.logUsage = async () => {
    logUsageCalled3 = true;
  };

  const req = jsonRequest({
    step: "questions",
    context: "Le lancement de mon nouvel atelier",
    angle: { title: "Angle test", structure: ["étape 1", "étape 2"], tone: "direct" },
  });
  const res = await handleRequest(req);
  const body = await res.json();

  assertEquals(res.status, 200);
  assertEquals(Array.isArray(body.questions), true);
  assertEquals(logUsageCalled3, false);
});

Deno.test("deep research (generate + deepResearch) : checkQuota reçoit bien le workspace_id de la requête", async () => {
  resetDeps();

  _deps.runPipeline = async () => ({
    ok: true, userId: "test-user-1", supabase: makeFakeSupabase(), corsHeaders: {}, quota: null,
  });
  let checkQuotaArgs: any[] | null = null;
  _deps.checkQuota = async (...args: any[]) => {
    checkQuotaArgs = args;
    // On bloque volontairement ici : on ne veut vérifier que les arguments
    // passés à checkQuota, pas dérouler toute la recherche web + génération.
    return { allowed: false, plan: "free", reason: "not_available", message: "deep research indisponible" };
  };
  _deps.callAnthropic = async () => {
    throw new Error("IA ne doit pas être appelée si le quota deep_research est refusé");
  };
  _deps.callAnthropicSimple = async () => {
    throw new Error("IA ne doit pas être appelée si le quota deep_research est refusé");
  };
  let logUsageCalled5 = false;
  _deps.logUsage = async () => {
    logUsageCalled5 = true;
  };

  const req = jsonRequest({
    step: "generate",
    contentType: "post",
    context: "Le lancement de mon nouvel atelier",
    workspace_id: "11111111-1111-1111-1111-111111111111",
    deepResearch: true,
    angle: { title: "Angle test", structure: ["étape 1", "étape 2"], tone: "direct" },
  });
  const res = await handleRequest(req);

  assertEquals(checkQuotaArgs !== null, true);
  assertEquals(checkQuotaArgs![0], "test-user-1");
  assertEquals(checkQuotaArgs![1], "deep_research");
  assertEquals(checkQuotaArgs![2], "11111111-1111-1111-1111-111111111111");
  assertEquals(res.status, 429);
  assertEquals(logUsageCalled5, false);
});

Deno.test("step facturé (adjust) + échec de l'appel IA : logUsage n'est jamais appelé", async () => {
  resetDeps();

  _deps.runPipeline = async () => ({
    ok: true, userId: "test-user-1", supabase: makeFakeSupabase(), corsHeaders: {}, quota: null,
  });
  _deps.callAnthropicSimple = async () => {
    throw new AnthropicError("erreur simulée", 500);
  };
  let logUsageCalled4 = false;
  _deps.logUsage = async () => {
    logUsageCalled4 = true;
  };

  const req = jsonRequest({ step: "adjust", content: "texte existant", adjustment: "raccourcis" });
  const res = await handleRequest(req);
  const body = await res.json();

  assertEquals(res.status, 500);
  assertEquals(body.error, "erreur simulée");
  assertEquals(logUsageCalled4, false);
});
