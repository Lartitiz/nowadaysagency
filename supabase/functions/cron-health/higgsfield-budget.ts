// cron-health, deux scopes : budget images Higgsfield du mois (fiche 18 lot 1, à l'identique).
import { debutMoisUtc, jugerBudgetHiggsfield, somme, compte } from "./higgsfield-alerte.ts";
import { DAY, fetchAllRows } from "./lecture.ts";

// ── Budget images HIGGSFIELD (crédit OpenAI épuisé depuis le 02/10/2026) ─────
// Toutes les images passent par Higgsfield ; au plafond mensuel
// HIGGSFIELD_IMAGE_MONTHLY_LIMIT_USD, chaque image est refusée « budget ». Le
// calcul reproduit `higgsfield_image_month_used()` (deux tables, statut ≠ failed,
// mois UTC) ; jugement dans `higgsfield-alerte.ts`. Les montants sont des
// RÉSERVATIONS (borne haute), pas la facture réelle Higgsfield.
// ⚠️ Les refus « budget » ne sont PAS journalisés en base (la voie synchrone
// n'écrit aucune ligne, le Studio ne garde qu'un échec générique) : on ne peut pas
// les compter, d'où `refus_budget: null` et l'alerte « plafond atteint » à la place.
export async function higgsfieldBudget(supabase: any, now: number) {
  try {
    const debutMois = debutMoisUtc(now);
    const depuis7j = now - 7 * DAY;
    const depuis = new Date(Math.min(debutMois, depuis7j)).toISOString();
    const cols = "estimated_usd, status, created_at";
    const [spend, studio] = await Promise.all([
      fetchAllRows(supabase, "higgsfield_image_spend", `source, ${cols}`, (q) => q.gte("created_at", depuis)),
      fetchAllRows(supabase, "studio_image_requests", cols, (q) => q.gte("created_at", depuis)),
    ]);
    const rows = [...spend, ...studio.map((r: any) => ({ ...r, source: "studio" }))];
    const raw = Deno.env.get("HIGGSFIELD_IMAGE_MONTHLY_LIMIT_USD");
    const plafond = raw ? Number(raw) : null;
    const jugement = jugerBudgetHiggsfield(somme(rows, debutMois), somme(rows, depuis7j), plafond, now);
    const duMois = rows.filter((r: any) => compte(r, debutMois) && Number(r.estimated_usd) > 0);
    const parSource: Record<string, { images: number; usd: number }> = {};
    for (const r of duMois) {
      const s = (parSource[r.source] ||= { images: 0, usd: 0 });
      s.images++;
      s.usd = Math.round((s.usd + Number(r.estimated_usd)) * 100) / 100;
    }
    return {
      actif: Deno.env.get("HIGGSFIELD_IMAGE_ENABLED") === "true" && Deno.env.get("HIGGSFIELD_DATA_USE_REVIEWED") === "true",
      ...jugement,
      images_mois: duMois.length,
      incertaines_mois: duMois.filter((r: any) => r.status === "uncertain").length,
      par_source: parSource,
      refus_budget: null,
      refus_budget_note: "non journalisé en base (seulement dans les logs des edges)",
    };
  } catch (e) {
    return { erreur: String((e as any)?.message || e).slice(0, 90) };
  }
}
