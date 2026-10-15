import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* Fiche 17 de docs/robustesse/gros-fichiers.md, lot T (test 1) : ce que
   `generate` envoie au serveur pour chaque format, figé AVANT le découpage du
   hook. Une clé oubliée dans un corps de demande ne casse rien de visible (le
   serveur l'ignore, le contenu est juste moins bon : #1042, #1043) ; ces
   snapshots la rendent visible. Aucun snapshot n'a le droit de changer pendant
   le découpage. Régénérer : npx vitest run src/test/content-generator-bodies.test.tsx -u */

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), stream: vi.fn(), reset: vi.fn() }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: mocks.invoke }));
vi.mock("@/lib/invoke-with-heartbeat", () => ({ invokeWithHeartbeat: mocks.invoke }));
vi.mock("@/hooks/use-streaming-invoke", () => ({ useStreamingInvoke: () => ({ invoke: mocks.stream, reset: mocks.reset }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "workspace" }));
vi.mock("@/lib/posthog-lazy", () => ({ posthog: { capture: vi.fn() } }));
vi.mock("@/lib/quota-error-handler", () => ({ handleQuotaError: () => false }));
vi.mock("@/lib/image-vision", () => ({
  downscalePhotosForVision: async (photos: any[]) => photos?.map((p) => ({ ...p, base64: `allégée(${p.base64})` })),
}));

import { useContentGenerator, type GenerateParams } from "@/hooks/use-content-generator";

const OK: Record<string, unknown> = {
  carousel: { slides: [{ slide_number: 1, title: "A" }] },
  reel: { sections: [{ id: "hook" }] },
  story: { stories: [] },
  post: { content: "Post" },
  linkedin: { content: "Post" },
};

beforeEach(() => vi.clearAllMocks());

async function bodyOf(params: GenerateParams) {
  mocks.invoke.mockResolvedValue({ data: { content: JSON.stringify(OK[params.format] ?? {}) }, error: null });
  const { result } = renderHook(useContentGenerator);
  await act(async () => { await result.current.generate(params); });
  expect(mocks.invoke).toHaveBeenCalledTimes(1);
  const [fn, opts, timeout] = mocks.invoke.mock.calls[0];
  return { fn, body: lisible(opts.body), timeout, onStatus: typeof opts.onStatus };
}

/** Snapshot lisible : une chaîne de plus de 200 caractères devient « <N car.> ». */
const lisible = (v: any) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "string" && x.length > 200 ? `<${x.length} car.>` : x === undefined ? "<undefined>" : x)));

const photos = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ base64: `px${i + 1}`, context: `contexte ${i + 1}`, libraryContext: `biblio ${i + 1}`, mimeType: "image/png", userPhotoId: `photo-${i + 1}` }));
const CAL = "Mon sujet\n\n[Contenu existant à approfondir]\nLe texte déjà écrit dans le calendrier";

describe("generate — carrousel (carousel-ai express_full)", () => {
  const cas: Record<string, GenerateParams> = {
    texte: { format: "carousel", subject: "Sujet", objective: "visibilite", editorialAngle: "mythe", answers: { "Q1 ?": "R1" } },
    "photo automatique": { format: "carousel", subject: "Sujet", carouselType: "photo", carouselSubMode: "photo", photos: photos(2), photoDescription: "Atelier" },
    "photo plan validé": {
      format: "carousel", subject: "Sujet", carouselType: "photo", carouselSubMode: "photo", photos: photos(1),
      confirmedStructure: [{ slide_number: 1, role: "hook", title_suggestion: "Plan", strategic_note: "Note", photo_index: 1, slide_type: "photo_full" }],
    },
    mixte: { format: "carousel", subject: "Sujet", carouselType: "mix", carouselSubMode: "mix", photos: photos(12) },
    "photos brutes": { format: "carousel", subject: "Sujet", carouselType: "photo", carouselSubMode: "pure_photo", photos: photos(2) },
    "texte d'abord (catalogue de 45)": {
      format: "carousel", subject: "Sujet", carouselType: "mix", carouselSubMode: "mix", textFirst: true,
      photoCatalog: Array.from({ length: 45 }, (_, i) => ({ index: i + 1, description: `photo ${i + 1}`, kind: "produit" })),
    },
    "qualité max, récit, intention, longueur": {
      format: "carousel", subject: "Sujet", qualityMax: true, narrativeThread: "Le fil du récit", slideCount: 7,
      editorialIntent: { mode: "explain", idea: "Idée", reader_takeaway: "Retenir", basis_source_ids: ["s1"], inferred: false },
      slideStructure: [{ slide_number: 1, type: "text_only" }], channel: "linkedin", workspaceId: "espace-explicite",
    },
    "actu de 4 000 caractères": { format: "carousel", subject: "Sujet", newsContext: "a".repeat(4000) },
    "récit vide et actu blanche ignorés": { format: "carousel", subject: "Sujet", narrativeThread: "   ", newsContext: "  " },
    "sujet venu du calendrier": { format: "carousel", subject: CAL },
  };
  for (const [nom, params] of Object.entries(cas)) {
    it(nom, async () => {
      const call = await bodyOf(params);
      if (nom.startsWith("actu")) expect(call.body.news_context).toBe("<3800 car.>");
      if (nom.startsWith("texte d'abord")) expect(call.body.photo_catalog).toHaveLength(40);
      expect(call).toMatchSnapshot();
    });
  }
});

describe("generate — reel (creative-flow)", () => {
  it("réponses seules : rangées par position ET envoyées en paires", async () => {
    expect(await bodyOf({ format: "reel", subject: "Sujet", answers: { "Ton anecdote ?": "A", "Ton émotion ?": "B", "Ta conviction ?": "C" } })).toMatchSnapshot();
  });
  it("preGenAnswers fournis, hook choisi, angle, actu", async () => {
    expect(await bodyOf({
      format: "reel", subject: CAL, answers: { "Q ?": "R" }, preGenAnswers: { anecdote: "X" }, faceCam: "non", timeAvailable: "30min",
      selectedHook: { id: "h1", text: "Accroche" }, editorialAngle: "storytelling", newsContext: "Actu",
    })).toMatchSnapshot();
  });
  it("sans réponses ni caméra : face_cam « oui », réponses vides", async () => {
    expect(await bodyOf({ format: "reel", subject: "Sujet" })).toMatchSnapshot();
  });
});

describe("generate — stories (creative-flow)", () => {
  it("réponses en paires", async () => {
    expect(await bodyOf({ format: "story", subject: CAL, answers: { "Q1 ?": "R1" }, editorialAngle: "coulisses" })).toMatchSnapshot();
  });
  it("mode photo avec 12 photos : 10 identifiants au plus", async () => {
    const call = await bodyOf({ format: "story", subject: "Sujet", photoMode: true, photos: photos(12) });
    expect(call.body.preferred_photo_ids).toHaveLength(10);
    expect(call).toMatchSnapshot();
  });
});

describe("generate — post Instagram (creative-flow)", () => {
  it("angle connu (titre et étapes de structure)", async () => {
    expect(await bodyOf({ format: "post", subject: CAL, editorialAngle: "mythe", answers: { "Q ?": "R" }, objective: "vente" })).toMatchSnapshot();
  });
  it("mode photo : photos allégées, 10 au plus", async () => {
    const call = await bodyOf({ format: "post", subject: "Sujet", photoMode: true, photos: photos(11), photoDescription: "Desc" });
    expect(call.body.photos).toHaveLength(10);
    expect(call).toMatchSnapshot();
  });
});

describe("generate — LinkedIn (chemin de secours)", () => {
  it("sujet du calendrier → libellé « [Contenu existant] »", async () => {
    const call = await bodyOf({ format: "linkedin", subject: CAL, editorialAngle: "mythe", photoMode: true, photos: photos(1) });
    expect(call.body.context).toBe("Mon sujet\n\n[Contenu existant]\nLe texte déjà écrit dans le calendrier");
    expect(call).toMatchSnapshot();
  });
});

describe("generate — formats refusés", () => {
  for (const format of ["newsletter", "auto"]) {
    it(`${format} : message clair et aucun appel`, async () => {
      const { result } = renderHook(useContentGenerator);
      let out: unknown;
      await act(async () => { out = await result.current.generate({ format: format as any, subject: "Sujet" }); });
      expect(out).toBeNull();
      expect(mocks.invoke).not.toHaveBeenCalled();
      expect(result.current.error).toBe("Choisis un format valide pour générer ton contenu.");
      expect(result.current.generating).toBe(false);
    });
  }
});
