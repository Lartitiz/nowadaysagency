import { describe, it, expect } from "vitest";
import { buildStoryFrameHtml, storyVisualOrFallback, withStoryVisualFallback } from "@/lib/story-visual";
import {
  finalizeStoriesLayout,
  storyWords,
  stripStoriesWriterLayout,
} from "../../supabase/functions/_shared/story-formatting";

// ═══ GARDE-FOU DE NON-RÉGRESSION : séquence STORIES de référence (04/10/2026) ═══
// Même esprit que « NON-RÉGRESSION photo » des carrousels : une séquence de
// référence passe par TOUTES les gardes de production dans l'ordre réel
// (retrait de la mise en page écrite → [correction du texte] → mise en forme
// par le code → photo d'abord → bibliothèque), puis par le rendu. Si UN
// élément de design ou UN mot du texte disparaît, ce test échoue.

const branding = {
  color_primary: "#A9542F",
  color_secondary: "#97A683",
  color_background: "#F3ECDF",
  color_text: "#4A3F35",
};
const PHOTO = "https://example.com/photo.jpg";

/** Sortie d'écriture de référence. Elle contient encore des champs de mise en
 * page (comme un modèle qui désobéirait) : ils doivent être ignorés. */
function referenceWriterOutput() {
  return {
    stories: [
      {
        number: 1, role: "Hook", format: "photo", face_cam: false,
        text: "Ce matin, le four s'est ouvert sur une fournée entière de bols craquelés. Je vous raconte ce que j'ai compris.",
        visual: { gabarit: "fond_pills", background: "fond_couleur", title_pill: "Ce matin au four", body_pill: "Un résumé qui n'est pas le texte", photo_directive: "les bols craquelés sur l'étagère", photo_query_en: "cracked ceramic bowls", photo_index: 1 },
      },
      {
        number: 2, role: "Liste", format: "photo", face_cam: false,
        text: "Ce que je vérifie avant chaque cuisson : la température ; le temps de séchage ; l'épaisseur des fonds.",
        visual: { gabarit: "photo_pills", list_pills: ["Un item réécrit"], photo_directive: "le thermomètre du four", photo_query_en: "kiln thermometer" },
      },
      {
        number: 3, role: "Preuve", format: "photo", face_cam: false,
        text: "Une cliente m'a écrit hier : « vos bols imparfaits sont mes préférés ». Ça m'a fait relativiser.",
        visual: { gabarit: "citation", quote: "une citation inventée", body_pill: "Marion", photo_directive: "un bol dans des mains", photo_query_en: "hands holding bowl" },
      },
      {
        number: 4, role: "Face cam", format: "face_cam", face_cam: true,
        text: "Je vous montre en vrai la différence entre un fond trop fin et un fond juste.",
        visual: null,
      },
      {
        number: 5, role: "Interaction", format: "photo", face_cam: false,
        text: "Et vous, vous gardez vos pièces ratées ou vous les cassez ?",
        sticker: { type: "sondage", label: "Sondage", options: ["Je garde", "Je casse"], placement: "bas" },
        visual: { title_pill: "Petit sondage", photo_directive: "une pile de bols ratés", photo_query_en: "imperfect pottery" },
      },
      {
        number: 6, role: "Fin", format: "texte_fond", face_cam: false,
        text: "Demain je rallume le four, avec des fonds plus épais. Je vous montre le résultat.",
      },
    ],
  };
}

const htmlText = (h: string) =>
  h.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<link[^>]*>/g, " ").replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

function runProductionPipeline() {
  const parsed: any = referenceWriterOutput();
  stripStoriesWriterLayout(parsed); // avant la correction du texte
  // (la passe de correction ne touche que `text` : sans violation, elle ne tourne pas)
  finalizeStoriesLayout(parsed, {
    storiesPhotoCatalog: [{ index: 1, id: "uuid-bols", description: "bols craquelés", preferred: true }],
  });
  return parsed;
}

describe("NON-RÉGRESSION stories : séquence de référence après les gardes de production", () => {
  it("chaque élément de design attendu est présent et aucun mot du texte ne disparaît", () => {
    const parsed = runProductionPipeline();
    const stories = parsed.stories;

    // Plan visuel : un par story non face cam, posé par le code.
    expect(stories.map((s: any) => s.visual?.gabarit ?? null)).toEqual([
      "photo_pills", "liste", "citation", null, "interaction", "photo_pills",
    ]);
    // Rien de ce que la rédaction avait inventé comme mise en page ne survit.
    const all = JSON.stringify(stories);
    for (const invented of ["Un résumé qui n'est pas le texte", "Un item réécrit", "une citation inventée", "fond_couleur", "\"placement\""]) {
      expect(all).not.toContain(invented);
    }
    // Photo de la bibliothèque résolue, consignes de photo gardées.
    expect(stories[0].visual.photo_id).toBe("uuid-bols");
    expect(stories[1].visual.photo_directive).toBe("le thermomètre du four");
    // Badge cohérent : une story à fond photo ne s'annonce plus « texte ».
    expect(stories[5].format).toBe("photo");

    stories.forEach((s: any, i: number) => {
      const html = buildStoryFrameHtml(s, branding, { photoUrl: PHOTO, preview: false });
      if (s.face_cam) {
        expect(html, `story ${i + 1} face cam`).toBeNull();
        return;
      }
      expect(html, `story ${i + 1} sans image`).toBeTruthy();
      // Fond photo sur TOUTES les stories non face cam.
      expect(html!, `story ${i + 1} : photo perdue`).toContain("data-story-photo");
      // Chaque mot du texte, dans l'ordre.
      const rendered = storyWords(htmlText(html!)).join(" ");
      expect(rendered, `story ${i + 1} : mot perdu`).toContain(storyWords(s.text).join(" "));
    });

    const html = stories.map((s: any) => buildStoryFrameHtml(s, branding, { photoUrl: PHOTO, preview: false }) || "");
    // Liste : titre + 3 items, extraits exacts.
    expect(html[1]).toContain('data-story-pptx="title"');
    expect(html[1].match(/data-story-pptx="item"/g)).toHaveLength(3);
    for (const it of stories[1].visual.list_pills) expect(stories[1].text).toContain(it);
    expect(stories[1].text).toContain(stories[1].visual.title_pill);
    // Citation : verbatim mis en avant, extrait exact.
    expect(html[2]).toContain('data-story-pptx="quote"');
    expect(html[2]).toContain("« vos bols imparfaits sont mes préférés »");
    expect(stories[2].text).toContain(stories[2].visual.quote);
    // Interaction : zone du sticker réservée.
    expect(html[4]).toContain("data-story-sticker-zone");
    // Petit titre écrit par la rédaction : affiché tel quel, là où il a été écrit.
    expect(stories[0].visual.title_pill).toBe("Ce matin au four");
    expect(html[0]).toContain('data-story-pptx="title"');
    expect(html[0]).toContain(">Ce matin au four</span>");
    expect(html[4]).toContain(">Petit sondage</span>");
    // Aucun titre ajouté là où la rédaction n'en a pas écrit.
    for (const i of [2, 5]) expect(html[i]).not.toContain('data-story-pptx="title"');
  });

  it("une story avec petit titre s'affiche exactement comme avant la séparation", () => {
    const text = "Ce matin, le four s'est ouvert sur une fournée entière de bols craquelés.";
    // Avant : la rédaction écrivait tout le plan visuel.
    const before = { text, format: "photo", visual: { gabarit: "photo_pills", background: "photo", title_pill: "Ce matin au four", body_pill: text, list_pills: null, quote: null } };
    // Maintenant : la rédaction écrit le texte et le titre, le code pose le reste.
    const parsed: any = { stories: [{ text, format: "photo", visual: { title_pill: "Ce matin au four" } }] };
    stripStoriesWriterLayout(parsed);
    finalizeStoriesLayout(parsed, { storiesPhotoCatalog: [] });
    for (const preview of [true, false]) {
      expect(buildStoryFrameHtml(parsed.stories[0], branding, { photoUrl: PHOTO, preview }))
        .toBe(buildStoryFrameHtml(before, branding, { photoUrl: PHOTO, preview }));
    }
  });
});

describe("repli front : une story sans plan visuel garde une image", () => {
  it("story avec texte et sans visuel → photo_pills avec le texte complet (aperçu et export)", () => {
    const story = { text: "Une ancienne story sauvegardée sans plan visuel, mais avec son texte." };
    expect(storyVisualOrFallback(story)).toMatchObject({ gabarit: "photo_pills", background: "photo" });
    for (const preview of [true, false]) {
      const html = buildStoryFrameHtml(story, branding, { photoUrl: PHOTO, preview });
      expect(html).toBeTruthy();
      expect(html!).toContain("data-story-photo");
      expect(storyWords(htmlText(html!)).join(" ")).toContain(storyWords(story.text).join(" "));
    }
    // Sans photo attachée : l'aperçu invite à en ajouter une.
    expect(buildStoryFrameHtml(story, branding, { preview: true })).toContain("ajoute une photo pour ce fond");
  });

  it("story sans visuel avec sticker → interaction ; face cam ou vidéo → toujours aucune image", () => {
    expect(storyVisualOrFallback({ text: "Vous en pensez quoi ?", sticker: { type: "question" } })?.gabarit).toBe("interaction");
    expect(storyVisualOrFallback({ text: "Paroles", face_cam: true })).toBeNull();
    expect(storyVisualOrFallback({ text: "Paroles", format: "face_cam" })).toBeNull();
    expect(storyVisualOrFallback({ text: "" })).toBeNull();
  });

  it("une story qui a déjà un plan visuel est rendue exactement comme avant", () => {
    const visual = { gabarit: "liste", background: "photo", title_pill: "Mes 3 règles", list_pills: ["Peser", "Couper"] };
    const story = { text: "Texte libre", visual };
    expect(storyVisualOrFallback(story)).toBe(visual);
    expect(withStoryVisualFallback(story)).toBe(story);
  });
});
