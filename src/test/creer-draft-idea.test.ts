// Brouillon de /creer rangé dans Mes idées dès la 2e étape (13/11/2026).
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ rows: new Map<string, any>(), inserts: [] as any[], updates: [] as any[] }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      let id: string | null = null;
      let payload: any = null;
      let mode: "select" | "insert" | "update" = "select";
      const q: any = {
        select: () => q,
        eq: (_k: string, v: string) => { id = v; return q; },
        maybeSingle: async () => ({ data: id ? db.rows.get(id) ?? null : null, error: null }),
        single: async () => {
          if (mode === "insert") { const row = { ...payload, id: `fiche-${db.inserts.length - 1}` }; db.rows.set(row.id, row); return { data: row, error: null }; }
          return { data: null, error: null };
        },
        insert: (p: any) => { mode = "insert"; payload = p; db.inserts.push(p); return q; },
        update: (p: any) => { mode = "update"; payload = p; return q; },
        then: (resolve: any) => {
          if (mode === "update" && id) { db.updates.push({ id, ...payload }); db.rows.set(id, { ...db.rows.get(id), ...payload }); }
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };
      return q;
    },
  },
}));
vi.mock("@/lib/carousel-media", () => ({ externalizeCarouselMedia: async (v: string) => (v.length > 100 ? "https://x/storage/v1/object/public/calendar-visuals/u/carousel-media/abc.jpg" : v) }));

import {
  creerDraftOf, draftFlowOf, draftSignature, ideaAcceptsDraft, isCreerDraftStage, CREER_DRAFT_KEY,
} from "@/features/creer/creer-draft-idea";
import { writeCreerDraft } from "@/hooks/use-creer-draft-idea";
import { resumeIdea } from "@/lib/resume-idea";
import { ideaCreateLink } from "@/lib/idea-create-link";
import { computeDraftConflict } from "@/features/creer/draft-conflict";

const flow = { step: "questions", ideaText: "Découpe d'immeuble", selectedFormat: "carousel", carouselSubMode: "photo", questions: [{ id: "q1", question: "Pourquoi ?" }], answers: { q1: "Parce que" }, creationId: "c1", workspaceId: "u1", ts: 1, editingIdeaId: null, result: null };

beforeEach(() => { db.rows.clear(); db.inserts.length = 0; db.updates.length = 0; });

describe("à partir de quand un contenu est rangé", () => {
  it("dès la 2e étape ou dès qu'une photo est posée, jamais un sujet seulement tapé", () => {
    const base = { hasResult: false, hasEditContent: false, photoCount: 0, subject: "Sujet" };
    expect(isCreerDraftStage({ ...base, step: "idea" })).toBe(false);
    expect(isCreerDraftStage({ ...base, step: "format" })).toBe(true);
    expect(isCreerDraftStage({ ...base, step: "questions" })).toBe(true);
    expect(isCreerDraftStage({ ...base, step: "idea", photoCount: 2, subject: "" })).toBe(true);
    expect(isCreerDraftStage({ ...base, step: "result", hasResult: true })).toBe(false);
    expect(isCreerDraftStage({ ...base, step: "questions", generating: true })).toBe(false);
  });

  it("garde le parcours, pas ce qui appartient à l'onglet", () => {
    const kept = draftFlowOf(flow);
    expect(kept).toMatchObject({ step: "questions", ideaText: "Découpe d'immeuble", answers: { q1: "Parce que" } });
    expect(kept).not.toHaveProperty("creationId");
    expect(kept).not.toHaveProperty("workspaceId");
    expect(kept).not.toHaveProperty("result");
    expect(draftSignature({ flow: kept, photos: [] })).toBe(draftSignature({ flow: { ...kept }, photos: [] }));
  });

  it("n'écrase jamais une fiche qui porte un contenu écrit", () => {
    expect(ideaAcceptsDraft(null)).toBe(true);
    expect(ideaAcceptsDraft({ [CREER_DRAFT_KEY]: {}, resume: "x" })).toBe(true);
    expect(ideaAcceptsDraft({ slides: [{ text: "Slide" }] })).toBe(false);
    expect(ideaAcceptsDraft({ article: "Actu" }, "actu")).toBe(true);
  });
});

describe("écriture dans Mes idées", () => {
  it("crée une fiche avec le brouillon et ses photos en ligne, puis la met à jour sans doublon", async () => {
    const photo = { id: "p1", name: "Immeuble", base64: `data:image/jpeg;base64,${"A".repeat(200)}` };
    const first = await writeCreerDraft({ userId: "u1", workspaceId: "u1", flowState: flow, photos: [photo], ideaId: null });
    expect(first?.id).toBe("fiche-0");
    const inserted = db.inserts[0];
    expect(inserted).toMatchObject({ titre: "Découpe d'immeuble", format: "carousel", workspace_id: null, source_module: "creer" });
    const draft = creerDraftOf(inserted.content_data)!;
    expect(draft.flow.step).toBe("questions");
    expect(draft.photos[0].url).toMatch(/^https:\/\//);
    expect(inserted.content_data.resume).toContain("questions de cadrage");

    await writeCreerDraft({ userId: "u1", workspaceId: "u1", flowState: { ...flow, answers: { q1: "Autre" } }, photos: [photo], ideaId: first!.id });
    expect(db.inserts).toHaveLength(1);
    expect(creerDraftOf(db.rows.get("fiche-0").content_data)!.flow.answers).toEqual({ q1: "Autre" });
  });

  it("refuse d'écrire dans une fiche de contenu généré", async () => {
    db.rows.set("carrousel", { id: "carrousel", content_data: { slides: [{ text: "Déjà écrit" }] }, format: "carousel" });
    const saved = await writeCreerDraft({ userId: "u1", workspaceId: "u1", flowState: flow, photos: [], ideaId: "carrousel" });
    expect(saved).toBeNull();
    expect(db.updates).toHaveLength(0);
  });

  it("n'écrit rien tant qu'une photo déposée n'est pas relue", async () => {
    const saved = await writeCreerDraft({ userId: "u1", workspaceId: "u1", flowState: flow, photos: [{ id: "p", base64: "", missingLocalPhoto: true }], ideaId: null });
    expect(saved).toBeNull();
    expect(db.inserts).toHaveLength(0);
  });
});

describe("reprise depuis Mes idées", () => {
  const idea = { id: "fiche-1", titre: "Découpe d'immeuble", format: "carousel", canal: "instagram", content_data: { [CREER_DRAFT_KEY]: { version: 1, flow: draftFlowOf(flow), photos: [] }, resume: "Brouillon" } };

  it("rouvre le brouillon à son étape, pas comme un contenu généré", () => {
    expect(resumeIdea(idea as any)).toBeNull();
    const link = ideaCreateLink(idea as any);
    expect(link.to).toBe("/creer");
    expect(link.state).toMatchObject({ ideaId: "fiche-1", resumeDraft: { flow: { step: "questions" } } });
  });

  it("un sujet seulement tapé est remplacé sans fenêtre ; un contenu à la 2e étape passe par la protection", () => {
    const common = { photoCount: 0, aurianaDemoActive: false, isFreshStart: false, paramSujet: "", paramIdeaId: null, paramAuto: false, paramFormat: null, paramCanal: null };
    const locState = { resumeDraft: idea.content_data[CREER_DRAFT_KEY], ideaId: "fiche-1" };
    expect(computeDraftConflict({ ...common, existingFlowState: { step: "idea", ideaText: "Juste tapé" } as any, locState })?.replaceSilently).toBe(true);
    const conflict = computeDraftConflict({ ...common, existingFlowState: { step: "format", ideaText: "Commencé" } as any, locState });
    expect(conflict?.replaceSilently).toBe(false);
    expect(conflict?.resuming).toBe(true);
    // Le même brouillon déjà ouvert dans l'onglet : rien à demander.
    expect(computeDraftConflict({ ...common, existingFlowState: { step: "format", ideaText: "Commencé", editingIdeaId: "fiche-1" } as any, locState })).toBeNull();
  });
});
