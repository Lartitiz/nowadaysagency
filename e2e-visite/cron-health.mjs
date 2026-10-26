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
 * + erreurs JS (vraies clientes à part des comptes test) et santé des E-MAILS
 *   (envoyés, échecs, file email_queue bloquée).
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
    // Automates de la base (edge ≥ 14/10/2026 + migration cron_jobs_health) :
    // leur dernier passage réel, même quand personne ne programme rien.
    const cp = d.crons_pg;
    if (!cp) console.log("   automates de la base (pg_cron) : non mesurés (edge cron-health pas redéployée)");
    else if (cp.erreur) console.log(`   automates de la base (pg_cron) : ⚠️ non lus (${cp.erreur.slice(0, 90)}) — migration cron_jobs_health pas appliquée ?`);
    else {
      const pannes = cp.jobs.filter((j) => j.en_panne);
      console.log(`   automates de la base (pg_cron) : ${cp.jobs.length - pannes.length}/${cp.jobs.length} passés à l'heure${pannes.length ? "  🔴" : " ✅"}`);
      for (const j of pannes) console.log(`      🔴 ${j.nom} — ${j.raison}`);
    }
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
        // Contenu des anciens (edge ≥ 14/10/2026) : à citer au bilan du lundi.
        const veille = Date.now() - 24 * 3600 * 1000;
        for (const f of (d.feedback_new_items || []).filter((x) => new Date(x.quand).getTime() < veille)) {
          const sev = f.severite ? ` [${f.severite}]` : "";
          console.log(`      ⏳ ${f.type}${sev} — « ${f.contenu} »${f.page ? ` (page ${f.page})` : ""} — ${String(f.quand).slice(0, 10)}`);
        }
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
    // Erreurs JS remontées par le navigateur (#949). Catégories fermées, aucun
    // message : on voit QUEL écran casse, pas pourquoi. Depuis le 14/10, l'edge
    // sépare les vraies clientes (alerte) des comptes internes/test (info) ; sans
    // `internes`, c'est l'ancienne edge : tout mélangé, comptes test inclus.
    const ce = d.client_errors_24h;
    if (ce) {
      const nouveau = !!ce.internes;
      const parEcran = ce.par_ecran || {};
      if (!ce.par_ecran) {
        for (const e of ce.items || []) {
          const k = `${e.route}/${e.kind}`;
          parEcran[k] = (parEcran[k] || 0) + 1;
        }
      }
      const detail = Object.entries(parEcran).map(([k, n]) => `${k}×${n}`).join(", ");
      const internes = nouveau
        ? ` (comptes internes/test : ${ce.internes.count}${ce.internes.count ? ` — ${Object.entries(ce.internes.par_ecran || {}).map(([k, n]) => `${k}×${n}`).join(", ")}` : ""})`
        : "  ⚠️ comptes test INCLUS (edge cron-health pas redéployée)";
      const icone = ce.render ? "🔴" : "🟡";
      console.log(`   erreurs JS clientes (24 h)     : ${ce.count}${ce.count ? `  ${icone} ${detail}${ce.count > (ce.items || []).length ? " (20 dernières)" : ""}` : ""}${internes}`);
      if (ce.render) console.log(`      🔴 ${ce.render} écran(s) planté(s) vu(s) par une VRAIE cliente (kind render = écran d'erreur)`);
      for (const e of ce.items || []) console.log(`      • ${e.route} — ${e.kind}${e.asset ? ` (${e.asset})` : ""} — ${e.created_at}`);
    }

    // ── E-mails (14/10) : envoyés, échecs, file bloquée — hors comptes internes.
    // Seuils (jugés côté edge, sante-emails.ts) : 🔴 si échec > 0 ou file bloquée
    // (> 1 h) ; 0 envoyé n'est PAS une alerte (on ne sait pas ce qui était attendu).
    const em = d.emails_24h;
    if (!em) {
      console.log("✉️ E-mails : non mesuré (edge cron-health pas redéployée)");
    } else if (em.erreur) {
      console.log(`✉️ E-mails : ⚠️ non lus (${em.erreur})`);
    } else {
      console.log("✉️ E-mails (24 h, hors comptes internes)");
      const ign = em.ignores ? ` (+ ${em.ignores} ignoré(s) : désabonnée, plafond ou adresse de test)` : "";
      console.log(`   envoyés                        : ${em.envoyes}${ign}${em.envoyes ? "" : "  (0 : normal s'il n'y avait rien à envoyer — pas jugé)"}`);
      console.log(`   échecs                         : ${em.echecs}${em.echecs ? "  🔴" : " ✅"}`);
      for (const f of em.echecs_items || []) console.log(`      🔴 ${f.type} [${f.statut}] le ${f.quand} — ${f.erreur || "sans message"}`);
      const fb = em.file_bloquee || {};
      console.log(`   en attente depuis > 1 h        : ${fb.count ?? 0}${fb.count ? `  🔴 file bloquée (cron d'envoi email-trigger mort ?) — plus ancienne due le ${fb.plus_ancienne}` : " ✅"}${fb.internes ? ` (+ ${fb.internes} interne(s))` : ""}`);
      const it = em.internes;
      if (it && (it.envoyes || it.echecs || it.ignores)) console.log(`   comptes internes (info)        : ${it.envoyes} envoyé(s), ${it.echecs} échec(s), ${it.ignores} ignoré(s)`);
      console.log(em.alerte ? `   🔴 ${em.alerte}` : "   ✅ pas d'alerte");
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
    // Studio (15/10/2026) : images « en cours » depuis > 1 h = le rattrapage
    // automatique (cron studio-reconcile-images) ne les débloque plus. Seuil > 0 = ⚠️.
    const sb = d.studio_images_bloquees;
    if (!sb) console.log("🖼️ Studio : non mesuré (edge cron-health pas redéployée)");
    else if (sb.erreur) console.log(`🖼️ Studio : ⚠️ non lu (${sb.erreur.slice(0, 90)})`);
    else console.log(`🖼️ Studio : ${sb.count} image(s) bloquée(s) en cours depuis > 1 h${sb.count ? "  ⚠️ rattrapage auto (cron studio-reconcile-images) en échec ?" : " ✅"}`);
    // Sonde 🧪 (audit de coût du 20/10/2026) : générations RÉELLES du compte de
    // recette sur 24 h (visite du matin + tests des sessions), comptées hors crédit.
    // Seuils : mardi à dimanche, attendu 0 (specs payantes le lundi seulement) ;
    // > 0 un autre jour = 🟡 (test réel d'une session, ou spec payante relancée) ;
    // > 3 € sur 24 h = 🔴 (la visite repaye chaque jour ?).
    const ct = d.compte_test_24h;
    if (!ct) console.log("🧪 Compte test 24 h : non mesuré (edge cron-health pas redéployée)");
    else if (ct.erreur) console.log(`🧪 Compte test 24 h : ⚠️ non lu (${ct.erreur.slice(0, 90)}) — migration ai_usage_hors_credit pas appliquée ?`);
    else {
      const lundi = new Date().getDay() === 1;
      const icone = ct.cout_estime_eur > 3 ? "🔴" : !lundi && ct.generations > 0 ? "🟡" : "✅";
      const detail = Object.entries(ct.actions || {}).map(([a, n]) => `${a} ×${n}`).join(", ");
      console.log(`🧪 Compte test 24 h : ${ct.generations} génération(s) payée(s) ≈ ${ct.cout_estime_eur} € ${icone}${detail ? ` (${detail})` : ""}`);
    }
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
    // Issue de la relecture (payée puis gardée, ou jetée par la garde de fidélité).
    const ri = cur.relecture_issues;
    if (ri && Object.keys(ri).length) {
      const { garde, ...statuts } = ri;
      const g = garde ? ` — bloquées par : ${Object.entries(garde).map(([k, v]) => `${k} ×${v}`).join(", ")}` : "";
      console.log(`      issue de la relecture : ${Object.entries(statuts).map(([k, v]) => `${k} ${v}`).join(", ")}${g}`);
    }
    if (cur.cout_total_estime_eur != null) {
      console.log(
        `   coût estimé 7 j : ${cur.cout_total_estime_eur} €${cur.cout_incomplet ? " ⚠️ INCOMPLET" : ""} (texte ${cur.cout_texte_estime_eur} € + images ${cur.cout_images_estime_eur} €)  (S-1 : ${prev.cout_total_estime_eur ?? "?"} €${prev.cout_incomplet ? " ⚠️ incomplet" : ""})`
      );
    }
    // Appels sans crédit (audit de coût du 20/10/2026) et total « tout compris »
    // à comparer à la console Anthropic (sonde 💳 de la routine du lundi).
    const hc = d.hors_credit_7j;
    if (!hc) console.log("   hors crédit 7 j : non mesuré (edge cron-health pas redéployée)");
    else if (hc.erreur) console.log(`   hors crédit 7 j : ⚠️ non lu (${hc.erreur.slice(0, 90)}) — migration ai_usage_hors_credit pas appliquée ?`);
    else {
      console.log(`   hors crédit 7 j : ≈ ${hc.cout_estime_eur} €`);
      for (const s of hc.par_source || []) console.log(`      ${String(s.source).padEnd(20)} ${String(s.appels).padStart(4)} appels  ${String(s.tokens).padStart(9)} tokens  ≈ ${s.cout_estime_eur} €`);
    }
    if (d.cout_estime_total_7j != null) {
      console.log(`   💳 coût estimé TOUT COMPRIS 7 j (clientes + internes + hors crédit) : ${d.cout_estime_total_7j} € → comparer au coût 7 j de la console Anthropic (alerte si la console dépasse 3 fois ce chiffre)`);
    }
    // Un modèle absent des grilles tarifaires compte 0 € : il doit CRIER, sinon
    // le total ment en silence (cas `claude-sonnet-5`, ~1 mois de sous-comptage).
    for (const m of cur.modeles_non_tarifes || []) {
      console.log(`      🔴 modèle NON TARIFÉ « ${m.modele} » : ${m.appels} appels / ${m.tokens} tokens comptés 0 € → ajouter son tarif dans cron-health/tarifs.ts`);
    }
    // Intégrité (12/10, #1458) : un compte ne doit avoir qu'UN espace owner.
    // Seuil : nouveaux_7j > 0 = 🔴 (le verrou SQL anti-doublon a sauté ou un
    // autre chemin en crée) ; le stock ancien est connu et reste neutre.
    const eo = d.espaces_owner_multiples;
    if (!eo) console.log("   🏠 espaces owner multiples : non mesuré (edge cron-health pas redéployée)");
    else {
      console.log(`   🏠 espaces owner multiples : ${eo.comptes} comptes, ${eo.nouveaux_7j} nouveaux sur 7 j${eo.nouveaux_7j > 0 ? " 🔴 doublon d'espace récent → vérifier le verrou de create_default_tasks / ensure_owner_workspace" : " ✅"}`);
      for (const it of (eo.items || []).filter((i) => new Date(i.dernier_ajout).getTime() >= Date.now() - 7 * 86400000)) {
        console.log(`      ${it.email}${it.interne ? " (interne)" : ""} : ${it.espaces} espaces, dernier ajouté ${it.dernier_ajout}`);
      }
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
    // a_la_main / emails_coupes : edge ≥ 18/10/2026 (absents sinon).
    const alaMain = d.publications.a_la_main != null ? `, dont ${d.publications.a_la_main} « publié moi-même »` : "";
    console.log(`   publications : ${d.publications.cette_semaine} cette semaine${alaMain} (S-1 : ${d.publications.semaine_precedente})`);
    // slides_refaites : edge ≥ 19/10/2026 (chantier AA ; pas de seuil, règle d'usage à 60 jours).
    const sr = d.slides_refaites;
    console.log(sr
      ? `   🔁 Slides refaites : ${sr.n} (${sr.clientes} cliente${sr.clientes > 1 ? "s" : ""}) · S-1 : ${sr.n_s1}${sr.internes ? ` · comptes internes : ${sr.internes}` : ""}`
      : "   🔁 Slides refaites : non mesuré (edge cron-health pas redéployée)");
    // fiches_coincees : edge ≥ 26/10/2026. Seuil : 0 attendu (bug #1809, 4 inscrites bloquées 25 j sur « Ta fiche de marque t'attend »).
    const fc = d.fiches_coincees;
    if (!fc) console.log("   🪪 Fiches coincées : non mesuré (edge cron-health pas redéployée)");
    else if (fc.erreur) console.log(`   🪪 Fiches coincées : lecture impossible (${fc.erreur})`);
    else console.log(fc.coincees
      ? `   ⚠️ 🪪 Fiches coincées « à relire » (≥ 6/7 cartes relues, > 24 h) : ${fc.coincees} cliente(s), la plus ancienne du ${fc.plus_ancienne} → la page Créer leur dit « Ta fiche de marque t'attend » (rattrapage SQL comme le 26/10)`
      : `   ✅ 🪪 Fiches coincées « à relire » : 0 (${fc.a_relire} fiche(s) simplement pas encore relue(s))`);
    const ec = d.emails_coupes;
    if (!ec) console.log("   e-mails génériques coupés : non mesuré (edge cron-health pas redéployée)");
    else if (ec.erreur) console.log(`   e-mails génériques coupés : lecture impossible (${ec.erreur})`);
    else console.log(ec.alerte
      ? `   ⚠️ e-mails génériques coupés le 18/10 : ${ec.envoyes_7j} reparti(s) sur 7 j (${Object.entries(ec.par_type).map(([k, v]) => `${k} ×${v}`).join(", ")}) — interrupteur rallumé ?`
      : "   ✅ e-mails génériques coupés le 18/10 : 0 envoyé sur 7 j");
    console.log(`   actives cette semaine : ${d.actives_cette_semaine}`);
    console.log("   rétention par cohorte d'inscription (active = ≥1 génération ou post sur 7 j) :");
    for (const c of d.cohortes || []) {
      // ont_genere_depuis_inscription : edge ≥ 14/10/2026 (absent sinon).
      const act = c.ont_genere_depuis_inscription != null
        ? ` — ${c.ont_genere_depuis_inscription}/${c.inscrites} ont créé au moins 1 contenu depuis l'inscription (${pct(c.ont_genere_depuis_inscription, c.inscrites)})`
        : "";
      console.log(`      ${c.semaine} (du ${c.du}) : ${c.actives_cette_semaine}/${c.inscrites} actives (${pct(c.actives_cette_semaine, c.inscrites)})${act}`);
    }

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
      // Garde anti-redite d'accroche (#915) : compté AVANT correction, car le
      // score et le quality_check ne voient que l'après. Absent = edge pas à jour.
      const gr = q.garde_anti_redite;
      if (gr === undefined) {
        console.log("   garde anti-redite d'accroche : non mesurée (edge cron-health pas redéployée)");
      } else if (gr) {
        const ligne = (g) => {
          const fmts = Object.entries(g.par_format || {}).map(([f, n]) => `${f}×${n}`).join(", ");
          return `${g.a_mordu} contenu(s) dont l'accroche redisait une accroche précédente (${g.echos_avant} écho(s)), garde armée sur ${g.garde_armee}/${g.contenus}${fmts ? ` — ${fmts}` : ""}`;
        };
        console.log(`   garde anti-redite d'accroche : ${ligne(gr.cette_semaine)}  (S-1 : ${gr.semaine_precedente.a_mordu}/${gr.semaine_precedente.garde_armee})`);
        if (gr.comptes_internes_7j?.contenus) console.log(`      comptes internes : ${ligne(gr.comptes_internes_7j)}`);
      }
      // Contrôle du fil des carrousels (08/10/2026) : la réparation coûte ~1 min
      // (réparation + 2e relecture) ; on décide de la garder sur ce taux.
      const fil = q.fil_carrousels;
      if (fil === undefined) {
        console.log("   fil des carrousels : non mesuré (edge cron-health pas redéployée)");
      } else if (fil) {
        const f = fil.cette_semaine, r = f.reparations, fp = fil.semaine_precedente;
        console.log(`   fil des carrousels : ${f.carrousels} contrôlé(s), ${f.a_reparer} à réparer, ${f.controle_non_abouti} contrôle(s) non abouti(s)`);
        console.log(`      réparations GARDÉES : ${r.gardees}/${r.tentees} (${pct(r.gardees, r.tentees)}) — locales ${r.locales_gardees}/${r.locales}, complètes ${r.completes_gardees}/${r.completes} ; sautées faute de temps : ${f.sautees_faute_de_temps}  (S-1 : ${fp.reparations.gardees}/${fp.reparations.tentees})`);
        const fi = fil.comptes_internes_7j;
        if (fi?.carrousels) console.log(`      comptes internes : ${fi.carrousels} contrôlé(s), réparations gardées ${fi.reparations.gardees}/${fi.reparations.tentees} (locales ${fi.reparations.locales_gardees}/${fi.reparations.locales}), sautées ${fi.sautees_faute_de_temps}, non aboutis ${fi.controle_non_abouti}`);
      }
      // Durées des carrousels (09/10/2026, PR #1428) : budget photo/mixte
      // (rédaction, juge, réparation, association des photos, borne 270 s).
      const durees = q.durees_carrousels;
      if (durees === undefined) {
        console.log("   durées des carrousels : non mesurées (edge cron-health pas redéployée)");
      } else if (durees) {
        const ETAPES = [["total_ms", "total"], ["write_ms", "rédaction"], ["thread_judge_ms", "juge"], ["thread_repair_ms", "réparation"], ["thread_recheck_ms", "rejuge"], ["match_ms", "association"]];
        const ligne = (label, d) => {
          const etapes = ETAPES.flatMap(([k, nom]) => d.etapes?.[k] ? [`${nom} ${d.etapes[k].mediane}/${d.etapes[k].p90}/${d.etapes[k].max} s`] : []).join(", ");
          return `      ${String(label).padEnd(18)} ${d.generations} génération(s) : ${etapes || "aucune durée"} ; réparations sautées ${d.reparations_sautees}, association non aboutie ${d.association_non_aboutie}, slides en ambiance ${d.slides_en_ambiance}, > 270 s ${d.au_dela_270s}, > 330 s ${d.au_dela_330s}`;
        };
        const cur = Object.entries(durees.cette_semaine || {});
        const internes = Object.entries(durees.comptes_internes_7j || {});
        console.log(`   durées des carrousels (médiane/90e centile/max) : ${cur.length ? "" : "aucune génération cliente mesurée"}`);
        for (const [label, d] of cur) console.log(ligne(label, d));
        if (internes.length) {
          console.log("      comptes internes :");
          for (const [label, d] of internes) console.log(ligne(label, d));
        }
      }
      // Plan des carrousels (12/10/2026) : gratuit, gardé en base depuis
      // (format carousel_plan). L'écran attend 170 s, le second appel part à 80 s.
      const plan = q.plan_carrousels;
      if (plan === undefined) {
        console.log("   plan des carrousels : non mesuré (edge cron-health pas redéployée)");
      } else if (plan) {
        const ligne = (type, p) => {
          const duree = p.duree ? `durée ${p.duree.mediane}/${p.duree.p90}/${p.duree.max} s` : "aucune durée";
          const erreurs = Object.entries(p.erreurs || {}).map(([k, n]) => `${k}×${n}`).join(", ");
          const photos = p.slides_obtenues ? `, slides avec photo ${p.slides_avec_photo}/${p.slides_obtenues}` : "";
          return `      ${String(type).padEnd(18)} ${p.plans} plan(s) : ${duree} ; second appel ${p.second_appel}/${p.plans} (${pct(p.second_appel, p.plans)}, gagné ${p.gagnes_par_second}), plans vides ${p.avec_plan_vide} (${p.reponses_vides} réponse(s)), mauvaise longueur ${p.mauvaise_longueur} (rendus hors longueur ${p.longueur_approchee}), > 170 s ${p.au_dela_170s}${photos}${erreurs ? `, erreurs : ${erreurs}` : ""}`;
        };
        const cur = Object.entries(plan.cette_semaine || {});
        const prev = Object.values(plan.semaine_precedente || {}).reduce((n, p) => n + p.plans, 0);
        const internes = Object.entries(plan.comptes_internes_7j || {});
        console.log(`   plan des carrousels (médiane/90e centile/max) : ${cur.length ? "" : "aucun plan client mesuré"}  (S-1 : ${prev} plan(s))`);
        for (const [type, p] of cur) console.log(ligne(type, p));
        if (internes.length) {
          console.log("      comptes internes :");
          for (const [type, p] of internes) console.log(ligne(type, p));
        }
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
          : q.echantillon_source === "comptes_internes"
            ? "⚠️ COMPTES INTERNES — aucune cliente cette semaine, à juger quand même, à ne pas lire comme la qualité clientes"
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
