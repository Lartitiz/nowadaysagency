// Tests SNAPSHOT des constructeurs de prompts de creative-flow (extraits en
// fonctions top-level par les refactors #777/#803/#811). Les prompts sont le
// cœur du produit : rien d'autre ne verrouille leur sortie, une dérive
// accidentelle (réordonnancement de blocs, condition inversée, bloc partagé
// modifié dans _shared/copywriting-prompts.ts ou format-briefs.ts) passerait
// inaperçue en CI. Chaque builder est appelé avec une matrice d'entrées
// représentatives et sa sortie comparée à un snapshot figé.
//
// Un test rouge ici n'est PAS forcément un bug : si la dérive de prompt est
// VOULUE, régénère les snapshots et relis le diff du .snap comme une review
// de prompt :
//   deno test --no-check --allow-env --allow-read --allow-write --node-modules-dir=none supabase/functions/creative-flow/prompts_snapshot_test.ts -- --update
//
// Lancer (flags EXACTS de la CI, script npm test:edges) :
//   deno test --no-check --allow-env --allow-read --node-modules-dir=none supabase/functions/creative-flow/prompts_snapshot_test.ts

import { assertSnapshot } from "https://deno.land/std@0.224.0/testing/snapshot.ts";
import { setTestEnv } from "../_shared/test-edge-harness.ts";

setTestEnv();

// Importer index.ts exécute AUSSI `serve(handler)` en haut de fichier (effet
// de bord non testé ici). Sans neutraliser Deno.listen(), ça tente un vrai
// socket TCP et plante en CI (pas de --allow-net). On neutralise AVANT
// l'import (obligatoirement dynamique) — même danse que index_test.ts.
const realListen = Deno.listen;
// deno-lint-ignore no-explicit-any
(Deno as any).listen = () => ({
  [Symbol.asyncIterator]() {
    return { next: () => new Promise(() => {}) }; // ne se résout jamais : pas de crash, juste une tâche de fond inerte
  },
  accept: () => new Promise(() => {}),
  close() {},
  addr: { transport: "tcp", hostname: "localhost", port: 0 },
  rid: -1,
  ref() {},
  unref() {},
  // deno-lint-ignore no-explicit-any
}) as any;
const {
  buildAnglesPrompt,
  buildQuestionsPrompt,
  buildFollowUpPrompt,
  buildHooksPrompt,
  buildAdjustPrompt,
  buildDictationPrompt,
  buildGeneratePrompt,
} = await import("./index.ts");
// deno-lint-ignore no-explicit-any
(Deno as any).listen = realListen;

// Les préfixes système (COMMON_PREFIX / QUESTIONS_PREFIX) sont assemblés par
// le handler à partir du contexte utilisateur — hors du périmètre des
// builders. Un placeholder court garde les snapshots centrés sur ce que
// CHAQUE builder ajoute (les blocs partagés importés — ANTI_BIAS,
// FORMAT_STRUCTURES, briefs par format… — restent DANS le snapshot : ils font
// partie du prompt livré, leur dérive doit casser le test).
const COMMON_PREFIX = "[COMMON_PREFIX — socle système assemblé par le handler]";
const QUESTIONS_PREFIX = "[QUESTIONS_PREFIX — socle questions assemblé par le handler]";

const ANGLE = {
  title: "Le mythe du talent",
  pitch: "Déconstruire l'idée que la céramique demande un don inné.",
  structure: ["constat", "bascule", "preuve", "application"],
  tone: "complice et cash",
  format_livraison: "carrousel",
};

const ANSWERS = [
  { question: "La dernière fois qu'on t'a demandé une remise, tu as répondu quoi ?", answer: "J'ai dit non, et la cliente a signé quand même." },
  { question: "C'est quoi le truc qui t'agace dans la culture du prix cassé ?", answer: "Que ça dévalorise tout l'artisanat, pas juste mon travail." },
  { question: "Comment tu présentes tes tarifs maintenant ?", answer: "Une grille publique sur mon site, zéro négociation." },
];

function promptDoc(p: { systemPrompt: string; userPrompt: string }): string {
  return `── SYSTEM PROMPT ──\n${p.systemPrompt}\n\n── USER PROMPT ──\n${p.userPrompt}`;
}

// buildGeneratePrompt ne touche la base QUE sur le chemin stories (garde-fou
// vente + catalogue photos). Sur tous les autres chemins, ce fake garantit la
// pureté : le moindre .from() fait échouer le test.
const supabaseInterdit = {
  from(table: string): never {
    throw new Error(`buildGeneratePrompt ne doit faire AUCUNE requête sur ce chemin (table demandée : ${table})`);
  },
};

// Fake minimal des deux requêtes du chemin stories, façon postgrest chaîné
// (mêmes conventions que les fakes .single()/.maybeSingle() du harnais).
function fakeSupabaseStories(opts: { venteCount: number; photos: { id: string; description: string | null }[] }) {
  return {
    from(table: string) {
      if (table === "stories_sequences") {
        // deno-lint-ignore no-explicit-any
        const b: any = {};
        b.select = () => b;
        b.eq = () => b;
        b.gte = () => Promise.resolve({ count: opts.venteCount });
        return b;
      }
      if (table === "user_photos") {
        // deno-lint-ignore no-explicit-any
        const b: any = {};
        b.select = () => b;
        b.eq = () => b;
        b.order = () => b;
        b.limit = () => Promise.resolve({ data: opts.photos, error: null });
        return b;
      }
      throw new Error(`table inattendue sur le chemin stories : ${table}`);
    },
  };
}

// Base commune des params de buildGeneratePrompt — chaque cas surcharge.
const GENERATE_BASE = {
  supabase: supabaseInterdit,
  userId: "test-user-id",
  workspace_id: null,
  body: {},
  COMMON_PREFIX,
  context: "Pourquoi je ne fais plus de remises sur mes créations",
  contentType: null as string | null,
  editorialFormat: null,
  editorialFormatLabel: null,
  angle: ANGLE,
  answers: ANSWERS,
  followUpAnswers: [] as { question: string; answer: string }[],
  calendarBlock: "",
  objectiveBlock: "",
  newsContextBlock: "",
  preGenBlock: "",
  effectiveObjective: null as string | null,
  pinterest_link: null,
  pinterest_board: null,
  variation: false,
  previousContent: null as string | null,
  isCarousel: false,
  isReel: false,
  isStories: false,
  isLinkedIn: false,
  isPinterest: false,
  isNewsletter: false,
  isPhotoMode: false,
};

// ── step "angles" ──

Deno.test("buildAnglesPrompt — minimal (sans format éditorial, sans objectif, sans calendrier)", async (t) => {
  await assertSnapshot(t, promptDoc(buildAnglesPrompt({
    COMMON_PREFIX,
    editorialFormatLabel: null,
    contentType: "instagram",
    context: "Pourquoi je ne fais plus de remises sur mes créations",
    effectiveObjective: null,
    calendarBlock: "",
  })));
});

Deno.test("buildAnglesPrompt — complet (format éditorial + objectif vente + calendrier)", async (t) => {
  await assertSnapshot(t, promptDoc(buildAnglesPrompt({
    COMMON_PREFIX,
    editorialFormatLabel: "Mythe à déconstruire",
    contentType: "linkedin",
    context: "Pourquoi je ne fais plus de remises sur mes créations",
    effectiveObjective: "vente",
    calendarBlock: "\nCONTEXTE CALENDRIER : post prévu le 12 mars, thème du mois « coulisses d'atelier ».",
  })));
});

// ── step "questions" (guidance par canal : émotion / pro / profondeur) ──

Deno.test("buildQuestionsPrompt — Instagram minimal (sans branding ni blocs contextuels)", async (t) => {
  await assertSnapshot(t, promptDoc(buildQuestionsPrompt({
    QUESTIONS_PREFIX,
    brandingContext: "",
    brandVocabBlock: "",
    context: "Pourquoi je ne fais plus de remises sur mes créations",
    contentType: "instagram",
    editorialFormatLabel: null,
    angle: ANGLE,
    calendarBlock: "",
    objectiveBlock: "",
    newsContextBlock: "",
    recentBriefsContext: "",
  })));
});

Deno.test("buildQuestionsPrompt — LinkedIn complet (branding + vocab + newsjacking + historique briefs)", async (t) => {
  await assertSnapshot(t, promptDoc(buildQuestionsPrompt({
    QUESTIONS_PREFIX,
    brandingContext: "Céramiste à Lyon, elle apprend aux débutantes à tourner sans se décourager. Combat : revaloriser l'artisanat.",
    brandVocabBlock: "\nVOCABULAIRE DE MARQUE : « la terre ne ment pas », « tourner rond », « atelier-refuge ».\n",
    context: "Pourquoi je ne fais plus de remises sur mes créations",
    contentType: "linkedin",
    editorialFormatLabel: "Prise de position",
    angle: ANGLE,
    calendarBlock: "\nCONTEXTE CALENDRIER : post prévu le 12 mars.",
    objectiveBlock: "\nOBJECTIF : vente.",
    newsContextBlock: "\nACTUALITÉ : un reportage TV sur les prix de l'artisanat fait polémique cette semaine.",
    recentBriefsContext: "HISTORIQUE RÉCENT : « le vernis raté » (03/03), « pourquoi je ne prends plus de commandes perso » (26/02).",
  })));
});

Deno.test("buildQuestionsPrompt — Newsletter (guidance profondeur)", async (t) => {
  await assertSnapshot(t, promptDoc(buildQuestionsPrompt({
    QUESTIONS_PREFIX,
    brandingContext: "",
    brandVocabBlock: "",
    context: "Pourquoi je ne fais plus de remises sur mes créations",
    contentType: "newsletter",
    editorialFormatLabel: null,
    angle: ANGLE,
    calendarBlock: "",
    objectiveBlock: "",
    newsContextBlock: "",
    recentBriefsContext: "",
  })));
});

// ── step "follow-up" ──

Deno.test("buildFollowUpPrompt — avec contexte branding", async (t) => {
  await assertSnapshot(t, promptDoc(buildFollowUpPrompt({
    QUESTIONS_PREFIX,
    brandingContext: "Céramiste à Lyon, combat : revaloriser l'artisanat.",
    brandVocabBlock: "\nVOCABULAIRE DE MARQUE : « la terre ne ment pas ».\n",
    context: "Pourquoi je ne fais plus de remises sur mes créations",
    answers: ANSWERS,
  })));
});

Deno.test("buildFollowUpPrompt — sans contexte branding", async (t) => {
  await assertSnapshot(t, promptDoc(buildFollowUpPrompt({
    QUESTIONS_PREFIX,
    brandingContext: "",
    brandVocabBlock: "",
    context: "Pourquoi je ne fais plus de remises sur mes créations",
    answers: ANSWERS.slice(0, 1),
  })));
});

// ── step "hooks" (reels) ──

Deno.test("buildHooksPrompt — minimal (sans réponses, sans exclusions, face cam libre)", async (t) => {
  await assertSnapshot(t, promptDoc(buildHooksPrompt({
    COMMON_PREFIX,
    answers: undefined,
    excludeHooksRaw: undefined,
    faceCam: null,
    context: "Pourquoi je ne fais plus de remises sur mes créations",
    effectiveObjective: null,
    objective: null,
  })));
});

Deno.test("buildHooksPrompt — complet (réponses + hooks refusés + pas de face cam + objectif)", async (t) => {
  await assertSnapshot(t, promptDoc(buildHooksPrompt({
    COMMON_PREFIX,
    answers: ANSWERS.slice(0, 2),
    excludeHooksRaw: ["J'ai arrêté les remises du jour au lendemain.", "Et si le problème c'était ton prix ?"],
    faceCam: "non",
    context: "Pourquoi je ne fais plus de remises sur mes créations",
    effectiveObjective: "confiance",
    objective: "vente",
  })));
});

// ── step "adjust" (guidances par type d'ajustement) ──

Deno.test("buildAdjustPrompt — « Plus long » sur un carrousel (guidance slide supplémentaire) avec angle", async (t) => {
  await assertSnapshot(t, promptDoc(buildAdjustPrompt({
    COMMON_PREFIX,
    editorialFormatLabel: "Mythe à déconstruire",
    effectiveObjective: "vente",
    angle: ANGLE,
    currentContent: "SLIDE 1 : Le talent n'existe pas.\nSLIDE 2 : Ce qui existe, c'est 200 bols ratés.\nSLIDE 3 : Enregistre ce post.",
    adjustment: "Plus long",
  })));
});

Deno.test("buildAdjustPrompt — « Ajoute des chiffres » sans angle ni format", async (t) => {
  await assertSnapshot(t, promptDoc(buildAdjustPrompt({
    COMMON_PREFIX,
    editorialFormatLabel: null,
    effectiveObjective: null,
    angle: null,
    currentContent: "Le talent n'existe pas. Ce qui existe, c'est la régularité au tour.",
    adjustment: "Ajoute des chiffres",
  })));
});

// ── step "dictation" ──

Deno.test("buildDictationPrompt — dictée vocale vers post LinkedIn", async (t) => {
  await assertSnapshot(t, promptDoc(buildDictationPrompt({
    COMMON_PREFIX,
    sourceText: "Alors en vrai le truc c'est que on me demande tout le temps des remises et genre franchement j'en peux plus quoi, donc voilà j'ai décidé d'arrêter",
    targetFormat: "post LinkedIn",
  })));
});

// ── step "generate" (un cas par famille de format ; le chemin stories est le
// seul à toucher la base — partout ailleurs supabaseInterdit fait foi) ──

Deno.test("buildGeneratePrompt — carrousel avec angle, réponses et follow-up (aucune requête DB)", async (t) => {
  const r = await buildGeneratePrompt({
    ...GENERATE_BASE,
    contentType: "carrousel",
    followUpAnswers: [{ question: "Elle a dit quoi exactement en signant ?", answer: "« En fait votre prix, c'est le bon. »" }],
    isCarousel: true,
  });
  await assertSnapshot(t, promptDoc(r));
});

Deno.test("buildGeneratePrompt — newsletter sans angle (JSON de sortie dédié, blocs visuels exclus)", async (t) => {
  const r = await buildGeneratePrompt({
    ...GENERATE_BASE,
    contentType: "newsletter",
    angle: null,
    isNewsletter: true,
  });
  await assertSnapshot(t, promptDoc(r));
});

Deno.test("buildGeneratePrompt — LinkedIn avec format éditorial (FORMAT_STRUCTURES/WRITING_RESOURCES exclus)", async (t) => {
  const r = await buildGeneratePrompt({
    ...GENERATE_BASE,
    contentType: "linkedin",
    editorialFormat: "prise_de_position",
    editorialFormatLabel: "Prise de position",
    isLinkedIn: true,
  });
  await assertSnapshot(t, promptDoc(r));
});

Deno.test("buildGeneratePrompt — reel en mode variation avec contexte lancement", async (t) => {
  const r = await buildGeneratePrompt({
    ...GENERATE_BASE,
    body: {
      face_cam: "oui",
      time_available: "30min",
      is_launch: true,
      selected_hook: {
        type: "contre_intuition",
        type_label: "Contre-intuition",
        text: "Le talent, c'est le pire conseil qu'on m'ait donné.",
        text_overlay: "LE TALENT N'EXISTE PAS",
        format_recommande: "face_cam_confession",
        format_label: "Face cam confession",
        duree_cible: "~40 sec",
      },
      launch_context: {
        phase: "vente",
        chapter_label: "Semaine 2 — ouverture des inscriptions",
        audience_phase: "considération",
        objective: "vendre l'atelier tournage débutantes",
        angle_suggestion: "preuve par les élèves",
      },
    },
    contentType: "reel",
    effectiveObjective: "vente",
    variation: true,
    previousContent: "V1 du script : hook question, développement sur la régularité, CTA commentaire.",
    isReel: true,
  });
  await assertSnapshot(t, promptDoc(r));
});

Deno.test("buildGeneratePrompt — stories objectif vente : garde-fou 3 séquences/7j + catalogue photos avec choisies", async (t) => {
  const supabase = fakeSupabaseStories({
    venteCount: 3, // déclenche l'alerte ratio 80/20
    photos: [
      { id: "photo-choisie-sans-description", description: null }, // préférée → passe MÊME sans description
      { id: "photo-atelier", description: "Mains dans la terre sur le tour, lumière chaude d'atelier" },
      { id: "photo-non-decrite", description: null }, // ni préférée ni décrite → exclue du catalogue
      { id: "photo-bols", description: "Étagère de bols émaillés bleu nuit, rangés par taille" },
    ],
  });
  const r = await buildGeneratePrompt({
    ...GENERATE_BASE,
    supabase,
    body: {
      time_available: "15min",
      face_cam: "non",
      price_range: "premium",
      preferred_photo_ids: ["photo-choisie-sans-description"],
    },
    contentType: "stories",
    effectiveObjective: "vente",
    isStories: true,
  });
  await assertSnapshot(t, promptDoc(r));
  // Le catalogue résolu (index → id, préférées en tête) fait partie du
  // contrat de sortie : c'est lui qui garantit le placement post-parse.
  await assertSnapshot(t, JSON.stringify(r.storiesPhotoCatalog, null, 2));
});
