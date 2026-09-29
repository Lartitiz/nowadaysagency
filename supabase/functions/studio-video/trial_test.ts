import { TRIAL_MAX_SUBMISSIONS, TRIAL_TOTAL_LIMIT_USD, workspaceAllowed } from "./index.ts";
function assert(v: unknown, m: string) { if (!v) throw new Error(m); }
Deno.test("only Laetitia's workspace is allowed for the trial", () => {
  assert(workspaceAllowed("76af5fa5-3e3a-481f-b6a6-41cc16f3d73b"), "laetitia allowed");
  assert(!workspaceAllowed("00000000-0000-4000-8000-000000000000"), "other refused");
  assert(TRIAL_TOTAL_LIMIT_USD === 11 && TRIAL_MAX_SUBMISSIONS === 20, "trial caps");
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
  assert(COHORT_WORKSPACE_MAX_SUBMISSIONS >= 2, "2 videos per participant fit");
});
