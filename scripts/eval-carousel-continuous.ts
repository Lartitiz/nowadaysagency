// Opt-in writer + real judge + deterministic composition. Synthetic sources only.
import { createContinuousNarrative } from "../supabase/functions/carousel-ai/continuous-narrative.ts";
import { reviewCarouselProgression } from "../supabase/functions/_shared/carousel-progression.ts";
const cases = [
  {
    mode: "photo",
    brand:
      "Je suis vannière. Je propose des paniers en osier tressés à la main. J'assure aussi la réparation de mes paniers : une anse peut être remplacée sans refaire tout le panier. Je souhaite que mes objets restent en usage. Ma voix est personnelle et précise, sans emphase ni slogan.",
    context:
      "Trois paniers et un détail de tressage. Ces images accompagnent librement le propos.",
  },
  {
    mode: "mix",
    brand:
      "Je suis graphiste indépendante. Au début d'une mission, je demande à mes clients de rassembler leurs retours et de choisir les priorités avant de me transmettre leurs modifications. Deux demandes peuvent se contredire ; je demande alors un arbitrage avant de dessiner la nouvelle version. Ma voix est directe et accessible. Aucun résultat commercial ni témoignage à inventer.",
    context:
      "Un bureau, un carnet, deux détails de maquettes. Aucune scène client ou chronologie attestée.",
  },
];
if (!Deno.args.includes("--run")) {
  console.log(
    JSON.stringify({
      mode: "dry",
      cases: cases.map((c) => c.mode),
      max_calls: 12,
    }),
  );
  Deno.exit(0);
}
const max = Deno.args.includes("--max");
const originalFetch = globalThis.fetch;
let calls = 0;
globalThis.fetch = (async (url: any, init?: RequestInit) => {
  if (
    ![
      "https://api.anthropic.com/v1/messages",
      "https://api.openai.com/v1/responses",
    ].includes(String(url)) || ++calls > 12
  ) throw Error("Evaluation call budget exceeded");
  return await originalFetch(url, init);
}) as typeof fetch;
try {
  for (const c of cases) {
    const usage = {};
    const output = await createContinuousNarrative({
      body: {
        carousel_type: c.mode,
        scenario_origin: "automatic",
        slide_count: 6,
        quality_max: max,
        photo_contexts: Array.from(
          { length: 6 },
          () => ({ context: c.context }),
        ),
      },
      brandingContext: c.brand,
      photoContext: c.context,
      newsContext: "",
      authoredText: "",
      startedAt: Date.now(),
      usage,
      emitStatus: () => {},
    });
    if (!output) throw Error("Narrative not exercised");
    const review = await reviewCarouselProgression(output.doc, {
      sources: [{ id: "brand", provenance: "brand_context", text: c.brand }, {
        id: "photo_context",
        provenance: "visual_observation",
        text: c.context,
      }],
      abortTimeoutMs: 35000,
    });
    console.log(
      JSON.stringify({
        case: c.mode,
        quality_max: max,
        usage,
        document: output.doc,
        final_review: review,
      }),
    );
  }
} finally {
  globalThis.fetch = originalFetch;
  console.log(JSON.stringify({ calls }));
}
