// Tests SNAPSHOT des consignes de rédaction des carrousels (lot 2 « robustesse
// création de contenu », 13/10/2026 ; voir docs/creation-contenu/CARTE.md).
//
// index_test.ts vérifie la forme des sorties et le câblage du handler ; rien
// ne figeait le TEXTE des consignes envoyées au modèle. Le carrousel est le
// format le plus souvent retouché : ce fichier fige, pour chaque variante
// (texte, photo, mixte ; Instagram, LinkedIn ; avec ou sans cas personnel ou
// actualité), le prompt de rédaction tel que le construisent
// writing-contract.ts et variant-writing.ts.
//
// Dérive VOULUE : régénère et relis le diff du .snap comme une review de prompt.
//   deno test --no-check --allow-env --allow-read --allow-write --node-modules-dir=none supabase/functions/carousel-ai/prompts_snapshot_test.ts -- --update
// Si le diff touche une variante que tu ne voulais PAS modifier (ex. LinkedIn
// alors que tu corrigeais Instagram) : c'est une régression.

import { assertSnapshot } from "../../edge-tests/snapshot.ts";
import { buildCarouselWritingSystem, carouselStructureGuide } from "./writing-contract.ts";
import { mixWritingPrompt, newsWriting, photoWritingPrompt, textWritingPrompt } from "./variant-writing.ts";

const BRANDING = "Céramiste à Lyon. Ateliers de tournage pour débutantes. Ton complice, tutoiement.";
const IDENTITY = "[IDENTITÉ — bloc assemblé par le handler]";
const CLARITY = "[CLARTÉ — CONTENT_CLARITY_RULES]";
const ADDRESS = "[ADRESSE — règle tu / vous de la fiche de marque]";
const CONFIRMED = "[STRUCTURE CONFIRMÉE — bloc assemblé par le handler]";

const BODY_TEXT = {
  subject: "Pourquoi je ne fais plus de remises sur mes créations",
  subject_details: "Les remises dévalorisent le temps passé au tour.",
  objective: "confiance",
  carousel_type: "prise_de_position",
  slide_count: 7,
};

const BODY_OWN_CASE = {
  ...BODY_TEXT,
  deepening_answers: {
    "La dernière fois qu'on t'a demandé une remise ?": "J'ai dit non, et la cliente a signé quand même.",
    "Brief éditorial choisi": "Prix juste et artisanat",
  },
};

const BODY_PHOTO = {
  subject: "Une journée d'atelier, du premier café à la cuisson",
  carousel_type: "photo",
  objective: "visibilite",
  photo_description: "1. Le tour au matin ; 2. Les mains dans la terre ; 3. Le four ouvert",
};

const BODY_MIX = {
  subject: "Les trois gestes qui changent un premier bol",
  carousel_type: "tutoriel",
  objective: "confiance",
};

// ── Système de rédaction (commun aux trois variantes) ──

for (const isLinkedIn of [false, true]) {
  const canal = isLinkedIn ? "LinkedIn" : "Instagram";
  Deno.test(`système de rédaction — ${canal}, sans cas personnel`, async (t) => {
    await assertSnapshot(t, buildCarouselWritingSystem(BRANDING, isLinkedIn, IDENTITY, CLARITY));
  });
}

Deno.test("système de rédaction — Instagram, cas personnel fourni, règle tu / vous", async (t) => {
  await assertSnapshot(t, buildCarouselWritingSystem(BRANDING, false, IDENTITY, CLARITY, "own_case", ADDRESS));
});

Deno.test("système de rédaction — Instagram, ressenti sur une actu", async (t) => {
  await assertSnapshot(t, buildCarouselWritingSystem(BRANDING, false, IDENTITY, CLARITY, "news_feeling"));
});

// ── Consigne de rédaction par variante ──

for (const isLinkedIn of [false, true]) {
  const canal = isLinkedIn ? "LinkedIn" : "Instagram";

  Deno.test(`texte — ${canal}`, async (t) => {
    await assertSnapshot(t, textWritingPrompt(BODY_TEXT, isLinkedIn, CONFIRMED));
  });

  Deno.test(`photo — ${canal}`, async (t) => {
    await assertSnapshot(t, photoWritingPrompt(BODY_PHOTO, isLinkedIn, CONFIRMED));
  });

  Deno.test(`mixte — ${canal}, photos d'abord`, async (t) => {
    await assertSnapshot(t, mixWritingPrompt(BODY_MIX, isLinkedIn, CONFIRMED, ""));
  });
}

Deno.test("texte — Instagram, cas personnel fourni (réponses mises en avant)", async (t) => {
  await assertSnapshot(t, textWritingPrompt(BODY_OWN_CASE, false, CONFIRMED));
});

Deno.test("texte — Instagram, accroche et angle choisis, structure imposée", async (t) => {
  await assertSnapshot(t, textWritingPrompt({
    ...BODY_TEXT,
    chosen_angle: { title: "Le prix juste", pitch: "Assumer ses tarifs" },
    selected_hook: "J'ai arrêté les remises, et rien ne s'est effondré.",
    content_structure: "constat → bascule → position",
  }, false, CONFIRMED));
});

Deno.test("mixte — Instagram, texte d'abord", async (t) => {
  await assertSnapshot(t, mixWritingPrompt({ ...BODY_MIX, text_first: true }, false, CONFIRMED, "[TEXTE D'ABORD — consigne du handler]"));
});

// ── Actualité ──

Deno.test("actualité — sans ressenti (l'actu reste le sujet)", async (t) => {
  await assertSnapshot(t, newsWriting({ ...BODY_TEXT, news_context: "Un reportage sur les prix de l'artisanat" }));
});

Deno.test("actualité — avec ressenti (l'actu ouvre, son ressenti porte la suite)", async (t) => {
  await assertSnapshot(t, newsWriting({
    ...BODY_TEXT,
    news_context: "Un reportage sur les prix de l'artisanat",
    deepening_answers: { "Ce que tu en as pensé ?": "Ça m'a mise en colère, on parle de nous sans nous." },
  }));
});

// ── Guides de structure par type de carrousel ──

Deno.test("guides de structure — tous les types", async (t) => {
  const types = ["tips", "tutoriel", "prise_de_position", "mythe_realite", "storytelling", "etude_de_cas", "checklist",
    "comparatif", "before_after", "promo", "coulisses", "photo_dump", "inconnu"];
  await assertSnapshot(t, types.map((type) => `${type} → ${carouselStructureGuide(type)}`).join("\n\n"));
});
