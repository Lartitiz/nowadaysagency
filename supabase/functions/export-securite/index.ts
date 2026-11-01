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
import { COLONNE_TRI, contientUnSecret, retirerColonnes, TABLES_EXPORTEES } from "./tables.ts";

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
  const tables: Record<string, { lignes: number; octets: number; parties: number }> = {};
  const erreurs: Record<string, string> = {};
  const nonFaites: string[] = [];
  const secretsVus: string[] = [];

  for (const table of TABLES_EXPORTEES) {
    if (Date.now() - debut > BUDGET_MS) {
      nonFaites.push(table);
      continue;
    }
    try {
      let lignes = 0, octets = 0, partie = 0, attendues: number | null = null;
      for (let from = 0; ; from += PAGE) {
        const { data, error, count } = await supabase.from(table)
          .select("*", from === 0 ? { count: "exact" } : undefined)
          .order(COLONNE_TRI[table] || "id")
          .range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        if (from === 0) attendues = count;
        const rows = retirerColonnes(table, data || []);
        if (rows.length || from === 0) {
          const texte = JSON.stringify(rows);
          if (contientUnSecret(texte) && !secretsVus.includes(table)) secretsVus.push(table);
          const corps = await gzip(texte);
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
      // Une copie tronquée ne doit pas passer pour complète.
      if (attendues !== null && lignes < attendues) throw new Error(`${lignes} lignes copiées sur ${attendues}`);
      tables[table] = { lignes, octets, parties: partie };
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
    secrets_vus: secretsVus,
    tables,
  };
  const { error: errManifeste } = await supabase.storage.from(BUCKET).upload(`${dossier}/_manifeste.json`, JSON.stringify(manifeste, null, 1), {
    contentType: "application/json",
    upsert: true,
  });
  if (errManifeste) erreurs._manifeste = errManifeste.message.slice(0, 160);

  // Rotation : garder les GARDER exports les plus récents (dossiers AAAA-MM-JJ),
  // seulement si celui-ci est complet — jamais effacer un bon export pour un raté.
  const supprimes: string[] = [];
  const { data: racine, error: errRacine } = await supabase.storage.from(BUCKET).list("", { limit: 100 });
  if (errRacine) erreurs._rotation = errRacine.message.slice(0, 160);
  const dossiers = (racine || []).map((o) => o.name).filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n)).sort().reverse();
  if (!nonFaites.length && !Object.keys(erreurs).length) {
    for (const vieux of dossiers.slice(GARDER)) {
      try {
        // Tout effacer : ces copies gardent les données de clientes parties,
        // la politique de confidentialité promet qu'elles disparaissent.
        for (;;) {
          const { data: fichiers, error } = await supabase.storage.from(BUCKET).list(vieux, { limit: 1000 });
          if (error) throw error;
          if (!fichiers?.length) break;
          const { error: errRemove } = await supabase.storage.from(BUCKET).remove(fichiers.map((f) => `${vieux}/${f.name}`));
          if (errRemove) throw errRemove;
        }
        supprimes.push(vieux);
      } catch (e) {
        erreurs._rotation = `${vieux} : ${String((e as Error).message || e).slice(0, 140)}`;
      }
    }
  }
  const restants = dossiers.filter((d) => !supprimes.includes(d));

  const { tables: _detail, ...resume } = manifeste;
  return json({ ...resume, erreurs, anciens_exports_supprimes: supprimes, exports_gardes: restants });
});
