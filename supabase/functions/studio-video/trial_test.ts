import { TRIAL_MAX_SUBMISSIONS, TRIAL_TOTAL_LIMIT_USD, workspaceAllowed } from "./index.ts";
function assert(v: unknown, m: string) { if (!v) throw new Error(m); }
Deno.test("only Laetitia's workspace is allowed for the trial", () => {
  assert(workspaceAllowed("76af5fa5-3e3a-481f-b6a6-41cc16f3d73b"), "laetitia allowed");
  assert(!workspaceAllowed("00000000-0000-4000-8000-000000000000"), "other refused");
  assert(TRIAL_TOTAL_LIMIT_USD === 10 && TRIAL_MAX_SUBMISSIONS === 1, "trial caps");
});
