import { describe, it, expect } from "vitest";
import { buildStoryFrameHtml, buildStoryFrames } from "@/lib/story-visual";

const branding = {
  color_primary: "#A9542F",
  color_secondary: "#97A683",
  color_background: "#F3ECDF",
  color_text: "#4A3F35",
};

describe("buildStoryFrameHtml", () => {
  it("retourne null pour une story face cam", () => {
    const html = buildStoryFrameHtml(
      { face_cam: true, visual: { gabarit: "fond_pills", title_pill: "Titre" } },
      branding,
    );
    expect(html).toBeNull();
  });

  it("retourne null sans plan visuel (anciens contenus générés)", () => {
    expect(buildStoryFrameHtml({} as any, branding)).toBeNull();
    expect(buildStoryFrameHtml({ visual: null }, branding)).toBeNull();
  });

  it("rend un fond_pills avec les couleurs de la charte", () => {
    const html = buildStoryFrameHtml(
      { visual: { gabarit: "fond_pills", background: "fond_couleur", title_pill: "Marché des créatrices", body_pill: "samedi 12 juillet, stand 24" } },
      branding,
    )!;
    expect(html).toContain("#A9542F");
    expect(html).toContain("#F3ECDF");
    expect(html).toContain("Marché des créatrices");
    expect(html).toContain("box-decoration-break:clone");
    expect(html).toContain("1080px");
    expect(html).toContain("1920px");
  });

  it("échappe le HTML des textes", () => {
    const html = buildStoryFrameHtml(
      { visual: { gabarit: "fond_pills", title_pill: "<script>alert(1)</script>" } },
      branding,
    )!;
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("interaction : zone sticker visible en aperçu, invisible à l'export (même encombrement)", () => {
    const story = {
      visual: { gabarit: "interaction", background: "fond_couleur", title_pill: "Petit sondage" },
      sticker: { type: "sondage", options: ["Vert sauge", "Terracotta"] },
    };
    const preview = buildStoryFrameHtml(story, branding, { preview: true })!;
    const exported = buildStoryFrameHtml(story, branding, { preview: false })!;
    expect(preview).toContain("data-story-sticker-zone");
    expect(preview).toContain("Vert sauge");
    expect(preview).toContain("à poser dans Instagram");
    expect(preview).not.toContain("visibility:hidden");
    expect(exported).toContain("visibility:hidden");
  });

  it("photo : utilise la photo attachée en fond, sinon retombe sur le fond couleur", () => {
    const story = {
      visual: { gabarit: "photo_pills", background: "photo", title_pill: "Les coulisses", photo_directive: "ton plan de travail" },
    };
    const withPhoto = buildStoryFrameHtml(story, branding, { photoUrl: "https://x.test/p.jpg" })!;
    expect(withPhoto).toContain("background-image:url('https://x.test/p.jpg')");
    const withoutPhoto = buildStoryFrameHtml(story, branding, {})!;
    expect(withoutPhoto).not.toContain("background-image");
    expect(withoutPhoto).toContain("background:#F3ECDF");
    expect(withoutPhoto).toContain("ton plan de travail");
  });

  it("citation : rend le verbatim en italique avec guillemets", () => {
    const html = buildStoryFrameHtml(
      { visual: { gabarit: "citation", quote: "le bol est encore plus beau en vrai", body_pill: "reçu en DM" } },
      branding,
    )!;
    expect(html).toContain("« le bol est encore plus beau en vrai »");
    expect(html).toContain("font-style:italic");
    expect(html).toContain("reçu en DM");
  });

  it("liste : rend jusqu'à 4 items", () => {
    const html = buildStoryFrameHtml(
      { visual: { gabarit: "liste", title_pill: "3 gestes", list_pills: ["un", "deux", "trois", "quatre", "cinq"] } },
      branding,
    )!;
    expect(html).toContain("un");
    expect(html).toContain("quatre");
    expect(html).not.toContain("cinq");
  });

  it("tolère une charte absente (couleurs par défaut)", () => {
    const html = buildStoryFrameHtml(
      { visual: { gabarit: "fond_pills", title_pill: "Titre" } },
      null,
    )!;
    expect(html).toContain("#FB3D80");
  });
});

describe("buildStoryFrames", () => {
  it("numérote les frames et laisse null les stories sans visuel", () => {
    const frames = buildStoryFrames(
      [
        { visual: { gabarit: "fond_pills", title_pill: "A" } },
        { face_cam: true, visual: { gabarit: "fond_pills", title_pill: "B" } },
        { visual: { gabarit: "fond_pills", title_pill: "C" } },
      ],
      branding,
    );
    expect(frames).toHaveLength(3);
    expect(frames[0]?.story_number).toBe(1);
    expect(frames[1]).toBeNull();
    expect(frames[2]?.story_number).toBe(3);
  });
});
