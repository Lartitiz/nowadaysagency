import { describe, it, expect } from "vitest";
import path from "path";
// Helper JS partagé avec la visite guidée (étape 7ter) : une seule source de vérité
// pour la garde, deux consommateurs (CI bloquante ici, rapport quotidien là-bas).
import { scanSource, scanRepo, stripeSourceFiles } from "../../e2e-visite/stripe-api-guard.mjs";

// Garde CI de l'incident Stripe 24-31/07/2026 : le webhook a renvoyé des 500 en boucle
// pendant 8 jours parce que le code lisait des champs SUPPRIMÉS par la version d'API
// Basil (2025-03-31). Ni le type-check ni les tests ne l'ont vu — d'où ce scan.
// Le même helper alimente l'étape 7ter de la visite guidée quotidienne.
//
// 🔑 Chaque règle est validée par un test qui FABRIQUE le bug (le code réel d'avant
// le correctif), pas seulement par le vert du code corrigé.

type Finding = { regle: string; quoi: string; file: string };
const regles = (f: Finding[]) => f.map((x) => x.regle);

describe("garde API Stripe — périodes de facturation (Basil les a déplacées sur les items)", () => {
  it("attrape le code d'AVANT le correctif (lecture nue sur l'objet Subscription)", () => {
    const bug = `
      const sub = await stripe.subscriptions.retrieve(session.subscription as string);
      await supabase.from("subscriptions").upsert({
        current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
        current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      });
    `;
    const f: Finding[] = scanSource("bug.ts", bug);
    expect(regles(f)).toContain("periode-subscription");
    expect(regles(f)).toContain("date-non-gardee");
  });

  it("laisse passer la lecture sur l'item avec repli (le correctif)", () => {
    const ok = `
      function getPeriod(sub: Stripe.Subscription) {
        const s = sub as unknown as AnyRec;
        const item = (s.items?.data?.[0] ?? {}) as AnyRec;
        return { start: toIso(item.current_period_start ?? s.current_period_start) };
      }
    `;
    expect(scanSource("ok.ts", ok)).toEqual([]);
  });

  it("ne confond pas une LIGNE BDD avec un objet Stripe (check-subscription lit la même colonne)", () => {
    const ligneBdd = `
      const { data: sub } = await supabaseClient.from("subscriptions").select("*").single();
      return new Response(JSON.stringify({ current_period_end: sub?.current_period_end }));
    `;
    expect(scanSource("bdd.ts", ligneBdd)).toEqual([]);
  });
});

describe("garde API Stripe — invoice.subscription (le bug SILENCIEUX)", () => {
  it("attrape la lecture directe (undefined sans erreur → handler muet, 200 menteur)", () => {
    const bug = `
      const invoice = event.data.object as Stripe.Invoice;
      const subId = invoice.subscription as string;
      if (!subId) break;
    `;
    expect(regles(scanSource("bug.ts", bug))).toContain("invoice-subscription");
  });

  it("laisse passer le chemin Basil avec repli", () => {
    const ok = `
      function getInvoiceSubscriptionId(invoice: Stripe.Invoice) {
        const i = invoice as unknown as AnyRec;
        return i.parent?.subscription_details?.subscription ?? i.subscription ?? null;
      }
    `;
    expect(scanSource("ok.ts", ok)).toEqual([]);
  });

  it("ne touche pas à session.subscription, qui reste valide en Basil", () => {
    const ok = `
      const session = event.data.object as Stripe.Checkout.Session;
      const sub = await stripe.subscriptions.retrieve(session.subscription as string);
    `;
    expect(scanSource("ok.ts", ok)).toEqual([]);
  });
});

describe("garde API Stripe — conversion de date non gardée (le détonateur du 500)", () => {
  it("attrape new Date(champ * 1000) sans garde", () => {
    const bug = `const sub = await stripe.subscriptions.retrieve(id);
      const d = new Date(sub.trial_end * 1000).toISOString();`;
    expect(regles(scanSource("bug.ts", bug))).toContain("date-non-gardee");
  });

  it("laisse passer un ternaire de garde et un helper typé", () => {
    const ok = `
      function toIso(unixSeconds: unknown): string | null {
        if (typeof unixSeconds !== "number" || !Number.isFinite(unixSeconds)) return null;
        const d = new Date(unixSeconds * 1000);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
      }
      const sub = await stripe.subscriptions.retrieve(id);
      const cancel = sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString() : null;
    `;
    expect(scanSource("ok.ts", ok)).toEqual([]);
  });
});

describe("garde API Stripe — état réel du dépôt", () => {
  it("scanne bien les edge functions qui touchent à Stripe", () => {
    const fichiers = stripeSourceFiles(process.cwd()).map((f: { file: string }) => f.file);
    // Si ce fichier n'est plus scanné, c'est que la découverte est cassée : le scan
    // « vert » ne prouverait plus rien (anti « vert menteur »).
    expect(fichiers).toContain(path.join("supabase", "functions", "stripe-webhook", "index.ts"));
  });

  it("aucune lecture d'un champ supprimé par Stripe Basil", () => {
    const findings: Finding[] = scanRepo(process.cwd());
    expect(
      findings.map((f) => `${f.file} → ${f.quoi} [${f.regle}]`),
      "champ Stripe périmé : corriger AVANT de déployer (cf. e2e-visite/stripe-api-guard.mjs)",
    ).toEqual([]);
  });

  it("ne laisse pas les commentaires déclencher de faux positifs", () => {
    const commente = `
      // Basil : sub.current_period_start a disparu, invoice.subscription aussi.
      /* new Date(sub.current_period_end * 1000) était le code d'avant. */
      const sub = await stripe.subscriptions.retrieve(id);
      const url = "https://docs.stripe.com/changelog/basil";
    `;
    expect(scanSource("doc.ts", commente)).toEqual([]);
  });
});
