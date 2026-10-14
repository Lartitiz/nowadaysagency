import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { clientErrorsStats, emailsStats, santeQuotidienne } from "./sante-emails.ts";
import { isInternalEmail } from "../_shared/internal-accounts.ts";

const NOW = Date.parse("2026-10-14T08:00:00Z");
const emailOf = new Map(Object.entries({
  camille: "laetitiatest@nowadaysagency.com", // compte test de la visite
  admin: "laetitia@nowadaysagency.com",
  lea: "lea@cliente.fr",
}));
const ago = (h: number) => new Date(NOW - h * 3600000).toISOString();

// ── Le matin du 14/10 : 5 creer/render venus de la visite automatique ─────────
Deno.test("erreurs JS : les render du compte test ne comptent PAS côté clientes", () => {
  const rows = [
    ...Array.from({ length: 5 }, () => ({ user_id: "camille", kind: "render", route: "creer", asset: null, created_at: ago(3) })),
    { user_id: "lea", kind: "render", route: "calendrier", asset: null, created_at: ago(2) },
    { user_id: "lea", kind: "chunk", route: "creer", asset: "index-abc.js", created_at: ago(1) },
  ];
  const s = clientErrorsStats(rows, emailOf, isInternalEmail);
  assertEquals(s.count, 2);
  assertEquals(s.render, 1, "1 écran planté vu par une vraie cliente");
  assertEquals(s.par_ecran, { "calendrier/render": 1, "creer/chunk": 1 });
  assertEquals(s.internes, { count: 5, par_ecran: { "creer/render": 5 } });
  assertEquals(Object.keys(s.items[0]).includes("user_id"), false, "pas d'identité en sortie");
});

Deno.test("erreurs JS : sans profil connu = côté clientes (on ne cache pas un plantage)", () => {
  const s = clientErrorsStats([{ user_id: "inconnue", kind: "render", route: "x", asset: null, created_at: ago(1) }], emailOf, isInternalEmail);
  assertEquals(s.count, 1);
  assertEquals(s.internes.count, 0);
});

const nom = (id: string | null | undefined) => (id === "t1" ? "Bienvenue J+1" : null);

Deno.test("e-mails : tout va bien → pas d'alerte ; internes à part", () => {
  const sends = [
    { user_id: "lea", to_email: "lea@cliente.fr", template_id: "t1", status: "sent", sent_at: ago(2) },
    { user_id: "lea", to_email: "lea@cliente.fr", template_id: "t1", status: "opened", sent_at: ago(5) },
    { user_id: "lea", to_email: "lea@cliente.fr", template_id: "t1", status: "skipped", error: "Plafond", sent_at: ago(6) },
    { user_id: "camille", to_email: "laetitiatest@nowadaysagency.com", template_id: "t1", status: "failed", error: "x", sent_at: ago(1) },
    { user_id: null, to_email: "laetitia@nowadaysagency.com", template_id: null, status: "sent", sent_at: ago(1) },
    { user_id: "lea", to_email: "lea@cliente.fr", template_id: "t1", status: "failed", sent_at: ago(30) }, // hors 24 h
  ];
  const s = emailsStats(sends, [], emailOf, isInternalEmail, nom, NOW);
  assertEquals([s.envoyes, s.echecs, s.ignores], [2, 0, 1]);
  assertEquals(s.internes, { envoyes: 1, echecs: 1, ignores: 0 });
  assertEquals(s.alerte, null);
});

Deno.test("e-mails : échec client → 🔴 avec type et erreur tronquée", () => {
  const sends = [
    { user_id: "lea", to_email: "lea@cliente.fr", template_id: "t1", status: "failed", error: "y".repeat(300), sent_at: ago(1) },
    { user_id: null, to_email: "a@b.fr, laetitia@nowadaysagency.com", template_id: "zz", status: "bounced", sent_at: ago(2) },
  ];
  const s = emailsStats(sends, [], emailOf, isInternalEmail, nom, NOW);
  assertEquals(s.echecs, 2, "un destinataire externe suffit pour compter côté clientes");
  assertEquals(s.echecs_items[0].type, "Bienvenue J+1");
  assertEquals(s.echecs_items[0].erreur?.length, 140);
  assertEquals(s.echecs_items[1].type, "modèle inconnu");
  assertEquals(s.alerte, "2 e-mail(s) en échec");
});

Deno.test("e-mails : file bloquée > 1 h → 🔴 ; 59 min = pas encore ; internes à part", () => {
  const queue = [
    { user_id: "lea", scheduled_at: ago(3), sent: false, cancelled: false },
    { user_id: "lea", scheduled_at: ago(0.98), sent: false, cancelled: false },
    { user_id: "camille", scheduled_at: ago(5), sent: false, cancelled: false },
  ];
  const s = emailsStats([], queue, emailOf, isInternalEmail, nom, NOW);
  assertEquals(s.file_bloquee, { count: 1, plus_ancienne: ago(3), internes: 1 });
  assertEquals(s.envoyes, 0, "0 envoyé n'alerte pas seul");
  assertEquals(s.alerte, "1 e-mail(s) en attente depuis > 1 h (cron d'envoi mort ?)");
});

Deno.test("santeQuotidienne : une table e-mails illisible n'empêche pas les erreurs JS", async () => {
  const fake = (_s: unknown, table: string) =>
    table === "client_error_events"
      ? Promise.resolve([{ user_id: "lea", kind: "render", route: "creer", asset: null, created_at: ago(1) }])
      : Promise.reject(new Error(`relation ${table} does not exist`));
  const s = await santeQuotidienne(null, NOW, fake, emailOf, isInternalEmail);
  assertEquals(s.client_errors_24h.render, 1);
  assertEquals(s.emails_24h, { erreur: "relation email_sends does not exist" });
});
