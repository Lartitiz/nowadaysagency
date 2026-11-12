// Stories comme le carrousel (12/11/2026) : quel champ de la story on écrit
// quand on touche un texte sur l'aperçu. Mêmes champs que les cases du
// panneau : écrire sur la story ou dans la case revient au même.
import type { StoryInlineField } from "@/components/stories/StoryVisualDirectControls";
import type { StoryTextBox } from "@/components/stories/story-text-hit";

export interface StoryTextSetters {
  narration: string;
  setNarration: (value: string) => void;
  setPill: (field: "title_pill" | "body_pill" | "quote", value: string) => void;
  setListItem: (itemIndex: number, value: string) => void;
}

export function storyInlineField(story: any, box: StoryTextBox, set: StoryTextSetters): StoryInlineField | null {
  const visual = story?.visual || {};
  const n = "sur la story";
  switch (box.role) {
    case "title":
      return { label: `Titre ${n}`, value: String(visual.title_pill ?? ""), onChange: (v) => set.setPill("title_pill", v) };
    case "body":
      // Le corps montre la narration, sauf quand « Texte affiché » a été modifié à part.
      if (visual.body_pill_edited && visual.gabarit !== "citation" && visual.gabarit !== "liste") {
        return { label: `Texte affiché ${n}`, value: String(visual.body_pill ?? ""), onChange: (v) => set.setPill("body_pill", v) };
      }
      return { label: `Texte ${n}`, value: set.narration, onChange: set.setNarration };
    case "quote":
      return { label: "Citation sur la story", value: String(visual.quote ?? ""), onChange: (v) => set.setPill("quote", v) };
    case "attribution":
      return { label: "Petit texte sous la citation, sur la story", value: String(visual.body_pill ?? ""), onChange: (v) => set.setPill("body_pill", v) };
    case "item": {
      const items: string[] = Array.isArray(visual.list_pills) ? visual.list_pills : [];
      // Les éléments vides ne sont pas dessinés : retrouver le bon rang parmi les éléments remplis.
      const filled = items.map((t, i) => (t ? i : -1)).filter((i) => i >= 0);
      const at = filled[box.index];
      if (at === undefined) return null;
      return { label: `Élément ${at + 1} de la liste, sur la story`, value: String(items[at] ?? ""), onChange: (v) => set.setListItem(at, v) };
    }
    default:
      return null;
  }
}
