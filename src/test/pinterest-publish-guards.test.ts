import { describe, expect, it } from "vitest";
import {
  canPublishToPinterest,
  defaultPinterestBoardId,
  extractPinterestText,
  pinterestDestinationLink,
  pinterestPublishDisabledReason,
  REASON_EPINGLE_IMAGE_MANQUANTE,
  REASON_EPINGLE_TABLEAU,
  REASON_EPINGLE_TEXTE,
} from "@/features/creer/pinterest-publish-guards";
import { checkScheduleGuards } from "@/features/creer/publish-guards";

// Publication d'épingles depuis /creer (09/11/2026).
describe("publication Pinterest : règles", () => {
  it("accès d'essai : réservée aux admins, et aux seuls formats Pinterest", () => {
    expect(canPublishToPinterest({ selectedFormat: "pinterest_visual", isAdmin: false, forAll: false })).toBe(false);
    expect(canPublishToPinterest({ selectedFormat: "pinterest_visual", isAdmin: true, forAll: false })).toBe(true);
    expect(canPublishToPinterest({ selectedFormat: "pinterest", isAdmin: false, forAll: true })).toBe(true);
    expect(canPublishToPinterest({ selectedFormat: "post", isAdmin: true, forAll: true })).toBe(false);
    expect(canPublishToPinterest({ selectedFormat: null, isAdmin: true, forAll: true })).toBe(false);
  });

  it("texte : titre et description de l'épingle visuelle, édition libre prioritaire, texte libre en repli", () => {
    expect(extractPinterestText({ title: "T", description: "D" })).toEqual({ title: "T", description: "D" });
    expect(extractPinterestText({ title: "T", description: "D", edited_text: "📌 TITRE :\nNouveau\n📝 DESCRIPTION :\nAutre" }))
      .toEqual({ title: "Nouveau", description: "Autre" });
    expect(extractPinterestText({ content: "Une épingle texte" })).toEqual({ title: "", description: "Une épingle texte" });
  });

  it("lien : premier lien http(s) valide, sinon aucun", () => {
    expect(pinterestDestinationLink(undefined, "pas un lien", " https://exemple.fr/page ")).toBe("https://exemple.fr/page");
    expect(pinterestDestinationLink("exemple.fr", "")).toBeUndefined();
  });

  it("tableau pré-choisi : celui nommé à l'étape format, sinon le seul tableau", () => {
    const boards = [{ id: "1", name: "Recettes" }, { id: "2", name: "Déco" }];
    expect(defaultPinterestBoardId(boards, " déco ")).toBe("2");
    expect(defaultPinterestBoardId(boards, "Inconnu")).toBeNull();
    expect(defaultPinterestBoardId([{ id: "9", name: "Seul" }], null)).toBe("9");
  });

  it("raisons de blocage, dans l'ordre : texte, image, tableau", () => {
    const base = { raw: { title: "T", description: "D" }, hasPinHtml: false, publishableImageUrl: null, boardId: null };
    expect(pinterestPublishDisabledReason({ ...base, raw: {} })).toBe(REASON_EPINGLE_TEXTE);
    expect(pinterestPublishDisabledReason(base)).toBe(REASON_EPINGLE_IMAGE_MANQUANTE);
    expect(pinterestPublishDisabledReason({ ...base, hasPinHtml: true })).toBe(REASON_EPINGLE_TABLEAU);
    // Compte pas encore connecté : pas de blocage « tableau », la fenêtre propose de connecter.
    expect(pinterestPublishDisabledReason({ ...base, hasPinHtml: true, checkBoard: false })).toBeNull();
    expect(pinterestPublishDisabledReason({ ...base, publishableImageUrl: "https://x/img.png", boardId: "1" })).toBeNull();
  });

  it("programmer une épingle reste bloqué (le cron ne publie pas sur Pinterest)", () => {
    const res = checkScheduleGuards({ publishChannel: "pinterest", isChannelConnected: true, input: "2099-01-01T09:00" });
    expect(res.blocked).toBe(true);
  });
});
