// cron-health, scope weekly : le bilan du lundi, orchestration seule (fiche 18,
// lot 5). Lectures, puis les blocs dans l'ordre d'origine : la relecture
// éditoriale s'ajoute aux coûts AVANT le top 5 (part du coût relecture comprise).
// index.ts ajoute `generated_at` et `scope` devant l'objet rendu ici.
//
// Frontière : les modules de calcul (couts.ts, usage-hebdo.ts, qualite.ts,
// fenetres.ts, tarifs.ts) n'importent jamais index.ts, hebdo.ts ni quotidien.ts.
import { DAY, fetchAllRows } from "./lecture.ts";
import { higgsfieldBudget } from "./higgsfield-budget.ts";
import { inWindow, week } from "./fenetres.ts";
import { addEditorialReview, summarize } from "./couts.ts";
import { cohortes, comptesInternes, espacesOwnerMultiples, publications, topConsommatrices } from "./usage-hebdo.ts";
import { blocQualite, lireQualite } from "./qualite.ts";

export async function bilanHebdo({ supabase, now, profiles, isClient, emailOf }: {
  supabase: any;
  now: number;
  profiles: any[];
  isClient: (userId: string) => boolean;
  emailOf: Map<string, string>;
}) {
  const since35d = new Date(now - 35 * DAY).toISOString();
  const [aiRows, calRows, higgsfield, ownerRows] = await Promise.all([
    fetchAllRows(
      supabase,
      "ai_usage",
      "user_id, created_at, action_type, model_used, tokens_used",
      (q) => q.gte("created_at", since35d),
    ),
    fetchAllRows(supabase, "calendar_posts", "id, user_id, created_at, published_at, publish_status, status"),
    higgsfieldBudget(supabase, now),
    fetchAllRows(supabase, "workspace_members", "user_id, workspace_id, joined_at", (q) => q.eq("role", "owner")),
  ]);
  const espaces_owner_multiples = espacesOwnerMultiples(ownerRows, { emailOf, isClient, now });
  const ai = aiRows.filter((a: any) => isClient(a.user_id));
  const cal = calRows.filter((c: any) => isClient(c.user_id));

  const [curFrom, curTo] = week(now, 0);
  const [prevFrom, prevTo] = week(now, 1);
  const aiCur = summarize(ai.filter((a: any) => inWindow(a.created_at, curFrom, curTo)));
  const aiPrev = summarize(ai.filter((a: any) => inWindow(a.created_at, prevFrom, prevTo)));
  const { activeThisWeek, cohorts } = cohortes({ profiles, ai, cal, now, curFrom, curTo });
  const { publishedCur, publishedPrev } = publications(cal, { curFrom, curTo, prevFrom, prevTo });

  const { carCur, carPrev, cqEvents, cqAll, planAll, planClients } = await lireQualite({
    supabase, since35d, isClient, curFrom, curTo, prevFrom, prevTo,
  });

  addEditorialReview(aiCur, curFrom, curTo, cqEvents || []);
  addEditorialReview(aiPrev, prevFrom, prevTo, cqEvents || []);
  const top_consommatrices_7j = topConsommatrices({ profiles, ai, cqEvents, aiCur, curFrom, curTo });
  const { internalIds, comptes_internes_7j } = comptesInternes({ profiles, aiRows, cqAll, curFrom, curTo });
  const qualite = blocQualite({
    carCur, carPrev, cqEvents, cqAll, planAll, planClients, internalIds, cal, curFrom, curTo, prevFrom, prevTo,
  });

  return {
    ia_7j: aiCur,
    ia_7j_precedents: aiPrev,
    top_consommatrices_7j,
    comptes_internes_7j,
    publications: { cette_semaine: publishedCur, semaine_precedente: publishedPrev },
    cohortes: cohorts,
    actives_cette_semaine: activeThisWeek.size,
    qualite,
    higgsfield,
    espaces_owner_multiples,
  };
}
