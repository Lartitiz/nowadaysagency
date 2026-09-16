/** Versioned editorial material. Pure module shared by the edge and the UI. */
export interface IdeaSource { id: string; title: string; url: string; claim: string; accessed_at: string }
export interface DeepIdea {
  subject: string;
  angle: string;
  insight: string;
  mechanism: string;
  reader_benefit: string;
  outline: string[];
  example: string;
  nuance: string;
  grounding: string;
  objective_tag: string;
  sources: IdeaSource[];
  to_verify: string[];
  analogy?: { mapping: string; limit: string };
}
export const BRIEF_MARKER = "\n\n[Brief éditorial — v1]\n";
const string = (v: unknown, max: number) => typeof v === "string" && v.trim().length <= max ? v.trim() : "";
export function safeSourceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const u = new URL(value); return /^https?:$/.test(u.protocol) && !u.username && !u.password ? u.href : null; } catch { return null; }
}
/** Reject incomplete outputs instead of presenting a title as a developed idea. */
export function parseDeepIdea(raw: unknown, sources: IdeaSource[] = []): DeepIdea | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const fields = { subject: 220, angle: 80, insight: 500, mechanism: 900, reader_benefit: 350, example: 600, nuance: 450, grounding: 450 };
  const out: Record<string, unknown> = {};
  for (const [key, max] of Object.entries(fields)) { out[key] = string(r[key], max); if (!out[key]) return null; }
  if (!Array.isArray(r.outline) || r.outline.length < 2 || r.outline.length > 4) return null;
  out.outline = r.outline.map(v => string(v, 250));
  if ((out.outline as string[]).some(v => !v)) return null;
  out.objective_tag = ["visibilite", "engagement", "vente", "credibilite"].includes(String(r.objective_tag)) ? r.objective_tag : "credibilite";
  const ids = Array.isArray(r.source_ids) ? r.source_ids : Array.isArray(r.sources) ? r.sources.map((s: IdeaSource) => s?.id) : [];
  // URLs always come from retrieved citations, never from the final writer.
  out.sources = sources.filter(s => ids.includes(s.id) && safeSourceUrl(s.url)).slice(0, 3);
  out.to_verify = (Array.isArray(r.to_verify) ? r.to_verify : []).slice(0, 3).map(v => string(v, 250)).filter(Boolean);
  if (r.analogy && typeof r.analogy === "object") {
    const a = r.analogy as Record<string, unknown>;
    const mapping = string(a.mapping, 450), limit = string(a.limit, 300);
    if (!mapping || !limit) return null;
    out.analogy = { mapping, limit };
  }
  return out as unknown as DeepIdea;
}
/** Existing angle columns already travel through drafts, ideas and calendar.
 * Keep the whole readable brief there; never send it to the bounded angle fields
 * of a generation API. The request adapter below separates label and material. */
export function ideaToEditorialBrief(idea: DeepIdea): string {
  return `${idea.angle}${BRIEF_MARKER}Idée centrale : ${idea.insight}\n\nExplication : ${idea.mechanism}\n\nCe que le public en retire : ${idea.reader_benefit}\n\nDéveloppement :\n${idea.outline.map((v, i) => `${i + 1}. ${v}`).join("\n")}\n\nIllustration : ${idea.example}\n\nNuance : ${idea.nuance}\n\nAncrage dans l'activité : ${idea.grounding}${idea.analogy ? `\n\nAnalogie : ${idea.analogy.mapping}\nLimite de l'analogie : ${idea.analogy.limit}` : ""}${idea.sources.length ? `\n\nRéférences :\n${idea.sources.map(s => `${s.title} — ${s.url}\nAssertion documentée : ${s.claim}\nConsultée le ${s.accessed_at}`).join("\n")}` : "\n\nAucune référence externe vérifiée : conserver les hypothèses et exemples comme tels."}${idea.to_verify.length ? `\n\nÀ vérifier avant d'affirmer :\n${idea.to_verify.join("\n")}` : ""}`;
}
export function isIdeaBrief(value: unknown): value is string { return typeof value === "string" && value.includes(BRIEF_MARKER); }
export function ideaAngleLabel(value: string | null | undefined): string { return value?.split(BRIEF_MARKER)[0] || ""; }
export function preserveIdeaBrief(angle: string | undefined, previous: string | null): string | null {
  if (!angle) return previous;
  return isIdeaBrief(previous) ? `${angle}${BRIEF_MARKER}${previous.split(BRIEF_MARKER).slice(1).join(BRIEF_MARKER)}` : angle;
}
