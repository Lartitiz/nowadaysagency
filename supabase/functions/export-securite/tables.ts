// Tables copiées par l'export de sécurité mensuel, et celles exclues (avec la
// raison). Toute table de la base doit être dans l'une des deux listes :
// tables_test.ts compare avec src/integrations/supabase/types.ts, pour qu'une
// table ajoutée ne soit jamais oubliée en silence.

// Exclues : secrets, journaux techniques volumineux, caches recalculables.
export const TABLES_EXCLUES: Record<string, string> = {
  social_connections: "jetons de connexion aux réseaux (secrets) — reconnecter suffit",
  oauth_states: "états OAuth temporaires (secrets éphémères)",
  webhook_events: "journal technique Stripe, rejouable depuis Stripe",
  frontend_debug_logs: "journal technique",
  client_error_events: "journal technique (purgé chaque nuit)",
  scrape_cache: "cache recalculable",
  dashboard_clicks: "journal de clics",
  email_queue: "file d'envoi technique",
  email_sends: "journal d'envois",
  studio_video_session_events: "journal technique",
  carousel_media_backfill_backup: "table de transit vidée le 04/10/2026",
  content_quality_events: "mesures de qualité (journal), volumineux",
  mini_audit_attempts: "anti-abus du mini-audit public : adresses IP de visiteuses sans compte, à ne pas dupliquer",
};

// Colonnes retirées de la copie : les jetons qui ouvrent un lien de partage,
// une invitation ou un retour de prestataire. Une ligne restaurée aura besoin
// d'un nouveau lien. tables_test.ts échoue si une colonne au nom de secret
// n'est ni ici ni dans une table exclue.
export const COLONNES_MASQUEES: Record<string, string[]> = {
  calendar_shares: ["share_token"],
  shared_branding_links: ["token"],
  studio_image_requests: ["callback_token"],
  studio_video_jobs: ["webhook_token"],
  workspace_invitations: ["token"],
};

// Colonne de tri des tables sans `id` : sans ordre stable, les pages de 1000
// lignes peuvent se chevaucher ou en oublier.
export const COLONNE_TRI: Record<string, string> = {
  checkout_attempts: "attempt_id",
  credit_grants: "checkout_session_id",
  payment_checkout_attempts: "attempt_id",
  studio_image_requests: "version_id",
  studio_video_cohort_access: "workspace_id",
};

export function retirerColonnes(table: string, lignes: Record<string, unknown>[]): Record<string, unknown>[] {
  const masquees = COLONNES_MASQUEES[table];
  if (!masquees) return lignes;
  return lignes.map((l) => Object.fromEntries(Object.entries(l).filter(([c]) => !masquees.includes(c))));
}

// Dernier filet, sur le contenu réel : formes connues de clés et de jetons
// (JWT, Stripe, Anthropic, OpenAI, Meta, Google) dans un texte ou un JSON. La
// valeur n'est jamais recopiée. Le cas normal est le jeton d'un lien signé vers
// une photo, en base dans des contenus : le lien cassé se régénère. Tout autre
// cas est compté à part et signalé en rouge.
const FORMES_DE_SECRET = /eyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]*|\b(?:sk|rk)_live_\w{10,}|\bwhsec_\w{10,}|\bsk-(?:ant-|proj-)?[\w-]{20,}|\bEAA[A-Za-z0-9]{40,}|\bya29\.[\w-]{20,}/g;

export function retirerSecrets(texte: string): { texte: string; liensSignes: number; autres: number } {
  let liensSignes = 0, autres = 0;
  const propre = texte.replace(FORMES_DE_SECRET, (valeur, position: number) => {
    if (valeur.startsWith("eyJ") && /[?&]token=$/.test(texte.slice(Math.max(0, position - 7), position))) liensSignes++;
    else autres++;
    return "[retire]";
  });
  return { texte: propre, liensSignes, autres };
}
