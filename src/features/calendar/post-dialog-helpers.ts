// Petites fonctions pures de la fenêtre d'un post du calendrier, sorties de
// src/components/calendar/CalendarPostDialog.tsx à l'identique (fiche 13 de
// docs/robustesse/gros-fichiers.md, lot 1). Aucun appel, aucun état.
import { ANGLES } from "@/lib/calendar-constants";

/** ISO → valeur d'un <input type="datetime-local"> (heure locale, "YYYY-MM-DDTHH:mm"). */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Angle éditorial (libellé) → type de carrousel envoyé à /creer (`carousel_type`). */
export const ANGLE_TO_CAROUSEL: Record<string, string> = {
  "Storytelling": "storytelling", "Mythe à déconstruire": "mythe_realite",
  "Coup de gueule": "prise_de_position", "Enquête / décryptage": "prise_de_position",
  "Conseil contre-intuitif": "tips", "Test grandeur nature": "etude_de_cas",
  "Before / After": "before_after", "Histoire cliente": "etude_de_cas",
  "Regard philosophique": "prise_de_position", "Surf sur l'actu": "prise_de_position",
};

/** Réseau → emoji et libellé de l'en-tête de contexte. */
export const CANAL_META: Record<string, { emoji: string; label: string }> = {
  instagram: { emoji: "📸", label: "Instagram" },
  linkedin: { emoji: "💼", label: "LinkedIn" },
  pinterest: { emoji: "📌", label: "Pinterest" },
  newsletter: { emoji: "✉️", label: "Newsletter" },
};

// Libellé d'angle lisible : certains vieux posts stockent un id brut (« storytelling_pro »).
export const ANGLE_ID_LABELS: Record<string, string> = {
  storytelling: "Storytelling", storytelling_pro: "Storytelling",
  mythe_realite: "Mythe à déconstruire", prise_de_position: "Prise de position",
  tips: "Conseil", etude_de_cas: "Étude de cas", before_after: "Before / After",
  epingle_conseil: "Épingle conseil", epingle_produit: "Épingle produit",
  epingle_inspiration: "Épingle inspiration", epingle_article: "Épingle article",
};

/** Libellé d'angle lisible (libellé connu, id brut connu, ou id mis en forme). */
export function angleLabelOf(angle: string | null): string | null {
  return angle
    ? (ANGLES.includes(angle) ? angle : (ANGLE_ID_LABELS[angle] || (angle.charAt(0).toUpperCase() + angle.slice(1).replace(/_/g, " "))))
    : null;
}

/** Brouillon affiché à l'ouverture : content_draft > full_content > texte des stories > texte parlé du script reel. */
export function draftFromPost(editingPost: any): string | null {
  const ssd = editingPost.story_sequence_detail as any;
  return (editingPost as any).content_draft
    || ssd?.full_content
    || (ssd?.stories ? ssd.stories.map((s: any) => `${s.text || ""}`).join("\n\n") : null)
    || (ssd?.script ? ssd.script.map((s: any) => s.texte_parle || "").join("\n\n") : null)
    || null;
}
