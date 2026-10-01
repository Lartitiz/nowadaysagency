import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { TextEncoder } from "node:util";
import { applyStudioPhoto, buildSlideBrief, persistStudioPhoto, readTicket, recoverStudioPhotos, saveTicket, slideFingerprint, type CarouselStudioTicket } from "@/features/carousel-studio/bridge";
import { documentOutput, readCarouselDocument, getEditorElements, replacePhoto } from "@/lib/carousel-editor";
import type { DraftStore } from "@/lib/carousel-autosave";
beforeAll(() => { vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("TextEncoder", TextEncoder); });
beforeEach(() => localStorage.clear());
const image = "data:image/png;base64,aGVsbG8=";
async function fixture() {
  const doc = readCarouselDocument({ slides: [
    { slide_number: 1, role: "hook", title: "Titre source obsolète", photo_index: 1, photo_directive: "Ancienne directive hors sujet" },
    { slide_number: 2, body: "Suite du récit", photo_index: 1 },
  ], caption: { body: "Légende originale", hashtags: ["atelier"] } }, [
    { slide_number: 1, html: '<div style="position:relative;width:1080px;height:1350px"><img data-pptx-photo="1" src="https://example.test/original.jpg"><p>Texte final corrigé à la main</p></div>' },
    { slide_number: 2, html: '<div><img data-pptx-photo="1" src="https://example.test/original.jpg"><p>Suite du récit</p></div>' },
  ]);
  const raw = documentOutput(doc, { provenance: { keep: true } }).raw;
  const first = { ...doc.slides[0], data: raw.slides[0], html: raw.visual_html[0].html };
  const ticket: CarouselStudioTicket = { id: "ticket", userId: "user", workspaceId: "A", sessionId: "studio", ideaId: "idea", documentId: raw._carousel_document_id,
    slideId: first.id, slideNumber: 1, photoCount: 4, fingerprint: await slideFingerprint(first), createdAt: Date.now() };
  return { raw, doc, ticket };
}
describe("carousel Studio round trip", () => {
  it("prepares the final visible text, sequence, role and space, never the obsolete directive", async () => {
    const { doc } = await fixture();
    const brief = buildSlideBrief(doc.slides[0], doc.slides);
    expect(brief).toContain("Texte final corrigé à la main");
    expect(brief).toContain("Suite du récit");
    expect(brief).toContain("Accroche");
    expect(brief).toContain("4:5");
    expect(brief).toContain("ne pas le dessiner");
    expect(brief).not.toContain("Ancienne directive");
    expect(brief).not.toContain("Titre source obsolète");
  });
  it("persists a scoped reload link and rejects another workspace/account or expiry", async () => {
    const { ticket } = await fixture(); saveTicket(ticket);
    expect(readTicket("ticket", "user", "A")).toEqual(ticket);
    expect(readTicket("ticket", "user", "B")).toBeNull();
    expect(readTicket("ticket", "other", "A")).toBeNull();
    saveTicket({ ...ticket, createdAt: 0 });
    expect(readTicket("ticket", "user", "A")).toBeNull();
  });
  it("replaces one existing photo, preserves text, other slides and caption, allocates a separate slot", async () => {
    const { raw, ticket } = await fixture();
    const next = await applyStudioPhoto(raw, ticket, image, "photo-new", "v1");
    expect(next.slides[1]).toBe(raw.slides[1]);
    expect(next.visual_html[1]).toBe(raw.visual_html[1]);
    expect(next.caption).toBe(raw.caption);
    expect(next.provenance).toBe(raw.provenance);
    expect(next.visual_html[0].html).toContain(image);
    expect(next.slides[0].photo_index).toBe(5);
    expect(getEditorElements(next.visual_html[0].html).filter(e => e.kind === "text").map(e => e.text)).toEqual(["Texte final corrigé à la main"]);
    const restored = recoverStudioPhotos(next, []);
    expect(restored[4].userPhotoId).toBe("photo-new");
    expect(restored[4].base64).toBe(image);
    expect(restored[0].preview).toBe("https://example.test/original.jpg");
  });
  it("allows changes to other slides but refuses a changed, deleted, locked or regenerated target", async () => {
    const { raw, ticket } = await fixture();
    const other = { ...raw, slides: [raw.slides[0], { ...raw.slides[1], body: "Nouvelle suite" }] };
    expect((await applyStudioPhoto(other, ticket, image, "p", "v")).slides[1].body).toBe("Nouvelle suite");
    for (const edited of [
      { ...raw, slides: [{ ...raw.slides[0], body: "Nouvelle cible" }, raw.slides[1]] },
      { ...raw, slides: [{ ...raw.slides[0], editor_locked: true }, raw.slides[1]] },
      { ...raw, slides: [raw.slides[1]] },
      { ...raw, _carousel_document_id: "new" },
    ]) await expect(applyStudioPhoto(edited, ticket, image, "p", "v")).rejects.toThrow();
  });
  it("records a durable receipt and history; retry after reload does not duplicate the replacement", async () => {
    const { raw, ticket } = await fixture();
    let row = { id: "idea", updated_at: "one", content_data: raw };
    const store: DraftStore = { read: vi.fn(async () => row), insert: vi.fn(), update: vi.fn(async (_id, timestamp, data) => {
      expect(timestamp).toBe(row.updated_at);
      row = { id: "idea", updated_at: "two", content_data: data as any }; return row;
    }) };
    const saved = await persistStudioPhoto(store, ticket, image, "p", "v");
    expect(saved._carousel_cloud.history[0].raw.visual_html).toEqual(raw.visual_html);
    await persistStudioPhoto(store, ticket, image, "p", "v");
    expect(store.update).toHaveBeenCalledTimes(1);
  });
  it("recognizes a lost save response and refuses a competing write without changing it", async () => {
    const { raw, ticket } = await fixture();
    let row: any = { id: "idea", updated_at: "one", content_data: raw };
    const store: DraftStore = { read: vi.fn(async () => row), insert: vi.fn(), update: vi.fn(async (_id, _timestamp, data) => {
      row = { ...row, updated_at: "two", content_data: data }; throw new Error("response lost");
    }) };
    expect((await persistStudioPhoto(store, ticket, image, "p", "v")).slides[0].studio_image_receipt.version_id).toBe("v");
    row = { id: "idea", updated_at: "one", content_data: raw };
    store.update = vi.fn(async () => { row = { ...row, updated_at: "other", content_data: { ...raw, external: true } }; return null; });
    await expect(persistStudioPhoto(store, ticket, image, "p", "v")).rejects.toThrow("version plus récente");
    expect(row.content_data.external).toBe(true);
    expect(row.content_data.visual_html).toEqual(raw.visual_html);
  });
});


it("supports an uncomposed slide and clears its Studio provenance on a later manual photo change", async () => {
  const { raw, ticket } = await fixture();
  const legacy = { ...raw, carousel_editor_version: undefined, visual_html: undefined };
  const legacyTicket = { ...ticket, fingerprint: await slideFingerprint({id:ticket.slideId, data:legacy.slides[0],html:"",locked:false}) };
  const next = await applyStudioPhoto(legacy, legacyTicket, image, "photo", "version");
  expect(next.slides[0].studio_image_source).toBe(image);
  expect(recoverStudioPhotos(next, [])[4].base64).toBe(image);
  expect(next.visual_html).toBeUndefined();
  const modern = await applyStudioPhoto(raw, ticket, image, "photo", "version");
  const replaced = replacePhoto({id:ticket.slideId,data:modern.slides[0],html:modern.visual_html[0].html},null,"data:image/png;base64,bmV3",6);
  expect(replaced.data.studio_image_receipt).toBeUndefined();
  expect(replaced.data.photo_library_id).toBeUndefined();
});
