import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { COMPOSED_BY_CODE_MODEL } from "./plan-limiter.ts";

/**
 * Garde anti-dérive (13/08/2026).
 *
 * `cron-health` n'importe VOLONTAIREMENT rien de `_shared/` pour rester une edge
 * déployable seule : l'étiquette « rendu sans appel modèle » y est donc RECOPIÉE
 * en dur dans `ZERO_COST_LABELS`. Une duplication silencieuse dérive toujours —
 * et ici la dérive serait invisible à l'œil nu : le bilan hebdo se remettrait
 * simplement à crier « modèle NON TARIFÉ composition-code » à chaque carrousel
 * photo, et on réapprendrait à ignorer l'alerte. Exactement le mécanisme que la
 * garde de la PR #697 était censée empêcher.
 *
 * Ce test relit le SOURCE de `cron-health` et vérifie que les deux côtés
 * parlent bien de la même chaîne.
 */
Deno.test("l'étiquette « sans appel modèle » est la MÊME dans plan-limiter et cron-health", async () => {
  const src = await Deno.readTextFile(
    new URL("../cron-health/index.ts", import.meta.url),
  );

  const bloc = src.match(/const ZERO_COST_LABELS = new Set<string>\(\[([^\]]*)\]\)/);
  assert(bloc, "ZERO_COST_LABELS introuvable dans cron-health/index.ts");

  const labels = [...bloc[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert(
    labels.includes(COMPOSED_BY_CODE_MODEL),
    `cron-health ne connaît pas « ${COMPOSED_BY_CODE_MODEL} » (il liste : ${labels.join(", ") || "rien"})`,
  );
});

/**
 * Le test qui FABRIQUE le bug : on rejoue la règle de tri de `cron-health` pour
 * vérifier qu'elle distingue bien les deux « pas de tarif » qui se ressemblent —
 * le rendu par code (coût nul assumé) et le vrai modèle oublié (le bug #697).
 */
Deno.test("un modèle vraiment inconnu crie ; le rendu par code non", () => {
  const TARIFES = new Set(["claude-sonnet-5", "claude-opus-5", "claude-opus-5-5", "gpt-image-2"]);
  const ZERO_COST = new Set([COMPOSED_BY_CODE_MODEL]);
  const nonTarifes = (modeles: string[]) =>
    modeles.filter((m) => !TARIFES.has(m) && !ZERO_COST.has(m));

  assertEquals(nonTarifes([COMPOSED_BY_CODE_MODEL, "claude-sonnet-5"]), []);
  // Le cas #697 : un modèle passé en prod sans être ajouté à la grille.
  assertEquals(nonTarifes(["claude-sonnet-9-inexistant"]), ["claude-sonnet-9-inexistant"]);
  // `inconnu` = repli de cron-health quand model_used est NULL en base. Doit
  // continuer à crier : une ligne sans modèle n'est plus attribuable.
  assertEquals(nonTarifes(["inconnu"]), ["inconnu"]);
});

/**
 * Modèle Recraft pilotable par secret (bilan hebdo 17/08/2026) — le piège est
 * le vectoriel : en V3 il s'obtient par `style`, en V4 c'est un modèle À PART.
 * Un simple « recraftv4 » sortirait du raster là où le code attend du SVG.
 */
Deno.test("recraftModel : défaut V3 inchangé, et V4 bascule sur le modèle vectoriel", async () => {
  const { recraftModel } = await import("./recraft-illustration.ts");

  Deno.env.delete("RECRAFT_MODEL");
  assertEquals(recraftModel(true), "recraftv3");
  assertEquals(recraftModel(false), "recraftv3");

  Deno.env.set("RECRAFT_MODEL", "recraftv4");
  assertEquals(recraftModel(true), "recraftv4_vector");
  assertEquals(recraftModel(false), "recraftv4");

  // Une valeur déjà explicite est respectée telle quelle (pas de double mappage).
  Deno.env.set("RECRAFT_MODEL", "recraftv4_vector");
  assertEquals(recraftModel(true), "recraftv4_vector");

  Deno.env.delete("RECRAFT_MODEL");
});

/**
 * Le trou trouvé au bilan du 24/08 : le mappage ne connaissait que la valeur
 * EXACTE `recraftv4`, donc `recraftv4.1` — la version qu'on veut justement
 * tester — partait en RASTER sans erreur, là où l'appelant attend un SVG.
 */
Deno.test("recraftModel : V4.1 (et toute version future) obtient bien sa variante vectorielle", async () => {
  const { recraftModel } = await import("./recraft-illustration.ts");

  Deno.env.set("RECRAFT_MODEL", "recraftv4.1");
  assertEquals(recraftModel(true), "recraftv4.1_vector");
  assertEquals(recraftModel(false), "recraftv4.1");

  // Le motif vaut pour la suite : aucune liste à tenir à jour.
  Deno.env.set("RECRAFT_MODEL", "recraftv5");
  assertEquals(recraftModel(true), "recraftv5_vector");

  // Casse indifférente, et pas de double suffixe sur une valeur déjà vectorielle.
  Deno.env.set("RECRAFT_MODEL", "RecraftV4.1_Vector");
  assertEquals(recraftModel(true), "RecraftV4.1_Vector");

  Deno.env.delete("RECRAFT_MODEL");
});

/**
 * Valeur hors motif + vectoriel demandé : on retombe sur V3 (connue bonne)
 * plutôt que de livrer un raster muet à la place du SVG attendu.
 */
Deno.test("recraftModel : une valeur non reconnue ne part JAMAIS en raster silencieux", async () => {
  const { recraftModel } = await import("./recraft-illustration.ts");

  Deno.env.set("RECRAFT_MODEL", "recraft-v4.1-pro");
  assertEquals(recraftModel(true), "recraftv3");
  // Hors vectoriel, aucune raison de se substituer à la configuration.
  assertEquals(recraftModel(false), "recraft-v4.1-pro");

  Deno.env.delete("RECRAFT_MODEL");
});

// Chaque rédacteur Claude du carrousel doit avoir un tarif dans cron-health,
// sinon le bilan hebdo le compte à zéro (cf. #697).
Deno.test("les modèles Claude du rédacteur carrousel sont tarifés dans cron-health", async () => {
  const src = await Deno.readTextFile(new URL("../cron-health/index.ts", import.meta.url));
  const writer = await Deno.readTextFile(new URL("./carousel-model.ts", import.meta.url));
  const models = [...(writer.match(/export type CarouselWriterModel = ([^;]+);/)?.[1] ?? "").matchAll(/"(claude-[^"]+)"/g)].map((m) => m[1]);
  assert(models.includes("claude-opus-5-5"), `rédacteurs lus : ${models.join(", ")}`);
  for (const m of models) assert(src.includes(`"${m}":`), `cron-health n'a pas de tarif pour ${m}`);
});

/**
 * Garde anti-oubli (28/09/2026) : `gpt-6-astra` relisait CHAQUE carrousel et
 * rédigeait le mode qualité max depuis le 03/09 sans figurer dans la grille de
 * `cron-health` → coût hebdo compté ZÉRO pendant ~4 semaines (signalé le 14/09).
 * Tout modèle que le code carrousel peut appeler doit avoir un tarif :
 * rédacteurs dans TEXT_COST_EUR_PER_MTOKEN, relecteur dans les DEUX grilles
 * (sa relecture est chiffrée à part, entrée/sortie séparées).
 */
Deno.test("tout modèle de rédaction ou de relecture carrousel est tarifé dans cron-health", async () => {
  const { pickCarouselWriter } = await import("./carousel-model.ts");
  const { CAROUSEL_REVIEW_MODEL } = await import("./carousel-editorial-review.ts");
  const src = await Deno.readTextFile(new URL("../cron-health/index.ts", import.meta.url));

  const grille = (nom: string) => {
    const bloc = src.match(new RegExp(`const ${nom}: Record<[^=]+= \\{([\\s\\S]*?)\\n    \\};`));
    assert(bloc, `${nom} introuvable dans cron-health/index.ts`);
    return new Set([...bloc[1].matchAll(/^\s*"([^"]+)":/gm)].map((m) => m[1]));
  };
  const texte = grille("TEXT_COST_EUR_PER_MTOKEN");
  const relecture = grille("REVIEW_COST_EUR_PER_MTOKEN");

  // Tous les rédacteurs déclarés (y compris un banc d'essai), pas seulement les défauts.
  const writerSrc = await Deno.readTextFile(new URL("./carousel-model.ts", import.meta.url));
  const declares = [...(writerSrc.match(/export type CarouselWriterModel = ([^;]+);/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const redacteurs = [...new Set([...declares, pickCarouselWriter({}), pickCarouselWriter({ quality_max: true })])];
  assert(redacteurs.includes("gpt-6-astra"), `rédacteurs lus : ${redacteurs.join(", ")}`);
  for (const m of [...redacteurs, CAROUSEL_REVIEW_MODEL]) {
    assert(texte.has(m), `« ${m} » absent de TEXT_COST_EUR_PER_MTOKEN : son coût serait compté 0 €`);
  }
  assert(relecture.has(CAROUSEL_REVIEW_MODEL), `« ${CAROUSEL_REVIEW_MODEL} » absent de REVIEW_COST_EUR_PER_MTOKEN : la relecture serait comptée 0 €`);
  // Le parseur ne doit pas passer « à vide » : il voit bien les lignes connues.
  assert(texte.has("claude-opus-5") && texte.size >= 5, `grille texte mal lue (${[...texte].join(", ")})`);
});
