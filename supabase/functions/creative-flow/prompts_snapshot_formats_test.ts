// Tests SNAPSHOT — formats de creative-flow que prompts_snapshot_test.ts ne
// figeait pas encore (lot 2 « robustesse création de contenu », 13/10/2026 ;
// la liste des trous est dans docs/creation-contenu/CARTE.md, section 5).
//
// But : qu'une modification pensée pour UN format ne change pas en silence le
// prompt d'un AUTRE. creative-flow sert reel, stories, post Instagram,
// LinkedIn, newsletter, Pinterest et recyclage dans le même fichier, avec des
// `if` sur le format dans du code commun (buildGeneratePrompt,
// buildQuestionsPrompt, buildRecycleSystemPrompt) : chaque format a donc
// ici au moins un cas figé.
//
// Snapshots dans un fichier à part (__snapshots__/prompts_snapshot_formats_test.ts.snap)
// pour ne pas toucher à ceux de prompts_snapshot_test.ts.
//
// Un test rouge ici n'est PAS forcément un bug : si la dérive de prompt est
// VOULUE, régénère et relis le diff du .snap comme une review de prompt :
//   deno test --no-check --allow-env --allow-read --allow-write --node-modules-dir=none supabase/functions/creative-flow/prompts_snapshot_formats_test.ts -- --update
// Si le diff touche un format que tu ne voulais PAS modifier : c'est une
// régression, corrige le code plutôt que le snapshot.

import { assertSnapshot } from "https://deno.land/std@0.224.0/testing/snapshot.ts";
import { setTestEnv } from "../_shared/test-edge-harness.ts";
import { buildVisionGenerateBrief, buildVisionQuestionsPrompt, buildVisionTool } from "../_shared/vision-prompts.ts";

setTestEnv();

// Importer index.ts exécute aussi `serve(handler)` : on neutralise
// Deno.listen AVANT l'import (même danse que prompts_snapshot_test.ts).
const realListen = Deno.listen;
// deno-lint-ignore no-explicit-any
(Deno as any).listen = () => ({
  [Symbol.asyncIterator]() {
    return { next: () => new Promise(() => {}) };
  },
  accept: () => new Promise(() => {}),
  close() {},
  addr: { transport: "tcp", hostname: "localhost", port: 0 },
  rid: -1,
  ref() {},
  unref() {},
  // deno-lint-ignore no-explicit-any
}) as any;
const { buildQuestionsPrompt, buildGeneratePrompt, buildRecycleSystemPrompt } = await import("./index.ts");
// deno-lint-ignore no-explicit-any
(Deno as any).listen = realListen;

const COMMON_PREFIX = "[COMMON_PREFIX — socle système assemblé par le handler]";
const QUESTIONS_PREFIX = "[QUESTIONS_PREFIX — socle questions assemblé par le handler]";
const CONTEXT = "Pourquoi je ne fais plus de remises sur mes créations";

const ANGLE = {
  title: "Le mythe du talent",
  pitch: "Déconstruire l'idée que la céramique demande un don inné.",
  structure: ["constat", "bascule", "preuve", "application"],
  tone: "complice et cash",
  format_livraison: "carrousel",
};

const ANSWERS = [
  { question: "La dernière fois qu'on t'a demandé une remise, tu as répondu quoi ?", answer: "J'ai dit non, et la cliente a signé quand même." },
  { question: "Comment tu présentes tes tarifs maintenant ?", answer: "Une grille publique sur mon site, zéro négociation." },
];

function promptDoc(p: { systemPrompt: string; userPrompt: string }): string {
  return `── SYSTEM PROMPT ──\n${p.systemPrompt}\n\n── USER PROMPT ──\n${p.userPrompt}`;
}

// Hors stories, buildGeneratePrompt ne doit toucher AUCUNE table.
const supabaseInterdit = {
  from(table: string): never {
    throw new Error(`buildGeneratePrompt ne doit faire AUCUNE requête sur ce chemin (table demandée : ${table})`);
  },
};

function fakeSupabaseStories(opts: { venteCount: number; photos: { id: string; description: string | null }[] }) {
  return {
    from(table: string) {
      // deno-lint-ignore no-explicit-any
      const b: any = {};
      b.select = () => b;
      b.eq = () => b;
      b.order = () => b;
      if (table === "stories_sequences") {
        b.gte = () => Promise.resolve({ count: opts.venteCount });
        return b;
      }
      if (table === "user_photos") {
        b.limit = () => Promise.resolve({ data: opts.photos, error: null });
        return b;
      }
      throw new Error(`table inattendue sur le chemin stories : ${table}`);
    },
  };
}

const GENERATE_BASE = {
  supabase: supabaseInterdit,
  userId: "test-user-id",
  workspace_id: null,
  body: {},
  COMMON_PREFIX,
  context: CONTEXT,
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
  pinterest_link: null as string | null,
  pinterest_board: null as string | null,
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

const QUESTIONS_BASE = {
  QUESTIONS_PREFIX,
  brandingContext: "",
  brandVocabBlock: "",
  context: CONTEXT,
  editorialFormatLabel: null,
  angle: ANGLE,
  calendarBlock: "",
  objectiveBlock: "",
  newsContextBlock: "",
  recentBriefsContext: "",
};

// ── step "generate" : formats absents de prompts_snapshot_test.ts ──

Deno.test("generate — post Instagram (légende par défaut, objectif confiance)", async (t) => {
  const r = await buildGeneratePrompt({
    ...GENERATE_BASE,
    contentType: "post_instagram",
    effectiveObjective: "confiance",
  });
  await assertSnapshot(t, promptDoc(r));
});

Deno.test("generate — Pinterest texte avec lien et tableau", async (t) => {
  const r = await buildGeneratePrompt({
    ...GENERATE_BASE,
    contentType: "post_pinterest",
    angle: { ...ANGLE, format_livraison: "pinterest" },
    pinterest_link: "https://exemple.test/atelier-tournage",
    pinterest_board: "Céramique pour débutantes",
    isPinterest: true,
  });
  await assertSnapshot(t, promptDoc(r));
});

Deno.test("generate — légende photo (mode photo, description fournie)", async (t) => {
  const r = await buildGeneratePrompt({
    ...GENERATE_BASE,
    contentType: "post_instagram",
    body: { photo_description: "Mains dans la terre sur le tour, lumière chaude d'atelier" },
    isPhotoMode: true,
  });
  await assertSnapshot(t, promptDoc(r));
});

Deno.test("generate — stories sans objectif de vente (aucune photo en bibliothèque)", async (t) => {
  const r = await buildGeneratePrompt({
    ...GENERATE_BASE,
    supabase: fakeSupabaseStories({ venteCount: 0, photos: [] }),
    body: { time_available: "5min", face_cam: "oui" },
    contentType: "stories",
    effectiveObjective: "visibilite",
    isStories: true,
  });
  await assertSnapshot(t, promptDoc(r));
});

Deno.test("generate — newsletter avec angle et objectif vente", async (t) => {
  const r = await buildGeneratePrompt({
    ...GENERATE_BASE,
    contentType: "post_newsletter",
    effectiveObjective: "vente",
    isNewsletter: true,
  });
  await assertSnapshot(t, promptDoc(r));
});

// ── step "questions" : canaux absents de prompts_snapshot_test.ts ──

for (const contentType of ["post_pinterest", "reel", "stories", "instagram_post"]) {
  Deno.test(`questions — ${contentType}`, async (t) => {
    await assertSnapshot(t, promptDoc(buildQuestionsPrompt({ ...QUESTIONS_BASE, contentType })));
  });
}

// ── step "recycle" : un prompt système par format recyclé ──

// Copie des libellés `formatLabels` du handler (index.ts). S'ils changent
// là-bas, mets-les à jour ici aussi.
const FORMAT_LABELS: Record<string, string> = {
  carrousel: "Carrousel Instagram",
  reel: "Script Reel (30-60 sec)",
  stories: "Séquence Stories",
  linkedin: "Post LinkedIn",
  newsletter: "Email / Newsletter",
};

for (const format of Object.keys(FORMAT_LABELS)) {
  Deno.test(`recycle — prompt système ${format}`, async (t) => {
    await assertSnapshot(t, buildRecycleSystemPrompt(
      [format],
      FORMAT_LABELS,
      COMMON_PREFIX,
      "\nOBJECTIF : confiance.",
      "céramiste",
      "débutantes qui veulent apprendre le tournage",
      "coulisses d'atelier, pédagogie, prix juste",
    ));
  });
}

// ── mode photo (vision) : prompts de questions et brief de génération ──

const VISION_TYPES = ["post_instagram", "post_linkedin", "reel", "stories", "post_pinterest", "post_newsletter"];

for (const contentType of VISION_TYPES) {
  Deno.test(`vision questions — ${contentType}, une photo`, async (t) => {
    await assertSnapshot(t, buildVisionQuestionsPrompt({
      contentType,
      context: CONTEXT,
      objective: "confiance",
      photo_description: "Mains dans la terre sur le tour",
      per_photo_context: null,
    }));
  });

  Deno.test(`vision generate — brief et outil ${contentType}`, async (t) => {
    await assertSnapshot(t, JSON.stringify({
      brief: buildVisionGenerateBrief(contentType),
      tool: buildVisionTool(contentType),
    }, null, 2));
  });
}

Deno.test("vision questions — série avant / après avec contexte par photo", async (t) => {
  await assertSnapshot(t, buildVisionQuestionsPrompt({
    contentType: "post_instagram",
    context: CONTEXT,
    objective: null,
    photo_description: null,
    per_photo_context: null,
    photo_count: 2,
    per_photo_contexts: ["Le bol avant émaillage", null],
  }));
});
