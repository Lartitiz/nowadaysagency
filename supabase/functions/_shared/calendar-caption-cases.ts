// Cas de référence de la légende publiée depuis le calendrier, partagés par les
// tests Deno (calendar-caption_test.ts) et vitest (src/test/calendar-caption.test.ts).

const CAROUSEL_CAPTION = { hook: "Accroche", body: "Le corps de la légende.", cta: "Dis-moi en commentaire.", hashtags: ["ceramique", "#atelier"] };
const SLIDES_TEXT = "Slide titre 1\nCorps de la slide 1\n\nSlide titre 2\nCorps de la slide 2";
// Format exact écrit par src/features/creer/build-calendar-content.ts.
const SEP = "\n\n───── SLIDES ─────\n\n";

export interface CalendarCaptionCase {
  name: string;
  draft: string | null;
  detail: any;
  expected: string;
}

export const CALENDAR_CAPTION_CASES: CalendarCaptionCase[] = [
  {
    name: "séparateur SLIDES + légende : seule la légende part (hashtags ajoutés)",
    draft: `Accroche\nLe corps de la légende.\nDis-moi en commentaire.${SEP}${SLIDES_TEXT}`,
    detail: { type: "carousel", carousel_type: "tips", caption: CAROUSEL_CAPTION, slides: [] },
    expected: "Accroche\nLe corps de la légende.\nDis-moi en commentaire.\n\n#ceramique #atelier",
  },
  {
    name: "séparateur SLIDES + légende retouchée à la main : la retouche prime",
    draft: `Ma légende réécrite par moi.${SEP}${SLIDES_TEXT}`,
    detail: { type: "carousel", caption: CAROUSEL_CAPTION },
    expected: "Ma légende réécrite par moi.\n\n#ceramique #atelier",
  },
  {
    name: "séparateur SLIDES + légende contenant déjà des hashtags : pas de doublon",
    draft: `Ma légende.\n\n#maison #fait${SEP}${SLIDES_TEXT}`,
    detail: { type: "carousel", caption: CAROUSEL_CAPTION },
    expected: "Ma légende.\n\n#maison #fait",
  },
  {
    name: "séparateur SLIDES sans hashtags structurés : légende seule",
    draft: `Ma légende.${SEP}${SLIDES_TEXT}`,
    detail: { type: "carousel", caption: { hook: "H", body: "B" } },
    expected: "Ma légende.",
  },
  {
    name: "séparateur SLIDES + légende vide : retombe sur la légende structurée",
    draft: `───── SLIDES ─────\n\n${SLIDES_TEXT}`,
    detail: { type: "carousel", caption: CAROUSEL_CAPTION },
    expected: "Accroche\n\nLe corps de la légende.\n\nDis-moi en commentaire.\n\n#ceramique #atelier",
  },
  {
    name: "séparateur SLIDES + légende vide + aucune légende structurée : rien (pas les slides)",
    draft: `\n\n───── SLIDES ─────\n\n${SLIDES_TEXT}`,
    detail: { type: "carousel", caption: null },
    expected: "",
  },
  {
    name: "carrousel recyclé (slides puis « Légende ») : seule la légende part",
    draft: `Slide 1 · Titre\nCorps\n\nSlide 2 · Titre 2\nCorps 2\n\n──────────\nLégende\n\nAccroche\n\nCorps de légende`,
    detail: { type: "carousel", caption: { hook: "Accroche", body: "Corps de légende", cta: "" } },
    expected: "Accroche\n\nCorps de légende",
  },
  {
    name: "dump « SLIDE n : » (photo) : légende structurée, comportement inchangé",
    draft: "SLIDE 1: Texte visuel\nSLIDE 2: (photo seule)\n\nAccroche\nLe corps de la légende.",
    detail: { type: "carousel_photo", caption: CAROUSEL_CAPTION },
    expected: "Accroche\n\nLe corps de la légende.\n\nDis-moi en commentaire.\n\n#ceramique #atelier",
  },
  {
    name: "dump « SLIDE n [📝] : » (mix) : légende structurée, plus le dump",
    draft: "SLIDE 1 [📝]: Titre — Corps\nSLIDE 2 [📸]: (photo seule)\nSLIDE 3 [📷+📝]: T — C\n\nAccroche",
    detail: { type: "carousel_mix", caption: "Voici la vraie légende." },
    expected: "Voici la vraie légende.",
  },
  {
    name: "légende éditée à la main sans séparateur : publiée telle quelle",
    draft: "  Une légende écrite à la main.\n\n#perso  ",
    detail: { type: "carousel", caption: CAROUSEL_CAPTION },
    expected: "Une légende écrite à la main.\n\n#perso",
  },
  {
    name: "post simple sans détail : texte tel quel",
    draft: "Un texte de post LinkedIn prêt à publier.",
    detail: null,
    expected: "Un texte de post LinkedIn prêt à publier.",
  },
  {
    name: "brouillon vide : légende structurée",
    draft: "",
    detail: { type: "carousel", caption: CAROUSEL_CAPTION },
    expected: "Accroche\n\nLe corps de la légende.\n\nDis-moi en commentaire.\n\n#ceramique #atelier",
  },
  {
    name: "reel : règle reel inchangée (script remplacé par la légende)",
    draft: "[0-3] HOOK\nMon texte",
    detail: { type: "reel", script: [{ section: "hook", timing: "0-3", texte_parle: "Mon texte" }], caption: { text: "Caption", cta: "CTA" }, hashtags: ["#tag"] },
    expected: "Caption\n\nCTA\n\n#tag",
  },
  {
    name: "reel : légende éditée à la main conservée",
    draft: "Ma légende de reel",
    detail: { type: "reel", script: [{ section: "hook", timing: "0-3", texte_parle: "Mon texte" }], caption: { text: "Caption" } },
    expected: "Ma légende de reel",
  },
];
