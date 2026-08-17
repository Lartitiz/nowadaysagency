// Régression du « succès menteur » de diagnostic-enrichment (audit 17/08) :
// avant le fix, ~15 écritures branding (brand_profile, persona, offres,
// storytelling, voice_profile, brand_charter, brand_proposition,
// brand_strategy, branding_autofill, saved_ideas…) ignoraient leur `{ error }`
// et la fonction répondait « success: true » quoi qu'il arrive — une
// utilisatrice pouvait finir son onboarding en croyant son branding rempli
// alors que des sections étaient vides. On vérifie ici que :
//   1. tout passe → success: true, pas de failed_sections ;
//   2. une écriture échoue → success: false + la section listée, et les
//      AUTRES sections sont quand même tentées (échec partiel, pas d'abandon) ;
//   3. même contrat sur la branche onboarding (fiche branding_autofill).
//
// diagnostic-enrichment utilise `serve()` de std/http (vrai socket TCP au
// chargement du module) : on neutralise Deno.listen avant l'import dynamique
// et on teste le handler exporté `handleEnrichment` — même technique que
// creative-flow/index_test.ts et carousel-visual/index_test.ts.
//
// Lancer : deno test --allow-env --allow-read supabase/functions/diagnostic-enrichment/index_test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  anthropicToolSuccess,
  installFetchMock,
  setTestEnv,
  type FetchMockHandle,
} from "../_shared/test-edge-harness.ts";

setTestEnv();

// Neutraliser Deno.listen AVANT l'import (le serve() en pied de fichier
// ouvrirait sinon un vrai socket — interdit en CI, pas de --allow-net).
const realListen = Deno.listen;
// deno-lint-ignore no-explicit-any
(Deno as any).listen = () => ({
  [Symbol.asyncIterator]() {
    return { next: () => new Promise(() => {}) };
  },
  accept: () => new Promise(() => {}),
  close() {},
  addr: { transport: "tcp", hostname: "localhost", port: 0 },
  rid: -1,
  ref() {},
  unref() {},
  // deno-lint-ignore no-explicit-any
}) as any;
const { handleEnrichment } = await import("./index.ts");
// deno-lint-ignore no-explicit-any
(Deno as any).listen = realListen;

/** Sortie Opus complète et NON dégénérée : chaque section déclenche son écriture. */
const ENRICHMENT_INPUT = {
  branding_prefill: {
    positioning: "Photographe portraitiste ethique a Lyon",
    mission: "Revaloriser l'image de soi",
    target_description: "Femmes entrepreneures creatives",
    tone_keywords: ["chaleureux", "direct"],
    values: ["ethique", "artisanat"],
    content_pillars: ["Coulisses du studio"],
    story_draft: "Un parcours de reconversion vers le portrait.",
    offers: [{ name: "Seance portrait", description: "1h de shooting", price: "290" }],
    value_prop_sentence: "Des portraits qui te ressemblent",
    value_prop_solution: "Un accompagnement complet avant, pendant, apres",
  },
  voice_prefill: {
    voice_summary: "Ecrit direct et chaleureux, comme une amie experte",
    tone_patterns: ["questions directes"],
  },
  charter_prefill: { confidence: "low", color_primary: "#FB3D80", mood_keywords: ["pop"] },
  combat_structured: { combat_cause: "l'image de soi" },
  persona_prefill: {
    confidence: "medium",
    description: "Entrepreneure creative en quete de visibilite",
    frustrations: ["photos qui ne lui ressemblent pas"],
  },
  content_strategy_prefill: {
    confidence: "medium",
    pillars: [{ label: "Coulisses du studio", description: "l'envers du decor" }],
  },
  starter_ideas: [
    { titre: "Pourquoi je refuse les retouches lourdes", format: "post", canal: "instagram", objectif: "confiance", angle: "conviction" },
  ],
};

/**
 * Enveloppe le fetch déjà mocké : journalise les POST/PATCH par table et fait
 * échouer (500 PostgREST) celles listées dans `failTables`. `mock.restore()`
 * restaure le vrai fetch d'origine, ce qui jette aussi cette enveloppe.
 */
function interceptTableWrites(failTables: string[]): { writes: string[] } {
  const writes: string[] = [];
  const wrapped = globalThis.fetch;
  // deno-lint-ignore no-explicit-any
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url ?? String(input);
    const method = (init?.method || "GET").toUpperCase();
    const m = url.match(/\/rest\/v1\/([a-z_]+)/);
    if (m && (method === "POST" || method === "PATCH")) {
      writes.push(m[1]);
      if (failTables.includes(m[1])) {
        return new Response(
          JSON.stringify({ message: "simulated write failure", code: "XX000", details: null, hint: null }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
    }
    return wrapped(input, init);
  }) as typeof fetch;
  return { writes };
}

function installEnrichmentMock(): FetchMockHandle {
  return installFetchMock({
    anthropic: () => anthropicToolSuccess("rendre_enrichissement", ENRICHMENT_INPUT),
  });
}

function internalRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/diagnostic-enrichment", {
    method: "POST",
    headers: {
      // La fonction n'accepte que le service role key (appel interne).
      Authorization: "Bearer test-service-role-key",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

const BASE_BODY = {
  userId: "test-user-id",
  workspaceId: null,
  userPrompt: "Contenu du site et reponses d'onboarding factices.",
  savedDiagId: null,
  isOnboarding: false,
  allowOverwrite: false,
};

Deno.test("toutes les écritures passent -> success: true, sans failed_sections", async () => {
  const mock = installEnrichmentMock();
  const { writes } = interceptTableWrites([]);
  try {
    const res = await handleEnrichment(internalRequest(BASE_BODY));
    const json = await res.json();

    assertEquals(res.status, 200);
    assertEquals(json.success, true);
    assertEquals(json.failed_sections, undefined);
    // Le flux a bien tenté d'écrire le branding (sinon le test ne prouve rien).
    for (const table of ["brand_profile", "persona", "offers", "storytelling", "voice_profile", "brand_charter", "brand_proposition", "brand_strategy", "saved_ideas"]) {
      assert(writes.includes(table), `écriture attendue sur ${table}, reçues: ${writes.join(", ")}`);
    }
  } finally {
    mock.restore();
  }
});

Deno.test("écriture brand_profile en échec -> success: false, section listée, autres sections quand même tentées", async () => {
  const mock = installEnrichmentMock();
  const { writes } = interceptTableWrites(["brand_profile"]);
  try {
    const res = await handleEnrichment(internalRequest(BASE_BODY));
    const json = await res.json();

    assertEquals(res.status, 200);
    assertEquals(json.success, false);
    assertEquals(json.failed_sections, ["brand_profile"]);
    // Pas d'abandon au premier échec : les sections suivantes sont écrites.
    for (const table of ["persona", "storytelling", "voice_profile", "brand_charter"]) {
      assert(writes.includes(table), `écriture attendue sur ${table} malgré l'échec brand_profile`);
    }
  } finally {
    mock.restore();
  }
});

Deno.test("onboarding : fiche branding_autofill en échec -> success: false + failed_sections", async () => {
  const mock = installEnrichmentMock();
  interceptTableWrites(["branding_autofill"]);
  try {
    const res = await handleEnrichment(internalRequest({ ...BASE_BODY, isOnboarding: true }));
    const json = await res.json();

    assertEquals(res.status, 200);
    assertEquals(json.mode, "onboarding_pending_review");
    assertEquals(json.success, false);
    assert(json.failed_sections.includes("branding_autofill"));
  } finally {
    mock.restore();
  }
});

Deno.test("mauvais token -> 401, aucun appel IA", async () => {
  const mock = installFetchMock({
    anthropic: () => {
      throw new Error("Anthropic ne doit pas être appelé sans le service role key");
    },
  });
  try {
    const res = await handleEnrichment(
      new Request("http://localhost/diagnostic-enrichment", {
        method: "POST",
        headers: { Authorization: "Bearer pas-le-bon-token", "Content-Type": "application/json" },
        body: JSON.stringify(BASE_BODY),
      }),
    );
    await res.body?.cancel();
    assertEquals(res.status, 401);
    assertEquals(mock.anthropicCallCount, 0);
  } finally {
    mock.restore();
  }
});
