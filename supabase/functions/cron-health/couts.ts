// cron-health, scope weekly : coûts IA estimés en € (fiche 18, lot 4, à l'identique).
// `summarize` résume des lignes ai_usage ; `addEditorialReview` y ajoute la relecture
// éditoriale des carrousels EN PLACE (modeles_non_tarifes, cout_*, relecture_*).
// ⚠️ Ordre côté appelant : la relecture s'ajoute AVANT le top 5 des consommatrices,
// dont `part_du_cout_pct` divise par le total relecture comprise.
import { IMAGE_COST_EUR, REVIEW_COST_EUR_PER_MTOKEN, TEXT_COST_EUR_PER_MTOKEN, ZERO_COST_LABELS } from "./tarifs.ts";
import { inWindow } from "./fenetres.ts";

const round2 = (n: number) => Math.round(n * 100) / 100;

export const summarize = (rows: any[]) => {
  const byModel: Record<string, { appels: number; tokens: number }> = {};
  const byAction: Record<string, number> = {};
  let tokens = 0;
  for (const r of rows) {
    tokens += r.tokens_used || 0;
    const m = r.model_used || "inconnu";
    byModel[m] = byModel[m] || { appels: 0, tokens: 0 };
    byModel[m].appels++;
    byModel[m].tokens += r.tokens_used || 0;
    const a = r.action_type || "inconnu";
    byAction[a] = (byAction[a] || 0) + 1;
  }
  const topActions = Object.entries(byAction)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 12)
    .map(([action, count]) => ({ action, count }));
  const coutImagesEur = Object.entries(byModel).reduce(
    (s, [m, v]) => s + (IMAGE_COST_EUR[m] || 0) * v.appels,
    0,
  );
  const coutTexteEur = Object.entries(byModel).reduce(
    (s, [m, v]) => s + ((TEXT_COST_EUR_PER_MTOKEN[m] || 0) * v.tokens) / 1_000_000,
    0,
  );
  // Garde déterministe contre le sous-comptage silencieux : tout modèle vu
  // dans ai_usage mais absent des DEUX grilles tarifaires a contribué 0 € au
  // total. On le remonte au lieu de le taire — le total reste affiché (il
  // reste utile), mais il est explicitement signalé comme INCOMPLET.
  const modelesNonTarifes = Object.entries(byModel)
    .filter(([m]) => !(m in TEXT_COST_EUR_PER_MTOKEN) && !(m in IMAGE_COST_EUR) && !ZERO_COST_LABELS.has(m))
    .map(([m, v]) => ({ modele: m, appels: v.appels, tokens: v.tokens }))
    .sort((a, b) => b.tokens - a.tokens);
  return {
    appels: rows.length,
    tokens,
    byModel,
    topActions,
    utilisatrices: new Set(rows.map((r) => r.user_id)).size,
    cout_images_estime_eur: round2(coutImagesEur),
    cout_texte_estime_eur: round2(coutTexteEur),
    cout_total_estime_eur: round2(coutImagesEur + coutTexteEur),
    modeles_non_tarifes: modelesNonTarifes,
    cout_incomplet: modelesNonTarifes.length > 0,
  };
};

// Relecture éditoriale (hors ai_usage, cf. REVIEW_COST_EUR_PER_MTOKEN) :
// ajoutée au coût de la semaine et remontée par modèle. Un modèle de
// relecture sans tarif rejoint `modeles_non_tarifes` comme les autres.
export const addEditorialReview = (summary: any, from: number, to: number, events: any[]) => {
  const byModel: Record<string, { carrousels: number; input_tokens: number; output_tokens: number }> = {};
  // Issue de la relecture : « rejected » = payée puis jetée par la garde de
  // fidélité (2/2 le 28/09). `garde` compte la règle qui a bloqué.
  const issues: Record<string, number> = {}, garde: Record<string, number> = {};
  for (const e of events) {
    const u = e.content_preview?.editorial_usage;
    if (!u?.model || !inWindow(e.created_at, from, to)) continue;
    if (u.status) issues[u.status] = (issues[u.status] || 0) + 1;
    for (const g of Array.isArray(u.guard) ? u.guard : []) {
      const k = String(g).replace(/^(lost-number|new-unsupported-number):.*/, "$1");
      garde[k] = (garde[k] || 0) + 1;
    }
    const m = (byModel[u.model] ||= { carrousels: 0, input_tokens: 0, output_tokens: 0 });
    m.carrousels++;
    m.input_tokens += Number(u.input_tokens) || 0;
    m.output_tokens += Number(u.output_tokens) || 0;
  }
  let cout = 0;
  const relecture = Object.entries(byModel).map(([modele, v]) => {
    // L'API peut renvoyer un nom daté (claude-opus-5-5-2026xxxx).
    const tarif = REVIEW_COST_EUR_PER_MTOKEN[modele] ?? REVIEW_COST_EUR_PER_MTOKEN[modele.replace(/-20\d{6}$/, "")];
    const c = tarif ? (tarif.input * v.input_tokens + tarif.output * v.output_tokens) / 1_000_000 : 0;
    cout += c;
    if (!tarif) {
      summary.modeles_non_tarifes.push({ modele: `${modele} (relecture)`, appels: v.carrousels, tokens: v.input_tokens + v.output_tokens });
      summary.cout_incomplet = true;
    }
    return { modele, ...v, cout_estime_eur: Math.round(c * 100) / 100 };
  });
  summary.relecture_editoriale = relecture;
  summary.relecture_issues = { ...issues, ...(Object.keys(garde).length ? { garde } : {}) };
  summary.cout_texte_estime_eur = round2(summary.cout_texte_estime_eur + cout);
  summary.cout_total_estime_eur = round2(summary.cout_total_estime_eur + cout);
};
