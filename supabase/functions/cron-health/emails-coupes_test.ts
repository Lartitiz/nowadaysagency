import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { EMAILS_COUPES, emailsCoupesStats, publicationsAlaMain } from "./emails-coupes.ts";

const NOW = Date.parse("2026-10-19T08:00:00Z");
const FROM = NOW - 7 * 86400000;
const ago = (j: number) => new Date(NOW - j * 86400000).toISOString();
const noms: Record<string, string> = { hebdo: "Rendez-vous hebdo - idées de la semaine", bienvenue: "Bienvenue", teaser: "Teaser premium" };
const nom = (id: string | null | undefined) => (id ? noms[id] ?? null : null);

Deno.test("e-mails coupés : aucun envoi → pas d'alerte", () => {
  const s = emailsCoupesStats([{ template_id: "bienvenue", status: "sent", sent_at: ago(1) }], nom, FROM, NOW);
  assertEquals(s, { envoyes_7j: 0, par_type: {}, alerte: false });
});

Deno.test("e-mails coupés : un envoi de la semaine alerte, par nom ; hors fenêtre, ignoré ou en échec ne comptent pas", () => {
  const s = emailsCoupesStats([
    { template_id: "hebdo", status: "opened", sent_at: ago(2) },
    { template_id: "teaser", status: "skipped", sent_at: ago(2) },
    { template_id: "teaser", status: "sent", sent_at: ago(9) },
    { template_id: "hebdo", status: "failed", sent_at: ago(1) },
  ], nom, FROM, NOW);
  assertEquals(s, { envoyes_7j: 1, par_type: { "Rendez-vous hebdo - idées de la semaine": 1 }, alerte: true });
});

Deno.test("e-mails coupés : les indispensables n'y sont pas", () => {
  for (const garde of ["Bienvenue", "Paiement échoué", "Abonnement activé - Premium"]) assertEquals(EMAILS_COUPES.includes(garde), false);
});

Deno.test("publications à la main : published sans statut d'API, dans la semaine", () => {
  const n = publicationsAlaMain([
    { status: "published", publish_status: null, published_at: ago(1) },
    { status: "published", publish_status: "published", published_at: ago(1) },
    { status: "published", publish_status: null, published_at: ago(10) },
    { status: "drafting", publish_status: null, published_at: null },
  ], FROM, NOW);
  assertEquals(n, 1);
});
