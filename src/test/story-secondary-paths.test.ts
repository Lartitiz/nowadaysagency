import { describe, it, expect } from "vitest";
import { buildStoryFrameHtml } from "@/lib/story-visual";
import { recycledStoriesText } from "@/lib/recycle-result";
import {
  adoptStructuredStories,
  coerceStoriesSequence,
  finalizeStoriesLayout,
  storyWords,
  stripStoriesWriterLayout,
} from "../../supabase/functions/_shared/story-formatting";

// ═══ NON-RÉGRESSION stories des chemins secondaires (mode photo, recyclage) ═══
// 04/10/2026 : ces deux chemins écrivaient une prose « texte + indication
// visuelle » affichée telle quelle. Ils sortent désormais une séquence
// structurée qui suit les gardes du flux principal. Ici, la sortie passe par
// ces gardes dans l'ordre de production PUIS par le rendu : chaque story non
// face cam a une image avec fond photo, et chaque mot de son texte est rendu.

const branding = { color_primary: "#A9542F", color_secondary: "#97A683", color_background: "#F3ECDF", color_text: "#4A3F35" };
const PHOTO = "data:image/jpeg;base64,AAAA"; // la photo fournie par l'utilisatrice
const htmlText = (h: string) =>
  h.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<link[^>]*>/g, " ").replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&#39;/g, "'");

const visionResponse = () => ({
  accroche: "Ce bol a failli finir à la poubelle",
  content: "1. Zoom sur la fissure. Texte : Ce bol a failli finir à la poubelle.",
  stories: [
    { number: 1, text: "Ce bol a failli finir à la poubelle. Regardez la fissure, juste là, sur le bord.", sticker: null, visual: { title_pill: null, photo_directive: "zoom sur la fissure", gabarit: "fond_pills", background: "fond_couleur" }, face_cam: false },
    { number: 2, text: "Ce que je regarde avant de jeter : la profondeur ; la longueur ; l'endroit.", visual: { photo_directive: "crop sur mes mains" } },
    { number: 3, text: "Une cliente m'a dit « c'est celui-là que je veux, avec sa cicatrice » et je l'ai gardé.", visual: { photo_directive: "le bol entier" } },
    { number: 4, text: "Et vous, vous gardez les pièces imparfaites ?", sticker: { type: "sondage", label: "Sondage", options: ["Je garde", "Je jette"] }, visual: { title_pill: "Petit sondage", photo_directive: "la photo entière" } },
  ],
});

const recycledResponse = () => ({
  stories: [
    { number: 1, text: "J'ai longtemps cru qu'un bol fissuré était un bol raté. Ma newsletter de la semaine m'a fait changer d'avis.", visual: { title_pill: null, photo_directive: "le bol fissuré", photo_query_en: "cracked bowl", body_pill: "Résumé inventé" } },
    { number: 2, text: "Ce que je regarde : la profondeur ; la longueur ; l'endroit de la fissure.", visual: { photo_directive: "mes mains", photo_query_en: "hands pottery" } },
    { number: 3, text: "Je vous le dis en vrai, face caméra.", face_cam: true, visual: null },
    { number: 4, text: "Vous gardez vos pièces imparfaites, vous ?", sticker: { type: "sondage", label: "Sondage", options: ["Oui", "Non"] }, visual: { photo_directive: "une étagère", photo_query_en: "ceramics shelf" } },
  ],
});

function expectRenderedWithEveryWord(stories: any[]) {
  stories.forEach((s, i) => {
    for (const preview of [true, false]) {
      const html = buildStoryFrameHtml(s, branding, { photoUrl: PHOTO, preview });
      if (s.face_cam) {
        expect(html, `story ${i + 1} face cam`).toBeNull();
        continue;
      }
      expect(html, `story ${i + 1} sans image`).toBeTruthy();
      expect(html!, `story ${i + 1} : photo perdue`).toContain("data-story-photo");
      expect(storyWords(htmlText(html!)).join(" "), `story ${i + 1} : mot perdu`).toContain(storyWords(s.text).join(" "));
    }
  });
}

describe("NON-RÉGRESSION stories des chemins secondaires", () => {
  it("mode photo : séquence adoptée, mise en forme par le code, rendue avec la photo fournie, aucun mot perdu", () => {
    const parsed: any = visionResponse();
    expect(adoptStructuredStories(parsed)).toBe(true);
    stripStoriesWriterLayout(parsed);
    finalizeStoriesLayout(parsed, { storiesPhotoCatalog: [] });
    expect(parsed.content).toBeUndefined();
    expect(parsed.stories.map((s: any) => s.visual.gabarit)).toEqual(["photo_pills", "liste", "citation", "interaction"]);
    expectRenderedWithEveryWord(parsed.stories);
    // Extraits exacts.
    for (const it of parsed.stories[1].visual.list_pills) expect(parsed.stories[1].text).toContain(it);
    expect(parsed.stories[2].text).toContain(parsed.stories[2].visual.quote);
  });

  it("recyclage : séquence structurée rendue en vraies stories ; le texte copié ne contient que ce qui se lit", () => {
    const seq: any = coerceStoriesSequence(recycledResponse());
    stripStoriesWriterLayout(seq);
    finalizeStoriesLayout(seq, { storiesPhotoCatalog: [] });
    expectRenderedWithEveryWord(seq.stories);
    expect(JSON.stringify(seq.stories)).not.toContain("Résumé inventé");
    const copied = recycledStoriesText(seq);
    for (const s of seq.stories) expect(copied).toContain(s.text);
    for (const directive of ["le bol fissuré", "mes mains", "une étagère"]) expect(copied).not.toContain(directive);
  });
});
