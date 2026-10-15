import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/* Fiche 17 de docs/robustesse/gros-fichiers.md, lot T (test 4) :
   `generateQuestions` (corps envoyés, mémoire anti-répétition, plafond du
   contexte, lecture des questions, erreurs), figé avant le découpage du hook.
   Régénérer : npx vitest run src/test/content-generator-questions.test.tsx -u */

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  briefs: [] as any[],
  briefsError: null as Error | null,
  eq: vi.fn(),
}));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: mocks.invoke }));
vi.mock("@/lib/invoke-with-heartbeat", () => ({ invokeWithHeartbeat: mocks.invoke }));
vi.mock("@/hooks/use-streaming-invoke", () => ({ useStreamingInvoke: () => ({ invoke: vi.fn(), reset: vi.fn() }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/hooks/use-workspace-query", () => ({ useWorkspaceId: () => "workspace" }));
vi.mock("@/lib/posthog-lazy", () => ({ posthog: { capture: vi.fn() } }));
vi.mock("@/lib/quota-error-handler", () => ({ handleQuotaError: () => false }));
vi.mock("@/lib/image-vision", () => ({
  downscalePhotosForVision: async (photos: any[]) => photos?.map((p) => ({ ...p, base64: `allégée(${p.base64})` })),
}));
vi.mock("@/integrations/supabase/client", () => {
  const q: any = {
    select: () => q, order: () => q, limit: () => q,
    eq: (col: string, val: string) => { mocks.eq(col, val); return q; },
    then: (res: any, rej: any) => (mocks.briefsError ? Promise.reject(mocks.briefsError) : Promise.resolve({ data: mocks.briefs, error: null })).then(res, rej),
  };
  return { supabase: { auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) }, from: () => q } };
});

import { useContentGenerator, type GenerateQuestionsParams } from "@/hooks/use-content-generator";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.briefs = [];
  mocks.briefsError = null;
  mocks.invoke.mockResolvedValue({ data: { content: JSON.stringify({ questions: [{ id: "a", question: "Pourquoi ?" }] }) }, error: null });
});

/** Snapshot lisible : une chaîne de plus de 200 caractères devient « <N car.> ». */
const lisible = (v: any) => JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === "string" && x.length > 200 ? `<${x.length} car.>` : x === undefined ? "<undefined>" : x)));

async function appel(params: GenerateQuestionsParams) {
  const hook = renderHook(useContentGenerator);
  let out: any;
  await act(async () => { out = await hook.result.current.generateQuestions(params); });
  const [fn, opts, timeout] = mocks.invoke.mock.calls[0];
  return { out, hook, fn, body: opts.body, timeout };
}

const photos = (n: number) => Array.from({ length: n }, (_, i) => ({ base64: `px${i + 1}`, context: `contexte ${i + 1}`, mimeType: i % 2 ? "image/png" : undefined }));
const CAL = "Mon sujet\n\n[Contenu existant à approfondir]\nLe texte du calendrier";

describe("generateQuestions — carrousel (carousel-ai deepening_questions)", () => {
  const cas: Record<string, GenerateQuestionsParams> = {
    "texte, sujet du calendrier": { format: "carousel", subject: CAL, editorialAngle: "mythe", objective: "vente", carouselSubMode: "text" },
    "photo avec photos (vision, 90 s)": { format: "carousel", subject: "Sujet", carouselSubMode: "photo", photos: photos(12), photoDescription: "Desc" },
    "photos brutes envoyées comme photo": { format: "carousel", subject: "Sujet", carouselSubMode: "pure_photo", photos: photos(1) },
    "mixte sans photo : pas de vision": { format: "carousel", subject: "Sujet", carouselSubMode: "mix", newsContext: "Actu", channel: "linkedin" },
  };
  for (const [nom, params] of Object.entries(cas)) {
    it(nom, async () => {
      const { fn, body, timeout } = await appel(params);
      if (nom.startsWith("photo avec")) expect(body.photos).toHaveLength(10);
      expect(lisible({ fn, body, timeout })).toMatchSnapshot();
    });
  }
});

describe("generateQuestions — autres formats (creative-flow questions)", () => {
  it.each([["linkedin", "linkedin_post"], ["newsletter", "newsletter"], ["pinterest", "post_pinterest"], ["post", "instagram_post"], ["reel", "instagram_post"]])(
    "%s → contentType %s", async (format, contentType) => {
      const { body } = await appel({ format, subject: "Sujet" });
      expect(body.contentType).toBe(contentType);
    });

  it("angle connu, mode photo (vision 180 s)", async () => {
    const { fn, body, timeout } = await appel({ format: "post", subject: "Sujet", editorialAngle: "mythe", photoMode: true, photos: photos(2), photoDescription: "Desc", newsContext: "Actu" });
    expect(lisible({ fn, body, timeout })).toMatchSnapshot();
  });

  it("photos sans photoMode : pas de vision (60 s)", async () => {
    const { body, timeout } = await appel({ format: "post", subject: "Sujet", photos: photos(1) });
    expect(body.photo_mode).toBeUndefined();
    expect(body.photos).toBeUndefined();
    expect(timeout).toBe(60000);
  });

  it("angle inconnu : son id sert de titre", async () => {
    const { body } = await appel({ format: "post", subject: "Sujet", editorialAngle: "angle-maison" });
    expect(body.angle).toEqual({ title: "angle-maison", structure: expect.any(Array), tone: "direct, chaleureux, oral assumé" });
  });

  it("sans angle : « libre »", async () => {
    const { body } = await appel({ format: "linkedin", subject: "Sujet" });
    expect(body.angle).toEqual({ title: "libre", structure: [], tone: "direct, chaleureux, oral assumé" });
  });

  it("contexte de 10 000 caractères sans calendrier : coupé à 7 800", async () => {
    const { body } = await appel({ format: "post", subject: "s".repeat(10000) });
    expect(body.context).toHaveLength(7800);
    expect(body.context.endsWith("...")).toBe(true);
  });

  it("contexte de 10 000 caractères avec calendrier : 40 % pour le sujet, le reste pour le contenu existant", async () => {
    const { body } = await appel({ format: "post", subject: `${"s".repeat(10000)}\n\n[Contenu existant à approfondir]\n${"c".repeat(10000)}` });
    const [sujet, existant] = body.context.split("\n\n[Contenu existant à approfondir]\n");
    expect(sujet).toHaveLength(3120);
    expect(body.context).toHaveLength(7800);
    expect(existant.endsWith("...")).toBe(true);
  });
});

describe("generateQuestions — mémoire anti-répétition (content_briefs)", () => {
  it("3 sujets non vides gardés, 120 caractères max, filtre sur le workspace", async () => {
    mocks.briefs = [
      { subject: "Premier sujet", format: "post", editorial_angle: "mythe" },
      { subject: "   ", format: "reel" },
      { subject: "x".repeat(150), format: null, editorial_angle: null },
      { subject: "Troisième", format: "carousel" },
      { subject: "Quatrième (ignoré)" },
    ];
    const { body } = await appel({ format: "post", subject: "Sujet" });
    expect(mocks.eq).toHaveBeenCalledWith("workspace_id", "workspace");
    expect(body.recent_briefs_context).toMatchSnapshot();
  });

  it("workspace explicite prioritaire", async () => {
    await appel({ format: "post", subject: "Sujet", workspaceId: "autre" });
    expect(mocks.eq).toHaveBeenCalledWith("workspace_id", "autre");
  });

  it("aucun brief → pas de bloc d'historique", async () => {
    const { body } = await appel({ format: "carousel", subject: "Sujet" });
    expect(body.recent_briefs_context).toBeUndefined();
  });

  it("lecture des briefs en échec → les questions arrivent quand même", async () => {
    mocks.briefsError = new Error("réseau");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { out, body } = await appel({ format: "post", subject: "Sujet" });
    expect(body.recent_briefs_context).toBeUndefined();
    expect(out).toEqual([{ id: "a", question: "Pourquoi ?", placeholder: "" }]);
    warn.mockRestore();
  });
});

describe("generateQuestions — lecture et erreurs", () => {
  it("réponse en tableau, champs de repli (label, text, hint, id manquant)", async () => {
    mocks.invoke.mockResolvedValue({ data: [{ label: "Q label", hint: "H" }, { text: "Q text", id: "t" }], error: null });
    const { out, hook } = await appel({ format: "post", subject: "Sujet" });
    expect(out).toEqual([{ id: "q_0", question: "Q label", placeholder: "H" }, { id: "t", question: "Q text", placeholder: "" }]);
    expect(hook.result.current.questions).toEqual(out);
    expect(hook.result.current.loadingQuestions).toBe(false);
  });

  it("réponse { questions } dans content, entourée de ```json", async () => {
    mocks.invoke.mockResolvedValue({ data: { content: '```json\n{"questions":[{"question":"Q ?","placeholder":"P"}]}\n```' }, error: null });
    const { out } = await appel({ format: "carousel", subject: "Sujet" });
    expect(out).toEqual([{ id: "q_0", question: "Q ?", placeholder: "P" }]);
  });

  it("forme inconnue → aucune question, pas d'erreur", async () => {
    mocks.invoke.mockResolvedValue({ data: { content: '{"autre":1}' }, error: null });
    const { out, hook } = await appel({ format: "post", subject: "Sujet" });
    expect(out).toEqual([]);
    expect(hook.result.current.questionsError).toBeNull();
  });

  it("erreur → posée dans error ET questionsError", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { message: "Le serveur est occupé." } });
    const { out, hook } = await appel({ format: "post", subject: "Sujet" });
    expect(out).toEqual([]);
    expect(hook.result.current.error).toBe("Le serveur est occupé.");
    expect(hook.result.current.questionsError).toBe("Le serveur est occupé.");
    expect(hook.result.current.loadingQuestions).toBe(false);
  });
});
