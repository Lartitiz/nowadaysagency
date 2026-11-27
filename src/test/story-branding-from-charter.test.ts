import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { storyBrandingFromCharter } from "@/lib/story-visual";

/* Une seule lecture de la charte pour dessiner une story (27/11/2026).
   Avant, le tri « charte → réglages du dessin » était recopié à quatre
   endroits (atelier, export, calendrier, Mes idées) : un réglage oublié à un
   endroit aurait donné un aperçu différent de l'image exportée. */

const SRC = join(__dirname, "..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "test" && name !== "node_modules") sourceFiles(full, out);
    } else if (/\.tsx?$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("storyBrandingFromCharter", () => {
  it("garde les couleurs et les quatre réglages « Stories » de la charte", () => {
    expect(
      storyBrandingFromCharter({
        color_primary: "#112233", color_secondary: "#445566", color_background: "#ffffff", color_text: "#000000",
        story_assemblage: "C", story_pill_color: "ink", story_corners: "droits", story_align: "gauche",
        font_title: "Autre chose", id: "x",
      }),
    ).toEqual({
      color_primary: "#112233", color_secondary: "#445566", color_background: "#ffffff", color_text: "#000000",
      story_assemblage: "C", story_pill_color: "ink", story_corners: "droits", story_align: "gauche",
    });
  });

  it("charte d'avant les réglages « Stories » : réglages à null, pas undefined", () => {
    expect(storyBrandingFromCharter({ color_primary: "#112233" })).toMatchObject({
      story_assemblage: null, story_pill_color: null, story_corners: null, story_align: null,
    });
  });

  it("pas de charte : null", () => {
    expect(storyBrandingFromCharter(null)).toBeNull();
    expect(storyBrandingFromCharter(undefined)).toBeNull();
  });

  it("lit chaque réglage déclaré dans StoryStyleSettings (story-styles.ts)", () => {
    const declared = [...read("lib/story-styles.ts").split("export interface StoryStyleSettings")[1].split("}")[0].matchAll(/(story_\w+)\?:/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThanOrEqual(4);
    const got = Object.keys(storyBrandingFromCharter({})!);
    for (const key of declared) expect(got, `réglage ${key} oublié dans storyBrandingFromCharter`).toContain(key);
  });

  it("personne d'autre ne refait ce tri à la main", () => {
    // Écrans de la charte elle-même : ils montrent des réglages pas encore enregistrés.
    const allowed = ["lib/story-visual.ts", "lib/story-styles.ts", "components/branding/charter/CharterStoriesSection.tsx", "pages/BrandCharterPage.tsx", "integrations/supabase/types.ts"];
    const copies = sourceFiles(SRC)
      .map((f) => f.slice(SRC.length + 1))
      .filter((f) => !allowed.includes(f) && /story_pill_color\s*:/.test(read(f)));
    expect(copies, "passe par storyBrandingFromCharter (src/lib/story-visual.ts) au lieu de recopier les réglages").toEqual([]);
  });
});
