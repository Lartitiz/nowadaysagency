// Tests SNAPSHOT de _shared/format-briefs.ts, AVANT son découpage en un fichier
// par format (docs/robustesse/gros-fichiers.md, fiche 10, lot T).
//
// Les snapshots de creative-flow ne figent qu'une branche de chaque brief. Ici,
// chaque fonction est appelée sans passer par creative-flow (donc sans serve()),
// pour chaque branche : objectif, face cam, gamme de prix, tu / vous, etc. Le
// risque du découpage est le « presque à l'identique » (une espace, un retour à
// la ligne perdu dans un modèle de texte) : ce fichier le rend visible.
//
// Un test rouge ici n'est PAS forcément un bug : si le changement de consigne
// est VOULU, régénère et relis le diff du .snap comme une relecture de prompt :
//   deno test --no-check --allow-env --allow-read --allow-write --node-modules-dir=none supabase/functions/_shared/format-briefs_snapshot_test.ts -- --update
//
// Lancer (flags de la CI, script npm test:edges) :
//   deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/_shared/format-briefs_snapshot_test.ts

import { assertSnapshot } from "../../edge-tests/snapshot.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import * as briefs from "./format-briefs.ts";
import {
  captionBrief,
  carouselBrief,
  linkedinBrief,
  newsletterBrief,
  photoCaptionBrief,
  pinterestBrief,
  positionDepthBlock,
  reelBrief,
  storiesAddressLines,
  storiesBrief,
} from "./format-briefs.ts";
import { LINKEDIN_TEMPLATES } from "./copywriting-prompts.ts";
import { RECAP_PREFIX } from "./multi-subject.ts";

// Brief à plusieurs sujets (forme de multi-subject_test.ts) : déclenche la séquence récap.
const RECAP_SUBJECT = `${RECAP_PREFIX}

1. Les Reels longs reviennent

Un test rapporté par une experte : au-delà de 3 minutes, la vidéo peut sortir de ta communauté.

2. Ne pas juger un post à 48 h

Les marques décident trop vite si « ça a marché », alors que la relation se construit sur des mois.

3. Suivre les tendances sans perdre sa personnalité

Parler le langage de la plateforme sans emprunter la personnalité de la semaine.`;

// ── Sommaire ──────────────────────────────────────────────────────────────
// Au découpage, format-briefs.ts deviendra un sommaire (`export * from …`).
// Ce test attrape un export oublié ou ajouté par erreur.
Deno.test("format-briefs : la liste des exports est exactement celle attendue", () => {
  assertEquals(Object.keys(briefs).sort(), [
    "captionBrief",
    "carouselBrief",
    "linkedinBrief",
    "newsletterBrief",
    "photoCaptionBrief",
    "pinterestBrief",
    "positionDepthBlock",
    "reelBrief",
    "storiesAddressLines",
    "storiesBrief",
  ]);
});

// ── Carrousel, newsletter ─────────────────────────────────────────────────
Deno.test("carouselBrief", async (t) => {
  await assertSnapshot(t, carouselBrief());
});

Deno.test("newsletterBrief", async (t) => {
  await assertSnapshot(t, newsletterBrief());
});

// ── Reel ──────────────────────────────────────────────────────────────────
const REEL_CASES: [string, Parameters<typeof reelBrief>[0]][] = [
  ["sans argument", undefined],
  ["chaîne seule (ancienne signature) : confiance", "confiance"],
  ["objet : objectif visibilite", { effectiveObjective: "visibilite" }],
  ["objet : objectif vente", { effectiveObjective: "vente" }],
  ["objet : objectif credibilite", { effectiveObjective: "credibilite" }],
  ["face_cam non, lancement, 30 min", { effectiveObjective: "confiance", face_cam: "non", is_launch: true, time_available: "30min" }],
  ["hook partiel (seulement text)", { effectiveObjective: "confiance", selected_hook: { text: "Personne ne te dit ça sur les prix" } }],
  ["hook complet", {
    effectiveObjective: "visibilite",
    selected_hook: {
      type: "contre_intuitif",
      type_label: "Contre-intuitif",
      text: "Publier moins m'a apporté plus de clientes",
      text_overlay: "Publier moins",
      format_label: "Face cam",
      format_recommande: "face_cam",
      duree_cible: "20-30 sec",
    },
  }],
  ["inspiration", { effectiveObjective: "confiance", inspiration_context: "Un reel vu chez une céramiste : elle montre ses ratés de cuisson." }],
  ["angle + structure imposés", { effectiveObjective: "confiance", editorial_angle: "Le mythe du post parfait", content_structure: "mythe → réalité → preuve → invitation" }],
  ["angle sans structure (ignoré)", { effectiveObjective: "confiance", editorial_angle: "Le mythe du post parfait" }],
  ["sujet « 5 erreurs » (numérotation)", { effectiveObjective: "confiance", subject: "5 erreurs qui font fuir tes clientes sur Instagram" }],
  ["sujet récap (plusieurs sujets)", { effectiveObjective: "confiance", subject: RECAP_SUBJECT }],
  ["éléments perso complets", {
    effectiveObjective: "confiance",
    subject: "Pourquoi j'ai arrêté de baisser mes prix",
    pre_gen_answers: { anecdote: "Une cliente m'a remerciée d'avoir augmenté mes tarifs", emotion: "posée", conviction: "Un prix bas ne rassure personne" },
  }],
  ["éléments perso partiels (anecdote seule)", { effectiveObjective: "vente", pre_gen_answers: { anecdote: "Mon premier atelier complet en 2 jours" } }],
];

Deno.test("reelBrief : une branche par cas", async (t) => {
  for (const [name, arg] of REEL_CASES) {
    await t.step(name, async (s) => {
      await assertSnapshot(s, reelBrief(arg));
    });
  }
});

// ── Stories ───────────────────────────────────────────────────────────────
const CATALOG = [
  { index: 1, description: "Mains qui façonnent un bol en argile sur un tour" },
  { index: 2, description: "Atelier vu de loin, étagères pleines de pots" },
  { index: 3, description: "Portrait souriant devant la vitrine" },
];

const STORIES_CASES: [string, Parameters<typeof storiesBrief>[0]][] = [
  ["défaut (sans argument)", undefined],
  ["objectif confiance", { objective: "confiance" }],
  ["5 min, face cam oui", { time_available: "5min", face_cam: "oui" }],
  ["5 min, face cam non", { time_available: "5min", face_cam: "non" }],
  ["5 min, face cam flexible", { time_available: "5min" }],
  ["5 min, vente", { time_available: "5min", objective: "vente", price_range: "moyen" }],
  ["vente sans gamme", { objective: "vente" }],
  ...["petit", "moyen", "premium", "physique", "gratuit", "inconnue"].map(
    (price_range): [string, Parameters<typeof storiesBrief>[0]] => [`vente, gamme ${price_range}`, { objective: "vente", price_range }],
  ),
  ["lancement", { objective: "vente", price_range: "premium", is_launch: true }],
  ["éléments perso complets", { pre_gen_answers: { vecu: "Hier, une cliente a pleuré en voyant son logo", energy: "touchée", message_cle: "Ton identité mérite du temps" } }],
  ["éléments perso partiels (énergie seule)", { pre_gen_answers: { energy: "énervée" } }],
  ["catalogue photos sans photo choisie", { photo_catalog: CATALOG }],
  ["catalogue photos avec photos choisies", { photo_catalog: [{ ...CATALOG[0], chosen: true }, CATALOG[1], { ...CATALOG[2], chosen: true }] }],
  ["catalogue vide", { photo_catalog: [] }],
  ["adresse tu", { audienceAddress: "tu" }],
  ["adresse vous", { audienceAddress: "vous" }],
  ["garde-fou rempli (avec guillemets)", { gardeFouAlerte: "Le sujet \"santé\" demande une source." }],
  ["sujet « 5 erreurs » (numérotation)", { subject: "5 erreurs qui font fuir tes clientes sur Instagram" }],
  ["sujet récap", { subject: RECAP_SUBJECT }],
  ["sujet récap, 5 min", { subject: RECAP_SUBJECT, time_available: "5min" }],
];

Deno.test("storiesBrief : une branche par cas", async (t) => {
  for (const [name, arg] of STORIES_CASES) {
    await t.step(name, async (s) => {
      await assertSnapshot(s, storiesBrief(arg));
    });
  }
});

Deno.test("storiesAddressLines : sans réglage, tu, vous", async (t) => {
  for (const addr of [null, undefined, "tu", "vous"] as const) {
    await t.step(String(addr), async (s) => {
      // En texte simple (clé puis consigne) : ne dépend pas de l'affichage des objets par Deno.
      const lines = storiesAddressLines(addr);
      await assertSnapshot(s, `voice:\n${lines.voice}\n\nhook:\n${lines.hook}\n\noral:\n${lines.oral}`);
    });
  }
});

// ── LinkedIn ──────────────────────────────────────────────────────────────
Deno.test("linkedinBrief : sans gabarit, gabarit inconnu, chaque gabarit", async (t) => {
  const keys = [null, "inconnu", ...Object.keys(LINKEDIN_TEMPLATES)];
  for (const key of keys) {
    await t.step(String(key), async (s) => {
      await assertSnapshot(s, linkedinBrief(key));
    });
  }
});

// ── Pinterest ─────────────────────────────────────────────────────────────
Deno.test("pinterestBrief : rien, lien, tableau, les deux", async (t) => {
  const cases: [string, string | null, string | null][] = [
    ["rien", null, null],
    ["lien", "https://exemple.fr/atelier", null],
    ["tableau", null, "Déco céramique"],
    ["les deux", "https://exemple.fr/atelier", "Déco céramique"],
  ];
  for (const [name, link, board] of cases) {
    await t.step(name, async (s) => {
      await assertSnapshot(s, pinterestBrief(link, board));
    });
  }
});

// ── Légende photo, post Instagram ─────────────────────────────────────────
Deno.test("photoCaptionBrief : sans et avec description", async (t) => {
  for (const [name, desc] of [["null", null], ["vide", ""], ["description", "Mains pleines de terre, bol tout juste sorti du four"]] as const) {
    await t.step(name, async (s) => {
      await assertSnapshot(s, photoCaptionBrief(desc));
    });
  }
});

Deno.test("captionBrief : chaque objectif", async (t) => {
  for (const objective of [null, "visibilite", "visibilité", "confiance", "vente", "conversion", "credibilite"]) {
    await t.step(String(objective), async (s) => {
      await assertSnapshot(s, captionBrief(objective));
    });
  }
});

// ── Prise de position (transverse) ────────────────────────────────────────
Deno.test("positionDepthBlock : format × actu × vécu", async (t) => {
  for (const format of ["caption", "reel", "stories"] as const) {
    for (const hasNews of [false, true]) {
      for (const livedCase of [false, true, "own_case", "news_feeling", "news", "none"] as const) {
        await t.step(`${format}, actu ${hasNews}, vécu ${livedCase}`, async (s) => {
          await assertSnapshot(s, positionDepthBlock(format, hasNews, livedCase));
        });
      }
    }
  }
});
