// Cartes de « Mes idées » : l'extrait montré sur une vignette sans visuel et la
// date écrite sous la carte. Sorti de IdeasPage.tsx (fichier à taille gelée).
import { format as fnsFormat } from "date-fns";
import { fr } from "date-fns/locale";

export interface IdeaPreviewInput {
  content_data?: any | null;
  preview_data?: unknown;
  content_draft?: string | null;
  draft_head?: string | null;
  accroche_short: string | null;
}

function cleanSlideMarkers(text: string): string {
  return text
    .replace(/^SLIDE\s+\d+\s*(?:\[[^\]]*\])?\s*[:\-–]?\s*/gim, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getIdeaPreview(idea: IdeaPreviewInput): { title?: string; text?: string } {
  // Liste légère : l'extrait calculé par la base remplace le contenu complet.
  let data: any = idea.content_data !== undefined ? idea.content_data : idea.preview_data;
  const draft = idea.content_draft ?? idea.draft_head;
  // Contenu enregistré en texte JSON (parfois encodé deux fois, ou coupé par
  // l'extrait de la base) : jamais montré tel quel dans la liste (QA du 12/11/2026).
  const rawJson = typeof data === "string" ? data : typeof draft === "string" && draft.trim().startsWith("{") ? draft : "";
  for (let i = 0; i < 2 && typeof data === "string"; i++) {
    try { data = JSON.parse(data); } catch { data = null; }
  }
  if (data && typeof data === "object") {
    if (typeof data.edited_text === "string") return { text: cleanSlideMarkers(data.edited_text) };
    const title = typeof data.chosen_angle?.title === "string" && data.chosen_angle.title.trim()
      ? data.chosen_angle.title.trim()
      : undefined;
    const firstSlide = Array.isArray(data.slides) ? data.slides[0] : null;
    const firstStory = Array.isArray(data.stories) ? data.stories[0] : null;
    const scriptHook = Array.isArray(data.script)
      ? data.script.find((s: any) => s?.section === "hook")?.texte_parle
      : undefined;
    const rawText =
      (typeof data.chosen_angle?.description === "string" && data.chosen_angle.description.trim()) ||
      (firstSlide && (firstSlide.hook || firstSlide.text || firstSlide.titre || firstSlide.title || firstSlide.body || firstSlide.caption || firstSlide.overlay_text)) ||
      (firstStory && (firstStory.text || firstStory.texte || firstStory.hook || firstStory.overlay_text || firstStory.titre)) ||
      scriptHook ||
      (typeof data.hook === "object" ? data.hook?.texte_parle : data.hook) ||
      (typeof data.caption === "object" ? (data.caption?.hook || data.caption?.body || data.caption?.text) : data.caption) ||
      data.body ||
      data.content ||
      data.resume ||
      undefined;
    const cleanText = typeof rawText === "string" && rawText.trim() && !rawText.trim().startsWith("{") ? cleanSlideMarkers(rawText) : undefined;
    if (title || cleanText) return { title, text: cleanText };
  }
  const short = idea.accroche_short?.trim();
  if (short && !short.startsWith("{")) return { text: short };
  if (draft?.trim() && !draft.trim().startsWith("{")) return { text: cleanSlideMarkers(draft) };
  // JSON coupé : on garde au moins le titre de l'angle s'il est lisible.
  const cutTitle = rawJson.match(/"title"\s*:\s*"((?:[^"\\]|\\.){3,200})"/)?.[1];
  if (cutTitle) return { title: cutTitle.replace(/\\"/g, '"') };
  return {};
}

/** Date d'une carte : « aujourd’hui », « hier », « 25 nov. » (avec l'année si ce n'est pas celle en cours). */
export function activityDateLabel(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  if (diff === 0) return "aujourd’hui";
  if (diff === 1) return "hier";
  return fnsFormat(d, d.getFullYear() === now.getFullYear() ? "d MMM" : "d MMM yyyy", { locale: fr });
}

