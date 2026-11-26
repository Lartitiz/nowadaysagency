import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useRef, useState } from "react";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), toBase64: vi.fn(), stockItem: vi.fn() }));
vi.mock("@/lib/invoke-with-timeout", () => ({ invokeWithTimeout: mocks.invoke }));
vi.mock("@/lib/photo-storage", () => ({ userPhotoToBase64: mocks.toBase64 }));
vi.mock("@/lib/stock-photos", () => ({ stockPhotoToPhotoItem: mocks.stockItem }));

import { allImagesReadyMessage, applyPhotoProposals, proposalTargets, sameCarousel, slidePassage, visualsWaitForClick } from "@/lib/carousel-photo-proposals";
import { overlayPositionLabel, usefulDirective } from "@/features/creer/carousel-photo/labels";
import { usePhotoProposals } from "@/hooks/use-photo-proposals";

const waiting = (text: string, extra: Record<string, unknown> = {}) => ({
  slide_type: "photo_full", overlay_text: text, photo_index: null, photo_directive: `Une image qui accompagne ce passage : ${text}`, ...extra,
});
const stock = (id: string) => ({
  id, url: `https://images.pexels.com/photos/${id}/p.jpeg`, thumbnail: `https://images.pexels.com/photos/${id}/m.jpeg`,
  alt: "Old facade", photographer: "Ana", photographer_url: "", source_url: `https://www.pexels.com/photo/${id}/`,
});

describe("images proposées : quelles slides", () => {
  it("seulement les slides photo qui attendent leur image, dans la limite de 10 photos", () => {
    const raw = { slides: [
      waiting("Un"), { ...waiting("Deux"), photo_index: 1 }, waiting("Trois", { library_photo_index: 2 }),
      waiting("Quatre", { news_entity: "Une marque" }), { slide_type: "text_only", title: "Cinq" }, waiting("Six"),
    ] };
    expect(proposalTargets(raw, 0)).toEqual([1, 6]);
    expect(proposalTargets(raw, 9)).toEqual([1]);
    expect(proposalTargets(raw, 10)).toEqual([]);
    // Un carrousel déjà traité n'est jamais redemandé (rechargement de la page compris).
    expect(proposalTargets({ ...raw, photo_proposals: { status: "done" } }, 0)).toEqual([]);
  });
});

describe("images proposées : pose sur le carrousel", () => {
  const raw = { slides: [waiting("Un"), waiting("Deux"), waiting("Trois"), waiting("Quatre")] };
  const resolved = [
    { passage: "Un", ideal: "Une façade d'immeuble ancien", source: "stock" as const, photoIndex: 1, stock: stock("11"), alternates: [stock("13")] },
    { passage: "Deux", ideal: "Le plateau vide avant travaux", source: "library" as const, photoIndex: 2, libraryId: "lib-3", alternates: [] },
    { passage: "Trois", ideal: "Un mètre posé sur un plan", source: null, photoIndex: null, alternates: [] },
    { passage: "Quatre", ideal: null, source: "stock" as const, photoIndex: 3, stock: stock("12"), alternates: [] },
  ];

  it("bibliothèque, photo libre de droit et slide restée à choisir", () => {
    const out = applyPhotoProposals(raw, resolved);
    expect(out.slides[0]).toMatchObject({ photo_index: 1, cast_source: "stock_ambient", photo_directive: "Une façade d'immeuble ancien", stock_credit: { photographer: "Ana" } });
    expect(out.slides[0].stock_alternates).toHaveLength(1);
    expect(out.slides[1]).toMatchObject({ photo_index: 2, cast_source: "library_auto", photo_library_id: "lib-3" });
    // Rien trouvé : toujours à choisir, mais l'image idéale ne recopie plus le texte de la slide.
    expect(out.slides[2].photo_index).toBeNull();
    expect(out.slides[2].photo_directive).toBe("Un mètre posé sur un plan");
    expect(out.slides[3].stock_alternates).toBeUndefined();
    expect(out.photo_proposals).toMatchObject({ status: "done", placed: 3 });
  });

  it("une slide déplacée est retrouvée par son texte ; réécrite ou déjà remplie, elle n'est pas touchée", () => {
    const moved = { slides: [waiting("Deux"), { ...waiting("Un"), photo_index: 7 }, waiting("Trois réécrit"), waiting("Quatre")] };
    const out = applyPhotoProposals(moved, resolved);
    expect(out.slides[0]).toMatchObject({ photo_index: 2, cast_source: "library_auto" });
    expect(out.slides[1].photo_index).toBe(7);
    expect(out.slides[1].cast_source).toBeUndefined();
    expect(out.slides[2].photo_directive).toContain("Trois réécrit");
    expect(out.slides[3].photo_index).toBe(3);
    expect(sameCarousel(moved, ["Un", "Deux"])).toBe(true);
    expect(sameCarousel({ slides: [waiting("Autre carrousel")] }, ["Un", "Deux"])).toBe(false);
    expect(slidePassage({ title: "Titre", body: "Corps" })).toBe("Titre\nCorps");
  });
});

describe("images proposées : les visuels attendent le clic", () => {
  it("dès qu'une image a été posée par l'app, pas de création automatique des visuels", () => {
    const raw = { slides: [waiting("Un"), waiting("Deux")] };
    const stockOnly = applyPhotoProposals(raw, [{ passage: "Un", ideal: null, source: "stock" as const, photoIndex: 1, stock: stock("11"), alternates: [] }]);
    expect(visualsWaitForClick(stockOnly)).toBe(true);
    expect(allImagesReadyMessage(stockOnly)).toMatch(/image proposée.*change celles que tu veux/);
    // Rien de posé (ou carrousel fait avec ses propres photos) : la création automatique reste comme avant.
    const nothing = applyPhotoProposals(raw, [{ passage: "Un", ideal: "Une façade d'immeuble ancien", source: null, photoIndex: null, alternates: [] }]);
    expect(visualsWaitForClick(nothing)).toBe(false);
    expect(visualsWaitForClick({ slides: [{ slide_type: "photo_full", photo_index: 1, cast_source: "stock_ambient" }] })).toBe(false);
    expect(allImagesReadyMessage({ slides: [] })).toBe("Toutes les slides photo ont leur image : tu peux créer les visuels.");
  });
});

describe("libellés de l'écran carrousel photo", () => {
  it("la position du texte s'affiche en français", () => {
    expect(overlayPositionLabel("bottom_left")).toBe("Texte en bas à gauche");
    expect(overlayPositionLabel("bottom left")).toBe("Texte en bas à gauche");
    expect(overlayPositionLabel("center")).toBe("Texte au centre");
    expect(overlayPositionLabel("top-right")).toBe("Texte en haut à droite");
    expect(overlayPositionLabel("diagonal_zigzag")).toBe("Texte posé sur la photo");
    expect(overlayPositionLabel("bottom_left")).not.toMatch(/bottom|left/);
  });
  it("le texte de la slide recopié n'est pas une image idéale", () => {
    expect(usefulDirective("Une image qui accompagne ce passage : La découpe commence")).toBe("");
    expect(usefulDirective("Une photo qui accompagne « La découpe commence »")).toBe("");
    expect(usefulDirective("Un plan d'appartement annoté sur une table")).toBe("Un plan d'appartement annoté sur une table");
  });
});

describe("usePhotoProposals", () => {
  beforeEach(() => {
    mocks.invoke.mockReset(); mocks.toBase64.mockReset(); mocks.stockItem.mockReset();
    mocks.toBase64.mockResolvedValue({ base64: "data:lib", mimeType: "image/jpeg", name: "plateau" });
    mocks.stockItem.mockImplementation(async (p: any) => ({ id: `stock-${p.id}`, base64: `data:${p.id}`, preview: `data:${p.id}`, name: "x.jpg", mimeType: "image/jpeg", context: "" }));
  });

  function setup(initialRaw: any, enabled = true) {
    const saved: any[][] = [];
    const view = renderHook(() => {
      const [result, setResult] = useState<any>({ raw: initialRaw });
      const [photos, setPhotos] = useState<any[]>([]);
      const live = useRef<any[]>(photos);
      live.current = photos;
      const out = usePhotoProposals({
        enabled, result, subject: "La découpe d'immeubles", workspaceId: null,
        libraryRows: [{ id: "lib-1", description: "Plateau vide" } as any],
        uploadedPhotosLiveRef: live, setUploadedPhotos: setPhotos, savePhotos: async (p) => { saved.push(p); }, setResult,
      });
      return { ...out, result, photos, setResult };
    });
    return { view, saved };
  }

  it("pose la photo de bibliothèque et la photo libre de droit, une seule demande", async () => {
    mocks.invoke.mockResolvedValue({ data: { proposals: [
      { slide: 1, ideal: "Une façade d'immeuble ancien", library_index: null, stock: stock("11"), alternates: [stock("13")] },
      { slide: 2, ideal: "Le plateau vide avant travaux", library_index: 1, stock: null, alternates: [] },
      { slide: 3, ideal: "Un mètre posé sur un plan", library_index: null, stock: null, alternates: [] },
    ] }, error: null });
    const { view, saved } = setup({ slides: [waiting("Un"), waiting("Deux"), waiting("Trois")] });
    await waitFor(() => expect(view.result.current.result.raw.photo_proposals?.status).toBe("done"));
    await waitFor(() => expect(view.result.current.searching).toBe(false));
    const body = mocks.invoke.mock.calls[0][1].body;
    expect(mocks.invoke.mock.calls[0][0]).toBe("carousel-photo-proposals");
    expect(body.targets).toEqual([1, 2, 3]);
    expect(body.library).toEqual([{ index: 1, description: "Plateau vide" }]);
    const { slides } = view.result.current.result.raw;
    expect(slides[0]).toMatchObject({ photo_index: 1, cast_source: "stock_ambient" });
    expect(slides[1]).toMatchObject({ photo_index: 2, cast_source: "library_auto" });
    expect(slides[2].photo_index).toBeNull();
    // Posées par l'app : elles ne repartent pas comme « ses » photos à la génération suivante.
    expect(view.result.current.photos.map((p: any) => [p.id, p.stockAmbient])).toEqual([["stock-11", true], ["lib-1", true]]);
    expect(saved).toHaveLength(1);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it("un échec du serveur laisse les slides à choisir, sans redemander en boucle", async () => {
    mocks.invoke.mockResolvedValue({ data: null, error: { message: "indisponible" } });
    const { view, saved } = setup({ slides: [waiting("Un")] });
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(view.result.current.searching).toBe(false));
    expect(view.result.current.result.raw.slides[0].photo_index).toBeNull();
    // Pas marqué « traité » : la demande repartira au prochain chargement de la page.
    expect(view.result.current.result.raw.photo_proposals).toBeUndefined();
    expect(view.result.current.photos).toEqual([]);
    expect(saved).toHaveLength(0);
    await act(async () => { await Promise.resolve(); });
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it("ne demande rien en démo ou pendant une génération", async () => {
    const { view } = setup({ slides: [waiting("Un")] }, false);
    await act(async () => { await Promise.resolve(); });
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(view.result.current.searching).toBe(false);
  });

  it("nouvelle génération pendant la recherche : rien n'est posé sur le nouveau carrousel, qui est demandé à son tour", async () => {
    let release: (v: any) => void = () => {};
    mocks.invoke.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    mocks.invoke.mockResolvedValue({ data: { proposals: [{ slide: 1, ideal: "Une cage d'escalier lumineuse", library_index: null, stock: stock("21"), alternates: [] }] }, error: null });
    const { view } = setup({ slides: [waiting("Un")] });
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    act(() => view.result.current.setResult(() => ({ raw: { slides: [waiting("Tout autre texte")] } })));
    await act(async () => { release({ data: { proposals: [{ slide: 1, ideal: "Une façade d'immeuble ancien", library_index: null, stock: stock("11"), alternates: [] }] }, error: null }); });
    await waitFor(() => expect(view.result.current.result.raw.photo_proposals?.status).toBe("done"));
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(view.result.current.photos.map((p: any) => p.id)).toEqual(["stock-21"]);
    expect(view.result.current.result.raw.slides[0]).toMatchObject({ photo_index: 1, photo_directive: "Une cage d'escalier lumineuse" });
  });
});
