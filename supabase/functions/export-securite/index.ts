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
//
// Une fonction n'a pas assez de ressources pour tout copier d'un coup (546 sur
// le premier vrai export, à cause de saved_ideas) : chaque appel copie un
// morceau, range où il en est dans `<date>/_etat.json` et répond `termine`.
// Le script rappelle jusqu'au bout. Après un 546 il repart du dernier état avec
// des morceaux plus petits.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.3";
import { COLONNE_TRI, retirerColonnes, retirerSecrets, TABLES_EXPORTEES, tailleSuivante } from "./tables.ts";

const BUCKET = "sauvegardes";
const PAGE_MAX = 1000;
const GARDER = 3;
const BUDGET_MS = 120_000;
const CIBLE_OCTETS_PAGE = 1_000_000;
// Lignes connues pour être très lourdes : commencer petit.
const PAGE_DEPART: Record<string, number> = { saved_ideas: 5 };

type Etat = {
  date: string;
  indice: number;
  from: number;
  partie: number;
  lignes_table: number;
  octets_table: number;
  duree_ms: number;
  tables: Record<string, { lignes: number; octets: number; parties: number }>;
  erreurs: Record<string, string>;
  secrets_vus: Record<string, number>;
  liens_signes_retires: Record<string, number>;
};

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
  const corpsAppel = await req.json().catch(() => ({}));
  const plafondOctets = Math.max(1, Number(corpsAppel.plafond_mo) || 15) * 1_000_000;
  const pageMax = Math.max(1, Math.min(PAGE_MAX, Number(corpsAppel.page_max) || PAGE_MAX));
  const stockage = supabase.storage.from(BUCKET);

  const lireEtat = async (date: string): Promise<Etat | null> => {
    const { data, error } = await stockage.download(`${date}/_etat.json`);
    if (error || !data) return null;
    return JSON.parse(await data.text());
  };
  const ecrire = async (chemin: string, contenu: unknown) => {
    const { error } = await stockage.upload(chemin, JSON.stringify(contenu), { contentType: "application/json", upsert: true });
    if (error) throw new Error(`${chemin} : ${error.message}`);
  };

  const dateAppel = typeof corpsAppel.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(corpsAppel.date) ? corpsAppel.date : null;
  const etat: Etat = (dateAppel && await lireEtat(dateAppel)) || {
    date: dateAppel || new Date().toISOString().slice(0, 10),
    indice: 0, from: 0, partie: 0, lignes_table: 0, octets_table: 0, duree_ms: 0,
    tables: {}, erreurs: {}, secrets_vus: {}, liens_signes_retires: {},
  };

  let lusCetAppel = 0;
  const reste = () => Date.now() - debut < BUDGET_MS && lusCetAppel < plafondOctets;

  while (etat.indice < TABLES_EXPORTEES.length && reste()) {
    const table = TABLES_EXPORTEES[etat.indice];
    try {
      let taille = Math.min(pageMax, PAGE_DEPART[table] || 200);
      let fini = false;
      while (reste()) {
        const { data, error } = await supabase.from(table).select("*")
          .order(COLONNE_TRI[table] || "id")
          .range(etat.from, etat.from + taille - 1);
        // La base coupe la lecture de lignes trop lourdes : reprendre plus petit.
        if (error && /statement timeout/i.test(error.message) && taille > 1) {
          taille = Math.max(1, Math.floor(taille / 10));
          continue;
        }
        if (error) throw new Error(error.message);
        const lues = data?.length || 0;
        if (lues || etat.from === 0) {
          const nettoye = retirerSecrets(JSON.stringify(retirerColonnes(table, data || [])));
          if (nettoye.autres) etat.secrets_vus[table] = (etat.secrets_vus[table] || 0) + nettoye.autres;
          if (nettoye.liensSignes) etat.liens_signes_retires[table] = (etat.liens_signes_retires[table] || 0) + nettoye.liensSignes;
          const gz = await gzip(nettoye.texte);
          const { error: up } = await stockage
            .upload(`${etat.date}/${table}.${String(etat.partie).padStart(4, "0")}.json.gz`, gz, {
              contentType: "application/gzip",
              upsert: true,
            });
          if (up) throw new Error(`upload : ${up.message}`);
          lusCetAppel += nettoye.texte.length;
          etat.lignes_table += lues;
          etat.octets_table += gz.length;
          etat.partie++;
          if (lues < taille) {
            fini = true;
            break;
          }
          taille = Math.min(pageMax, tailleSuivante(taille, nettoye.texte.length, CIBLE_OCTETS_PAGE, PAGE_MAX));
          etat.from += lues;
        } else {
          fini = true;
          break;
        }
      }
      if (!fini) break; // Plafond de cet appel atteint : l'appel suivant reprend ici.
      // Une copie tronquée ne doit pas passer pour complète.
      const { count, error: errCompte } = await supabase.from(table).select("*", { count: "exact", head: true });
      if (errCompte) throw new Error(errCompte.message);
      if (count !== null && etat.lignes_table < count) throw new Error(`${etat.lignes_table} lignes copiées sur ${count}`);
      etat.tables[table] = { lignes: etat.lignes_table, octets: etat.octets_table, parties: etat.partie };
    } catch (e) {
      etat.erreurs[table] = String((e as Error).message || e).slice(0, 160);
    }
    etat.indice++;
    etat.from = etat.partie = etat.lignes_table = etat.octets_table = 0;
  }

  etat.duree_ms += Date.now() - debut;
  await ecrire(`${etat.date}/_etat.json`, etat);
  const termine = etat.indice >= TABLES_EXPORTEES.length;
  const valeursTables = Object.values(etat.tables);
  const avancement = {
    date: etat.date,
    termine,
    avancement: `${etat.indice}/${TABLES_EXPORTEES.length}`,
    duree_s: Math.round(etat.duree_ms / 1000),
    tables_copiees: valeursTables.length,
    lignes: valeursTables.reduce((s, t) => s + t.lignes, 0),
    octets: valeursTables.reduce((s, t) => s + t.octets, 0),
    erreurs: etat.erreurs,
    secrets_vus: etat.secrets_vus,
    liens_signes_retires: etat.liens_signes_retires,
  };
  if (!termine) return json(avancement);

  await ecrire(`${etat.date}/_manifeste.json`, { ...avancement, tables: etat.tables });

  // Rotation : garder les GARDER exports les plus récents (dossiers AAAA-MM-JJ),
  // seulement si celui-ci est complet — jamais effacer un bon export pour un raté.
  const erreurs = { ...etat.erreurs };
  const supprimes: string[] = [];
  const { data: racine, error: errRacine } = await stockage.list("", { limit: 100 });
  if (errRacine) erreurs._rotation = errRacine.message.slice(0, 160);
  const dossiers = (racine || []).map((o) => o.name).filter((n) => /^\d{4}-\d{2}-\d{2}$/.test(n)).sort().reverse();
  if (!Object.keys(erreurs).length) {
    for (const vieux of dossiers.slice(GARDER)) {
      try {
        // Tout effacer : ces copies gardent les données de clientes parties,
        // la politique de confidentialité promet qu'elles disparaissent.
        for (;;) {
          const { data: fichiers, error } = await stockage.list(vieux, { limit: 1000 });
          if (error) throw error;
          if (!fichiers?.length) break;
          const { error: errRemove } = await stockage.remove(fichiers.map((f) => `${vieux}/${f.name}`));
          if (errRemove) throw errRemove;
        }
        supprimes.push(vieux);
      } catch (e) {
        erreurs._rotation = `${vieux} : ${String((e as Error).message || e).slice(0, 140)}`;
      }
    }
  }
  return json({
    ...avancement,
    erreurs,
    anciens_exports_supprimes: supprimes,
    exports_gardes: dossiers.filter((d) => !supprimes.includes(d)),
  });
});
