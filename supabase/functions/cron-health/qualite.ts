// cron-health, scope weekly : qualité de la génération de contenu (fiche 18, lot 5,
// code déplacé à l'identique depuis index.ts). `lireQualite` lit les carrousels puis
// content_quality_events (avec ses deux replis) ; ses événements servent AUSSI aux
// coûts (relecture éditoriale), d'où une lecture séparée du bloc `blocQualite`.
import { gardeRediteStats } from "./garde-redite.ts";
import { construireEchantillon } from "./echantillon.ts";
import { filStats } from "./fil-reparations.ts";
import { dureesStats } from "./durees-carrousels.ts";
import { planStats } from "./plan-carrousels.ts";
import { CAROUSEL_PLAN_FORMAT } from "../_shared/carousel-plan-format.ts";
import { fetchAllRows } from "./lecture.ts";
import { inWindow } from "./fenetres.ts";

export async function lireQualite({ supabase, since35d, isClient, curFrom, curTo, prevFrom, prevTo }: {
  supabase: any;
  since35d: string;
  isClient: (userId: string) => boolean;
  curFrom: number;
  curTo: number;
  prevFrom: number;
  prevTo: number;
}) {
  // ── Qualité de la génération de contenu (lecture seule) ────────────────────
  // Ce que le quotidien ne voit pas : la QUALITÉ du contenu produit, pas le volume.
  // Trois signaux sur les carrousels réellement générés (hors comptes test) :
  //   1) score de gate (quality_score déjà en base) agrégé + delta S-1 — attrape
  //      une non-régression après un swap de modèle (ex. bascule Sonnet 5) ou un
  //      redéploiement edge ; n < total tant que Brique 1 (persistance serveur du
  //      score de redac-gate) n'est pas livrée — le report l'affiche honnêtement ;
  //   2) retravail = % de carrousels lourdement réédités après génération (proxy
  //      d'un 1er jet raté) + sujets re-générés ;
  //   3) funnel PAR FORMAT (généré → mis au calendrier → publié) : quel format
  //      meurt en route éclaire la falaise « 0 publication ».
  // + un échantillon anonymisé (le contenu à juger, tronqué, SANS identité d'autrice)
  //   pour le juge de la routine (grille : singularité, hook, ancrage métier, tics,
  //   fidélité au brief). Le contenu est du matériel marketing destiné à être publié
  //   publiquement — pas de la PII.
  const carRows = await fetchAllRows(
    supabase,
    "generated_carousels",
    "user_id, carousel_type, subject, hook_text, caption, slides, slide_count, quality_score, calendar_post_id, status, created_at, updated_at",
    (q) => q.gte("created_at", since35d),
  );
  const car = carRows.filter((c: any) => isClient(c.user_id));
  const carCur = car.filter((c: any) => inWindow(c.created_at, curFrom, curTo));
  const carPrev = car.filter((c: any) => inWindow(c.created_at, prevFrom, prevTo));

  // Source COMPLÈTE du score de gate = content_quality_events (1 ligne par
  // génération, écrite côté serveur par logContentQuality) ; repli sur
  // generated_carousels.quality_score (écrit seulement si un brouillon est sauvé)
  // tant que la table n'existe pas encore (migration Lovable en attente).
  let cqEvents: any[] | null = null;
  let cqAll: any[] = []; // comptes internes compris (coût de la recette, plus bas)
  // Lignes du plan des carrousels (format carousel_plan, aucun contenu ni
  // score) : mises à part, sinon elles gonfleraient « N notés sur M ».
  let planAll: any[] = [];
  let planClients: any[] | null = null;
  try {
    let cqRows: any[];
    try {
      cqRows = await fetchAllRows(
        supabase,
        "content_quality_events",
        "user_id, format, redac_score, redac_repassed, created_at, content_preview",
        (q) => q.gte("created_at", since35d),
      );
    } catch (e) {
      // `content_preview` peut ne pas encore exister (migration Lovable déployée
      // APRÈS l'edge) : on retente sans la colonne pour ne PAS perdre la source
      // du score de gate — l'échantillon retombera alors sur les brouillons.
      if (!/content_preview/.test(String((e as any)?.message || ""))) throw e;
      cqRows = await fetchAllRows(
        supabase,
        "content_quality_events",
        "user_id, format, redac_score, redac_repassed, created_at",
        (q) => q.gte("created_at", since35d),
      );
    }
    planAll = cqRows.filter((e: any) => e.format === CAROUSEL_PLAN_FORMAT);
    planClients = planAll.filter((e: any) => isClient(e.user_id));
    cqRows = cqRows.filter((e: any) => e.format !== CAROUSEL_PLAN_FORMAT);
    cqAll = cqRows;
    cqEvents = cqRows.filter((e: any) => isClient(e.user_id));
  } catch (_) { /* table absente : repli sur les brouillons */ }
  return { carCur, carPrev, cqEvents, cqAll, planAll, planClients };
}

const scoreStats = (rows: any[]) => {
  const vals = rows.map((r) => r.quality_score).filter((v: any) => typeof v === "number");
  if (!vals.length) return { n: 0, sur: rows.length, moyenne: null as number | null, sous_60: 0 };
  return {
    n: vals.length,
    sur: rows.length,
    moyenne: Math.round(vals.reduce((s: number, v: number) => s + v, 0) / vals.length),
    sous_60: vals.filter((v: number) => v < 60).length,
  };
};

export function blocQualite({ carCur, carPrev, cqEvents, cqAll, planAll, planClients, internalIds, cal, curFrom, curTo, prevFrom, prevTo }: {
  carCur: any[];
  carPrev: any[];
  cqEvents: any[] | null;
  cqAll: any[];
  planAll: any[];
  planClients: any[] | null;
  internalIds: Set<string>;
  cal: any[];
  curFrom: number;
  curTo: number;
  prevFrom: number;
  prevTo: number;
}) {
  const eventScoreStats = (rows: any[]) => {
    const vals = rows.map((r) => r.redac_score).filter((v: any) => typeof v === "number");
    if (!vals.length) return { n: 0, sur: rows.length, moyenne: null as number | null, sous_60: 0, repasses: 0 };
    return {
      n: vals.length,
      sur: rows.length,
      moyenne: Math.round(vals.reduce((s: number, v: number) => s + v, 0) / vals.length),
      sous_60: vals.filter((v: number) => v < 60).length,
      repasses: rows.filter((r: any) => r.redac_repassed).length,
    };
  };

  const RETRAVAIL_MS = 15 * 60 * 1000; // réédité >15 min après génération = 1er jet retouché en profondeur
  const estRetravaille = (c: any) =>
    !!(c.updated_at && c.created_at && new Date(c.updated_at).getTime() - new Date(c.created_at).getTime() > RETRAVAIL_MS);
  const retravailles = carCur.filter(estRetravaille).length;
  const sujetKey = (c: any) => `${c.user_id}::${String(c.subject || "").trim().toLowerCase().slice(0, 60)}`;
  const sujetCounts: Record<string, number> = {};
  for (const c of carCur) sujetCounts[sujetKey(c)] = (sujetCounts[sujetKey(c)] || 0) + 1;
  const sujets_regeneres = Object.values(sujetCounts).filter((n) => n > 1).length;

  const publishedIds = new Set(cal.filter((c: any) => c.published_at).map((c: any) => c.id));
  const parFormat: Record<string, { generes: number; au_calendrier: number; publies: number }> = {};
  for (const c of carCur) {
    const f = c.carousel_type || "inconnu";
    parFormat[f] = parFormat[f] || { generes: 0, au_calendrier: 0, publies: 0 };
    parFormat[f].generes++;
    if (c.calendar_post_id) {
      parFormat[f].au_calendrier++;
      if (publishedIds.has(c.calendar_post_id)) parFormat[f].publies++;
    }
  }

  // Échantillon pour le juge (sources et repli « comptes internes » : echantillon.ts).
  const { echantillon, echantillon_source } = construireEchantillon({
    clientEvents: (cqEvents || []).filter((e: any) => inWindow(e.created_at, curFrom, curTo)),
    internalEvents: cqAll.filter((e: any) => internalIds.has(e.user_id) && inWindow(e.created_at, curFrom, curTo)),
    carrouselsGardes: carCur,
    estRetravaille,
  });

  const qualite = {
    score_gate: cqEvents && cqEvents.length
      ? {
          source: "events",
          cette_semaine: eventScoreStats(cqEvents.filter((e: any) => inWindow(e.created_at, curFrom, curTo))),
          semaine_precedente: eventScoreStats(cqEvents.filter((e: any) => inWindow(e.created_at, prevFrom, prevTo))),
        }
      : {
          source: "brouillons",
          cette_semaine: scoreStats(carCur),
          semaine_precedente: scoreStats(carPrev),
        },
    // Garde anti-redite d'accroche (#915) : contenus où l'accroche redisait une
    // accroche précédente AVANT correction (cf. garde-redite.ts). Clientes et
    // comptes internes séparés, comme les coûts.
    garde_anti_redite: cqEvents
      ? {
          cette_semaine: gardeRediteStats(cqEvents, (d) => inWindow(d, curFrom, curTo)),
          semaine_precedente: gardeRediteStats(cqEvents, (d) => inWindow(d, prevFrom, prevTo)),
          comptes_internes_7j: gardeRediteStats(cqAll.filter((e: any) => internalIds.has(e.user_id)), (d) => inWindow(d, curFrom, curTo)),
        }
      : null,
    // Contrôle du fil des carrousels (08/10/2026) : réparations tentées /
    // GARDÉES par le 2e juge / sautées faute de temps (cf. fil-reparations.ts).
    fil_carrousels: cqEvents
      ? {
          cette_semaine: filStats(cqEvents, (d) => inWindow(d, curFrom, curTo)),
          semaine_precedente: filStats(cqEvents, (d) => inWindow(d, prevFrom, prevTo)),
          // Peu de clientes génèrent : les essais internes donnent un 1er chiffre.
          comptes_internes_7j: filStats(cqAll.filter((e: any) => internalIds.has(e.user_id)), (d) => inWindow(d, curFrom, curTo)),
        }
      : null,
    // Durées des carrousels par parcours (09/10/2026) : rédaction, juge,
    // réparation, association des photos (cf. durees-carrousels.ts).
    durees_carrousels: cqEvents
      ? {
          cette_semaine: dureesStats(cqEvents, (d) => inWindow(d, curFrom, curTo)),
          semaine_precedente: dureesStats(cqEvents, (d) => inWindow(d, prevFrom, prevTo)),
          comptes_internes_7j: dureesStats(cqAll.filter((e: any) => internalIds.has(e.user_id)), (d) => inWindow(d, curFrom, curTo)),
        }
      : null,
    // Plan des carrousels (12/10/2026) : durée, second appel, plans vides ou de
    // mauvaise longueur, au-delà des 170 s de l'écran (cf. plan-carrousels.ts).
    plan_carrousels: planClients
      ? {
          cette_semaine: planStats(planClients, (d) => inWindow(d, curFrom, curTo)),
          semaine_precedente: planStats(planClients, (d) => inWindow(d, prevFrom, prevTo)),
          comptes_internes_7j: planStats(planAll.filter((e: any) => internalIds.has(e.user_id)), (d) => inWindow(d, curFrom, curTo)),
        }
      : null,
    retravail: { total_carrousels: carCur.length, retravailles, sujets_regeneres },
    par_format: parFormat,
    echantillon,
    echantillon_source,
  };
  return qualite;
}
