/** Versioned editorial material. Pure module shared by the edge and the UI. */
export interface IdeaSource { id: string; title: string; url: string; claim: string; accessed_at: string }
/** Les ressorts qui font partager un contenu, quel que soit le métier (relevé Instagram du 14/11/2026).
 * `needsFact` : le ressort repose sur un fait réel de la cliente ; sans ce fait dans sa fiche,
 * l'idée lui pose une question au lieu d'inventer. */
export const IDEA_SPRINGS = [
  { id: "geste", emoji: "👐", label: "Montrer le geste", needsFact: false, rule: "un geste, une matière, un son ou une étape de son métier à filmer ou photographier, montré sans explication ; une scène à réaliser, jamais un vécu inventé" },
  { id: "clin_oeil", emoji: "😅", label: "Le clin d'œil à ta cliente", needsFact: false, rule: "une scène ou une pensée typique de SA cliente, racontée avec tendresse et humour pour qu'elle se reconnaisse ; présentée comme une situation type, jamais comme un témoignage réel ni une moquerie" },
  { id: "position", emoji: "✊", label: "Prendre position, avec un acte", needsFact: true, rule: "une décision prise ou une pratique refusée par la cliente, ce qu'elle lui coûte et pourquoi elle la tient ; une valeur montrée par un acte, pas un discours sur les valeurs" },
  { id: "metier", emoji: "🙊", label: "Ce que ton métier ne dit pas", needsFact: false, rule: "une idée reçue de SA propre profession contredite ou une limite de son métier dite franchement, argumentée, sans viser personne de nommé" },
  { id: "cause", emoji: "📣", label: "À repartager pour la cause", needsFact: false, rule: "un message court et utile à d'autres qu'elle, que sa communauté repartage parce qu'il défend ce à quoi elle tient (une valeur, un métier, une façon de consommer)" },
  { id: "moment", emoji: "🌿", label: "Un moment de vie", needsFact: true, rule: "un petit moment réel de sa vie ou de son atelier, hors vente, qui dit quelque chose d'elle ; jamais inventé" },
  { id: "autres", emoji: "🔎", label: "Parler des autres", needsFact: true, rule: "recommander ou faire découvrir une personne, un lieu, un savoir-faire ou un outil que son public aimera ; jamais un nom inventé" },
  { id: "eclairer", emoji: "💡", label: "Éclairer", needsFact: false, rule: "une explication, une distinction ou un mécanisme qui change une décision de son public" },
] as const;
export type IdeaSpring = typeof IDEA_SPRINGS[number]["id"];
export const ideaSpring = (id: unknown) => IDEA_SPRINGS.find(s => s.id === id);
/** Question posée à la cliente quand l'idée a besoin de son vécu réel. */
export interface IdeaAsk { question: string; placeholder: string }
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
  /** Absent sur les idées d'avant les ressorts (14/11/2026). */
  spring?: IdeaSpring;
  /** « Pourquoi on l'enverra » : ce qui fait partager l'idée. */
  share_reason?: string;
  ask?: IdeaAsk;
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
  if (ideaSpring(r.spring)) out.spring = r.spring;
  const share = string(r.share_reason, 220);
  if (share) out.share_reason = share;
  if (r.ask && typeof r.ask === "object") {
    const a = r.ask as Record<string, unknown>;
    const question = string(a.question, 220);
    if (question) out.ask = { question, placeholder: string(a.placeholder, 160) };
  }
  return out as unknown as DeepIdea;
}
/** Existing angle columns already travel through drafts, ideas and calendar.
 * Keep the whole readable brief there; never send it to the bounded angle fields
 * of a generation API. The request adapter below separates label and material. */
export function ideaToEditorialBrief(idea: DeepIdea, answer?: string): string {
  const spring = ideaSpring(idea.spring);
  const reply = answer?.trim().replace(/\n\s*\n+/g, "\n");
  const springPart = spring ? `Ressort : ${spring.label} (${spring.rule})\n\n` : "";
  const sharePart = idea.share_reason ? `Pourquoi on l'enverra : ${idea.share_reason}\n\n` : "";
  const askPart = idea.ask ? `Question posée à la cliente : ${idea.ask.question}\n${reply ? `Sa réponse (fait réel donné par elle, à utiliser tel quel) : ${reply}` : "Sa réponse : pas encore donnée. Ne rien inventer : laisser un emplacement clairement à compléter."}\n\n` : "";
  return `${idea.angle}${BRIEF_MARKER}${springPart}${sharePart}${askPart}Idée centrale : ${idea.insight}\n\nExplication : ${idea.mechanism}\n\nCe que le public en retire : ${idea.reader_benefit}\n\nDéveloppement :\n${idea.outline.map((v, i) => `${i + 1}. ${v}`).join("\n")}\n\nIllustration : ${idea.example}\n\nNuance : ${idea.nuance}\n\nAncrage dans l'activité : ${idea.grounding}${idea.analogy ? `\n\nAnalogie : ${idea.analogy.mapping}\nLimite de l'analogie : ${idea.analogy.limit}` : ""}${idea.sources.length ? `\n\nRéférences :\n${idea.sources.map(s => `${s.title} — ${s.url}\nAssertion documentée : ${s.claim}\nConsultée le ${s.accessed_at}`).join("\n")}` : "\n\nAucune référence externe vérifiée : conserver les hypothèses et exemples comme tels."}${idea.to_verify.length ? `\n\nÀ vérifier avant d'affirmer :\n${idea.to_verify.join("\n")}` : ""}`;
}
/** Question et vraie réponse de la cliente portées par un brief (null sans réponse). */
export function ideaBriefAnswer(brief: string): { question: string; answer: string } | null {
  const m = brief.match(/Question posée à la cliente : ([^\n]+)\nSa réponse \(fait réel donné par elle, à utiliser tel quel\) : ([\s\S]*?)\n\n/);
  return m ? { question: m[1].trim(), answer: m[2].trim() } : null;
}
export function isIdeaBrief(value: unknown): value is string { return typeof value === "string" && value.includes(BRIEF_MARKER); }
export function ideaAngleLabel(value: string | null | undefined): string { return value?.split(BRIEF_MARKER)[0] || ""; }
export function preserveIdeaBrief(angle: string | undefined, previous: string | null): string | null {
  if (!angle) return previous;
  return isIdeaBrief(previous) ? `${angle}${BRIEF_MARKER}${previous.split(BRIEF_MARKER).slice(1).join(BRIEF_MARKER)}` : angle;
}
