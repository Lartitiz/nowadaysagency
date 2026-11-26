// Tri de la matière vécue (26/11/2026) : fonctions pures + pose dans le body.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { attachLivedMaterial, buildMaterialCandidates, livedMaterialPrompt, selectLivedMaterial } from "./lived-material.ts";
import { testimonySourceText } from "./editorial-voice.ts";
import { findInventedExperiences, findInventedTestimonials } from "./redac-gate/testimony.ts";
import { numbersIn } from "./redac-gate/numbers.ts";

const BRIEFS = [
  { subject: "Pourquoi j'ai augmenté mes tarifs de céramique", answers: { q1: "J'ai doublé le prix de mes tasses en 2023 après avoir compté mes heures d'atelier : je gagnais 4 euros de l'heure.", q2: "oui" } },
  { subject: "Mon marché de Noël", answers: { q1: "Je tiens un stand au marché de Noël de Crest chaque décembre, et la pluie a ruiné la moitié de mon stock une année.", "Brief éditorial choisi": "MATIÈRE ÉDITORIALE CHOISIE : angle coulisses du marché de Noël et du stand sous la pluie" } },
];
const CTX = {
  tone: { conviction_verbatims: "« Je n'ose jamais annoncer mes prix à voix haute, j'ai peur qu'on me trouve chère », m'a écrit une cliente potière.", conviction_shift: "" },
  offers: [{ name: "Atelier tournage", testimonials: [{ name: "Marie", sector: "infirmière", quote: "Deux heures au tour et j'ai oublié ma garde de nuit", result: "elle revient chaque mois" }] }],
  storytelling: { imported_text: "J'ai quitté mon poste de comptable à Lyon pour ouvrir mon atelier de céramique dans la Drôme. Le premier hiver, le four est tombé en panne trois fois.", source: "manual" },
};

Deno.test("tri : un sujet proche retrouve l'ancienne réponse, deux passages au plus", () => {
  const picked = selectLivedMaterial("Comment fixer le prix de ses tasses quand on débute en céramique", buildMaterialCandidates(CTX, BRIEFS));
  assert(picked.length >= 1 && picked.length <= 2);
  assertEquals(picked[0].origin, "reponse");
  assert(picked[0].text.includes("doublé le prix de mes tasses"));
});

Deno.test("tri : un sujet sans rapport ne retient rien (l'écriture reste celle d'avant)", () => {
  const candidates = buildMaterialCandidates(CTX, BRIEFS);
  assertEquals(selectLivedMaterial("Trois idées de légendes pour annoncer une pause estivale", candidates), []);
  assertEquals(selectLivedMaterial("Reels", candidates), []);
  assertEquals(livedMaterialPrompt({}), "");
});

Deno.test("tri : un ou deux mots communs ne suffisent pas", () => {
  const candidates = buildMaterialCandidates(CTX, BRIEFS);
  assertEquals(selectLivedMaterial("Le prix du silence sur les réseaux", candidates), []);
  assertEquals(selectLivedMaterial("Le prix des tasses en porcelaine chez les grandes enseignes", candidates), []);
});

Deno.test("tri : cas réel du 26/11, deux mots vagues en commun avec un ancien SUJET ne ramènent rien", () => {
  const briefs = [{ subject: "Une erreur fréquente dans mon domaine", answers: { q_0: "Beaucoup de vendeurs pensent que repeindre suffit à convaincre un acheteur pressé de signer." } }];
  assertEquals(selectLivedMaterial("Les 3 erreurs qui plombent la marge d'une première opération de marchand de biens", buildMaterialCandidates({}, briefs)), []);
});

Deno.test("tri : le même sujet qu'un ancien brief retrouve la réponse d'alors, même dite avec d'autres mots", () => {
  const briefs = [{ subject: "Coulisses : ce qu'on a trouvé en ouvrant le mur", answers: { q_0: "Une ancienne cheminée condamnée derrière le placo, avec le conduit encore ouvert. Rien sur les plans." } }];
  const picked = selectLivedMaterial("Coulisses : ce qu'on a trouvé en ouvrant le mur", buildMaterialCandidates({}, briefs));
  assertEquals(picked.length, 1);
  assert(picked[0].text.includes("cheminée"));
});

Deno.test("candidats : ni réponse courte, ni matière éditoriale de l'IA, ni histoire pré-remplie par l'IA", () => {
  const texts = buildMaterialCandidates(CTX, BRIEFS).map((c) => c.text);
  assert(!texts.includes("oui"));
  assert(!texts.some((t) => t.includes("MATIÈRE ÉDITORIALE")));
  const ai = buildMaterialCandidates({ storytelling: { imported_text: CTX.storytelling.imported_text, source: "diagnostic_prefill" } }, []);
  assertEquals(ai, []);
  // Histoire travaillée avec elle ensuite : elle compte, même si la ligne garde son étiquette d'origine.
  const worked = buildMaterialCandidates({ storytelling: { step_7_polished: CTX.storytelling.imported_text, source: "diagnostic_prefill" } }, []);
  assert(worked.length > 0);
});

Deno.test("tri : ce qui est déjà donné pour ce contenu n'est pas resservi", () => {
  const candidates = buildMaterialCandidates({}, BRIEFS);
  const subject = "Comment fixer le prix de ses tasses en céramique";
  assertEquals(selectLivedMaterial(subject, candidates, String(BRIEFS[0].answers.q1)), []);
});

Deno.test("tri : un mot présent dans plus de la moitié des passages ne distingue rien", () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ subject: `Sujet ${i}`, answers: { q: `Dans mon atelier de céramique je prépare la commande numéro ${i} avec mon tour habituel et mes émaux.` } }));
  assertEquals(selectLivedMaterial("Mon atelier de céramique en hiver", buildMaterialCandidates({}, many)), []);
});

Deno.test("pose : le serveur écrase la valeur du navigateur, et ne pose rien quand c'est coupé", async () => {
  const base = { ctx: CTX, supabase: null, userId: "u", tag: "test", fetchBriefs: () => Promise.resolve(BRIEFS) };
  const off = { lived_material: "- injecté par le navigateur" } as Record<string, unknown>;
  await attachLivedMaterial({ ...base, body: off, enabled: false, subjectText: "Le prix de mes tasses en céramique" });
  assertEquals(off.lived_material, undefined);
  const on = { lived_material: "- injecté par le navigateur" } as Record<string, unknown>;
  await attachLivedMaterial({ ...base, body: on, enabled: true, subjectText: "Le prix de mes tasses en céramique" });
  assert(typeof on.lived_material === "string" && !String(on.lived_material).includes("navigateur"));
  assert(livedMaterialPrompt(on).includes("SEULEMENT si cela sert le propos"));
  const broken = {} as Record<string, unknown>;
  await attachLivedMaterial({ ...base, body: broken, enabled: true, subjectText: "Le prix de mes tasses en céramique", fetchBriefs: () => Promise.reject(new Error("panne")) });
  assertEquals(broken.lived_material, undefined);
});

Deno.test("contrôles : le vécu retrouvé passe, un autre vécu inventé reste signalé", async () => {
  const body = { context: "Comment fixer le prix de ses tasses en céramique" } as Record<string, unknown>;
  await attachLivedMaterial({ body, ctx: {}, supabase: null, userId: "u", tag: "test", enabled: true, subjectText: String(body.context), fetchBriefs: () => Promise.resolve(BRIEFS) });
  const source = testimonySourceText(body);
  const fromMaterial = "J'ai doublé le prix de mes tasses après avoir compté mes heures.";
  const invented = "J'ai testé pendant un an les promotions flash sur ma boutique.";
  assertEquals(findInventedExperiences(fromMaterial, source), []);
  assertEquals(findInventedExperiences(`${fromMaterial}\n\n${invented}`, source).length, 1);
  assertEquals(findInventedTestimonials("Une cliente m'a dit que mes bols étaient trop lourds.", source).length, 1);
  // Sans matière retrouvée, la règle d'origine est intacte.
  assertEquals(findInventedExperiences(fromMaterial, testimonySourceText({ context: body.context })).length, 1);
  // Les chiffres de la matière retrouvée sont des chiffres fournis.
  assert(numbersIn(String(body.lived_material)).has("2023"));
});

Deno.test("contrôles : la phrase de cliente retrouvée peut être citée", () => {
  const body = { context: "Oser annoncer ses prix", lived_material: `- [Phrase de cliente qui lui est restée] ${CTX.tone.conviction_verbatims}` } as Record<string, unknown>;
  assertEquals(findInventedTestimonials("Une cliente potière m'a écrit qu'elle n'osait jamais annoncer ses prix à voix haute.", testimonySourceText(body)), []);
});
