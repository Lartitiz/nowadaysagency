import { describe, it, expect } from "vitest";
import { buildStoryFrameHtml, buildStoryFrames, bodyScale } from "@/lib/story-visual";

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
    expect(html).toContain('data-story-pptx="quote"');
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

describe("assemblages et pastilles façon native", () => {
  const story = {
    visual: { gabarit: "photo_pills", background: "photo", title_pill: "Bon, je vous montre un truc", body_pill: "Là je tourne la série de bols pour le marché de samedi." },
  };

  it("B par défaut : titre Strong sur pastille couleur, texte Classic sur pastille blanche, centré au milieu", () => {
    const html = buildStoryFrameHtml(story, branding, { photoUrl: "https://x.test/p.jpg" })!;
    expect(html).toContain("font-family:'Oswald'");
    expect(html).toContain("font-family:'Inter'");
    expect(html).toContain('data-story-mode="col"');
    expect(html).toContain('data-story-mode="wh"');
    expect(html).not.toContain('data-story-mode="nu"');
    expect(html).not.toContain("text-shadow");
    expect(html).toContain("justify-content:center");
    expect(html).not.toContain("justify-content:flex-end");
    expect(html).toContain("text-align:center");
  });

  it("géométrie calibrée : une boîte par ligne, interligne serré, coins courts", () => {
    const html = buildStoryFrameHtml(story, branding, { photoUrl: "https://x.test/p.jpg" })!;
    expect(html).toContain("box-decoration-break:clone");
    expect(html).toContain("line-height:1.24");
    expect(html).toContain("padding:0.09em 0.42em");
    expect(html).toContain("border-radius:0.26em");
  });

  it("tous les assemblages : chaque bloc est une pastille, sur photo comme sur fond couleur", () => {
    for (const key of ["B", "C"]) {
      for (const opts of [{ photoUrl: "https://x.test/p.jpg" }, {}]) {
        const html = buildStoryFrameHtml(story, { ...branding, story_assemblage: key }, opts)!;
        expect(html, key).not.toContain('data-story-mode="nu"');
        expect(html, key).not.toContain("text-shadow");
      }
    }
  });

  it("réglages de la charte : assemblage B, pastilles encre, coins droits, alignement gauche", () => {
    const html = buildStoryFrameHtml(story, { ...branding, story_assemblage: "B", story_pill_color: "ink", story_corners: "droits", story_align: "gauche" }, { photoUrl: "https://x.test/p.jpg" })!;
    expect(html).toContain("font-family:'Oswald'");
    expect(html).toContain("text-transform:uppercase");
    expect(html).toContain("background:#4A3F35");
    expect(html).toContain("border-radius:0.05em");
    expect(html).toContain("text-align:left");
  });

  it("alignement : centré par défaut même sur un pavé ; « auto » passe à gauche au-delà de 2 lignes", () => {
    const pave = { visual: { gabarit: "fond_pills", title_pill: "T", body_pill: "Pendant longtemps je faisais sécher trop vite, et forcément, résultat : des fissures partout, sur toutes mes pièces, même celles du marché." } };
    expect(buildStoryFrameHtml(pave, branding)!).toContain("text-align:center");
    expect(buildStoryFrameHtml(pave, { ...branding, story_align: "auto" })!).toContain("text-align:left");
    const short = buildStoryFrameHtml({ visual: { gabarit: "fond_pills", title_pill: "T", body_pill: "Deux mots." } }, { ...branding, story_align: "auto" })!;
    expect(short).toContain("text-align:center");
  });

  it("liste : items toujours en pastille et à gauche, jamais nus", () => {
    const html = buildStoryFrameHtml({ visual: { gabarit: "liste", background: "photo", title_pill: "3 gestes", list_pills: ["un", "deux"] } }, branding, { photoUrl: "https://x.test/p.jpg" })!;
    expect(html.match(/data-story-pptx="item"/g)).toHaveLength(2);
    expect(html).not.toContain('data-story-pptx="item" data-story-mode="nu"');
  });
});

describe("texte long dans la pastille", () => {
  it("le corps se réduit par paliers quand le texte s'allonge, jamais sous 70 %", () => {
    expect(bodyScale("Deux mots.")).toBe(1);
    expect(bodyScale("a".repeat(180))).toBe(0.88);
    expect(bodyScale("a".repeat(250))).toBe(0.78);
    expect(bodyScale("a".repeat(340))).toBe(0.7);
  });

  it("un texte de 4 phrases est rendu entier, en corps réduit", () => {
    const long = "Pendant longtemps je faisais sécher trop vite. Résultat : des fissures partout, sur toutes mes pièces. J'ai fini par comprendre que c'était l'air du four. Depuis, je laisse une nuit de plus, et plus rien ne casse.";
    const html = buildStoryFrameHtml({ visual: { gabarit: "photo_pills", background: "photo", body_pill: long } }, branding, { photoUrl: "https://x.test/p.jpg" })!;
    expect(html).toContain("plus rien ne casse.");
    expect(bodyScale(long)).toBeLessThan(1);
    expect(html).toContain(`font-size:${Math.round(52 * bodyScale(long))}px`);
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
