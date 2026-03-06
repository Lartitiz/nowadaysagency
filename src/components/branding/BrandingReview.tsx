import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Sparkles, ArrowLeft, Lock, Instagram, Pencil, Trash2, X, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Confetti from "@/components/Confetti";
import BrandingCoachingFlow from "@/components/branding/BrandingCoachingFlow";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

// ─── Types ───────────────────────────────────────────────────
export interface AnalysisResult {
  story?: { confidence?: string; origin?: string; trigger?: string; struggles?: string; uniqueness?: string; vision?: string; full_story?: string };
  persona?: { confidence?: string; name?: string; age_range?: string; job?: string; goals?: string[]; frustrations?: string[]; desires?: string[]; channels?: string[]; brands_they_follow?: string[] };
  value_proposition?: { confidence?: string; key_phrase?: string; problem?: string; solution?: string; differentiator?: string; proofs?: string[] };
  tone_style?: { confidence?: string; tone_keywords?: string[]; i_do?: string[]; i_never_do?: string[]; fights?: string[]; visual_style?: string };
  content_strategy?: { confidence?: string; pillars?: string[]; creative_twist?: string; formats?: string[]; rhythm?: string; editorial_line?: string };
  offers?: { confidence?: string; offers?: { name?: string; price?: string; description?: string; target?: string; promise?: string }[] };
  sources_used?: string[];
  sources_failed?: string[];
  overall_confidence?: string;
  missing_info?: string;
}

interface Props {
  analysis: AnalysisResult;
  sourcesUsed?: string[];
  sourcesFailed?: string[];
  onDone: () => void;
  /** Sections already filled by the user (won't be overwritten) */
  preFilledSections?: Set<string>;
  /** Callback for Instagram bio paste + reanalysis */
  onReanalyzeWithBio?: (bio: string) => void;
  /** Callback for "describe project" fallback */
  onDescribeProject?: (text: string) => void;
  /** If true, all sources failed */
  allSourcesFailed?: boolean;
}

const COACHING_SECTION_MAP: Record<SectionKey, string> = {
  story: "story",
  persona: "persona",
  value_proposition: "value_proposition",
  tone_style: "tone_style",
  content_strategy: "content_strategy",
  offers: "offers",
};

const SECTIONS = [
  { key: "story", title: "Ton histoire", emoji: "📖" },
  { key: "persona", title: "Ton·ta client·e idéal·e", emoji: "👤" },
  { key: "value_proposition", title: "Ta proposition de valeur", emoji: "💎" },
  { key: "tone_style", title: "Ton & style", emoji: "🎙️" },
  { key: "content_strategy", title: "Ta stratégie de contenu", emoji: "🍒" },
  { key: "offers", title: "Tes offres", emoji: "🎁" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

function getConfidence(section: any): string {
  return section?.confidence || "low";
}

function ConfidenceBadge({ level }: { level: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    high: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Confiant·e" },
    medium: { bg: "bg-amber-100", text: "text-amber-700", label: "À vérifier" },
    low: { bg: "bg-[#fce4ec]", text: "text-[#91014b]", label: "À compléter" },
  };
  const s = map[level] || map.low;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[12px] font-medium px-2.5 py-0.5 rounded-full ${s.bg} ${s.text}`}>
      <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: level === "high" ? "#22c55e" : level === "medium" ? "#f59e0b" : "#fb3d80" }} />
      {s.label}
    </span>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-block px-3 py-1 text-[13px] rounded-[8px] bg-[#ffa7c6]/20 text-[#91014b] font-medium">{children}</span>;
}

function SourceTag({ name, ok }: { name: string; ok: boolean }) {
  const labels: Record<string, string> = { website: "Site", instagram: "Instagram", linkedin: "LinkedIn", documents: "Documents" };
  return (
    <span className={`inline-flex items-center gap-1 text-[12px] px-2 py-0.5 rounded-full font-medium ${ok ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground line-through"}`}>
      {labels[name] || name} {ok ? "✓" : "✗"}
    </span>
  );
}

// ─── Section Renderers ───────────────────────────────────────
function StorySection({ data }: { data: AnalysisResult["story"] }) {
  if (!data) return null;
  return (
    <div className="space-y-3">
      {data.full_story && <p className="text-[14px] leading-relaxed text-foreground whitespace-pre-line">{data.full_story}</p>}
      {!data.full_story && (
        <div className="space-y-2 text-[14px] text-foreground">
          {data.origin && <p><span className="font-semibold text-[#91014b]">Origine :</span> {data.origin}</p>}
          {data.trigger && <p><span className="font-semibold text-[#91014b]">Déclic :</span> {data.trigger}</p>}
          {data.struggles && <p><span className="font-semibold text-[#91014b]">Épreuves :</span> {data.struggles}</p>}
          {data.uniqueness && <p><span className="font-semibold text-[#91014b]">Ce qui te rend unique :</span> {data.uniqueness}</p>}
          {data.vision && <p><span className="font-semibold text-[#91014b]">Vision :</span> {data.vision}</p>}
        </div>
      )}
    </div>
  );
}

function PersonaSection({ data }: { data: AnalysisResult["persona"] }) {
  if (!data) return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-[14px]">
        {data.name && <span className="font-display text-[16px]">{data.name}</span>}
        {data.age_range && <Chip>{data.age_range} ans</Chip>}
        {data.job && <Chip>{data.job}</Chip>}
      </div>
      {data.goals?.length ? <div><p className="text-[12px] font-semibold text-[#91014b] mb-1">Objectifs</p><div className="flex flex-wrap gap-1.5">{data.goals.map((g, i) => <Chip key={i}>{g}</Chip>)}</div></div> : null}
      {data.frustrations?.length ? <div><p className="text-[12px] font-semibold text-[#91014b] mb-1">Frustrations</p><div className="flex flex-wrap gap-1.5">{data.frustrations.map((f, i) => <Chip key={i}>{f}</Chip>)}</div></div> : null}
      {data.desires?.length ? <div><p className="text-[12px] font-semibold text-[#91014b] mb-1">Désirs</p><div className="flex flex-wrap gap-1.5">{data.desires.map((d, i) => <Chip key={i}>{d}</Chip>)}</div></div> : null}
      {data.channels?.length ? <div><p className="text-[12px] font-semibold text-[#91014b] mb-1">Canaux</p><div className="flex flex-wrap gap-1.5">{data.channels.map((c, i) => <Chip key={i}>{c}</Chip>)}</div></div> : null}
    </div>
  );
}

function ValuePropSection({ data }: { data: AnalysisResult["value_proposition"] }) {
  if (!data) return null;
  return (
    <div className="space-y-3">
      {data.key_phrase && <p className="font-display text-[18px] text-foreground leading-snug">{data.key_phrase}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[13px]">
        {data.problem && <div className="p-3 rounded-[12px] bg-[#fce4ec]"><p className="font-semibold text-[#91014b] mb-1">Problème</p><p className="text-foreground">{data.problem}</p></div>}
        {data.solution && <div className="p-3 rounded-[12px] bg-emerald-50"><p className="font-semibold text-emerald-700 mb-1">Solution</p><p className="text-foreground">{data.solution}</p></div>}
        {data.differentiator && <div className="p-3 rounded-[12px] bg-amber-50"><p className="font-semibold text-amber-700 mb-1">Différenciateur</p><p className="text-foreground">{data.differentiator}</p></div>}
      </div>
      {data.proofs?.length ? <div className="flex flex-wrap gap-1.5">{data.proofs.map((p, i) => <Chip key={i}>{p}</Chip>)}</div> : null}
    </div>
  );
}

function ToneSection({ data }: { data: AnalysisResult["tone_style"] }) {
  if (!data) return null;
  return (
    <div className="space-y-3">
      {data.tone_keywords?.length ? <div className="flex flex-wrap gap-1.5">{data.tone_keywords.map((k, i) => <Chip key={i}>{k}</Chip>)}</div> : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[13px]">
        {data.i_do?.length ? <div className="p-3 rounded-[12px] bg-emerald-50"><p className="font-semibold text-emerald-700 mb-2">✅ Je fais</p><ul className="space-y-1">{data.i_do.map((d, i) => <li key={i}>• {d}</li>)}</ul></div> : null}
        {data.i_never_do?.length ? <div className="p-3 rounded-[12px] bg-[#fce4ec]"><p className="font-semibold text-[#91014b] mb-2">🚫 Je ne fais jamais</p><ul className="space-y-1">{data.i_never_do.map((d, i) => <li key={i}>• {d}</li>)}</ul></div> : null}
      </div>
      {data.fights?.length ? <div><p className="text-[12px] font-semibold text-[#91014b] mb-1">Combats</p><div className="flex flex-wrap gap-1.5">{data.fights.map((f, i) => <Chip key={i}>{f}</Chip>)}</div></div> : null}
      {data.visual_style && <p className="text-[13px] text-muted-foreground italic">{data.visual_style}</p>}
    </div>
  );
}

function StrategySection({ data }: { data: AnalysisResult["content_strategy"] }) {
  if (!data) return null;
  return (
    <div className="space-y-3">
      {data.pillars?.length ? <div><p className="text-[12px] font-semibold text-[#91014b] mb-1">Piliers</p><div className="flex flex-wrap gap-1.5">{data.pillars.map((p, i) => <Chip key={i}>{p}</Chip>)}</div></div> : null}
      {data.creative_twist && <p className="text-[14px]"><span className="font-semibold text-[#91014b]">Angle créatif :</span> {data.creative_twist}</p>}
      {data.formats?.length ? <div><p className="text-[12px] font-semibold text-[#91014b] mb-1">Formats</p><div className="flex flex-wrap gap-1.5">{data.formats.map((f, i) => <Chip key={i}>{f}</Chip>)}</div></div> : null}
      {data.rhythm && <p className="text-[13px] text-muted-foreground">{data.rhythm}</p>}
      {data.editorial_line && <p className="text-[14px]"><span className="font-semibold text-[#91014b]">Ligne éditoriale :</span> {data.editorial_line}</p>}
    </div>
  );
}

interface OfferItem { name?: string; price?: string; description?: string; target?: string; promise?: string }

function OffersSection({ data, onUpdate, onDelete }: { data: AnalysisResult["offers"]; onUpdate?: (index: number, offer: OfferItem) => void; onDelete?: (index: number) => void }) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<OfferItem>({});

  if (!data?.offers?.length) return null;

  const startEdit = (i: number) => {
    setEditDraft({ ...data.offers![i] });
    setEditingIndex(i);
  };
  const cancelEdit = () => { setEditingIndex(null); setEditDraft({}); };
  const confirmEdit = () => {
    if (editingIndex !== null && onUpdate) {
      onUpdate(editingIndex, editDraft);
    }
    setEditingIndex(null);
    setEditDraft({});
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {data.offers.map((o, i) => (
        <div key={i} className="p-4 rounded-[12px] border border-border bg-background relative group">
          {editingIndex === i ? (
            <div className="space-y-2">
              <input value={editDraft.name || ""} onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))} placeholder="Nom de l'offre" className="w-full text-[14px] font-display border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
              <input value={editDraft.price || ""} onChange={e => setEditDraft(d => ({ ...d, price: e.target.value }))} placeholder="Prix" className="w-full text-[13px] border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
              <input value={editDraft.description || ""} onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))} placeholder="Description" className="w-full text-[13px] border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
              <input value={editDraft.target || ""} onChange={e => setEditDraft(d => ({ ...d, target: e.target.value }))} placeholder="Pour qui ?" className="w-full text-[13px] border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
              <input value={editDraft.promise || ""} onChange={e => setEditDraft(d => ({ ...d, promise: e.target.value }))} placeholder="Promesse" className="w-full text-[13px] border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
              <div className="flex gap-2 pt-1">
                <button onClick={confirmEdit} className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-600 hover:text-emerald-700"><Check className="h-3.5 w-3.5" /> OK</button>
                <button onClick={cancelEdit} className="inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /> Annuler</button>
              </div>
            </div>
          ) : (
            <>
              {(onUpdate || onDelete) && (
                <div className="absolute top-2.5 right-2.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {onUpdate && <button onClick={() => startEdit(i)} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title="Modifier"><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></button>}
                  {onDelete && <button onClick={() => onDelete(i)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors" title="Supprimer"><Trash2 className="h-3.5 w-3.5 text-destructive" /></button>}
                </div>
              )}
              <div className="flex items-baseline justify-between mb-2 pr-14">
                <p className="font-display text-[15px]">{o.name || "Offre"}</p>
                {o.price && <span className="text-[13px] font-semibold text-[#fb3d80]">{o.price}</span>}
              </div>
              {o.description && <p className="text-[13px] text-muted-foreground mb-1">{o.description}</p>}
              {o.target && <p className="text-[12px]"><span className="font-semibold text-[#91014b]">Pour :</span> {o.target}</p>}
              {o.promise && <p className="text-[12px]"><span className="font-semibold text-[#91014b]">Promesse :</span> {o.promise}</p>}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Save helpers ────────────────────────────────────────────
async function saveStory(data: AnalysisResult["story"], userId: string, workspaceId: string) {
  if (!data) return;

  const payload: Record<string, any> = {
    user_id: userId,
    workspace_id: workspaceId || null,
    is_primary: true,
    title: "Mon histoire fondatrice",
    story_type: "fondatrice",
    source: "autofill",
    updated_at: new Date().toISOString(),
  };

  if (data.origin) payload.step_1_raw = data.origin;
  if (data.trigger) payload.step_2_location = data.trigger;
  if (data.struggles) payload.step_3_action = data.struggles;
  if (data.uniqueness) payload.step_4_thoughts = data.uniqueness;
  if (data.vision) payload.step_5_emotions = data.vision;
  if (data.full_story) payload.step_6_full_story = data.full_story;

  const filterCol = workspaceId && workspaceId !== userId ? "workspace_id" : "user_id";
  const filterVal = workspaceId && workspaceId !== userId ? workspaceId : userId;

  const { data: existing } = await (supabase.from("storytelling") as any)
    .select("id")
    .eq(filterCol, filterVal)
    .eq("is_primary", true)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await (supabase.from("storytelling") as any).update(payload).eq("id", existing.id);
  } else {
    await (supabase.from("storytelling") as any).insert(payload);
  }
}
async function savePersona(data: AnalysisResult["persona"], userId: string, workspaceId: string) {
  if (!data) return;

  const payload: Record<string, any> = {
    user_id: userId,
    workspace_id: workspaceId || null,
    is_primary: true,
    updated_at: new Date().toISOString(),
  };

  if (data.name) payload.portrait_prenom = data.name;
  if (data.age_range) payload.portrait_age = data.age_range;
  if (data.job) payload.description = data.job;
  if (data.frustrations?.length) payload.step_1_frustrations = data.frustrations.join("\n");
  if (data.desires?.length) payload.step_2_transformation = data.desires.join("\n");
  if (data.goals?.length) payload.step_3a_objections = data.goals.join("\n");
  if (data.channels) payload.channels = data.channels;
  if (data.brands_they_follow?.length) payload.step_4_inspiring = data.brands_they_follow.join(", ");

  const filterCol = workspaceId && workspaceId !== userId ? "workspace_id" : "user_id";
  const filterVal = workspaceId && workspaceId !== userId ? workspaceId : userId;

  const { data: existing } = await (supabase.from("persona") as any)
    .select("id")
    .eq(filterCol, filterVal)
    .eq("is_primary", true)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await (supabase.from("persona") as any).update(payload).eq("id", existing.id);
  } else {
    await (supabase.from("persona") as any).insert(payload);
  }
}
async function saveValueProp(data: AnalysisResult["value_proposition"], userId: string, workspaceId: string) {
  if (!data) return;
  const payload: Record<string, any> = { updated_at: new Date().toISOString() };
  if (data.key_phrase) { payload.step_1_what = data.key_phrase; payload.version_one_liner = data.key_phrase; }
  if (data.solution) payload.step_2a_process = data.solution;
  if (data.differentiator) payload.step_2d_refuse = data.differentiator;
  if (data.problem) payload.step_3_for_whom = data.problem;
  const filterCol = workspaceId && workspaceId !== userId ? "workspace_id" : "user_id";
  const filterVal = workspaceId && workspaceId !== userId ? workspaceId : userId;
  const { data: existing } = await (supabase.from("brand_proposition") as any)
    .select("id").eq(filterCol, filterVal).maybeSingle();
  if (existing?.id) {
    await (supabase.from("brand_proposition") as any).update(payload).eq("id", existing.id);
  } else {
    await (supabase.from("brand_proposition") as any).insert({ user_id: userId, workspace_id: workspaceId || null, ...payload });
  }
}
async function saveTone(data: AnalysisResult["tone_style"], userId: string, workspaceId: string) {
  if (!data) return;
  const payload: Record<string, any> = { updated_at: new Date().toISOString() };
  if (data.tone_keywords) payload.tone_keywords = data.tone_keywords;
  if (data.i_do?.length) payload.tone_do = data.i_do.join("\n");
  if (data.i_never_do?.length) payload.tone_dont = data.i_never_do.join("\n");
  if (data.fights?.length) payload.combat_cause = data.fights.join("\n");
  if (data.visual_style) payload.visual_style = data.visual_style;
  const filterCol = workspaceId && workspaceId !== userId ? "workspace_id" : "user_id";
  const filterVal = workspaceId && workspaceId !== userId ? workspaceId : userId;
  const { data: existing } = await (supabase.from("brand_profile") as any)
    .select("id").eq(filterCol, filterVal).maybeSingle();
  if (existing?.id) {
    await (supabase.from("brand_profile") as any).update(payload).eq("id", existing.id);
  } else {
    await (supabase.from("brand_profile") as any).insert({ user_id: userId, workspace_id: workspaceId || null, ...payload });
  }
}
async function saveStrategy(data: AnalysisResult["content_strategy"], userId: string, workspaceId: string) {
  if (!data) return;
  const filterCol = workspaceId && workspaceId !== userId ? "workspace_id" : "user_id";
  const filterVal = workspaceId && workspaceId !== userId ? workspaceId : userId;
  const stratPayload: Record<string, any> = { updated_at: new Date().toISOString() };
  if (data.pillars?.[0]) stratPayload.pillar_major = data.pillars[0];
  if (data.pillars?.[1]) stratPayload.pillar_minor_1 = data.pillars[1];
  if (data.pillars?.[2]) stratPayload.pillar_minor_2 = data.pillars[2];
  if (data.creative_twist) stratPayload.creative_concept = data.creative_twist;
  const { data: existingStrat } = await (supabase.from("brand_strategy") as any)
    .select("id").eq(filterCol, filterVal).maybeSingle();
  if (existingStrat?.id) {
    await (supabase.from("brand_strategy") as any).update(stratPayload).eq("id", existingStrat.id);
  } else {
    await (supabase.from("brand_strategy") as any).insert({ user_id: userId, workspace_id: workspaceId || null, ...stratPayload });
  }
  if (data.editorial_line || data.formats?.length) {
    const profilePayload: Record<string, any> = { updated_at: new Date().toISOString() };
    if (data.pillars) profilePayload.content_pillars = data.pillars;
    if (data.editorial_line) profilePayload.content_editorial_line = data.editorial_line;
    if (data.formats) profilePayload.content_formats = data.formats;
    if (data.rhythm) profilePayload.content_frequency = data.rhythm;
    const { data: existingProfile } = await (supabase.from("brand_profile") as any)
      .select("id").eq(filterCol, filterVal).maybeSingle();
    if (existingProfile?.id) {
      await (supabase.from("brand_profile") as any).update(profilePayload).eq("id", existingProfile.id);
    } else {
      await (supabase.from("brand_profile") as any).insert({ user_id: userId, workspace_id: workspaceId || null, ...profilePayload });
    }
  }
}
async function saveOffers(data: AnalysisResult["offers"], userId: string, workspaceId: string) {
  if (!data?.offers?.length) return;
  for (const offer of data.offers) {
    await (supabase.from("offers") as any).insert({
      user_id: userId,
      workspace_id: workspaceId || null,
      name: offer.name || "Offre",
      price_text: offer.price || null,
      description: offer.description || null,
      target_ideal: offer.target || null,
      promise: offer.promise || null,
      updated_at: new Date().toISOString(),
    });
  }
}

const SAVE_FNS: Record<SectionKey, (data: any, uid: string, wsId: string) => Promise<void>> = {
  story: saveStory, persona: savePersona, value_proposition: saveValueProp, tone_style: saveTone, content_strategy: saveStrategy, offers: saveOffers,
};

const QUERY_KEYS: Record<SectionKey, string[]> = {
  story: ["storytelling-primary", "storytelling-list"], persona: ["persona", "brand-profile"], value_proposition: ["brand-proposition"], tone_style: ["brand-profile"], content_strategy: ["brand-strategy", "brand-profile"], offers: ["brand-profile"],
};

const RENDERERS: Record<SectionKey, (analysis: AnalysisResult) => React.ReactNode> = {
  story: (a) => <StorySection data={a.story} />, persona: (a) => <PersonaSection data={a.persona} />, value_proposition: (a) => <ValuePropSection data={a.value_proposition} />, tone_style: (a) => <ToneSection data={a.tone_style} />, content_strategy: (a) => <StrategySection data={a.content_strategy} />, offers: (a) => <OffersSection data={a.offers} />,
};

function sectionHasData(key: SectionKey, analysis: AnalysisResult): boolean {
  const d = analysis[key];
  if (!d) return false;
  const { confidence, ...rest } = d as any;
  return Object.values(rest).some((v) => v !== null && v !== undefined && v !== "" && (!Array.isArray(v) || v.length > 0));
}

// ─── Main Component ──────────────────────────────────────────
export default function BrandingReview({ analysis, sourcesUsed = [], sourcesFailed = [], onDone, preFilledSections, onReanalyzeWithBio, onDescribeProject, allSourcesFailed = false }: Props) {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const queryClient = useQueryClient();

  const [validated, setValidated] = useState<Set<SectionKey>>(() => {
    // Pre-fill validated for already-completed sections
    const initial = new Set<SectionKey>();
    if (preFilledSections) {
      for (const s of preFilledSections) {
        if (SECTIONS.some(sec => sec.key === s)) initial.add(s as SectionKey);
      }
    }
    return initial;
  });
  const [collapsed, setCollapsed] = useState<Set<SectionKey>>(() => {
    const initial = new Set<SectionKey>();
    if (preFilledSections) {
      for (const s of preFilledSections) {
        if (SECTIONS.some(sec => sec.key === s)) initial.add(s as SectionKey);
      }
    }
    return initial;
  });
  const [savingSection, setSavingSection] = useState<SectionKey | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [coachingSection, setCoachingSection] = useState<SectionKey | null>(null);
  const [refinedSections, setRefinedSections] = useState<Set<SectionKey>>(new Set());

  // Editable offers state
  const [editedOffers, setEditedOffers] = useState<OfferItem[]>(() => analysis.offers?.offers ? [...analysis.offers.offers] : []);
  const handleOfferUpdate = useCallback((index: number, offer: OfferItem) => {
    setEditedOffers(prev => prev.map((o, i) => i === index ? offer : o));
  }, []);
  const handleOfferDelete = useCallback((index: number) => {
    setEditedOffers(prev => prev.filter((_, i) => i !== index));
  }, []);
  
  // Instagram bio fallback
  const instagramFailed = sourcesFailed.includes("instagram") || (analysis.sources_failed || []).includes("instagram");
  const [igBio, setIgBio] = useState("");
  const [showIgBioInput, setShowIgBioInput] = useState(false);
  
  // Project description fallback
  const [projectText, setProjectText] = useState("");
  const [showProjectInput, setShowProjectInput] = useState(false);

  const validatedCount = validated.size;
  const allDone = validatedCount === 6;

  // Log section_validated events
  const logEvent = useCallback(async (eventType: string, meta?: Record<string, any>) => {
    if (!user?.id) return;
    try {
      await supabase.from("ai_usage").insert({
        user_id: user.id,
        workspace_id: workspaceId !== user.id ? workspaceId : null,
        action_type: eventType,
        category: "autofill",
        model_used: null,
        tokens_used: null,
      } as any);
    } catch { /* silent */ }
  }, [user?.id, workspaceId]);

  const handleValidate = useCallback(async (key: SectionKey) => {
    if (!user?.id) return;
    // Don't re-save pre-filled sections
    if (preFilledSections?.has(key)) {
      setValidated((prev) => new Set(prev).add(key));
      setCollapsed((prev) => new Set(prev).add(key));
      return;
    }
    setSavingSection(key);
    try {
      await SAVE_FNS[key](analysis[key], user.id, workspaceId);
      for (const qk of QUERY_KEYS[key]) queryClient.invalidateQueries({ queryKey: [qk] });
      setValidated((prev) => new Set(prev).add(key));
      setCollapsed((prev) => new Set(prev).add(key));
      toast.success("Section sauvegardée ✓");
      logEvent("section_validated");
      if (validated.size === 5) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 4000);
      }
    } catch (e) {
      console.error("Save error:", e);
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSavingSection(null);
    }
  }, [user?.id, workspaceId, analysis, validated.size, queryClient, preFilledSections, logEvent]);

  const toggleCollapse = (key: SectionKey) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const overallConf = analysis.overall_confidence || "medium";
  const confMessages: Record<string, { emoji: string; text: string }> = {
    high: { emoji: "🎯", text: "Confiance élevée : j'ai trouvé beaucoup d'infos !" },
    medium: { emoji: "👍", text: "Bonne base, mais quelques sections auront besoin de ton aide" },
    low: { emoji: "🌱", text: "Premier jet : j'ai fait avec ce que j'avais. On affine ensemble ?" },
  };
  const confMsg = confMessages[overallConf] || confMessages.medium;

  const allSources = [...new Set([...sourcesUsed, ...sourcesFailed])];
  if (allSources.length === 0 && analysis.sources_used) {
    allSources.push(...(analysis.sources_used || []));
    if (analysis.sources_failed) allSources.push(...analysis.sources_failed);
  }

  const sourceLabels = (analysis.sources_used || sourcesUsed || []).map(s => {
    const m: Record<string, string> = { website: "ton site", instagram: "ton Instagram", linkedin: "ton LinkedIn", documents: "tes documents" };
    return m[s] || s;
  });
  const subtitleSources = sourceLabels.length > 0 ? sourceLabels.join(", ") : "tes liens";

  const hasPreFilled = preFilledSections && preFilledSections.size > 0;

  return (
    <div className="pb-24">
      {showConfetti && <Confetti />}

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-8">
        <h1 className="font-display text-[26px] sm:text-[32px] text-foreground mb-2" style={{ fontWeight: 400 }}>
          Voici ce que j'ai compris de ton projet
        </h1>
        <p className="font-mono-ui text-[14px] text-muted-foreground mb-4 leading-relaxed">
          J'ai analysé {subtitleSources}. Vérifie, ajuste, et valide section par section.
        </p>

        {hasPreFilled && (
          <p className="font-mono-ui text-[13px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-[12px] px-3 py-2 mb-3">
            ✅ J'ai gardé ce que tu avais déjà rempli et j'ai complété le reste.
          </p>
        )}

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border text-[13px] mb-3">
          <span>{confMsg.emoji}</span>
          <span className="text-foreground">{confMsg.text}</span>
        </div>

        {allSources.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {allSources.map((s) => (
              <SourceTag key={s} name={s} ok={sourcesUsed.includes(s) || (analysis.sources_used || []).includes(s)} />
            ))}
          </div>
        )}

        {/* Instagram bio fallback */}
        {instagramFailed && (
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-[16px] p-4">
            <div className="flex items-start gap-2 mb-2">
              <Instagram className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[13px] text-amber-800">
                Je n'ai pas réussi à accéder à ton Instagram (c'est fréquent, Instagram bloque les analyses automatiques). Tu peux m'aider en copiant-collant ta bio ici.
              </p>
            </div>
            {!showIgBioInput ? (
              <button onClick={() => setShowIgBioInput(true)} className="text-[13px] font-semibold text-[#fb3d80] hover:underline">
                Coller ma bio Instagram →
              </button>
            ) : (
              <div className="space-y-2 mt-2">
                <Textarea
                  value={igBio}
                  onChange={(e) => setIgBio(e.target.value)}
                  placeholder="Colle ta bio Instagram ici..."
                  className="text-[13px] min-h-[80px]"
                />
                <Button
                  size="sm"
                  disabled={!igBio.trim()}
                  onClick={() => onReanalyzeWithBio?.(igBio.trim())}
                  className="bg-[#fb3d80] hover:bg-[#91014b] text-white text-[13px]"
                >
                  Réanalyser avec ma bio
                </Button>
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* Coaching overlay */}
      <AnimatePresence>
        {coachingSection && (
          <motion.div key="coaching" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} transition={{ duration: 0.3 }} className="mb-6">
            <button onClick={() => setCoachingSection(null)} className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground mb-4 transition-colors">
              <ArrowLeft className="h-4 w-4" /> Revenir à la vue d'ensemble
            </button>
            <BrandingCoachingFlow
              section={COACHING_SECTION_MAP[coachingSection] as any}
              autofillData={analysis[coachingSection]}
              autofillConfidence={getConfidence(analysis[coachingSection])}
              onComplete={() => {
                setValidated((prev) => new Set(prev).add(coachingSection));
                setCollapsed((prev) => new Set(prev).add(coachingSection));
                setRefinedSections((prev) => new Set(prev).add(coachingSection));
                for (const qk of QUERY_KEYS[coachingSection]) queryClient.invalidateQueries({ queryKey: [qk] });
                setCoachingSection(null);
                toast.success("Section affinée et sauvegardée ✓");
                logEvent("section_validated");
                if (validated.size === 5) { setShowConfetti(true); setTimeout(() => setShowConfetti(false), 4000); }
              }}
              onBack={() => setCoachingSection(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Section cards */}
      {!coachingSection && (
        <div className="space-y-4">
          {SECTIONS.map((sec, idx) => {
            const conf = getConfidence(analysis[sec.key]);
            const isPreFilled = preFilledSections?.has(sec.key) ?? false;
            const isValidated = validated.has(sec.key);
            const isCollapsed_ = collapsed.has(sec.key);
            const hasData = sectionHasData(sec.key, analysis);
            const isLow = conf === "low" && !hasData;
            const isSaving = savingSection === sec.key;
            const isRefined = refinedSections.has(sec.key);

            return (
              <motion.div key={sec.key} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay: idx * 0.08 }}>
                <div className="bg-card rounded-[20px] shadow-card border border-border overflow-hidden">
                  {/* Card header */}
                  <button
                    onClick={() => (isValidated || isPreFilled) && toggleCollapse(sec.key)}
                    className="w-full flex items-center justify-between p-5 sm:p-6 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[20px]">{sec.emoji}</span>
                      <h2 className="font-display text-[18px] text-foreground" style={{ fontWeight: 400 }}>{sec.title}</h2>
                      {isValidated && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                      {isRefined && <span className="text-[11px] text-emerald-600 font-medium">Affiné</span>}
                      {isPreFilled && !isRefined && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                          <Lock className="h-3 w-3" /> Déjà complété
                        </span>
                      )}
                    </div>
                    {!isValidated && !isPreFilled && <ConfidenceBadge level={conf} />}
                  </button>

                  {/* Card body */}
                  <AnimatePresence initial={false}>
                    {!isCollapsed_ && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3 }} className="overflow-hidden">
                        <div className="px-5 sm:px-6 pb-5 sm:pb-6">
                          {isPreFilled && !isRefined ? (
                            <div className="text-center py-4">
                              <p className="text-[14px] text-muted-foreground mb-2">
                                Cette section était déjà remplie. Elle n'a pas été modifiée par l'analyse.
                              </p>
                              <button
                                onClick={() => { setValidated(prev => new Set(prev).add(sec.key)); setCollapsed(prev => new Set(prev).add(sec.key)); }}
                                className="inline-flex items-center gap-2 border-[1.5px] border-emerald-500 text-emerald-600 rounded-[12px] px-5 py-2 text-[14px] font-semibold hover:bg-emerald-50 transition-all"
                              >
                                <CheckCircle2 className="h-4 w-4" /> Garder tel quel ✓
                              </button>
                            </div>
                          ) : isLow ? (
                            <div className="text-center py-6">
                              <p className="text-[14px] text-muted-foreground mb-4">Je n'ai pas assez d'éléments pour cette section. On la remplit ensemble ?</p>
                              <button onClick={() => setCoachingSection(sec.key)} className="inline-flex items-center gap-2 bg-[#fb3d80] text-white rounded-[12px] px-6 py-2.5 text-[14px] font-semibold transition-all hover:scale-[1.02] hover:shadow-lg">
                                <Sparkles className="h-4 w-4" /> On la remplit ensemble →
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="mb-5">{RENDERERS[sec.key](analysis)}</div>
                              {!isValidated && (
                                <div className="flex flex-col sm:flex-row gap-2">
                                  <button onClick={() => handleValidate(sec.key)} disabled={isSaving} className="inline-flex items-center justify-center gap-2 border-[1.5px] border-emerald-500 text-emerald-600 rounded-[12px] px-5 py-2 text-[14px] font-semibold hover:bg-emerald-50 transition-all disabled:opacity-50">
                                    {isSaving ? <span className="inline-block h-4 w-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                    C'est bon ✓
                                  </button>
                                  <button onClick={() => setCoachingSection(sec.key)} className={`inline-flex items-center justify-center gap-2 rounded-[12px] px-5 py-2 text-[14px] font-semibold transition-all ${conf === "low" ? "bg-[#fb3d80] text-white hover:scale-[1.02] hover:shadow-lg" : "border-[1.5px] border-[#fb3d80] text-[#fb3d80] hover:bg-[#fce4ec]"}`}>
                                    <Sparkles className="h-4 w-4" /> On affine ensemble →
                                  </button>
                                </div>
                              )}
                              {conf === "low" && !isValidated && (
                                <p className="text-[12px] text-muted-foreground mt-2">Je n'ai pas trouvé assez d'infos pour cette partie. Quelques questions vont m'aider à compléter.</p>
                              )}
                            </>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-sm border-t border-border px-4 py-3">
        <div className="mx-auto max-w-[900px] flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[13px] font-semibold text-foreground">
                {allDone ? "Branding complété ! 🎉" : `${validatedCount}/6 sections validées`}
              </span>
              {allDone && (
                <motion.button initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} onClick={onDone} className="text-[13px] font-semibold text-[#fb3d80] hover:underline">
                  Voir mon branding complet →
                </motion.button>
              )}
            </div>
            <div className="h-[6px] rounded-full bg-[#fce4ec] overflow-hidden">
              <motion.div className="h-full rounded-full" style={{ background: "linear-gradient(90deg, #ffa7c6, #fb3d80)" }} animate={{ width: `${(validatedCount / 6) * 100}%` }} transition={{ type: "spring", stiffness: 60, damping: 20 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
