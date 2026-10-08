/**
 * Santé de l'app — lecture de l'edge `cron-health`.
 *
 * Sans argument : scope "daily" (étape 8bis de la visite quotidienne) — santé des
 * publications réelles (échecs, posts bloqués, programmés en retard, tokens sociaux)
 * + retours bêta des 24 h (widget beta_feedback), les « blocking » en tête,
 * + crédits Photoroom restants (épuisés = 402 sur toutes les retouches photo)
 * + santé de la FACTURATION (incident Stripe 24-31/07 : 8 jours de webhook en 500 sans
 *   qu'aucune sonde ne le voie) — événements que Stripe n'arrive pas à livrer,
 *   abonnements payés sans accès en base, périodes de facturation périmées.
 * Avec `--hebdo` : scope "weekly" (routine du lundi) — coûts IA, usage features,
 * rétention par cohorte, volume de publications.
 * Dans les deux : budget images HIGGSFIELD du mois (crédit OpenAI épuisé depuis le
 * 02/10/2026, toutes les images y passent ; au plafond, « budget images atteint »).
 *
 * Même plomberie que activation-funnel.mjs : secret partagé CRON_STATS_SECRET
 * (`.env.visite.local`), anon key du `.env`. Ne casse jamais le run (exit 0 partout) ;
 * c'est au cron de juger les chiffres.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const load = (f, prefix) => {
  const p = path.join(__dirname, "..", f);
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(new RegExp(`^\\s*(${prefix}[A-Z0-9_]*)\\s*=\\s*(.*?)\\s*$`));
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
};
load(".env", "VITE_SUPABASE_");
load(".env.visite.local", "CRON_STATS_SECRET");

const URL = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const SECRET = process.env.CRON_STATS_SECRET;
const hebdo = process.argv.includes("--hebdo");
if (!URL || !ANON || !SECRET) {
  console.log("santé : non branché (VITE_SUPABASE_* ou CRON_STATS_SECRET absent) — étape sautée.");
  process.exit(0);
}


// Budget images Higgsfield (bloc `higgsfield`, daily ET weekly). Absent = edge
// live pas encore la version qui le remonte.
function printHiggsfield(h) {
  if (!h) {
    console.log("🖼️ Budget images Higgsfield : non mesuré (edge cron-health pas redéployée)");
    return;
  }
  if (h.erreur) {
    console.log(`🖼️ Budget images Higgsfield : ⚠️ non lu (${h.erreur})`);
    return;
  }
  console.log(`🖼️ Budget images Higgsfield (réservations, borne haute — pas la facture)${h.actif ? "" : "  ⚠️ Higgsfield DÉSACTIVÉ (HIGGSFIELD_IMAGE_ENABLED)"}`);
  const plafond = h.plafond_usd != null ? `${h.plafond_usd} $ (${h.pct_utilise} %)` : "AUCUN";
  console.log(`   réservé ce mois                : ${h.reserve_mois_usd} $ / ${plafond}, reste ${h.restant_usd ?? "?"} $ — ${h.images_mois} image(s)${h.incertaines_mois ? `, dont ${h.incertaines_mois} incertaine(s)` : ""}`);
  const src = Object.entries(h.par_source || {}).map(([k, v]) => `${k} ${v.images} img / ${v.usd} $`).join(", ");
  if (src) console.log(`      par source : ${src}`);
  const proj = h.jours_avant_epuisement == null
    ? "aucune dépense sur 7 j, pas d'épuisement en vue"
    : h.epuisement_avant_reset
      ? `épuisement estimé dans ${h.jours_avant_epuisement} j (vers le ${h.epuisement_estime})`
      : `tient jusqu'au reset du ${h.prochain_reset} (épuisement théorique dans ${h.jours_avant_epuisement} j)`;
  console.log(`   rythme 7 j                     : ${h.rythme_7j_usd_par_jour} $/j (${h.reserve_7j_usd} $ sur 7 j) — ${proj}`);
  console.log(`   refus « budget »               : ${h.refus_budget ?? `non comptés (${h.refus_budget_note || "non journalisé"})`}`);
  console.log(h.alerte ? `   🔴 ${h.alerte}` : "   ✅ pas d'alerte (seuils : > 80 % ou < 10 j avant le reset)");
}

try {
  const r = await fetch(`${URL}/functions/v1/cron-health`, {
    method: "POST",
    headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, "x-cron-secret": SECRET, "Content-Type": "application/json" },
    body: JSON.stringify({ scope: hebdo ? "weekly" : "daily" }),
  });
  if (!r.ok) {
    console.log(`santé : edge cron-health HTTP ${r.status} (${(await r.text()).slice(0, 90)}) — étape sautée (edge pas déployée ? régé schéma ?).`);
    process.exit(0);
  }
  const d = await r.json();

  if (!hebdo) {
    console.log("🩺 Santé des publications (source Supabase — hors comptes test)");
    console.log(`   échecs de publication (48 h)   : ${d.failed_48h.count}`);
    for (const f of d.failed_48h.items || []) console.log(`      🔴 ${f.canal} le ${f.quand} — ${f.erreur || "sans message"}`);
    console.log(`   posts bloqués en "publishing"  : ${d.stuck_publishing}${d.stuck_publishing ? "  🔴 worker planté en route ?" : ""}`);
    console.log(`   programmés en retard (>45 min) : ${d.overdue_scheduled}${d.overdue_scheduled ? "  🔴 cron pg de publication mort ? (régé schéma)" : ""}`);
    console.log(`   publiés dans les 24 h          : ${d.published_24h}`);
    console.log(`   connexions sociales à risque   : ${(d.connections_at_risk || []).length} / ${d.connections_total}`);
    for (const c of d.connections_at_risk || []) console.log(`      ⚠️ ${c.platform} (${c.compte || "?"}) — ${c.etat} (${c.jours} j)`);
    if (d.feedback_24h) {
      const items = d.feedback_24h.items || [];
      const blocking = items.filter((f) => f.severite === "blocking").length;
      console.log(`   feedbacks bêta (24 h)          : ${d.feedback_24h.count}${blocking ? `  🔴 dont ${blocking} BLOQUANT(S)` : ""}`);
      for (const f of items) {
        const icone = f.severite === "blocking" ? "🔴" : f.type === "bug" ? "🟡" : "💡";
        const sev = f.severite ? ` [${f.severite}]` : "";
        console.log(`      ${icone} ${f.type}${sev} — « ${f.contenu} »${f.page ? ` (page ${f.page})` : ""}${f.capture ? " 📎 capture" : ""} — ${f.quand}`);
        if (f.detail) console.log(`         ↳ ${f.detail}`);
      }
      if (d.feedback_new_total > d.feedback_24h.count) {
        console.log(`   feedbacks encore « new » (tous âges) : ${d.feedback_new_total}  ⚠️ des plus anciens jamais traités dans l'onglet admin`);
      }
    }
    // Crédits Photoroom (absent si l'edge live n'est pas encore la version qui les remonte).
    const pr = d.photoroom_credits;
    if (pr?.erreur) {
      console.log(`   crédits Photoroom              : ⚠️ non lus (${pr.erreur})`);
    } else if (pr) {
      // Depuis #937, l'edge renvoie moyenne_par_jour = null tant qu'il n'y a pas 3 j de
      // recul depuis le reset : ne pas imprimer « ~null/j », qui se lit comme une panne.
      const rythme = pr.moyenne_par_jour != null
        ? `~${pr.moyenne_par_jour}/j sur ${pr.jours_depuis_reset} j`
        : `rythme pas encore significatif, ${pr.jours_depuis_reset} j depuis le reset`;
      const conso = pr.consommes_mois != null ? `, consommés ${pr.consommes_mois} (${rythme})` : "";
      console.log(`   crédits Photoroom restants     : ${pr.restants}${pr.abonnement ? ` / ${pr.abonnement}` : ""}${conso}${pr.alerte ? `  🔴 ${pr.alerte}` : ""}`);
    }
    // Erreurs JS remontées par le navigateur des clientes (#949). Catégories fermées,
    // aucun message : on voit QUEL écran casse, pas pourquoi. ⚠️ comptes test inclus
    // (l'edge ne filtre pas) : un run de visite peut en produire.
    const ce = d.client_errors_24h;
    if (ce) {
      const parEcran = {};
      for (const e of ce.items || []) {
        const k = `${e.route}/${e.kind}`;
        parEcran[k] = (parEcran[k] || 0) + 1;
      }
      const detail = Object.entries(parEcran).map(([k, n]) => `${k}×${n}`).join(", ");
      console.log(`   erreurs JS clientes (24 h)     : ${ce.count}${ce.count ? `  🟡 ${detail}${ce.count > (ce.items || []).length ? " (20 dernières)" : ""}` : ""}`);
      for (const e of ce.items || []) console.log(`      • ${e.route} — ${e.kind}${e.asset ? ` (${e.asset})` : ""} — ${e.created_at}`);
    }

    // ── Facturation (incident Stripe 24-31/07) ────────────────────────────────
    // Absent si l'edge live n'est pas encore la version qui remonte le bloc.
    const fa = d.facturation;
    if (fa) {
      console.log("💳 Facturation (source Stripe + base)");
      const li = fa.livraisons_en_echec;
      if (li?.erreur) {
        console.log(`   livraisons Stripe              : ⚠️ non lues (${li.erreur})`);
      } else if (li) {
        const types = (li.types || []).map((t) => `${t.type}×${t.n}`).join(", ");
        console.log(
          `   événements non livrés (>30 min) : ${li.count}${li.count ? `  🔴 le webhook renvoie une erreur — Stripe COUPE l'endpoint au bout de ~9 j` : " ✅"}`,
        );
        if (li.count) console.log(`      plus ancien : ${li.plus_ancien} — ${types}`);
      }
      const pa = fa.payantes_sans_acces;
      if (pa?.erreur) {
        console.log(`   abonnements Stripe             : ⚠️ non lus (${pa.erreur})`);
      } else if (pa) {
        const horsApp = fa.abonnements_hors_app
          ? ` (+ ${fa.abonnements_hors_app} hors app : liens de paiement « Ta binôme de com' », normal)`
          : "";
        console.log(
          `   payantes SANS accès en base    : ${pa.count} / ${fa.abonnements_app_chez_stripe ?? "?"} abos app${pa.count ? "  🔴 elle a payé et n'a pas ses accès — à réparer à la main" : " ✅"}${horsApp}`,
        );
        for (const o of pa.items || []) console.log(`      🔴 ${o.abo} — actif chez Stripe depuis ${o.depuis}, aucune ligne \`subscriptions\``);
      }
      const pe = fa.periodes_perimees;
      if (pe?.erreur) {
        console.log(`   périodes de facturation        : ⚠️ non lues (${pe.erreur})`);
      } else if (pe) {
        console.log(
          `   périodes périmées (>2 j)       : ${pe.count} / ${fa.abonnements_stripe_actifs ?? "?"} actifs${pe.count ? "  🔴 le webhook ne met plus la base à jour (bug silencieux)" : " ✅"}`,
        );
        for (const p of pe.items || []) console.log(`      🔴 ${p.abo} (${p.plan}) — fin de période ${p.fin_periode || "JAMAIS renseignée"}`);
      }
      const ev = fa.evenements_recus;
      if (ev && !ev.erreur) {
        console.log(`   événements webhook reçus       : ${ev.h24} sur 24 h, ${ev.j7} sur 7 j (dernier : ${ev.dernier || "aucun"})`);
      }
      if (fa.erreur_stripe) console.log(`   ⚠️ ${fa.erreur_stripe}`);
    }
    printHiggsfield(d.higgsfield);
  } else {
    const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : "n/a");
    const delta = (cur, prev) => (prev ? `${cur >= prev ? "+" : ""}${Math.round(((cur - prev) / prev) * 100)}%` : "n/a");
    const cur = d.ia_7j, prev = d.ia_7j_precedents;
    console.log("📈 Bilan hebdo (source Supabase — hors comptes test)");
    console.log(`   IA 7 j : ${cur.appels} appels / ${cur.tokens} tokens / ${cur.utilisatrices} utilisatrices  (vs S-1 : ${delta(cur.appels, prev.appels)} appels, ${delta(cur.tokens, prev.tokens)} tokens)`);
    for (const [m, v] of Object.entries(cur.byModel || {})) console.log(`      modèle ${m} : ${v.appels} appels, ${v.tokens} tokens`);
    // Relecture éditoriale des carrousels : hors ai_usage (pas de crédit), lue
    // dans content_quality_events. Absente = edge cron-health pas à jour.
    if (!cur.relecture_editoriale) console.log("      relecture carrousels : non mesurée (edge cron-health pas redéployée)");
    for (const r of cur.relecture_editoriale || []) {
      console.log(`      modèle ${r.modele} (relecture) : ${r.carrousels} carrousels, ${r.input_tokens + r.output_tokens} tokens (${r.input_tokens} entrée / ${r.output_tokens} sortie) ≈ ${r.cout_estime_eur} €`);
    }
    if (cur.cout_total_estime_eur != null) {
      console.log(
        `   coût estimé 7 j : ${cur.cout_total_estime_eur} €${cur.cout_incomplet ? " ⚠️ INCOMPLET" : ""} (texte ${cur.cout_texte_estime_eur} € + images ${cur.cout_images_estime_eur} €)  (S-1 : ${prev.cout_total_estime_eur ?? "?"} €${prev.cout_incomplet ? " ⚠️ incomplet" : ""})`
      );
    }
    // Un modèle absent des grilles tarifaires compte 0 € : il doit CRIER, sinon
    // le total ment en silence (cas `claude-sonnet-5`, ~1 mois de sous-comptage).
    for (const m of cur.modeles_non_tarifes || []) {
      console.log(`      🔴 modèle NON TARIFÉ « ${m.modele} » : ${m.appels} appels / ${m.tokens} tokens comptés 0 € → ajouter son tarif dans cron-health/index.ts`);
    }
    // … et ceux de la S-1, sinon un « S-1 : X € ⚠️ incomplet » est illisible :
    // on sait que la base de comparaison ment, sans pouvoir dire à cause de quoi
    // (angle mort trouvé au bilan du 17/08/2026, la S-1 sortait « 1,29 € incomplet »).
    for (const m of prev.modeles_non_tarifes || []) {
      console.log(`      ⚠️ S-1, modèle NON TARIFÉ « ${m.modele} » : ${m.appels} appels / ${m.tokens} tokens comptés 0 € → le delta de coût ci-dessus compare à une base SOUS-ÉVALUÉE`);
    }
    // Qui a consommé : un pic se lit d'un coup d'œil (email masqué côté edge).
    if (!d.top_consommatrices_7j) console.log("   top consommatrices : non mesuré (edge cron-health pas redéployée)");
    else {
      console.log("   top 5 consommatrices 7 j :");
      for (const t of d.top_consommatrices_7j) {
        console.log(`      ${String(t.email_masque).padEnd(30)} inscrite ${t.inscrite_le || "?"}  ${String(t.appels).padStart(4)} appels  ${String(t.tokens).padStart(9)} tokens  ≈ ${t.cout_estime_eur} €${t.part_du_cout_pct != null ? ` (${t.part_du_cout_pct} %)` : ""}  ${t.action_principale || ""}`);
      }
    }
    const ci = d.comptes_internes_7j;
    if (ci) console.log(`   comptes internes (admin + recette, HORS totaux) : ${ci.comptes} compte(s), ${ci.appels} appels / ${ci.tokens} tokens ≈ ${ci.cout_estime_eur} €`);
    console.log("   top actions 7 j (vs S-1) :");
    const prevActions = Object.fromEntries((prev.topActions || []).map((a) => [a.action, a.count]));
    for (const a of cur.topActions || []) console.log(`      ${String(a.action).padEnd(28)} ${String(a.count).padStart(4)}  (S-1 : ${prevActions[a.action] ?? 0})`);
    console.log(`   publications : ${d.publications.cette_semaine} cette semaine (S-1 : ${d.publications.semaine_precedente})`);
    console.log(`   actives cette semaine : ${d.actives_cette_semaine}`);
    console.log("   rétention par cohorte d'inscription (active = ≥1 génération ou post sur 7 j) :");
    for (const c of d.cohortes || []) console.log(`      ${c.semaine} (du ${c.du}) : ${c.actives_cette_semaine}/${c.inscrites} actives (${pct(c.actives_cette_semaine, c.inscrites)})`);

    // ── Qualité de la génération (absent si l'edge live n'est pas encore à jour) ──
    const q = d.qualite;
    if (q) {
      console.log("   ── qualité de la création de contenu (carrousels réels de la semaine) ──");
      const sc = q.score_gate?.cette_semaine, scP = q.score_gate?.semaine_precedente;
      const src = q.score_gate?.source === "events" ? "toutes générations" : "brouillons sauvés seulement";
      if (sc?.moyenne != null) {
        const d9 = scP?.moyenne != null ? ` (S-1 : ${scP.moyenne}, ${delta(sc.moyenne, scP.moyenne)})` : "";
        const bas = sc.sous_60 ? `  🔴 ${sc.sous_60} sous 60` : "";
        const rep = sc.repasses != null ? `, ${sc.repasses} re-passe(s) LLM déclenchée(s)` : "";
        console.log(`   score de gate moyen : ${sc.moyenne}/100 sur ${sc.n}/${sc.sur} notés [${src}]${d9}${bas}${rep}`);
      } else {
        console.log(`   score de gate moyen : n/a (0/${sc?.sur ?? 0} noté — [${src}] ; si « brouillons », déployer la Brique 1 pour couvrir toutes les générations)`);
      }
      const rt = q.retravail;
      if (rt) {
        console.log(`   retravail : ${rt.retravailles}/${rt.total_carrousels} carrousels réédités >15 min (${pct(rt.retravailles, rt.total_carrousels)})${rt.sujets_regeneres ? `, ${rt.sujets_regeneres} sujet(s) re-généré(s)` : ""}`);
      }
      const pf = q.par_format || {};
      const formats = Object.entries(pf).sort((a, b) => b[1].generes - a[1].generes);
      if (formats.length) {
        console.log("   funnel par format (généré → calendrier → publié) :");
        for (const [f, v] of formats) console.log(`      ${String(f).padEnd(24)} ${String(v.generes).padStart(3)} → ${String(v.au_calendrier).padStart(3)} → ${String(v.publies).padStart(3)}`);
      }
      const ech = q.echantillon || [];
      const srcLabel = q.echantillon_source === "events"
        ? "toutes générations"
        : q.echantillon_source === "brouillons"
          ? "carrousels gardés seulement"
          : q.echantillon_source || "?";
      console.log(`   échantillon à juger (grille : singularité, hook, ancrage métier, tics, fidélité) : ${ech.length} contenu(s) [${srcLabel}]`);
      for (const e of ech) {
        const flags = `${e.au_calendrier ? " 📅" : ""}${e.retravaille ? " ✏️retravaillé" : ""}${e.quality_score != null ? ` [gate ${e.quality_score}]` : ""}`;
        console.log(`      • [${e.format}] ${e.sujet || "(sans sujet)"}${flags}`);
        if (e.hook) console.log(`        hook : « ${e.hook} »`);
        for (const s of e.apercu_slides || []) console.log(`          – ${s}`);
        if (e.caption) console.log(`        caption : ${e.caption}`);
      }
    }
    printHiggsfield(d.higgsfield);
  }
} catch (e) {
  console.log(`santé : erreur (${String(e.message).slice(0, 90)}) — étape sautée sans casser le run.`);
}
