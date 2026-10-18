// cron-health, scope weekly : les e-mails génériques coupés le 18/10/2026 (choix
// de Laetitia : ~300 envois en 90 jours, 10 clics) ne doivent plus partir, et
// « Je l'ai publié moi-même » (fenêtre Publier de /creer) se compte à part.
// Fonctions pures, testées par emails-coupes_test.ts. Jamais d'adresse en sortie.
//
// La coupure est un interrupteur (migration 20261018120000) : séquences et
// modèles `is_active = false`, rien d'effacé. Si l'un d'eux repart sans qu'on
// l'ait rallumé exprès, la ligne du lundi passe en ⚠️.
import { inWindow } from "./fenetres.ts";

/** Noms exacts des modèles (table email_templates) coupés le 18/10/2026. */
export const EMAILS_COUPES = [
  "Rendez-vous hebdo - idées de la semaine",
  "Relance inactive 7j",
  "Relance inactive 14j",
  "Relance inactive 30j",
  "Relance activation - jamais généré",
  "Tips branding J+3",
  "Teaser premium",
  "Crédits épuisés",
  "Rappel contenu jamais publié",
  "Rapport mensuel - stats Instagram",
  "Win-back résiliation",
];

// Statuts « bien parti » posés par send-email puis resend-webhook (comme sante-emails.ts).
const PARTIS = new Set(["sent", "opened", "clicked"]);

/** sends : lignes email_sends ; templateName : template_id → nom. Clientes ET internes. */
export function emailsCoupesStats(
  sends: any[],
  templateName: (id: string | null | undefined) => string | null,
  from: number,
  to: number,
) {
  const coupes = new Set(EMAILS_COUPES);
  const par_type: Record<string, number> = {};
  let envoyes = 0;
  for (const s of sends) {
    if (!PARTIS.has(s.status) || !inWindow(s.sent_at, from, to)) continue;
    const nom = templateName(s.template_id);
    if (!nom || !coupes.has(nom)) continue;
    envoyes++;
    par_type[nom] = (par_type[nom] || 0) + 1;
  }
  return { envoyes_7j: envoyes, par_type, alerte: envoyes > 0 };
}

/**
 * Publications de la semaine, dont celles notées « publié moi-même » : statut
 * published SANS statut d'API (publish_status vide) — même règle que « Marquer
 * comme publié » du calendrier.
 */
export function publicationsAlaMain(cal: any[], from: number, to: number) {
  return cal.filter((c: any) => c.status === "published" && !c.publish_status && inWindow(c.published_at, from, to)).length;
}
