import { normalizeDiagnosticRoute } from "./routes.ts";

// Provenance des constats (fiche 12, lot 1 : sorti d'index.ts à l'identique).
// finalizeDiagnosticEvidence modifie EN PLACE `analysis`, `sourcesUsed` et
// `sourcesFailed` : la réponse du handler renvoie ces mêmes tableaux. Ne jamais
// lui passer une copie.

export const SCREENSHOT_SOURCES = new Set(["instagram_screenshot", "linkedin_screenshot", "social_screenshot"]);
export const hasScreenshotFinding = (analysis: Record<string, unknown>) =>
  ["strengths", "weaknesses"].some((key) => Array.isArray(analysis[key]) &&
    (analysis[key] as any[]).some((item) => SCREENSHOT_SOURCES.has(item?.source) &&
      typeof item.detail === "string" && item.detail.trim().length >= 20));

/** Public for regression fixtures: provenance is decided from actual findings, not uploads. */
export function finalizeDiagnosticEvidence(
  analysis: Record<string, unknown>, sourcesUsed: string[], sourcesFailed: string[], screenshotCount: number,
) {
  const findings = [...(Array.isArray(analysis.strengths) ? analysis.strengths : []),
    ...(Array.isArray(analysis.weaknesses) ? analysis.weaknesses : [])]
    .filter((item: any) => SCREENSHOT_SOURCES.has(item?.source) &&
      typeof item.detail === "string" && item.detail.trim().length >= 20);
  if (screenshotCount > 0) {
    if (analysis.screenshot_readable !== false && findings.length) {
      for (const item of findings) if (!sourcesUsed.includes(item.source)) sourcesUsed.push(item.source);
    } else if (!sourcesFailed.includes("social_screenshot")) {
      sourcesFailed.push("social_screenshot");
    }
  }
  const validSources = new Set([...sourcesUsed, "profile"]);
  for (const key of ["strengths", "weaknesses"] as const) {
    if (Array.isArray(analysis[key])) {
      analysis[key] = (analysis[key] as any[]).filter((item) => !item?.source || validSources.has(item.source));
    }
  }
  if (Array.isArray(analysis.priorities)) {
    analysis.priorities = (analysis.priorities as any[])
      .filter((item) => !item.source || validSources.has(item.source))
      .map((item) => ({
      ...item, source: validSources.has(item.source) ? item.source : "profile",
      route: normalizeDiagnosticRoute(item.route),
      }));
  }
  const scores = analysis.scores as Record<string, unknown> | undefined;
  if (scores && !sourcesUsed.some(s => ["instagram_public", "instagram_screenshot", "instagram_connected"].includes(s))) scores.instagram = null;
  if (scores && !sourcesUsed.some(s => ["linkedin", "linkedin_screenshot"].includes(s))) scores.linkedin = null;
  if (scores && !sourcesUsed.includes("website")) scores.website = null;
  return analysis;
}
