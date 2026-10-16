import { newsletterCopyText } from "@/lib/newsletter-copy";

/**
 * Texte brut à copier depuis l'écran du résultat de /creer, selon le format.
 * Sorti de CreerStepResult (chantier C, 15/10/2026) sans changer le résultat.
 * Le nettoyage par canal (LinkedIn : pas de markdown) reste à l'appelant
 * (`copyTextForChannel`).
 *
 * `reelStepKey` : pour un reel, « Copier » suit l'ÉTAPE affichée. Sans ça, à
 * l'étape « Légende » on copiait le script alors qu'un bouton « Copier » juste
 * au-dessus copiait la caption : deux boutons du même nom, deux résultats.
 */
export function resultCopyText(format: string, result: any, reelStepKey?: string | null): string {
  if (format === "newsletter") return newsletterCopyText(result);
  if (typeof result?.edited_text === "string" && format !== "reel") return result.edited_text;
  if (format === "pinterest_photo" && result?.title) {
    const b = result.photo_brief;
    const briefText = b ? `\n\n📷 CONSIGNES PHOTO :\n• Sujet : ${b.what}\n• Cadrage : ${b.framing}\n• Lumière : ${b.lighting}\n• Accessoires : ${(b.props || []).join(", ")}\n• Ambiance : ${b.mood}` : "";
    return `📌 ${result.title}\n\n${result.description || ""}${briefText}`;
  }
  if (format === "reel" && (result?.sections || result?.script)) {
    if (reelStepKey === "caption") {
      const c = result?.caption && typeof result.caption === "object" ? result.caption : null;
      const tags = Array.isArray(result?.hashtags) ? result.hashtags.filter((h: unknown) => typeof h === "string") : [];
      const captionText = [c?.text, c?.cta, tags.length ? tags.join(" ") : null].filter(Boolean).join("\n\n");
      if (captionText) return captionText;
    }
    if (reelStepKey === "tournage" && Array.isArray(result?.plan_tournage) && result.plan_tournage.length > 0) {
      const shots = result.plan_tournage
        .map((s: any, i: number) => {
          const type = s?.type === "face_cam" ? "Face cam" : s?.type === "insert" ? "Insert" : "B-roll";
          return [`${i + 1}. [${type}${s?.duree ? ` · ${s.duree}` : ""}] ${s?.plan || ""}`, s?.conseil ? `   💡 ${s.conseil}` : ""]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n\n");
      return `🎥 Plan de tournage\n\n${shots}`;
    }
    const reelSections = result.sections || result.script || [];
    const scriptText = reelSections.map((s: any) => `[${s.timing || ""}] ${(s.label || "").toUpperCase()}\n${s.texte_parle || ""}${s.texte_overlay ? `\n📝 ${s.texte_overlay}` : ""}`).join("\n\n");
    const tip = result.personal_tip ? `\n\n🎯 ${result.personal_tip}` : "";
    return `🎬 Script Reel (${result.duree_cible || ""})\n\n${scriptText}${tip}`;
  }
  if (format === "pinterest_visual" && result?.title) return `${result.title}\n\n${result.description || ""}`;
  if (format === "story" && Array.isArray(result?.stories)) {
    const storiesText = result.stories
      .map((s: any, i: number) => {
        const text = s?.text || s?.texte || s?.content || "";
        const sticker = s?.sticker?.type ? ` [sticker : ${s.sticker.type}]` : "";
        return text ? `📱 Story ${i + 1}${s?.timing ? ` (${s.timing})` : ""}${sticker}\n${text}` : "";
      })
      .filter(Boolean)
      .join("\n\n");
    if (storiesText) return storiesText;
  }
  const cleanText =
    result?.full_text ||
    result?.content ||
    [result?.hook, result?.body, result?.cta].filter(Boolean).join("\n\n").trim();
  return cleanText || JSON.stringify(result, null, 2);
}
