// cron-health, scope weekly : usage des clientes (fiche 18, lot 5, code déplacé à
// l'identique depuis index.ts) — comptes à plusieurs espaces owner, cohortes,
// publications, top 5 des consommatrices et consommation des comptes internes.
import { ontGenere } from "./feedback-new.ts";
import { isInternalEmail as isExcludedEmail, maskEmail } from "../_shared/internal-accounts.ts";
import { DAY } from "./lecture.ts";
import { inWindow, week } from "./fenetres.ts";
import { addEditorialReview, summarize } from "./couts.ts";

export function espacesOwnerMultiples(ownerRows: any[], { emailOf, isClient, now }: {
  emailOf: Map<string, string>;
  isClient: (userId: string) => boolean;
  now: number;
}) {
  // Comptes à PLUSIEURS espaces owner (12/10, #1458) : l'auto-réparation
  // workspace + le trigger d'insert profiles en créaient deux à l'inscription
  // (6 comptes trouvés, dont 2 nés ainsi). Le verrou SQL l'empêche désormais ;
  // `nouveaux_7j` > 0 = il a sauté (régénération de schéma) ou un autre chemin
  // en crée. Tous comptes, internes compris (marqués) : c'est de l'intégrité.
  const ownersByUser = new Map<string, any[]>();
  for (const r of ownerRows) ownersByUser.set(r.user_id, [...(ownersByUser.get(r.user_id) || []), r]);
  const doublonsOwner = [...ownersByUser.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([userId, rows]) => {
      const dates = rows.map((r: any) => r.joined_at).sort();
      return {
        email: emailOf.get(userId) || userId,
        interne: !isClient(userId),
        espaces: rows.length,
        dernier_ajout: dates[dates.length - 1],
      };
    })
    .sort((x, y) => String(y.dernier_ajout).localeCompare(String(x.dernier_ajout)));
  const espaces_owner_multiples = {
    comptes: doublonsOwner.length,
    nouveaux_7j: doublonsOwner.filter((d) => new Date(d.dernier_ajout).getTime() >= now - 7 * DAY).length,
    items: doublonsOwner.slice(0, 15),
  };
  return espaces_owner_multiples;
}

export function cohortes({ profiles, ai, cal, now, curFrom, curTo }: {
  profiles: any[];
  ai: any[];
  cal: any[];
  now: number;
  curFrom: number;
  curTo: number;
}) {
  // Rétention par cohorte hebdo d'inscription (5 dernières semaines) :
  // active cette semaine = ≥1 génération OU ≥1 post créé dans les 7 derniers jours.
  const activeThisWeek = new Set([
    ...ai.filter((a: any) => inWindow(a.created_at, curFrom, curTo)).map((a: any) => a.user_id),
    ...cal.filter((c: any) => inWindow(c.created_at, curFrom, curTo)).map((c: any) => c.user_id),
  ]);
  const clients = profiles.filter((p: any) => !isExcludedEmail(p.email));
  const cohorts = [];
  for (let w = 0; w < 5; w++) {
    const [from, to] = week(now, w);
    const cohort = clients.filter((p: any) => inWindow(p.created_at, from, to));
    cohorts.push({
      semaine: `S-${w}`,
      du: new Date(from).toISOString().slice(0, 10),
      inscrites: cohort.length,
      actives_cette_semaine: cohort.filter((p: any) => activeThisWeek.has(p.user_id)).length,
      ont_genere_depuis_inscription: ontGenere(cohort, [...ai, ...cal]),
    });
  }
  return { activeThisWeek, cohorts };
}

export function publications(cal: any[], { curFrom, curTo, prevFrom, prevTo }: {
  curFrom: number;
  curTo: number;
  prevFrom: number;
  prevTo: number;
}) {
  const publishedCur = cal.filter((c: any) => inWindow(c.published_at, curFrom, curTo)).length;
  const publishedPrev = cal.filter((c: any) => inWindow(c.published_at, prevFrom, prevTo)).length;
  return { publishedCur, publishedPrev };
}

export function topConsommatrices({ profiles, ai, cqEvents, aiCur, curFrom, curTo }: {
  profiles: any[];
  ai: any[];
  cqEvents: any[] | null;
  aiCur: any;
  curFrom: number;
  curTo: number;
}) {
  // Top 5 consommatrices des 7 j : un pic de coût se lit d'un coup d'œil (qui,
  // depuis quand inscrite, combien) au lieu d'être deviné dans l'échantillon —
  // le bilan du 05/10/2026 (43,82 € vs 1,42 €) a dû être attribué à la recette
  // à la lecture des sujets. Email MASQUÉ (la***@domaine), jamais complet.
  const profileById = new Map(profiles.map((p: any) => [p.user_id, p]));
  const aiCurByUser = new Map<string, any[]>();
  for (const a of ai) {
    if (!inWindow(a.created_at, curFrom, curTo)) continue;
    const list = aiCurByUser.get(a.user_id) || [];
    list.push(a);
    aiCurByUser.set(a.user_id, list);
  }
  const top_consommatrices_7j = [...aiCurByUser.entries()]
    .map(([userId, rows]) => {
      const s = summarize(rows);
      addEditorialReview(s, curFrom, curTo, (cqEvents || []).filter((e: any) => e.user_id === userId));
      const p: any = profileById.get(userId);
      return {
        email_masque: maskEmail(p?.email),
        inscrite_le: p?.created_at ? String(p.created_at).slice(0, 10) : null,
        appels: s.appels,
        tokens: s.tokens,
        cout_estime_eur: s.cout_total_estime_eur,
        part_du_cout_pct: aiCur.cout_total_estime_eur
          ? Math.round((s.cout_total_estime_eur / aiCur.cout_total_estime_eur) * 100)
          : null,
        action_principale: s.topActions[0]?.action || null,
      };
    })
    .sort((x, y) => y.cout_estime_eur - x.cout_estime_eur || y.tokens - x.tokens)
    .slice(0, 5);
  return top_consommatrices_7j;
}

export function comptesInternes({ profiles, aiRows, cqAll, curFrom, curTo }: {
  profiles: any[];
  aiRows: any[];
  cqAll: any[];
  curFrom: number;
  curTo: number;
}) {
  // Ce que les comptes INTERNES (admin + recette, _shared/internal-accounts.ts)
  // ont consommé cette semaine, HORS des totaux ci-dessus : la recette coûte de
  // vrais euros, on la voit sans qu'elle fausse l'usage des clientes.
  const internalIds = new Set(
    profiles.filter((p: any) => isExcludedEmail(p.email)).map((p: any) => p.user_id),
  );
  const aiInternes = summarize(
    aiRows.filter((a: any) => internalIds.has(a.user_id) && inWindow(a.created_at, curFrom, curTo)),
  );
  addEditorialReview(aiInternes, curFrom, curTo, cqAll.filter((e: any) => internalIds.has(e.user_id)));
  const comptes_internes_7j = {
    comptes: aiInternes.utilisatrices,
    appels: aiInternes.appels,
    tokens: aiInternes.tokens,
    cout_estime_eur: aiInternes.cout_total_estime_eur,
  };
  return { internalIds, comptes_internes_7j };
}
