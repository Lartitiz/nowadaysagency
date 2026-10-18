import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor, render, screen } from "@testing-library/react";

// Chantier Y, choix C3 (Laetitia, 18/10/2026) : une retouche faite après la mise
// au calendrier met à jour le calendrier toute seule tant que le contenu n'est
// pas publié, et l'encadré d'enregistrement le dit. useCalendarSave est rendu
// pour de vrai avec le suivi (use-calendar-follow.ts) ; seuls la base, les
// envois de fichiers et l'extraction du texte sont faux.

const m = vi.hoisted(() => ({
  rpc: [] as any[],
  rpcError: [] as any[],
  removed: [] as string[][],
  posts: {} as Record<string, any>,
  ideas: {} as Record<string, any>,
  uploads: 0,
}));

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() }) }));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn(), Link: (p: any) => <a href={p.to}>{p.children}</a> }));
vi.mock("@/hooks/use-flow-persistence", () => ({ clearFlowState: vi.fn(), loadFlowState: () => null, saveFlowState: vi.fn() }));
vi.mock("@/lib/client-error-monitor", () => ({ reportClientError: vi.fn() }));
vi.mock("@/features/creer/build-calendar-content", () => ({
  buildCalendarContent: (_f: string, raw: any) => ({ contentDraft: `SLIDES ${raw?.texte || ""}`, accroche: "Accroche", storyDetail: { type: "carousel", slides: raw?.slides || [] } }),
}));
vi.mock("@/features/creer/upload-helpers", () => ({
  uploadPhotosToStorage: vi.fn(),
  uploadPinterestVisualToStorage: vi.fn(),
  uploadVisualsToStorage: async (_s: any, userId: string, postId: string, slides: any[], _p: any, onUploaded: (p: string) => void) => {
    m.uploads += 1;
    return slides.map((_v, i) => {
      const path = `${userId}/${postId}/slides/v${m.uploads}/slide-${i + 1}.jpg`;
      onUploaded(path);
      return `https://cdn.test/storage/v1/object/public/calendar-visuals/${path}`;
    });
  },
}));
vi.mock("@/integrations/supabase/client", () => {
  const from = (table: string) => {
    let id = "";
    const row = () => (table === "calendar_posts" ? m.posts[id] : m.ideas[id]) ?? null;
    const q: any = {
      select: () => q,
      eq: (_c: string, v: string) => { id = v; return q; },
      maybeSingle: async () => ({ data: row(), error: null }),
      single: async () => ({ data: row(), error: row() ? null : { message: "not found" } }),
    };
    return q;
  };
  return {
    supabase: {
      from,
      rpc: async (_name: string, args: any) => {
        m.rpc.push(args);
        const error = m.rpcError.shift();
        if (error) return { data: null, error };
        const post = m.posts[args.p_post_id];
        post.updated_at = `v${m.rpc.length + 1}`;
        return { data: { id: args.p_post_id, replayed: false, scheduled: false, updated_at: post.updated_at }, error: null };
      },
      storage: { from: () => ({ remove: async (paths: string[]) => { m.removed.push(paths); return { error: null }; } }) },
    },
  };
});

import { useCalendarSave } from "@/hooks/use-calendar-save";
import CarouselSaveStatus from "@/components/creer/CarouselSaveStatus";

const slides = (texte: string) => [{ slide_number: 1, html: `<div>${texte}</div>` }, { slide_number: 2, html: "<div>2</div>" }];

function params(over: Record<string, any> = {}) {
  return {
    session: { user: { id: "u1" } }, result: { raw: { texte: "a", caption: { hook: "Légende" } } }, selectedFormat: "carousel",
    isLinkedInCarousel: false, chosenProposal: null, inspirationAnalysis: null, ideaText: "Sujet", workspaceId: "u1",
    objective: null, editorialAngle: null, savedId: null, carouselSubMode: "text", uploadedPhotos: [], photoMode: false,
    visualSlides: slides("a"), pinterestPinHtml: null, photoBriefOverlayHtml: null, currentBriefId: null, editingIdeaId: null,
    reelMp4Url: null, publishableImageUrl: null, calendarPostId: null, calendarPostDate: null, setPublishDialogOpen: vi.fn(),
    carouselAutosave: { enabled: true, status: "saved" },
    ...over,
  } as any;
}

const oldUrl = "https://cdn.test/storage/v1/object/public/calendar-visuals/u1/post-1/slides/old/slide-1.jpg";

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  m.rpc = []; m.rpcError = []; m.removed = []; m.uploads = 0; m.ideas = {};
  m.posts = { "post-1": { id: "post-1", status: "drafting", publish_status: null, auto_publish: false, scheduled_publish_at: null, canal: "instagram", updated_at: "v1", story_sequence_detail: { visual_urls: [oldUrl], photo_urls: ["p.jpg"] } } };
});
afterEach(() => vi.useRealTimers());

async function retoucher(hook: any, rerender: any, p: any, texte: string) {
  rerender({ ...p, visualSlides: slides(texte), result: { raw: { texte, caption: { hook: "Légende" } } } });
  await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
}

describe("C3 : le calendrier suit les retouches", () => {
  it("ouvert depuis le calendrier : la retouche part au calendrier après la sauvegarde, sans relier l'idée", async () => {
    const p = params({ calendarPostId: "post-1", editingIdeaId: "idee-1" });
    const { result, rerender } = renderHook((props) => useCalendarSave(props), { initialProps: p });
    await waitFor(() => expect(result.current.calendarFollow.status).toBe("following"));
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(m.rpc, "rien n'est envoyé sans retouche").toHaveLength(0);

    await retoucher(result, rerender, p, "b");
    await waitFor(() => expect(result.current.calendarFollow.status).toBe("updated"));
    expect(m.rpc).toHaveLength(1);
    const args = m.rpc[0];
    expect(args).toMatchObject({ p_post_id: "post-1", p_create: false, p_idea_id: null, p_expected_updated_at: "v1" });
    expect(args.p_payload.content_draft).toBe("SLIDES b");
    expect(args.p_payload.story_sequence_detail.visual_html).toEqual(slides("b"));
    expect(args.p_payload.story_sequence_detail.photo_urls, "les photos déjà au calendrier restent").toEqual(["p.jpg"]);
    expect(args.p_payload.media_urls).toEqual(args.p_payload.story_sequence_detail.visual_urls);
    expect(args.p_payload).not.toHaveProperty("auto_publish");
    expect(m.removed, "les anciens visuels sont retirés").toEqual([["u1/post-1/slides/old/slide-1.jpg"]]);

    // Deuxième retouche : la version attendue est celle écrite juste avant.
    await retoucher(result, rerender, p, "c");
    await waitFor(() => expect(m.rpc).toHaveLength(2));
    expect(m.rpc[1].p_expected_updated_at).toBe("v2");
  });

  it("pas d'envoi tant que la sauvegarde continue n'a pas fini", async () => {
    const p = params({ calendarPostId: "post-1", carouselAutosave: { enabled: true, status: "saving" } });
    const { result, rerender } = renderHook((props) => useCalendarSave(props), { initialProps: p });
    await waitFor(() => expect(result.current.calendarFollow.status).toBe("following"));
    await retoucher(result, rerender, p, "b");
    expect(m.rpc).toHaveLength(0);
    expect(result.current.calendarFollow.pending).toBe(true);
  });

  it("fiche de Mes idées déjà mise au calendrier : le calendrier suit aussi", async () => {
    m.ideas["idee-1"] = { calendar_post_id: "post-1" };
    const p = params({ editingIdeaId: "idee-1" });
    const { result, rerender } = renderHook((props) => useCalendarSave(props), { initialProps: p });
    await waitFor(() => expect(result.current.calendarFollow.status).toBe("following"));
    m.posts["post-1"].updated_at = "v1"; // version vue à l'ouverture
    await retoucher(result, rerender, p, "b");
    await waitFor(() => expect(m.rpc).toHaveLength(1));
    expect(m.rpc[0]).toMatchObject({ p_post_id: "post-1", p_expected_updated_at: "v1", p_idea_id: null });
  });

  it("contenu publié : rien ne part, l'encadré le dit", async () => {
    m.posts["post-1"].publish_status = "published";
    const p = params({ calendarPostId: "post-1" });
    const { result, rerender } = renderHook((props) => useCalendarSave(props), { initialProps: p });
    await waitFor(() => expect(result.current.calendarFollow.status).toBe("published"));
    await retoucher(result, rerender, p, "b");
    expect(m.rpc).toHaveLength(0);
  });

  it("modifié ailleurs : pas d'écrasement automatique, « Mettre à jour quand même » écrase en connaissance de cause", async () => {
    m.rpcError.push({ message: "calendar_version_conflict" });
    const p = params({ calendarPostId: "post-1" });
    const { result, rerender } = renderHook((props) => useCalendarSave(props), { initialProps: p });
    await waitFor(() => expect(result.current.calendarFollow.status).toBe("following"));
    await retoucher(result, rerender, p, "b");
    await waitFor(() => expect(result.current.calendarFollow.status).toBe("conflict"));
    expect(m.removed.flat(), "les visuels de l'essai refusé sont retirés").toContain("u1/post-1/slides/v1/slide-1.jpg");
    await retoucher(result, rerender, p, "c");
    expect(m.rpc, "pas de nouvel essai tout seul").toHaveLength(1);
    m.posts["post-1"].updated_at = "v-ailleurs";
    await act(async () => { result.current.calendarFollow.retry(true); });
    await waitFor(() => expect(result.current.calendarFollow.status).toBe("updated"));
    expect(m.rpc[1].p_expected_updated_at).toBe("v-ailleurs");
  });

  it("contenu programmé : reste programmé à la même heure, avec la légende publiable", async () => {
    Object.assign(m.posts["post-1"], { auto_publish: true, publish_status: "scheduled", scheduled_publish_at: "2026-11-01T09:00:00Z" });
    const p = params({ calendarPostId: "post-1" });
    const { result, rerender } = renderHook((props) => useCalendarSave(props), { initialProps: p });
    await waitFor(() => expect(result.current.calendarFollow.status).toBe("following"));
    await retoucher(result, rerender, p, "b");
    await waitFor(() => expect(m.rpc).toHaveLength(1));
    expect(m.rpc[0].p_payload).toMatchObject({ auto_publish: true, scheduled_publish_at: "2026-11-01T09:00:00Z", content_draft: "Légende" });
  });

  it("contenu pas encore au calendrier : rien ne change", async () => {
    const p = params({ editingIdeaId: "idee-libre" });
    const { result, rerender } = renderHook((props) => useCalendarSave(props), { initialProps: p });
    await retoucher(result, rerender, p, "b");
    expect(result.current.calendarFollow.status).toBe("off");
    expect(m.rpc).toHaveLength(0);
  });
});

describe("encadré d'enregistrement", () => {
  const save = { enabled: true, status: "saved", history: [], flush: vi.fn(), restore: vi.fn(), saveCopy: vi.fn() } as never;
  const follow = (over: any) => ({ status: "off", pending: false, retry: vi.fn(), markSynced: vi.fn(), ...over }) as never;
  it.each([
    [{ status: "following" }, "Ce contenu est dans ton calendrier : tes retouches y iront toutes seules."],
    [{ status: "updated" }, "Mis à jour dans ton calendrier"],
    [{ status: "following", pending: true }, "Mise à jour de ton calendrier…"],
    [{ status: "published" }, /Déjà publié/],
  ])("%o", (state, text) => {
    render(<CarouselSaveStatus save={save} calendar={follow(state)} />);
    expect(screen.getByTestId("calendar-follow-status")).toHaveTextContent(text as any);
  });
  it("rien quand le contenu n'est pas au calendrier", () => {
    render(<CarouselSaveStatus save={save} calendar={follow({ status: "off" })} />);
    expect(screen.queryByTestId("calendar-follow-status")).not.toBeInTheDocument();
  });
});
