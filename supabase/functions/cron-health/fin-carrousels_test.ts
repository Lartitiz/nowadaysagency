// Lancer : deno test --no-check --no-lock --allow-env --allow-read --node-modules-dir=none supabase/functions/cron-health/fin-carrousels_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { finCarrouselsStats } from "./fin-carrousels.ts";

const toujours = () => true;
const row = (fin: string | null, carousel_type = "tips", created_at = "2026-11-16T10:00:00Z") => ({
  carousel_type, created_at, slides: [{ title: "Couverture" }, { body: "Milieu." }, { body: fin }],
});

Deno.test("fin des carrousels : question repérée, alerte si plus de la moitié sans question", () => {
  const r = finCarrouselsStats([
    row("Je le traite d'abord. Lequel est parti en dernier ?"),
    row("Ouvre ton dernier devis et relis la ligne délais."),
    row("Voilà."),
    row(null, "photo"), // dernière slide sans texte : on lit la précédente
  ], toujours);
  assertEquals(r.carrousels, 4);
  assertEquals(r.fin_question, 1);
  assertEquals(r.par_type, { tips: { carrousels: 3, sans_question: 2 }, photo: { carrousels: 1, sans_question: 1 } });
  assertEquals(typeof r.alerte, "string");
});

Deno.test("fin des carrousels : pas d'alerte sous 2 carrousels, ni avant la mise en ligne, photos brutes ignorées", () => {
  assertEquals(finCarrouselsStats([row("Voilà.")], toujours).alerte, null);
  assertEquals(finCarrouselsStats([row("Voilà.", "tips", "2026-11-10T10:00:00Z"), row("Fin.", "tips", "2026-11-12T10:00:00Z")], toujours).carrousels, 0);
  const brutes = { carousel_type: "photo", created_at: "2026-11-16T10:00:00Z", slides: [{ overlay_text: null }, { overlay_text: null }] };
  assertEquals(finCarrouselsStats([brutes], toujours).carrousels, 0);
  assertEquals(finCarrouselsStats([row("A ?"), row("B ?"), row("C.")], toujours).alerte, null);
});

Deno.test("fin des carrousels : fin en geste + question en légende = ouverture (essai réel du 13/11)", () => {
  const geste = { ...row("Sur votre prochain bilan, isolez ce lot et recalculez la marge."), caption: "Accroche.\nCorps.\nSur votre dernière découpe, quel lot portait l'hypothèse la plus fragile ?\n#marchanddebiens #decoupe" };
  const r = finCarrouselsStats([geste, geste], toujours);
  assertEquals([r.fin_question, r.legende_question, r.sans_question, r.alerte], [0, 2, 0, null]);
  // Ancien comportement (carrousel d'origine du 13/11) : ni question ni ouverture → 🟠.
  const ancien = { ...row("Le risque d'une découpe se concentre dans un lot."), caption: "Légende.\nCe lot dit tout de votre bilan.\n#immobilier" };
  assertEquals(typeof finCarrouselsStats([ancien, ancien], toujours).alerte, "string");
});
