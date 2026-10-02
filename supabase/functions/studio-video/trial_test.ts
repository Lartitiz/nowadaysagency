import { claimFailureMessage, TRIAL_MAX_SUBMISSIONS, TRIAL_TOTAL_LIMIT_USD, workspaceAllowed } from "./index.ts";
function assert(v: unknown, m: string) { if (!v) throw new Error(m); }
Deno.test("only Laetitia's workspace is allowed for the trial", () => {
  assert(workspaceAllowed("76af5fa5-3e3a-481f-b6a6-41cc16f3d73b"), "laetitia allowed");
  assert(!workspaceAllowed("00000000-0000-4000-8000-000000000000"), "other refused");
  assert(TRIAL_TOTAL_LIMIT_USD === 11 && TRIAL_MAX_SUBMISSIONS === 20, "trial caps");
});
Deno.test("an active clip conflict explains when the same quote can be launched", () => {
  const conflict = claimFailureMessage({ code: "23505",
    message: 'duplicate key value violates unique constraint "studio_video_one_active"' });
  assert(conflict.includes("Un autre clip est en cours"), "active clip explained");
  assert(conflict.includes("devis expire"), "quote expiry explained");
  assert(claimFailureMessage({ code: "23505", message: 'duplicate key value violates unique constraint "other_index"' }) ===
    "La génération ne peut pas démarrer.", "other database conflicts stay generic");
});
Deno.test("cohort lane ceilings only ever lower, never raise", async () => {
  const { ceilingUsd, maxQuoteUsd, COHORT_TOTAL_LIMIT_USD, COHORT_WORKSPACE_LIMIT_USD, COHORT_WORKSPACE_MAX_SUBMISSIONS } = await import("./index.ts");
  Deno.env.set("HIGGSFIELD_VIDEO_MONTHLY_LIMIT_USD", "500");
  assert(ceilingUsd("cohort") === COHORT_TOTAL_LIMIT_USD && ceilingUsd("trial") === TRIAL_TOTAL_LIMIT_USD, "env cannot raise");
  assert(maxQuoteUsd("cohort") === COHORT_WORKSPACE_LIMIT_USD, "per-workspace cap");
  Deno.env.set("HIGGSFIELD_VIDEO_MONTHLY_LIMIT_USD", "5");
  assert(ceilingUsd("cohort") === 5 && maxQuoteUsd("cohort") === 5, "env lowers");
  Deno.env.delete("HIGGSFIELD_VIDEO_MONTHLY_LIMIT_USD");
  assert(ceilingUsd("cohort") === 0 && ceilingUsd(null) === 0, "off without env");
  assert(COHORT_WORKSPACE_MAX_SUBMISSIONS === 2, "2 videos max per participant");
});
Deno.test("cohort lane ceilings only ever lower, never raise", async () => {
  const { ceilingUsd, maxQuoteUsd, COHORT_TOTAL_LIMIT_USD, COHORT_WORKSPACE_LIMIT_USD, COHORT_WORKSPACE_MAX_SUBMISSIONS } = await import("./index.ts");
  Deno.env.set("HIGGSFIELD_VIDEO_MONTHLY_LIMIT_USD", "500");
  assert(ceilingUsd("cohort") === COHORT_TOTAL_LIMIT_USD && ceilingUsd("trial") === TRIAL_TOTAL_LIMIT_USD, "env cannot raise");
  assert(maxQuoteUsd("cohort") === COHORT_WORKSPACE_LIMIT_USD, "per-workspace cap");
  Deno.env.set("HIGGSFIELD_VIDEO_MONTHLY_LIMIT_USD", "5");
  assert(ceilingUsd("cohort") === 5 && maxQuoteUsd("cohort") === 5, "env lowers");
  Deno.env.delete("HIGGSFIELD_VIDEO_MONTHLY_LIMIT_USD");
  assert(ceilingUsd("cohort") === 0 && ceilingUsd(null) === 0, "off without env");
  assert(COHORT_WORKSPACE_MAX_SUBMISSIONS === 2, "2 videos max per participant");
});
Deno.test("plan lane (grille 01/10/2026) : 3 clips Premium, 6 Binôme, aucun en gratuit ; clip ≤ 2 $", async () => {
  const { ceilingUsd, maxQuoteUsd, planVideoClips, PLAN_CLIP_LIMIT_USD, PLAN_TOTAL_LIMIT_USD, exhaustedMessage, overQuoteMessage } = await import("./index.ts");
  assert(planVideoClips("outil") === 3 && planVideoClips("binome") === 6, "clips par forfait");
  assert(planVideoClips("free") === 0 && planVideoClips("inconnu") === 0, "pas de vidéo hors forfait payant");
  Deno.env.set("HIGGSFIELD_VIDEO_MONTHLY_LIMIT_USD", "500");
  assert(ceilingUsd("plan") === PLAN_TOTAL_LIMIT_USD, "env cannot raise the global plan ceiling");
  assert(maxQuoteUsd("plan") === PLAN_CLIP_LIMIT_USD && PLAN_CLIP_LIMIT_USD === 2, "clip ≤ 2 $ (480p jusqu'à 8 s)");
  Deno.env.set("HIGGSFIELD_VIDEO_MONTHLY_LIMIT_USD", "1");
  assert(ceilingUsd("plan") === 1 && maxQuoteUsd("plan") === 1, "env lowers");
  Deno.env.delete("HIGGSFIELD_VIDEO_MONTHLY_LIMIT_USD");
  assert(ceilingUsd("plan") === 0, "off without env");
  assert(exhaustedMessage("plan", 3).includes("tes 3 vidéos du mois"), "message forfait épuisé");
  assert(overQuoteMessage("plan").includes("8 secondes en 480p"), "message devis trop cher");
  assert(claimFailureMessage({ message: "video_month_exhausted" }).includes("vidéos du mois"), "claim month exhausted");
  assert(claimFailureMessage({ message: "video_clip_too_expensive" }).includes("480p"), "claim clip too expensive");
});
Deno.test("verrou par espace (02/10/2026) : messages du clip déjà en cours et de la file globale", async () => {
  const { PLAN_MAX_ACTIVE_CLIPS } = await import("./index.ts");
  assert(PLAN_MAX_ACTIVE_CLIPS === 3, "3 clips de forfait simultanés au maximum");
  const perWorkspace = claimFailureMessage({ code: "23505",
    message: 'duplicate key value violates unique constraint "studio_video_one_active_workspace"' });
  assert(perWorkspace.includes("dans cet espace"), "le verrou est désormais par espace");
  assert(claimFailureMessage({ message: "video_busy" }).includes("Plusieurs clips"), "file globale expliquée");
});
