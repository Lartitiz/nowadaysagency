#!/usr/bin/env node
// Sonde « migration mergée mais pas appliquée » — l'angle mort du 23/10/2026.
//
// Pourquoi elle existe : la migration 20261016200000_stats_instagram_source.sql
// (nouvelle source « instagram » de save_monthly_stats) est restée une semaine sur
// main sans être appliquée en production. « Remplir depuis Instagram » répondait
// 400 `Invalid stats patch`, l'écran n'affichait qu'un toast générique, et ni la
// visite du matin ni le bilan du lundi ne l'ont vu.
//
// Principe : purement GIT, zéro réseau, zéro login, zéro crédit. Depuis le 03/10/2026,
// l'agent Lovable note chaque migration de schéma qu'il applique dans
// `drizzle/migrations/meta/_journal.json` (tag `NNNN_<nom>`, nom parfois rallongé :
// `saved_idea_previews` → `0003_saved_idea_previews_functions`). Une migration de
// `supabase/migrations/` qui crée, modifie ou supprime un objet (CREATE / ALTER / DROP)
// sans entrée dans ce journal n'est probablement PAS en production.
//
// Ce que la sonde ne sait pas voir : les migrations de données seules (INSERT, UPDATE,
// DELETE : code promo, e-mails coupés…) ne passent pas par le journal. Elle les liste
// à titre d'info quand elles ont moins de 7 jours, à vérifier par un SELECT dans
// l'éditeur SQL de Lovable (Database → Manage → SQL editor, sans crédit).
//
// Usage : node e2e-visite/migrations-non-appliquees.mjs → VERDICT: OK | WARN
// Lancée chaque lundi par code-health.mjs (bilan hebdo).

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Début du journal Lovable : les migrations plus anciennes ont été appliquées autrement.
const DEBUT_JOURNAL = "20261003120000";

// Appliquées en production (vérifié par SELECT) mais absentes du journal Lovable.
// N'ajouter une ligne qu'après avoir lu l'objet en base, avec la date de la lecture.
export const VERIFIEES_A_LA_MAIN = {
  // saved_idea_has_content, saved_idea_preview_of, saved_ideas_fill_preview + déclencheur : lus le 23/10/2026.
  "20261004170000_saved_ideas_stored_preview": "2026-10-23",
};

const LOVABLE_UUID = /^\d{14}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Retire les commentaires SQL (`--` en fin de ligne et blocs). */
function sansCommentaires(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "");
}

export function estSchema(sql) {
  return /\b(create|alter|drop)\s/i.test(sansCommentaires(sql));
}

/** Le journal connaît-il ce nom ? Préfixe dans un sens ou dans l'autre. */
export function dansLeJournal(nom, nomsJournal) {
  return nomsJournal.some((j) => j === nom || j.startsWith(`${nom}_`) || nom.startsWith(`${j}_`));
}

/**
 * migrations : [{ fichier: "20261016200000_stats_instagram_source", sql }]
 * tags : tags du journal drizzle (`0011_stats_instagram_source`)
 */
export function analyser({ migrations, tags, now = Date.now(), verifiees = VERIFIEES_A_LA_MAIN }) {
  const nomsJournal = tags.map((t) => t.replace(/^\d+_/, ""));
  const nonAppliquees = [];
  const donneesRecentes = [];
  for (const { fichier, sql } of migrations) {
    if (fichier < DEBUT_JOURNAL || LOVABLE_UUID.test(fichier) || verifiees[fichier]) continue;
    const nom = fichier.replace(/^\d{14}_/, "");
    if (estSchema(sql)) {
      if (!dansLeJournal(nom, nomsJournal)) nonAppliquees.push(fichier);
    } else {
      const t = fichier.slice(0, 14);
      const date = Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8));
      if (now - date <= 7 * 86_400_000) donneesRecentes.push(fichier);
    }
  }
  return { nonAppliquees, donneesRecentes };
}

export function lireDepot(root = process.cwd()) {
  const dir = join(root, "supabase", "migrations");
  const migrations = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({ fichier: f.replace(/\.sql$/, ""), sql: readFileSync(join(dir, f), "utf8") }));
  const journal = JSON.parse(readFileSync(join(root, "drizzle", "migrations", "meta", "_journal.json"), "utf8"));
  return { migrations, tags: (journal.entries || []).map((e) => e.tag) };
}

/** Lignes du bilan + verdict. */
export function rapport(res) {
  const lignes = ["🗄️ Migrations du dépôt appliquées en production (journal Lovable)"];
  if (res.nonAppliquees.length) {
    lignes.push(`   ⚠️ ${res.nonAppliquees.length} migration(s) de schéma absente(s) du journal Lovable, sans doute PAS en ligne :`);
    for (const f of res.nonAppliquees) lignes.push(`      ${f}.sql`);
    lignes.push("   → vérifier par un SELECT (éditeur SQL Lovable, sans crédit) ; si absente : une demande Lovable « apply exactly as written ».");
    lignes.push("     Si elle est bien en ligne : l'ajouter à VERIFIEES_A_LA_MAIN (e2e-visite/migrations-non-appliquees.mjs).");
  } else {
    lignes.push("   ✅ toutes les migrations de schéma depuis le 03/10/2026 sont dans le journal");
  }
  if (res.donneesRecentes.length) {
    lignes.push(`   ℹ️ migration(s) de données de la semaine, hors journal (à vérifier par SELECT) : ${res.donneesRecentes.join(", ")}`);
  }
  return { lignes, verdict: res.nonAppliquees.length ? "WARN" : "OK" };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    const { lignes, verdict } = rapport(analyser(lireDepot()));
    console.log(lignes.join("\n"));
    console.log(`\nVERDICT: ${verdict}`);
  } catch (e) {
    console.log(`🗄️ Migrations — lecture impossible (${e.message})\n\nVERDICT: INCOMPLET`);
  }
  process.exit(0);
}
