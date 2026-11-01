// Export de sécurité mensuel (14/10/2026).
//
// Lovable Cloud sauvegarde la base chaque jour, mais la seule restauration
// possible remet TOUTE la base à l'état de la veille (le travail des clientes
// depuis serait perdu). Cet export garde, une fois par mois, une copie de
// chaque table (hors secrets et journaux, cf. tables.ts) dans le bucket PRIVÉ
// `sauvegardes` (aucune policy : service_role seulement). Si un bug efface des
// lignes, on peut les remettre une à une à partir de cette copie.
//
// Appelée par la routine « audit mensuel » (e2e-visite/export-securite.mjs),
// protégée par le secret partagé CRON_STATS_SECRET (header x-cron-secret),
// comme cron-health. Les 3 exports les plus récents sont gardés.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { TABLES_EXPORTEES } from "./tables.ts";

const BUCKET = "sauvegardes";
const PAGE = 1000;
const GARDER = 3;
const BUDGET_MS = 330_000; // borne plateforme ~400 s

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function gzip(texte: string): Promise<Uint8Array> {
  const flux = new Blob([texte]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(flux).arrayBuffer());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const secret = Deno.env.get("CRON_STATS_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "Unauthorized" }, 401);

  const debut = Date.now();
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const dossier = new Date().toISOString().slice(0, 10);
  const tables: Record<string, { lignes: number; octets: number }> = {};
  const erreurs: Record<string, string> = {};
  const nonFaites: string[] = [];

  for (const table of TABLES_EXPORTEES) {
    if (Date.now() - debut > BUDGET_MS) {
      nonFaites.push(table);
      continue;
    }
    try {
      let lignes = 0, octets = 0, partie = 0, trie = true;
      for (let from = 0; ; from += PAGE) {
        // Ordre stable par id quand la table en a un (sinon pages non garanties).
        let { data, error } = await (trie
          ? supabase.from(table).select("*").order("id").range(from, from + PAGE - 1)
          : supabase.from(table).select("*").range(from, from + PAGE - 1));
        if (error && trie && from === 0 && /id/.test(error.message)) {
          trie = false;
          ({ data, error } = await supabase.from(table).select("*").range(from, from + PAGE - 1));
        }
        if (error) throw new Error(error.message);
        const rows = data || [];
        if (rows.length || from === 0) {
          const corps = await gzip(JSON.stringify(rows));
          const { error: up } = await supabase.storage.from(BUCKET)
            .upload(`${dossier}/${table}.${String(partie).padStart(3, "0")}.json.gz`, corps, {
              contentType: "application/gzip",
              upsert: true,
            });
          if (up) throw new Error(`upload : ${up.message}`);
          lignes += rows.length;
          octets += corps.length;
          partie++;
        }
        if (rows.length < PAGE) break;
      }
      tables[table] = { lignes, octets };
    } catch (e) {
      erreurs[table] = String((e as Error).message || e).slice(0, 160);
    }
  }

  const manifeste = {
    date: dossier,
    duree_s: Math.round((Date.now() - debut) / 1000),
    tables_copiees: Object.keys(tables).length,
    lignes: Object.values(tables).reduce((s, t) => s + t.lignes, 0),
    octets: Object.values(tables).reduce((s, t) => s + t.octets, 0),
    erreurs,
    non_faites: nonFaites,
    tables,
  };
  await supabase.storage.from(BUCKET).upload(`${dossier}/_manifeste.json`, JSON.stringify(manifeste, null, 1), {
    contentType: "application/json",
    upsert: true,
  });

  // Rotation : garder les GARDER exports les plus récents (dossiers AAAA-MM-JJ),
  // seulement si celui-ci est complet — jamais effacer un bon export pour un raté.
  const supprimes: string[] = [];
  if (!nonFaites.length && !Object.keys(erreurs).length) {
    const { data: racine } = await supabase.storage.from(BUCKET).list("", { limit: 100 });
    const dossiers = (racine || []).map((o) => o.name).filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n)).sort().reverse();
    for (const vieux of dossiers.slice(GARDER)) {
      const { data: fichiers } = await supabase.storage.from(BUCKET).list(vieux, { limit: 1000 });
      const chemins = (fichiers || []).map((f) => `${vieux}/${f.name}`);
      if (chemins.length) await supabase.storage.from(BUCKET).remove(chemins);
      supprimes.push(vieux);
    }
  }

  const { tables: _detail, ...resume } = manifeste;
  return json({ ...resume, anciens_exports_supprimes: supprimes });
});
