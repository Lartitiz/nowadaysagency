// Télémétrie qualité de la génération de contenu — table append-only
// `content_quality_events`, écrite à CHAQUE passage du gate rédactionnel.
//
// Pourquoi : le score de `runRedacGate` finissait en console.log, et
// `generated_carousels.quality_score` n'est écrit qu'en front (si l'utilisatrice
// sauve un brouillon), donc souvent null. Ici on mesure CHAQUE génération côté
// serveur → le score de gate du bilan hebdo (edge cron-health) devient complet et
// fiable, ce qui permet de détecter une non-régression après un swap de modèle
// (bascule Sonnet 5) ou un redéploiement.
//
// + `content_preview` (jsonb, 13/07→21/07) : un extrait tronqué du contenu généré
// (sujet, hook, aperçu de slides, caption) pour que l'ÉCHANTILLON du juge de la
// routine hebdo pioche ICI (à CHAQUE génération) et non plus dans
// `generated_carousels` (écrit seulement si l'utilisatrice GARDE le carrousel) —
// sinon le juge est aveugle les semaines « génère-mais-jette ». C'est du matériel
// marketing destiné à être publié : pas de PII au-delà du user_id déjà présent.
//
// Fire-and-forget, calqué sur logUsage : même client service, même bypass des
// comptes QA, et un échec d'insert n'interrompt JAMAIS la génération (try/catch).
import { getServiceClient, isQaTestAccount } from "./plan-limiter.ts";
import type { RedacGateResult } from "./redac-gate.ts";

const trunc = (s: unknown, n: number): string =>
  typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, n) : "";

// Aperçu des 4 premières slides : même chaîne de repli que l'échantillon
// historique de cron-health (title → heading → overlay_text → text → body →
// content), + fallback brut si la slide est une string ou un objet exotique.
function slidePreview(slides: unknown): string[] {
  if (!Array.isArray(slides)) return [];
  return slides.slice(0, 4).map((sl: any) => {
    const t = sl?.title || sl?.heading || sl?.overlay_text || sl?.text || sl?.body || sl?.content || "";
    if (typeof t === "string" && t.trim()) return trunc(t, 120);
    return trunc(typeof sl === "string" ? sl : JSON.stringify(sl), 120);
  }).filter(Boolean);
}

// Construit l'aperçu tronqué à partir du contenu FINAL du gate (une string JSON
// `{ slides, caption }`). Renvoie null si rien d'exploitable — l'insert reste
// valide, l'échantillon retombera simplement sur le repli generated_carousels.
export function buildContentPreview(
  gateContent: unknown,
  subject?: string,
): Record<string, unknown> | null {
  let doc: any = null;
  if (typeof gateContent === "string") {
    try { doc = JSON.parse(gateContent); } catch { doc = null; }
  } else if (gateContent && typeof gateContent === "object") {
    doc = gateContent;
  }

  const slides = doc?.slides;
  const cap = doc?.caption;
  const hook = trunc(doc?.slides?.[0]?.title || cap?.hook, 140);
  const caption = [cap?.hook, cap?.body, cap?.cta]
    .filter((x) => typeof x === "string" && x.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  const apercu = slidePreview(slides);
  const sujet = trunc(subject, 100);

  // Rien de rien : pas la peine de stocker un objet vide.
  if (!sujet && !hook && !caption && apercu.length === 0) return null;
  return { sujet, hook, apercu_slides: apercu, caption };
}

export async function logContentQuality(
  userId: string,
  format: string,
  gate: RedacGateResult,
  modelUsed?: string,
  workspaceId?: string,
  subject?: string,
): Promise<void> {
  // Contenu illisible (JSON non parsé) : rien à mesurer.
  if (gate.score == null) return;
  // Comptes QA exclus (même Set déterministe que logUsage/checkQuota).
  if (isQaTestAccount(userId)) return;

  const base = {
    user_id: userId,
    workspace_id: workspaceId || null,
    format,
    model: modelUsed || null,
    redac_score: gate.score,
    redac_violations: gate.violations,
    redac_repassed: gate.repassed,
  };
  const preview = buildContentPreview(gate.content, subject);

  try {
    const { error } = await getServiceClient()
      .from("content_quality_events")
      .insert({ ...base, content_preview: preview });
    // Repli si la colonne content_preview n'existe pas encore (migration Lovable
    // déployée APRÈS l'edge) : on réinsère sans elle pour ne pas perdre la
    // télémétrie de score pendant la fenêtre de déploiement.
    if (error && /content_preview/.test(error.message || "")) {
      await getServiceClient().from("content_quality_events").insert(base);
    } else if (error) {
      throw error;
    }
  } catch (e) {
    console.error("[content-quality] insert ignoré (génération intacte) :", (e as any)?.message || e);
  }
}
