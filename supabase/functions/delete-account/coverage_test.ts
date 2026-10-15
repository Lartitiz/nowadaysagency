// Garde « rien n'est oublié » de la suppression de compte (RGPD), sans crédit
// ni réseau : lit le code et les migrations du dépôt.
// - chaque table de `src/integrations/supabase/types.ts` doit être soit vidée
//   par delete-account (phase1/phase2), soit effacée par CASCADE (vérifiée
//   dans les migrations), soit exclue ici avec sa raison ;
// - chaque bucket de stockage utilisé dans le code doit être classé « rangé
//   sous userId » ou « traité à part » dans storage-cleanup.ts.
// Une nouvelle table ou un nouveau bucket fait donc échouer ce test tant que
// personne n'a décidé comment l'effacer.
//
// Lancer : deno test --no-check --allow-read supabase/functions/delete-account/coverage_test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { SPECIAL_BUCKETS, USER_PREFIX_BUCKETS } from "./storage-cleanup.ts";

const ROOT = new URL("../../../", import.meta.url);
const read = (rel: string) => Deno.readTextFileSync(new URL(rel, ROOT));

// Tables effacées par la base elle-même quand le compte (auth.users), l'espace
// (workspaces) ou une ligne parente déjà vidée disparaît. Chaque ligne est
// vérifiée plus bas dans les migrations (`… REFERENCES <parent>(id) … ON DELETE CASCADE`).
const CASCADE: Record<string, { column: string; parent: string }> = {
  carousel_styles: { column: "user_id", parent: "auth.users" },
  credit_grants: { column: "user_id", parent: "auth.users" },
  payment_checkout_attempts: { column: "user_id", parent: "auth.users" },
  studio_brand_memory: { column: "user_id", parent: "auth.users" },
  studio_image_requests: { column: "version_id", parent: "public.visual_studio_versions" },
  studio_video_cohort_access: { column: "workspace_id", parent: "public.workspaces" },
  studio_video_jobs: { column: "user_id", parent: "auth.users" },
  studio_video_session_events: { column: "user_id", parent: "auth.users" },
  studio_video_sessions: { column: "user_id", parent: "auth.users" },
  visual_studio_compositions: { column: "user_id", parent: "auth.users" },
};

// Tables qui ne contiennent aucune donnée rattachée à un compte cliente.
const EXCLUDED: Record<string, string> = {
  email_templates: "modèles d'e-mails de l'app, communs à toutes",
  email_sequences: "définition des séquences d'e-mails, commune",
  email_sequence_steps: "étapes des séquences, communes",
  promo_codes: "codes promo créés par l'admin (l'usage est dans promo_redemptions)",
  webhook_events: "identifiants d'évènements Stripe déjà traités (anti-doublon), sans cliente",
  mini_audit_attempts: "anti-abus du mini-audit public (visiteuse anonyme : ip + pseudo, pas de compte)",
  carousel_media_backfill_backup: "copie de sauvegarde technique d'une migration ponctuelle (aucune colonne cliente)",
};

const OWNER_COLUMN = /^(user_id|workspace_id|created_by|owner_id|invited_by|hidden_by|client_user_id|user_a|user_b|author_id|[a-z_]+_user_id)$/;

function typedTables(): Record<string, string[]> {
  const types = read("src/integrations/supabase/types.ts");
  const section = types.slice(types.indexOf("Tables: {"), types.indexOf("Views: {"));
  const tables: Record<string, string[]> = {};
  for (const m of section.matchAll(/\n {6}([a-z0-9_]+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/g)) {
    tables[m[1]] = [...m[2].matchAll(/^\s+([a-z0-9_]+)\??:/gm)].map((c) => c[1]);
  }
  return tables;
}

function deletedByFunction(): Set<string> {
  const src = read("supabase/functions/delete-account/index.ts");
  const out = new Set<string>();
  for (const name of ["phase1", "phase2"]) {
    const start = src.indexOf(`const ${name}: string[] = [`);
    assert(start >= 0, `liste ${name} introuvable dans index.ts`);
    const body = src.slice(start, src.indexOf("];", start));
    for (const m of body.matchAll(/"([a-z0-9_]+)"/g)) out.add(m[1]);
  }
  return out;
}

function migrations(): string {
  const dir = new URL("supabase/migrations/", ROOT);
  return [...Deno.readDirSync(dir)].filter((e) => e.name.endsWith(".sql")).map((e) => e.name).sort()
    .map((name) => Deno.readTextFileSync(new URL(name, dir))).join("\n");
}

Deno.test("suppression de compte : chaque table est effacée, en cascade ou exclue avec sa raison", () => {
  const tables = typedTables();
  assert(Object.keys(tables).length > 100, "lecture de types.ts ratée");
  const deleted = deletedByFunction();
  const missing = Object.entries(tables)
    .filter(([t]) => !deleted.has(t) && !(t in CASCADE) && !(t in EXCLUDED))
    .map(([t, cols]) => `${t} (${cols.filter((c) => OWNER_COLUMN.test(c)).join(",") || "aucune colonne propriétaire"})`);
  assertEquals(missing, [], "tables oubliées par delete-account : ajoute-les à phase1, ou à CASCADE/EXCLUDED avec la preuve");
  for (const t of [...Object.keys(CASCADE), ...Object.keys(EXCLUDED)]) {
    assert(t in tables, `${t} n'existe plus dans types.ts : retire-la de la liste`);
    assert(!deleted.has(t), `${t} est à la fois vidée par la fonction et listée ici`);
  }
  for (const t of Object.keys(EXCLUDED)) {
    const owners = tables[t].filter((c) => OWNER_COLUMN.test(c));
    assertEquals(owners, [], `${t} a une colonne propriétaire : elle ne peut pas être exclue`);
  }
});

Deno.test("suppression de compte : chaque cascade annoncée existe dans les migrations", () => {
  const sql = migrations();
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const [table, { column, parent }] of Object.entries(CASCADE)) {
    const block = sql.match(new RegExp(`CREATE TABLE (?:IF NOT EXISTS )?(?:public\\.)?${table}\\s*\\(([\\s\\S]*?)\\n\\s*\\);`, "i"));
    assert(block, `CREATE TABLE ${table} introuvable`);
    const line = new RegExp(`^\\s*"?${column}"?\\s[^\\n]*REFERENCES\\s+${esc(parent)}\\s*\\(id\\)[^\\n]*ON DELETE CASCADE`, "im");
    assert(line.test(block[1]), `${table}.${column} n'a pas de REFERENCES ${parent}(id) ON DELETE CASCADE`);
  }
});

function* sourceFiles(dir: URL): Generator<{ path: string; text: string }> {
  for (const entry of Deno.readDirSync(dir)) {
    const url = new URL(entry.name + (entry.isDirectory ? "/" : ""), dir);
    if (entry.isDirectory) {
      if (["node_modules", "test", "__tests__"].includes(entry.name)) continue;
      yield* sourceFiles(url);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/(_test|\.test|\.spec)\.tsx?$/.test(entry.name)) {
      yield { path: url.pathname, text: Deno.readTextFileSync(url) };
    }
  }
}

Deno.test("suppression de compte : chaque bucket utilisé est classé (sous userId ou traité à part)", () => {
  const patterns = [
    /storage\s*\.from\(\s*["'`]([a-z0-9-]+)["'`]/g,
    /\b[A-Z_]*BUCKET[A-Z_]*\s*=\s*["'`]([a-z0-9-]+)["'`]/g,
    /\bbucket(?:Name)?\s*[:=]\s*["'`]([a-z0-9-]+)["'`]/g,
    /\b(?:uploadFile|checkUploadSize)\([^,()]+,\s*["'`]([a-z0-9-]+)["'`]/g,
  ];
  const found = new Map<string, string>();
  for (const dir of ["src/", "supabase/functions/"]) {
    for (const file of sourceFiles(new URL(dir, ROOT))) {
      for (const re of patterns) for (const m of file.text.matchAll(re)) found.set(m[1], file.path);
    }
  }
  const sql = migrations();
  for (const m of sql.matchAll(/bucket_id\s*=\s*'([a-z0-9-]+)'/g)) found.set(m[1], "migrations");
  for (const m of sql.matchAll(/INSERT INTO storage\.buckets[^;]*?VALUES\s*\(\s*'([a-z0-9-]+)'/gi)) found.set(m[1], "migrations");
  assert(found.size >= 10, "détection des buckets ratée");
  const known = new Set<string>([...USER_PREFIX_BUCKETS, ...Object.keys(SPECIAL_BUCKETS)]);
  const unknown = [...found].filter(([b]) => !known.has(b)).map(([b, where]) => `${b} (${where})`);
  assertEquals(unknown, [], "bucket non classé : où sont rangés ses fichiers ? ajoute-le à USER_PREFIX_BUCKETS ou à SPECIAL_BUCKETS (+ son effacement)");
  for (const b of USER_PREFIX_BUCKETS) assert(!(b in SPECIAL_BUCKETS), `${b} classé deux fois`);
});
