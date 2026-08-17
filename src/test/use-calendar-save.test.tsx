import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Sauvegarde calendrier : handleConfirmCalendar (nouveau post, programmation
// optionnelle) et handleSaveBackToCalendar (post existant). Le point le plus
// sensible : quand on PROGRAMME, le cron publie content_draft TEL QUEL — le
// brouillon « déroulé slides » doit être remplacé par la légende publiable,
// et Instagram exige un média joint (sinon on pose un brouillon, pas une
// programmation). publish-guards est utilisé en VRAI (logique pure déjà
// testée) ; supabase, uploads et buildCalendarContent sont mockés.

const mocks = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
  navigate: vi.fn(),
  clearFlowState: vi.fn(),
  buildCalendarContent: vi.fn(),
  uploadPhotos: vi.fn(),
  uploadVisuals: vi.fn(),
  uploadPinterestVisual: vi.fn(),
  db: {
    ops: [] as any[],
    insertResponse: { data: { id: "post-1" }, error: null } as any,
    schedError: null as any,
  },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("react-router-dom", () => ({ useNavigate: () => mocks.navigate }));
vi.mock("@/hooks/use-flow-persistence", () => ({ clearFlowState: mocks.clearFlowState }));
vi.mock("@/features/creer/build-calendar-content", () => ({
  buildCalendarContent: mocks.buildCalendarContent,
}));
vi.mock("@/features/creer/upload-helpers", () => ({
  uploadPhotosToStorage: mocks.uploadPhotos,
  uploadVisualsToStorage: mocks.uploadVisuals,
  uploadPinterestVisualToStorage: mocks.uploadPinterestVisual,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      insert: (row: any) => {
        mocks.db.ops.push({ table, type: "insert", row });
        return { select: () => ({ single: async () => mocks.db.insertResponse }) };
      },
      update: (row: any) => ({
        eq: async (col: string, val: any) => {
          mocks.db.ops.push({ table, type: "update", row, eq: [col, val] });
          if (row.auto_publish !== undefined && mocks.db.schedError) {
            return { error: mocks.db.schedError };
          }
          return { error: null };
        },
      }),
    }),
  },
}));

import { useCalendarSave } from "@/hooks/use-calendar-save";

function makeParams(overrides: Record<string, any> = {}) {
  return {
    session: { user: { id: "u1" } },
    result: { raw: { content: "Ma légende publiable" } },
    selectedFormat: "post",
    isLinkedInCarousel: false,
    chosenProposal: null,
    inspirationAnalysis: null,
    ideaText: "Mon idée",
    workspaceId: "u1",
    objective: "visibilite",
    editorialAngle: "storytelling",
    savedId: null,
    carouselSubMode: null,
    uploadedPhotos: [],
    photoMode: false,
    visualSlides: [],
    pinterestPinHtml: null,
    photoBriefOverlayHtml: null,
    currentBriefId: null,
    reelMp4Url: null,
    publishableImageUrl: null,
    calendarPostId: null,
    calendarPostDate: null,
    setPublishDialogOpen: vi.fn(),
    persistCarousel: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

const inserts = () => mocks.db.ops.filter((o) => o.type === "insert");
const updates = () => mocks.db.ops.filter((o) => o.type === "update");
const schedUpdates = () => updates().filter((o) => o.row.auto_publish !== undefined);

describe("useCalendarSave — handleConfirmCalendar (nouveau post)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.ops = [];
    mocks.db.insertResponse = { data: { id: "post-1" }, error: null };
    mocks.db.schedError = null;
    mocks.buildCalendarContent.mockReturnValue({
      contentDraft: "DÉROULÉ SLIDE 1 : …",
      accroche: "Mon accroche",
      storyDetail: null,
    });
    mocks.uploadPhotos.mockResolvedValue([]);
    mocks.uploadVisuals.mockResolvedValue([]);
    mocks.uploadPinterestVisual.mockResolvedValue([]);
  });

  it("gardes : pas de session ou pas de date → false, rien en base", async () => {
    const p1 = makeParams({ session: null });
    const { result: r1 } = renderHook(() => useCalendarSave(p1));
    await act(async () => {
      expect(await r1.current.handleConfirmCalendar({ date: "2026-08-20" })).toBe(false);
    });

    const p2 = makeParams();
    const { result: r2 } = renderHook(() => useCalendarSave(p2));
    await act(async () => {
      expect(await r2.current.handleConfirmCalendar({ date: "" })).toBe(false);
    });

    expect(mocks.db.ops).toHaveLength(0);
  });

  it("brouillon simple → insert complet, toast, navigation vers le post créé", async () => {
    const params = makeParams();
    const { result } = renderHook(() => useCalendarSave(params));
    let scheduled: boolean | undefined;
    await act(async () => {
      scheduled = await result.current.handleConfirmCalendar({ date: "2026-08-20" });
    });

    expect(scheduled).toBe(false);
    expect(inserts()).toHaveLength(1);
    const row = inserts()[0].row;
    expect(inserts()[0].table).toBe("calendar_posts");
    expect(row).toMatchObject({
      user_id: "u1",
      date: "2026-08-20",
      theme: "Mon idée",
      status: "drafting",
      canal: "instagram",
      format: "post",
      objectif: "visibilite",
      angle: "storytelling",
      content_draft: "DÉROULÉ SLIDE 1 : …",
      accroche: "Mon accroche",
    });
    // workspace perso → pas de workspace_id
    expect(row.workspace_id).toBeUndefined();
    expect(schedUpdates()).toHaveLength(0);
    expect(mocks.toast.success).toHaveBeenCalledWith("Ajouté au calendrier !");
    expect(params.setPublishDialogOpen).toHaveBeenCalledWith(false);
    expect(mocks.clearFlowState).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith("/calendrier?date=2026-08-20&post=post-1");
  });

  it("programmation Instagram SANS média → brouillon posé mais PAS programmé (warning)", async () => {
    const params = makeParams();
    const { result } = renderHook(() => useCalendarSave(params));
    let scheduled: boolean | undefined;
    await act(async () => {
      scheduled = await result.current.handleConfirmCalendar({
        date: "2026-08-20",
        scheduleAt: new Date("2026-08-20T10:00:00Z"),
      });
    });

    expect(scheduled).toBe(false);
    // Le cron publie content_draft tel quel → c'est la légende publiable qui
    // est insérée, pas le déroulé « SLIDE 1 : … » du brouillon éditorial.
    expect(inserts()[0].row.content_draft).toBe("Ma légende publiable");
    expect(schedUpdates()).toHaveLength(0);
    expect(mocks.toast.warning).toHaveBeenCalledTimes(1);
    expect(mocks.toast.warning.mock.calls[0][0]).toContain("pas programmé");
  });

  it("programmation Instagram avec image publiable → media_urls posé puis auto_publish", async () => {
    const params = makeParams({ publishableImageUrl: "https://img.example/photo.jpg" });
    const { result } = renderHook(() => useCalendarSave(params));
    let scheduled: boolean | undefined;
    const when = new Date("2026-08-20T10:00:00Z");
    await act(async () => {
      scheduled = await result.current.handleConfirmCalendar({ date: "2026-08-20", scheduleAt: when });
    });

    expect(scheduled).toBe(true);
    const mediaUpdate = updates().find((o) => o.row.media_urls);
    expect(mediaUpdate?.row.media_urls).toEqual(["https://img.example/photo.jpg"]);
    expect(mediaUpdate?.eq).toEqual(["id", "post-1"]);
    expect(schedUpdates()).toHaveLength(1);
    expect(schedUpdates()[0].row).toMatchObject({
      auto_publish: true,
      publish_status: "scheduled",
      scheduled_publish_at: when.toISOString(),
    });
    expect(mocks.toast.success).toHaveBeenCalledWith("Publication programmée ! 🗓️", expect.anything());
  });

  it("programmation LinkedIn → pas de média requis, programmée directement", async () => {
    const params = makeParams({ isLinkedInCarousel: true, selectedFormat: "carousel" });
    const { result } = renderHook(() => useCalendarSave(params));
    let scheduled: boolean | undefined;
    await act(async () => {
      scheduled = await result.current.handleConfirmCalendar({
        date: "2026-08-20",
        scheduleAt: new Date("2026-08-20T10:00:00Z"),
      });
    });

    expect(scheduled).toBe(true);
    expect(inserts()[0].row.canal).toBe("linkedin");
    expect(inserts()[0].row.content_draft).toBe("Ma légende publiable");
    expect(schedUpdates()).toHaveLength(1);
    expect(mocks.toast.warning).not.toHaveBeenCalled();
  });

  it("reel monté → la vidéo devient le média du post (avant tout visuel de repli)", async () => {
    const params = makeParams({
      selectedFormat: "reel",
      reelMp4Url: "https://cdn.example/reel.mp4",
      publishableImageUrl: "https://img.example/fallback.jpg",
    });
    const { result } = renderHook(() => useCalendarSave(params));
    let scheduled: boolean | undefined;
    await act(async () => {
      scheduled = await result.current.handleConfirmCalendar({
        date: "2026-08-20",
        scheduleAt: new Date("2026-08-20T10:00:00Z"),
      });
    });

    expect(scheduled).toBe(true);
    const mediaUpdates = updates().filter((o) => o.row.media_urls);
    expect(mediaUpdates).toHaveLength(1);
    expect(mediaUpdates[0].row.media_urls).toEqual(["https://cdn.example/reel.mp4"]);
  });

  it("échec de la pose d'auto-publication → warning, retourne false", async () => {
    mocks.db.schedError = { message: "RLS" };
    const params = makeParams({ publishableImageUrl: "https://img.example/p.jpg" });
    const { result } = renderHook(() => useCalendarSave(params));
    let scheduled: boolean | undefined;
    await act(async () => {
      scheduled = await result.current.handleConfirmCalendar({
        date: "2026-08-20",
        scheduleAt: new Date("2026-08-20T10:00:00Z"),
      });
    });

    expect(scheduled).toBe(false);
    expect(mocks.toast.warning).toHaveBeenCalledTimes(1);
    expect(mocks.toast.warning.mock.calls[0][0]).toContain("programmation a échoué");
  });

  it("insert en erreur → toast d'erreur, false, pas de navigation", async () => {
    mocks.db.insertResponse = { data: null, error: { message: "insert KO" } };
    const params = makeParams();
    const { result } = renderHook(() => useCalendarSave(params));
    let scheduled: boolean | undefined;
    await act(async () => {
      scheduled = await result.current.handleConfirmCalendar({ date: "2026-08-20" });
    });

    expect(scheduled).toBe(false);
    expect(mocks.toast.error).toHaveBeenCalledWith("insert KO");
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(mocks.clearFlowState).not.toHaveBeenCalled();
  });
});

describe("useCalendarSave — handleSaveBackToCalendar (post existant)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.ops = [];
    mocks.db.insertResponse = { data: { id: "post-1" }, error: null };
    mocks.db.schedError = null;
    mocks.buildCalendarContent.mockReturnValue({
      contentDraft: "DÉROULÉ SLIDE 1 : …",
      accroche: "Mon accroche",
      storyDetail: null,
    });
    mocks.uploadPhotos.mockResolvedValue([]);
    mocks.uploadVisuals.mockResolvedValue([]);
    mocks.uploadPinterestVisual.mockResolvedValue([]);
  });

  it("garde : pas de calendarPostId → rien en base", async () => {
    const params = makeParams({ calendarPostId: null });
    const { result } = renderHook(() => useCalendarSave(params));
    await act(() => result.current.handleSaveBackToCalendar());
    expect(mocks.db.ops).toHaveLength(0);
  });

  it("met à jour le post d'origine puis renvoie vers lui dans le calendrier", async () => {
    const params = makeParams({ calendarPostId: "cal-9", calendarPostDate: "2026-08-22" });
    const { result } = renderHook(() => useCalendarSave(params));
    await act(() => result.current.handleSaveBackToCalendar());

    expect(inserts()).toHaveLength(0);
    const upd = updates()[0];
    expect(upd.table).toBe("calendar_posts");
    expect(upd.eq).toEqual(["id", "cal-9"]);
    expect(upd.row).toMatchObject({
      content_draft: "DÉROULÉ SLIDE 1 : …",
      accroche: "Mon accroche",
      status: "drafting",
      format: "post",
    });
    expect(params.persistCarousel).not.toHaveBeenCalled();
    expect(mocks.toast.success).toHaveBeenCalledWith("Contenu sauvegardé dans ton calendrier !");
    expect(mocks.clearFlowState).toHaveBeenCalledTimes(1);
    expect(mocks.navigate).toHaveBeenCalledWith("/calendrier?date=2026-08-22&post=cal-9");
  });

  it("carrousel jamais persisté → persistCarousel appelé avant la sauvegarde", async () => {
    const params = makeParams({
      calendarPostId: "cal-9",
      selectedFormat: "carousel",
      savedId: null,
      result: { raw: { slides: [{ slide_number: 1 }], content: "x" } },
    });
    const { result } = renderHook(() => useCalendarSave(params));
    await act(() => result.current.handleSaveBackToCalendar());
    expect(params.persistCarousel).toHaveBeenCalledTimes(1);
  });

  it("upload des visuels en échec → le texte reste sauvegardé, warning et navigation quand même", async () => {
    mocks.uploadVisuals.mockRejectedValue(new Error("storage KO"));
    const params = makeParams({
      calendarPostId: "cal-9",
      calendarPostDate: "2026-08-22",
      visualSlides: [{ slide_number: 1, html: "<div/>" }],
    });
    const { result } = renderHook(() => useCalendarSave(params));
    await act(() => result.current.handleSaveBackToCalendar());

    expect(mocks.toast.warning).toHaveBeenCalledTimes(1);
    expect(mocks.toast.warning.mock.calls[0][0]).toContain("l'upload des visuels a échoué");
    expect(mocks.toast.success).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith("/calendrier?date=2026-08-22&post=cal-9");
  });
});
