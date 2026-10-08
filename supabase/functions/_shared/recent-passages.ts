// Passages déjà écrits pour la MÊME marque dans ses contenus récents (bilan
// hebdo 05/10/2026).
//
// Cinq carrousels photo sans sujet d'une même marque recopiaient la même
// présentation (« Je travaille surtout la faïence, parfois le grès… Je vis dans
// la Drôme, entourée d'arbres ») et le gate leur mettait 100/100 : il note
// chaque contenu isolément, et la garde anti-redite (#915) ne compare que les
// ACCROCHES d'un même SUJET. Sans sujet, rien ne voyait la redite.
//
// La matière existe déjà, sans nouvelle table :
//  - `generated_carousels` : texte complet des carrousels gardés ;
//  - `content_quality_events.content_preview` : extrait de CHAQUE génération
//    (accroche, 4 premières slides tronquées, légende), même jetée.
//
// 🔑 Même contrat de sûreté que previous-hooks.ts : lecture best-effort, jamais
// bloquante. Toute erreur renvoie [] et la génération reste exactement celle
// d'avant. Une garde qualité ne doit JAMAIS faire échouer une génération.
import { getServiceClient } from "./plan-limiter.ts";
import { findRecentEchoes } from "./redac-gate.ts";

/** Au-delà, reprendre un fait de la marque redevient légitime. */
const LOOKBACK_DAYS = 30;
/** Contenus comparés : une série récente, pas tout l'historique. */
const MAX_TEXTS = 10;
/** Taille du rappel donné au rédacteur (le prompt reste lisible). */
const PROMPT_MAX_CHARS = 1800;

const clean = (s: unknown): string =>
  typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "";

function slideTexts(slides: unknown): string[] {
  if (!Array.isArray(slides)) return [];
  return slides.map((sl: any) =>
    typeof sl === "string"
      ? clean(sl)
      : [sl?.title, sl?.heading, sl?.overlay_text, sl?.text, sl?.body, sl?.content]
        .map(clean).filter(Boolean).join(" ")
  ).filter(Boolean);
}

function captionText(caption: unknown): string {
  if (typeof caption === "string") {
    try {
      const parsed = JSON.parse(caption);
      if (parsed && typeof parsed === "object") return captionText(parsed);
    } catch { /* légende en texte brut */ }
    return clean(caption);
  }
  const c = caption as { hook?: unknown; body?: unknown; cta?: unknown } | null;
  return c ? [c.hook, c.body, c.cta].map(clean).filter(Boolean).join(" ") : "";
}

/** Texte d'une ligne `generated_carousels` (slides + légende). */
export function carouselRowText(row: { slides?: unknown; caption?: unknown; hook_text?: unknown }): string {
  return [clean(row.hook_text), ...slideTexts(row.slides), captionText(row.caption)]
    .filter(Boolean).join("\n");
}

/** Texte d'un `content_preview` (accroche, aperçu des slides, légende). */
export function previewText(preview: { hook?: unknown; apercu_slides?: unknown; caption?: unknown } | null | undefined): string {
  if (!preview) return "";
  const slides = Array.isArray(preview.apercu_slides) ? preview.apercu_slides.map(clean) : [];
  return [clean(preview.hook), ...slides, clean(preview.caption)].filter(Boolean).join("\n");
}

/**
 * Textes des contenus récents de cette marque (espace de travail, sinon
 * utilisatrice), les plus récents d'abord. Les doublons (un carrousel gardé a
 * aussi son extrait de génération) sont dédoublonnés par contenu identique.
 */
export async function fetchRecentContentTexts(
  userId: string,
  workspaceId?: string | null,
  limit = MAX_TEXTS,
  client: any = undefined,
): Promise<string[]> {
  if (!userId) return [];
  try {
    const sb = client ?? getServiceClient();
    const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const scope = (q: any) => workspaceId ? q.eq("workspace_id", workspaceId) : q.eq("user_id", userId).is("workspace_id", null);
    const [saved, events] = await Promise.all([
      scope(sb.from("generated_carousels").select("hook_text, slides, caption, created_at"))
        .gte("created_at", since).order("created_at", { ascending: false }).limit(limit),
      scope(sb.from("content_quality_events").select("content_preview, created_at"))
        .gte("created_at", since).order("created_at", { ascending: false }).limit(limit * 2),
    ]);
    const rows: { at: string; text: string }[] = [];
    if (!saved?.error) {
      for (const r of saved?.data || []) rows.push({ at: r.created_at, text: carouselRowText(r) });
    }
    if (!events?.error) {
      for (const r of events?.data || []) rows.push({ at: r.created_at, text: previewText(r.content_preview) });
    }
    rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of rows) {
      if (!r.text || seen.has(r.text)) continue;
      seen.add(r.text);
      out.push(r.text);
      if (out.length >= limit) break;
    }
    return out;
  } catch (e) {
    console.error("[recent-passages] lecture ignorée (génération intacte) :", (e as Error)?.message || e);
    return [];
  }
}

// Détection : `findRecentEchoes` vit dans redac-gate.ts (le gate la mesure sur
// tous les carrousels) ; ré-exportée ici pour le récit continu.
export { findRecentEchoes };

/** Rappel pour le rédacteur : ce qui a déjà été écrit, à ne pas redire. */
export function recentPassagesPrompt(recentTexts: string[] | undefined): string {
  if (!recentTexts?.length) return "";
  const excerpt: string[] = [];
  let size = 0;
  for (const t of recentTexts) {
    const line = t.replace(/\n+/g, " / ").slice(0, 400);
    if (size + line.length > PROMPT_MAX_CHARS) break;
    excerpt.push(`- ${line}`);
    size += line.length;
  }
  return `DÉJÀ ÉCRIT RÉCEMMENT POUR CETTE MARQUE (ses derniers contenus, pas une source de faits) :
${excerpt.join("\n")}
Ne reprends aucune de ces phrases telle quelle. Un fait déjà raconté ne revient que s'il sert ta proposition, dit autrement ; sinon choisis un autre fait des sources. La présentation de la marque (matière, lieu de vie, inspirations) ne se récite pas à chaque contenu.`;
}
