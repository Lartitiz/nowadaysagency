import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, Sparkles, ArrowLeft, Lock, Instagram, Pencil, Trash2, X, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Confetti from "@/components/Confetti";
import BrandingCoachingFlow from "@/components/branding/BrandingCoachingFlow";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { isEmptyVal, fillOnlyEmpty } from "@/lib/fill-only-empty";
import { posthog } from "@/lib/posthog";

// ─── Types ───────────────────────────────────────────────────
export interface AnalysisResult {
  story?: { confidence?: string; origin?: string; trigger?: string; struggles?: string; uniqueness?: string; vision?: string; full_story?: string };
  persona?: { confidence?: string; name?: string; age_range?: string; job?: string; description?: string; goals?: string[]; frustrations?: string[]; desires?: string[]; channels?: string[]; brands_they_follow?: string[]; beautiful_world?: string; first_actions?: string };
  value_proposition?: { confidence?: string; key_phrase?: string; problem?: string; solution?: string; differentiator?: string; proofs?: string[] };
  tone_style?: { confidence?: string; tone_keywords?: string[]; voice_description?: string; tone_register?: string; tone_level?: string; tone_style_chip?: string; tone_humor?: string; tone_engagement?: string; i_do?: string[]; i_never_do?: string[]; fights?: string[]; key_expressions?: string; things_to_avoid?: string; target_verbatims?: string; channels?: string[]; visual_style?: string };
  content_strategy?: { confidence?: string; pillars?: string[]; creative_twist?: string; formats?: string[]; rhythm?: string; editorial_line?: string };
  offers?: { confidence?: string; offers?: { name?: string; price?: string; description?: string; target?: string; promise?: string }[] };
  charter?: { confidence?: string; color_primary?: string; color_secondary?: string; color_accent?: string; color_background?: string; font_title?: string; font_body?: string; mood_keywords?: string[]; visual_style_description?: string };
  /** Reprise d'onboarding confirmée : valider une section écrase l'existant. */
  allow_overwrite?: boolean;
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
  /**
   * Parcours d'inscription : valider sa fiche EST l'étape en cours (pas de
   * « finir plus tard », pas de raccourci vers la création). Hors onboarding
   * — retour sur /branding plus tard — la porte de sortie reste ouverte.
   */
  mandatory?: boolean;
}

const COACHING_SECTION_MAP: Record<SectionKey, string> = {
  story: "story",
  persona: "persona",
  value_proposition: "value_proposition",
  tone_style: "tone_style",
  content_strategy: "content_strategy",
  offers: "offers",
  charter: "charter",
};

const SECTIONS = [
  { key: "story", title: "Ton histoire", emoji: "📖" },
  { key: "persona", title: "Ton·ta client·e idéal·e", emoji: "👤" },
  { key: "value_proposition", title: "Ta proposition de valeur", emoji: "💎" },
  { key: "tone_style", title: "Ton & style", emoji: "🎙️" },
  { key: "content_strategy", title: "Ta stratégie de contenu", emoji: "🍒" },
  { key: "offers", title: "Tes offres", emoji: "🎁" },
  { key: "charter", title: "Ta charte graphique", emoji: "🎨" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

function getConfidence(section: any): string {
  return section?.confidence || "low";
}

function ConfidenceBadge({ level }: { level: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    high: { bg: "bg-success-bg", text: "text-success", label: "Confiant·e" },
    medium: { bg: "bg-warning-bg", text: "text-warning", label: "À vérifier" },
    low: { bg: "bg-rose-pale", text: "text-bordeaux", label: "À compléter" },
  };
  const s = map[level] || map.low;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full ${s.bg} ${s.text}`}>
      <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: level === "high" ? "#22c55e" : level === "medium" ? "#f59e0b" : "hsl(var(--primary))" }} />
      {s.label}
    </span>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-block px-3 py-1 text-sm rounded-[8px] bg-[#ffa7c6]/20 text-bordeaux font-medium">{children}</span>;
}

function SourceTag({ name, ok }: { name: string; ok: boolean }) {
  const labels: Record<string, string> = { website: "Site", instagram: "Instagram", linkedin: "LinkedIn", documents: "Documents" };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${ok ? "bg-success-bg text-success" : "bg-muted text-muted-foreground line-through"}`}>
      {labels[name] || name} {ok ? "✓" : "✗"}
    </span>
  );
}

// ─── Section Renderers ───────────────────────────────────────
function StorySection({ data }: { data: AnalysisResult["story"] }) {
  if (!data) return null;
  return (
    <div className="space-y-3">
      {data.full_story && <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">{data.full_story}</p>}
      {!data.full_story && (
        <div className="space-y-2 text-sm text-foreground">
          {data.origin && <p><span className="font-semibold text-bordeaux">Origine :</span> {data.origin}</p>}
          {data.trigger && <p><span className="font-semibold text-bordeaux">Déclic :</span> {data.trigger}</p>}
          {data.struggles && <p><span className="font-semibold text-bordeaux">Épreuves :</span> {data.struggles}</p>}
          {data.uniqueness && <p><span className="font-semibold text-bordeaux">Ce qui te rend unique :</span> {data.uniqueness}</p>}
          {data.vision && <p><span className="font-semibold text-bordeaux">Vision :</span> {data.vision}</p>}
        </div>
      )}
    </div>
  );
}

function PersonaSection({ data }: { data: AnalysisResult["persona"] }) {
  if (!data) return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        {data.name && <span className="font-body text-base">{data.name}</span>}
        {data.age_range && <Chip>{data.age_range} ans</Chip>}
        {data.job && <Chip>{data.job}</Chip>}
      </div>
      {data.goals?.length ? <div><p className="text-xs font-semibold text-bordeaux mb-1">Objectifs</p><div className="flex flex-wrap gap-1.5">{data.goals.map((g, i) => <Chip key={i}>{g}</Chip>)}</div></div> : null}
      {data.frustrations?.length ? <div><p className="text-xs font-semibold text-bordeaux mb-1">Frustrations</p><div className="flex flex-wrap gap-1.5">{data.frustrations.map((f, i) => <Chip key={i}>{f}</Chip>)}</div></div> : null}
      {data.desires?.length ? <div><p className="text-xs font-semibold text-bordeaux mb-1">Désirs</p><div className="flex flex-wrap gap-1.5">{data.desires.map((d, i) => <Chip key={i}>{d}</Chip>)}</div></div> : null}
      {data.channels?.length ? <div><p className="text-xs font-semibold text-bordeaux mb-1">Canaux</p><div className="flex flex-wrap gap-1.5">{data.channels.map((c, i) => <Chip key={i}>{c}</Chip>)}</div></div> : null}
    </div>
  );
}

function ValuePropSection({ data }: { data: AnalysisResult["value_proposition"] }) {
  if (!data) return null;
  return (
    <div className="space-y-3">
      {data.key_phrase && <p className="font-display text-lg text-foreground leading-snug">{data.key_phrase}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
        {data.problem && <div className="p-3 rounded-[12px] bg-rose-pale"><p className="font-semibold text-bordeaux mb-1">Problème</p><p className="text-foreground">{data.problem}</p></div>}
        {data.solution && <div className="p-3 rounded-[12px] bg-success-bg"><p className="font-semibold text-success mb-1">Solution</p><p className="text-foreground">{data.solution}</p></div>}
        {data.differentiator && <div className="p-3 rounded-[12px] bg-warning-bg"><p className="font-semibold text-warning mb-1">Différenciateur</p><p className="text-foreground">{data.differentiator}</p></div>}
      </div>
      {data.proofs?.length ? <div className="flex flex-wrap gap-1.5">{data.proofs.map((p, i) => <Chip key={i}>{p}</Chip>)}</div> : null}
    </div>
  );
}

function ToneSection({ data }: { data: AnalysisResult["tone_style"] }) {
  if (!data) return null;
  return (
    <div className="space-y-3">
      {data.voice_description && <p className="text-sm leading-relaxed text-foreground italic bg-muted/30 rounded-[12px] p-3">{data.voice_description}</p>}
      {data.tone_keywords?.length ? <div className="flex flex-wrap gap-1.5">{data.tone_keywords.map((k, i) => <Chip key={i}>{k}</Chip>)}</div> : null}
      {(data.tone_register || data.tone_level || data.tone_style_chip || data.tone_humor || data.tone_engagement) && (
        <div className="flex flex-wrap gap-1.5">
          {data.tone_register && <Chip>{data.tone_register}</Chip>}
          {data.tone_level && <Chip>{data.tone_level}</Chip>}
          {data.tone_style_chip && <Chip>{data.tone_style_chip}</Chip>}
          {data.tone_humor && <Chip>{data.tone_humor}</Chip>}
          {data.tone_engagement && <Chip>{data.tone_engagement}</Chip>}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        {data.i_do?.length ? <div className="p-3 rounded-[12px] bg-success-bg"><p className="font-semibold text-success mb-2">✅ Je fais</p><ul className="space-y-1">{data.i_do.map((d, i) => <li key={i}>• {d}</li>)}</ul></div> : null}
        {data.i_never_do?.length ? <div className="p-3 rounded-[12px] bg-rose-pale"><p className="font-semibold text-bordeaux mb-2">🚫 Je ne fais jamais</p><ul className="space-y-1">{data.i_never_do.map((d, i) => <li key={i}>• {d}</li>)}</ul></div> : null}
      </div>
      {data.fights?.length ? <div><p className="text-xs font-semibold text-bordeaux mb-1">Combats</p><div className="flex flex-wrap gap-1.5">{data.fights.map((f, i) => <Chip key={i}>{f}</Chip>)}</div></div> : null}
      {data.key_expressions && <p className="text-sm"><span className="font-semibold text-bordeaux">Expressions clés :</span> {data.key_expressions}</p>}
      {data.channels?.length ? <div><p className="text-xs font-semibold text-bordeaux mb-1">Canaux</p><div className="flex flex-wrap gap-1.5">{data.channels.map((c, i) => <Chip key={i}>{c}</Chip>)}</div></div> : null}
      {data.visual_style && <p className="text-sm text-muted-foreground italic">{data.visual_style}</p>}
    </div>
  );
}

function StrategySection({ data }: { data: AnalysisResult["content_strategy"] }) {
  if (!data) return null;
  return (
    <div className="space-y-3">
      {data.pillars?.length ? <div><p className="text-xs font-semibold text-bordeaux mb-1">Piliers</p><div className="flex flex-wrap gap-1.5">{data.pillars.map((p, i) => <Chip key={i}>{p}</Chip>)}</div></div> : null}
      {data.creative_twist && <p className="text-sm"><span className="font-semibold text-bordeaux">Angle créatif :</span> {data.creative_twist}</p>}
      {data.formats?.length ? <div><p className="text-xs font-semibold text-bordeaux mb-1">Formats</p><div className="flex flex-wrap gap-1.5">{data.formats.map((f, i) => <Chip key={i}>{f}</Chip>)}</div></div> : null}
      {data.rhythm && <p className="text-sm text-muted-foreground">{data.rhythm}</p>}
      {data.editorial_line && <p className="text-sm"><span className="font-semibold text-bordeaux">Ligne éditoriale :</span> {data.editorial_line}</p>}
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
              <input value={editDraft.name || ""} onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))} placeholder="Nom de l'offre" className="w-full text-sm font-body border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
              <input value={editDraft.price || ""} onChange={e => setEditDraft(d => ({ ...d, price: e.target.value }))} placeholder="Prix" className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
              <input value={editDraft.description || ""} onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))} placeholder="Description" className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
              <input value={editDraft.target || ""} onChange={e => setEditDraft(d => ({ ...d, target: e.target.value }))} placeholder="Pour qui ?" className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
              <input value={editDraft.promise || ""} onChange={e => setEditDraft(d => ({ ...d, promise: e.target.value }))} placeholder="Promesse" className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
              <div className="flex gap-2 pt-1">
                <button onClick={confirmEdit} className="inline-flex items-center gap-1 text-xs font-medium text-success hover:text-success"><Check className="h-3.5 w-3.5" /> OK</button>
                <button onClick={cancelEdit} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /> Annuler</button>
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
                <p className="font-body text-base">{o.name || "Offre"}</p>
                {o.price && <span className="text-sm font-semibold text-primary">{o.price}</span>}
              </div>
              {o.description && <p className="text-sm text-muted-foreground mb-1">{o.description}</p>}
              {o.target && <p className="text-xs"><span className="font-semibold text-bordeaux">Pour :</span> {o.target}</p>}
              {o.promise && <p className="text-xs"><span className="font-semibold text-bordeaux">Promesse :</span> {o.promise}</p>}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

const CHARTER_COLOR_SLOTS = [
  { key: "color_primary", label: "Primaire" },
  { key: "color_secondary", label: "Secondaire" },
  { key: "color_accent", label: "Accent" },
  { key: "color_background", label: "Fond" },
] as const;

type CharterData = NonNullable<AnalysisResult["charter"]>;

export function normalizeHex(v: string | undefined | null): string | null {
  let s = (v || "").trim();
  if (!s) return null;
  if (!s.startsWith("#")) s = `#${s}`;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) s = `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : null;
}

export function CharterSection({ data, onUpdate }: { data: AnalysisResult["charter"]; onUpdate?: (charter: CharterData) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CharterData>({});
  if (!data) return null;

  const colors = CHARTER_COLOR_SLOTS
    .map((s) => ({ label: s.label as string, hex: data[s.key] }))
    .filter((c): c is { label: string; hex: string } => !!c.hex);

  // Honnêteté sur la provenance : « détectées » SEULEMENT si elles sortent
  // vraiment du CSS du site (confidence high). En low, l'IA a proposé une
  // palette d'ambiance (cf prompt diagnostic-enrichment) — la présenter comme
  // détectée faisait passer une invention pour une lecture du site.
  const conf = data.confidence || "low";
  const colorsTitle = conf === "high"
    ? "Couleurs détectées sur ton site"
    : conf === "medium"
      ? "Couleurs estimées depuis ton logo / aperçu"
      : "Palette proposée d'après ton univers";

  const startEdit = () => {
    setDraft({ ...data });
    setEditing(true);
  };
  const cancelEdit = () => { setEditing(false); setDraft({}); };
  const confirmEdit = () => {
    if (onUpdate) {
      const cleaned: CharterData = { ...draft };
      for (const slot of CHARTER_COLOR_SLOTS) {
        const norm = normalizeHex(draft[slot.key]);
        if (norm) cleaned[slot.key] = norm; else delete cleaned[slot.key];
      }
      cleaned.font_title = (draft.font_title || "").trim() || undefined;
      cleaned.font_body = (draft.font_body || "").trim() || undefined;
      onUpdate(cleaned);
    }
    setEditing(false);
    setDraft({});
  };

  if (editing) {
    return (
      <div className="space-y-3">
        <p className="text-xs font-semibold text-bordeaux">Tes couleurs</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {CHARTER_COLOR_SLOTS.map((slot) => {
            const valid = normalizeHex(draft[slot.key]);
            return (
              <div key={slot.key} className="flex items-center gap-2.5 p-2.5 rounded-[10px] border border-border bg-background">
                {/* input color natif : pipette + palette système, aucune dépendance */}
                <input
                  type="color"
                  value={valid || "#CCCCCC"}
                  onChange={(e) => setDraft((d) => ({ ...d, [slot.key]: e.target.value.toUpperCase() }))}
                  className="w-9 h-9 rounded-[8px] border border-border cursor-pointer bg-transparent p-0.5"
                  aria-label={`Choisir la couleur ${slot.label.toLowerCase()}`}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground mb-0.5">{slot.label}</p>
                  <input
                    value={draft[slot.key] || ""}
                    onChange={(e) => setDraft((d) => ({ ...d, [slot.key]: e.target.value }))}
                    placeholder="#A1B2C3 (vide = retirer)"
                    className={`w-full text-xs font-mono border rounded-lg px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-primary ${draft[slot.key] && !valid ? "border-destructive" : "border-border"}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs font-semibold text-bordeaux pt-1">Typographies</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <input value={draft.font_title || ""} onChange={(e) => setDraft((d) => ({ ...d, font_title: e.target.value }))} placeholder="Police des titres" className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
          <input value={draft.font_body || ""} onChange={(e) => setDraft((d) => ({ ...d, font_body: e.target.value }))} placeholder="Police du texte courant" className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={confirmEdit} className="inline-flex items-center gap-1 text-xs font-medium text-success"><Check className="h-3.5 w-3.5" /> OK</button>
          <button onClick={cancelEdit} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /> Annuler</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {colors.length > 0 ? (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs font-semibold text-bordeaux">{colorsTitle}</p>
            {onUpdate && (
              <button onClick={startEdit} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline" title="Modifier les couleurs et typos">
                <Pencil className="h-3 w-3" /> Modifier
              </button>
            )}
          </div>
          {conf !== "high" && (
            <p className="text-xs text-muted-foreground mb-2">
              Je n'ai pas pu lire les couleurs exactes de ton site — celles-ci sont une proposition. Corrige-les ici si ce ne sont pas les tiennes.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            {colors.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-[8px] border border-border shadow-sm" style={{ backgroundColor: c.hex }} />
                <div>
                  <p className="text-xs font-medium text-foreground">{c.label}</p>
                  <p className="text-2xs text-muted-foreground font-mono">{c.hex}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-[10px] bg-muted/50 border border-border px-3 py-2.5">
          <p className="text-xs text-muted-foreground">
            On n'a pas réussi à détecter automatiquement tes couleurs depuis ton site
            (elles sont parfois dans des fichiers que l'analyse ne peut pas lire).
            {onUpdate ? " Tu peux les saisir directement ici :" : " Tu pourras les ajouter en un clic : ou uploader ton logo : dans ta charte graphique."}
          </p>
          {onUpdate && (
            <button onClick={startEdit} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline mt-1.5">
              <Pencil className="h-3 w-3" /> Ajouter mes couleurs
            </button>
          )}
        </div>
      )}
      {(data.font_title || data.font_body) && (
        <div>
          <p className="text-xs font-semibold text-bordeaux mb-1">Typographies</p>
          <div className="flex flex-wrap gap-1.5">
            {data.font_title && <Chip>Titres : {data.font_title}</Chip>}
            {data.font_body && <Chip>Corps : {data.font_body}</Chip>}
          </div>
        </div>
      )}
      {data.mood_keywords?.length ? (
        <div>
          <p className="text-xs font-semibold text-bordeaux mb-1">Ambiance</p>
          <div className="flex flex-wrap gap-1.5">{data.mood_keywords.map((k, i) => <Chip key={i}>{k}</Chip>)}</div>
        </div>
      ) : null}
      {data.visual_style_description && <p className="text-sm text-muted-foreground italic">{data.visual_style_description}</p>}
    </div>
  );
}

// ─── Save helpers ────────────────────────────────────────────
// supabase-js ne LÈVE PAS d'exception sur erreur DB : il renvoie { error }.
// Sans ce garde, une écriture échouée (RLS, colonne inexistante…) passait
// inaperçue et la section affichait « sauvegardée ✓ » alors que rien n'était
// persisté (cf. bug portrait_age). On force la remontée vers handleValidate.
async function writeOrThrow(query: any, ctx: string) {
  const { error } = await query;
  if (error) {
    console.error(`[branding save] ${ctx}:`, error);
    throw error;
  }
}

/**
 * Upsert ciblé de quelques colonnes de `brand_profile` (la table de synthèse lue
 * par la génération via _shared/user-context.ts), en complétant uniquement les
 * champs vides (fillOnlyEmpty n'écrase jamais une saisie existante).
 * Sert à alimenter target_description / target_problem / mission depuis l'autofill,
 * qui étaient lus par l'IA mais jamais remplis. Les save* tournent par section
 * (au clic « valider »), donc séquentiellement → pas de race sur la ligne.
 */
async function fillBrandProfileSynthesis(
  fields: Record<string, any>,
  userId: string,
  workspaceId: string,
  overwrite = false,
) {
  if (Object.keys(fields).length === 0) return;
  const filterCol = workspaceId && workspaceId !== userId ? "workspace_id" : "user_id";
  const filterVal = workspaceId && workspaceId !== userId ? workspaceId : userId;
  const selectCols = `id, ${Object.keys(fields).join(", ")}`;
  const { data: existing } = await (supabase.from("brand_profile") as any)
    .select(selectCols).eq(filterCol, filterVal).maybeSingle();
  if (existing?.id) {
    const toWrite = fillOnlyEmpty(fields, existing, overwrite);
    if (Object.keys(toWrite).length === 0) return;
    await writeOrThrow((supabase.from("brand_profile") as any).update({ ...toWrite, updated_at: new Date().toISOString() }).eq("id", existing.id), "brand_profile.synthesis.update");
  } else {
    await writeOrThrow((supabase.from("brand_profile") as any).insert({ user_id: userId, workspace_id: workspaceId || null, updated_at: new Date().toISOString(), ...fields }), "brand_profile.synthesis.insert");
  }
}

async function saveStory(data: AnalysisResult["story"], userId: string, workspaceId: string, overwrite = false) {
  if (!data) return;

  const fields: Record<string, any> = {};
  if (data.origin) fields.step_1_raw = data.origin;
  if (data.trigger) fields.step_2_location = data.trigger;
  if (data.struggles) fields.step_3_action = data.struggles;
  if (data.uniqueness) fields.step_4_thoughts = data.uniqueness;
  if (data.vision) fields.step_5_emotions = data.vision;
  if (data.full_story) fields.step_6_full_story = data.full_story;

  const filterCol = workspaceId && workspaceId !== userId ? "workspace_id" : "user_id";
  const filterVal = workspaceId && workspaceId !== userId ? workspaceId : userId;

  const { data: existing } = await (supabase.from("storytelling") as any)
    .select("id, step_1_raw, step_2_location, step_3_action, step_4_thoughts, step_5_emotions, step_6_full_story")
    .eq(filterCol, filterVal)
    .eq("is_primary", true)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const toWrite = fillOnlyEmpty(fields, existing, overwrite);
    if (Object.keys(toWrite).length === 0) return; // rien à compléter
    await writeOrThrow((supabase.from("storytelling") as any).update({ ...toWrite, updated_at: new Date().toISOString() }).eq("id", existing.id), "storytelling.update");
  } else {
    await writeOrThrow((supabase.from("storytelling") as any).insert({
      user_id: userId,
      workspace_id: workspaceId || null,
      is_primary: true,
      title: "Mon histoire fondatrice",
      story_type: "fondatrice",
      source: "autofill",
      updated_at: new Date().toISOString(),
      ...fields,
    }), "storytelling.insert");
  }

  // La vision tient lieu de mission tant que celle-ci est vide : brand_profile.mission
  // est injectée dans le prompt de génération (section IDENTITÉ) et restait vide.
  if (data.vision) await fillBrandProfileSynthesis({ mission: data.vision }, userId, workspaceId, overwrite);
}
async function savePersona(data: AnalysisResult["persona"], userId: string, workspaceId: string, overwrite = false) {
  if (!data) return;

  const fields: Record<string, any> = {};
  if (data.name) fields.portrait_prenom = data.name;
  // L'âge ET le métier vivent dans le JSON portrait.qui_elle_est (leur vraie
  // place, lue par la synthèse). Il n'existe PAS de colonne plate portrait_age :
  // écrire dessus faisait rejeter tout l'INSERT/SELECT en silence (« column
  // does not exist ») → la cliente idéale n'était jamais enregistrée.
  if (data.description) fields.description = data.description;
  if (data.frustrations?.length) fields.step_1_frustrations = data.frustrations.join("\n");
  if (data.desires?.length) fields.step_2_transformation = data.desires.join("\n");
  if (data.goals?.length) fields.step_3a_objections = data.goals.join("\n");
  if (data.beautiful_world) fields.step_4_beautiful = data.beautiful_world;
  if (data.first_actions) fields.step_5_actions = data.first_actions;
  if (data.channels?.length) fields.channels = data.channels;
  if (data.brands_they_follow?.length) fields.step_4_inspiring = data.brands_they_follow.join(", ");

  const filterCol = workspaceId && workspaceId !== userId ? "workspace_id" : "user_id";
  const filterVal = workspaceId && workspaceId !== userId ? workspaceId : userId;

  const { data: existing } = await (supabase.from("persona") as any)
    .select("id, portrait, portrait_prenom, description, step_1_frustrations, step_2_transformation, step_3a_objections, step_4_beautiful, step_5_actions, channels, step_4_inspiring")
    .eq(filterCol, filterVal)
    .eq("is_primary", true)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    const toWrite = fillOnlyEmpty(fields, existing, overwrite);
    // Merge l'âge + le métier dans portrait.qui_elle_est, uniquement s'ils manquent.
    const baseQui = (existing?.portrait?.qui_elle_est && typeof existing.portrait.qui_elle_est === "object")
      ? existing.portrait.qui_elle_est
      : {};
    const quiPatch: Record<string, any> = {};
    if (data.age_range && isEmptyVal(baseQui.age)) quiPatch.age = data.age_range;
    if (data.job && isEmptyVal(baseQui.metier)) quiPatch.metier = data.job;
    if (Object.keys(quiPatch).length > 0) {
      const basePortrait = (existing?.portrait && typeof existing.portrait === "object" && !Array.isArray(existing.portrait))
        ? { ...existing.portrait }
        : {};
      basePortrait.qui_elle_est = { ...(basePortrait.qui_elle_est || {}), ...quiPatch };
      toWrite.portrait = basePortrait;
    }
    // rien à compléter sur persona si toWrite vide — mais on tente quand même la synthèse brand_profile plus bas
    if (Object.keys(toWrite).length > 0) {
      await writeOrThrow((supabase.from("persona") as any).update({ ...toWrite, updated_at: new Date().toISOString() }).eq("id", existing.id), "persona.update");
    }
  } else {
    const qui: Record<string, any> = {};
    if (data.age_range) qui.age = data.age_range;
    if (data.job) qui.metier = data.job;
    if (Object.keys(qui).length > 0) fields.portrait = { qui_elle_est: qui };
    await writeOrThrow((supabase.from("persona") as any).insert({
      user_id: userId,
      workspace_id: workspaceId || null,
      is_primary: true,
      updated_at: new Date().toISOString(),
      ...fields,
    }), "persona.insert");
  }

  // La description de la cible est lue par la génération (brand_profile.target_description)
  // et restait vide après l'autofill — on la complète depuis le persona.
  if (data.description) await fillBrandProfileSynthesis({ target_description: data.description }, userId, workspaceId, overwrite);
}
async function saveValueProp(data: AnalysisResult["value_proposition"], userId: string, workspaceId: string, overwrite = false) {
  if (!data) return;
  const fields: Record<string, any> = {};
  // version_final = source de vérité lue par la génération/synthèse/Coach. On la
  // remplit avec la phrase-clé (si vide) pour que la proposition analysée soit
  // considérée comme « complétée » et non « à faire ». fillOnlyEmpty protège
  // toute version_final déjà rédigée par l'utilisatrice.
  if (data.key_phrase) { fields.step_1_what = data.key_phrase; fields.version_one_liner = data.key_phrase; fields.version_final = data.key_phrase; }
  if (data.solution) fields.step_2a_process = data.solution;
  if (data.differentiator) fields.step_2d_refuse = data.differentiator;
  if (data.problem) fields.step_3_for_whom = data.problem;
  // Preuves/témoignages : extraits + affichés mais jamais sauvegardés jusqu'ici.
  // On les range dans step_2c_feedback (« validation reçue » de la proposition).
  if (data.proofs?.length) fields.step_2c_feedback = data.proofs.join("\n");
  const filterCol = workspaceId && workspaceId !== userId ? "workspace_id" : "user_id";
  const filterVal = workspaceId && workspaceId !== userId ? workspaceId : userId;
  const { data: existing } = await (supabase.from("brand_proposition") as any)
    .select("id, step_1_what, version_one_liner, version_final, step_2a_process, step_2d_refuse, step_3_for_whom, step_2c_feedback").eq(filterCol, filterVal).maybeSingle();
  if (existing?.id) {
    const toWrite = fillOnlyEmpty(fields, existing, overwrite);
    if (Object.keys(toWrite).length > 0) {
      await writeOrThrow((supabase.from("brand_proposition") as any).update({ ...toWrite, updated_at: new Date().toISOString() }).eq("id", existing.id), "brand_proposition.update");
    }
  } else {
    await writeOrThrow((supabase.from("brand_proposition") as any).insert({ user_id: userId, workspace_id: workspaceId || null, updated_at: new Date().toISOString(), ...fields }), "brand_proposition.insert");
  }

  // Le problème principal de la cible est lu par la génération (brand_profile.target_problem)
  // et restait vide — on le complète depuis le problème de la proposition de valeur.
  if (data.problem) await fillBrandProfileSynthesis({ target_problem: data.problem }, userId, workspaceId, overwrite);
  // L'offre (brand_profile.offer) est injectée dans le prompt de génération (section
  // IDENTITÉ) et restait vide — on la complète depuis la solution de la proposition.
  if (data.solution) await fillBrandProfileSynthesis({ offer: data.solution }, userId, workspaceId, overwrite);
}
async function saveTone(data: AnalysisResult["tone_style"], userId: string, workspaceId: string, overwrite = false) {
  if (!data) return;
  const fields: Record<string, any> = {};
  if (data.tone_keywords?.length) fields.tone_keywords = data.tone_keywords;
  if (data.voice_description) fields.voice_description = data.voice_description;
  if (data.tone_register) fields.tone_register = data.tone_register;
  if (data.tone_level) fields.tone_level = data.tone_level;
  if (data.tone_style_chip) fields.tone_style = data.tone_style_chip;
  if (data.tone_humor) fields.tone_humor = data.tone_humor;
  if (data.tone_engagement) fields.tone_engagement = data.tone_engagement;
  if (data.i_do?.length) fields.tone_do = data.i_do.join("\n");
  if (data.i_never_do?.length) fields.tone_dont = data.i_never_do.join("\n");
  if (data.fights?.length) fields.combat_cause = data.fights.join("\n");
  if (data.key_expressions) fields.key_expressions = data.key_expressions;
  if (data.things_to_avoid) fields.things_to_avoid = data.things_to_avoid;
  if (data.target_verbatims) fields.target_verbatims = data.target_verbatims;
  if (data.channels?.length) fields.channels = data.channels;
  if (data.visual_style) fields.visual_style = data.visual_style;
  const filterCol = workspaceId && workspaceId !== userId ? "workspace_id" : "user_id";
  const filterVal = workspaceId && workspaceId !== userId ? workspaceId : userId;
  const { data: existing } = await (supabase.from("brand_profile") as any)
    .select("id, tone_keywords, voice_description, tone_register, tone_level, tone_style, tone_humor, tone_engagement, tone_do, tone_dont, combat_cause, key_expressions, things_to_avoid, target_verbatims, channels, visual_style").eq(filterCol, filterVal).maybeSingle();
  if (existing?.id) {
    const toWrite = fillOnlyEmpty(fields, existing, overwrite);
    if (Object.keys(toWrite).length === 0) return;
    await writeOrThrow((supabase.from("brand_profile") as any).update({ ...toWrite, updated_at: new Date().toISOString() }).eq("id", existing.id), "brand_profile.update");
  } else {
    await writeOrThrow((supabase.from("brand_profile") as any).insert({ user_id: userId, workspace_id: workspaceId || null, updated_at: new Date().toISOString(), ...fields }), "brand_profile.insert");
  }
}
async function saveStrategy(data: AnalysisResult["content_strategy"], userId: string, workspaceId: string, overwrite = false) {
  if (!data) return;
  const filterCol = workspaceId && workspaceId !== userId ? "workspace_id" : "user_id";
  const filterVal = workspaceId && workspaceId !== userId ? workspaceId : userId;
  const stratFields: Record<string, any> = {};
  if (data.pillars?.[0]) stratFields.pillar_major = data.pillars[0];
  if (data.pillars?.[1]) stratFields.pillar_minor_1 = data.pillars[1];
  if (data.pillars?.[2]) stratFields.pillar_minor_2 = data.pillars[2];
  if (data.pillars?.[3]) stratFields.pillar_minor_3 = data.pillars[3]; // 4e pilier (était jeté)
  if (data.creative_twist) stratFields.creative_concept = data.creative_twist;
  const { data: existingStrat } = await (supabase.from("brand_strategy") as any)
    .select("id, pillar_major, pillar_minor_1, pillar_minor_2, pillar_minor_3, creative_concept").eq(filterCol, filterVal).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (existingStrat?.id) {
    const toWrite = fillOnlyEmpty(stratFields, existingStrat, overwrite);
    if (Object.keys(toWrite).length > 0) {
      await writeOrThrow((supabase.from("brand_strategy") as any).update({ ...toWrite, updated_at: new Date().toISOString() }).eq("id", existingStrat.id), "brand_strategy.update");
    }
  } else {
    await writeOrThrow((supabase.from("brand_strategy") as any).insert({ user_id: userId, workspace_id: workspaceId || null, updated_at: new Date().toISOString(), ...stratFields }), "brand_strategy.insert");
  }
  if (data.editorial_line || data.formats?.length) {
    const profileFields: Record<string, any> = {};
    if (data.pillars?.length) profileFields.content_pillars = data.pillars;
    if (data.editorial_line) profileFields.content_editorial_line = data.editorial_line;
    if (data.formats?.length) profileFields.content_formats = data.formats;
    if (data.rhythm) profileFields.content_frequency = data.rhythm;
    const { data: existingProfile } = await (supabase.from("brand_profile") as any)
      .select("id, content_pillars, content_editorial_line, content_formats, content_frequency").eq(filterCol, filterVal).maybeSingle();
    if (existingProfile?.id) {
      const toWrite = fillOnlyEmpty(profileFields, existingProfile, overwrite);
      if (Object.keys(toWrite).length > 0) {
        await writeOrThrow((supabase.from("brand_profile") as any).update({ ...toWrite, updated_at: new Date().toISOString() }).eq("id", existingProfile.id), "brand_profile.content.update");
      }
    } else {
      await writeOrThrow((supabase.from("brand_profile") as any).insert({ user_id: userId, workspace_id: workspaceId || null, updated_at: new Date().toISOString(), ...profileFields }), "brand_profile.content.insert");
    }
  }
}
async function saveOffers(data: AnalysisResult["offers"], userId: string, workspaceId: string, overwrite = false) {
  if (!data?.offers?.length) return;
  const col = workspaceId && workspaceId !== userId ? "workspace_id" : "user_id";
  const val = workspaceId && workspaceId !== userId ? workspaceId : userId;
  // Check existing offers to avoid duplicates by name
  const { data: existing } = await (supabase.from("offers") as any).select("name").eq(col, val);
  const existingNames = new Set((existing || []).map((o: any) => (o.name || "").toLowerCase().trim()));

  for (const offer of data.offers) {
    const normalizedName = (offer.name || "Offre").toLowerCase().trim();
    if (existingNames.has(normalizedName)) continue; // Skip duplicates
    const { error } = await (supabase.from("offers") as any).insert({
      user_id: userId,
      workspace_id: workspaceId || null,
      name: offer.name || "Offre",
      offer_type: "paid",
      price_text: offer.price || null,
      description_short: offer.description || null,
      target_ideal: offer.target || null,
      promise: offer.promise || null,
    });
    if (error) {
      console.error("Error saving offer:", offer.name, error);
      throw error;
    }
    existingNames.add(normalizedName);
  }
}

async function saveCharter(data: AnalysisResult["charter"], userId: string, workspaceId: string, overwrite = false) {
  if (!data) return;
  const payload: Record<string, any> = { updated_at: new Date().toISOString() };
  if (data.color_primary) payload.color_primary = data.color_primary;
  if (data.color_secondary) payload.color_secondary = data.color_secondary;
  if (data.color_accent) payload.color_accent = data.color_accent;
  if (data.color_background) payload.color_background = data.color_background;
  if (data.font_title) payload.font_title = data.font_title;
  if (data.font_body) payload.font_body = data.font_body;
  if (data.mood_keywords?.length) payload.mood_keywords = data.mood_keywords;
  if (data.visual_style_description) payload.moodboard_description = data.visual_style_description;
  const filterCol = workspaceId && workspaceId !== userId ? "workspace_id" : "user_id";
  const filterVal = workspaceId && workspaceId !== userId ? workspaceId : userId;
  const { data: existing } = await (supabase.from("brand_charter") as any)
    .select("id").eq(filterCol, filterVal).maybeSingle();
  if (existing?.id) {
    await writeOrThrow((supabase.from("brand_charter") as any).update(payload).eq("id", existing.id), "brand_charter.update");
  } else {
    await writeOrThrow((supabase.from("brand_charter") as any).insert({ user_id: userId, workspace_id: workspaceId || null, ...payload }), "brand_charter.insert");
  }
}

const SAVE_FNS: Record<SectionKey, (data: any, uid: string, wsId: string, overwrite?: boolean) => Promise<void>> = {
  story: saveStory, persona: savePersona, value_proposition: saveValueProp, tone_style: saveTone, content_strategy: saveStrategy, offers: saveOffers, charter: saveCharter,
};

const QUERY_KEYS: Record<SectionKey, string[]> = {
  story: ["storytelling-primary", "storytelling-list", "brand-profile"], persona: ["persona", "brand-profile"], value_proposition: ["brand-proposition", "brand-profile"], tone_style: ["brand-profile"], content_strategy: ["brand-strategy", "brand-profile"], offers: ["brand-profile"], charter: ["brand-charter"],
};

const RENDERERS: Record<SectionKey, (analysis: AnalysisResult) => React.ReactNode> = {
  story: (a) => <StorySection data={a.story} />, persona: (a) => <PersonaSection data={a.persona} />, value_proposition: (a) => <ValuePropSection data={a.value_proposition} />, tone_style: (a) => <ToneSection data={a.tone_style} />, content_strategy: (a) => <StrategySection data={a.content_strategy} />, offers: (a) => <OffersSection data={a.offers} />, charter: (a) => <CharterSection data={a.charter} />,
};

function sectionHasData(key: SectionKey, analysis: AnalysisResult): boolean {
  const d = analysis[key];
  if (!d) return false;
  const { confidence, ...rest } = d as any;
  return Object.values(rest).some((v) => v !== null && v !== undefined && v !== "" && (!Array.isArray(v) || v.length > 0));
}

// ─── Main Component ──────────────────────────────────────────
export default function BrandingReview({ analysis, sourcesUsed = [], sourcesFailed = [], onDone, preFilledSections, onReanalyzeWithBio, onDescribeProject, allSourcesFailed = false, mandatory = false }: Props) {
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
  const [savingSection, setSavingSection] = useState<SectionKey | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [coachingSection, setCoachingSection] = useState<SectionKey | null>(null);
  const [refinedSections, setRefinedSections] = useState<Set<SectionKey>>(new Set());

  /* ── Carrousel : une section par carte ────────────────────────────────────
     La longue page qui empilait les 7 sections ne disait ni où on en était ni
     ce qu'il restait à faire. Une carte à la fois, avec une réponse explicite
     (« c'est bon » / « à revoir »), rend l'étape lisible ; les « à revoir »
     sont rappelées à la fin au lieu de se perdre dans le scroll.
     Le swipe est un RACCOURCI tactile, jamais le seul moyen de répondre :
     sur ordinateur il n'y a pas de doigt, et un swipe seul ne dit pas si on a
     validé ou seulement regardé. ── */
  const total = SECTIONS.length;
  const [index, setIndex] = useState(0);
  const [toReview, setToReview] = useState<Set<SectionKey>>(new Set());
  const [validatingAll, setValidatingAll] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const finished = index >= total;

  const goTo = useCallback((i: number) => setIndex(Math.max(0, Math.min(total, i))), [total]);
  const goNext = useCallback(() => setIndex((i) => Math.min(total, i + 1)), [total]);
  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    if (coachingSection) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // On ne vole pas les flèches d'un champ en cours de saisie (couleurs, offres…).
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [coachingSection, goNext, goPrev]);

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0]?.clientX ?? null; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start == null) return;
    const dx = (e.changedTouches[0]?.clientX ?? start) - start;
    if (Math.abs(dx) < 60) return; // seuil : un scroll vertical ne doit pas changer de carte
    if (dx < 0) goNext(); else goPrev();
  };

  // Editable offers state
  const [editedOffers, setEditedOffers] = useState<OfferItem[]>(() => analysis.offers?.offers ? [...analysis.offers.offers] : []);
  const handleOfferUpdate = useCallback((index: number, offer: OfferItem) => {
    setEditedOffers(prev => prev.map((o, i) => i === index ? offer : o));
  }, []);
  const handleOfferDelete = useCallback((index: number) => {
    setEditedOffers(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Charte éditable : couleurs/typos corrigées à la main priment sur l'analyse
  // (indispensable quand la palette est « proposée » faute de CSS lisible).
  const [editedCharter, setEditedCharter] = useState<AnalysisResult["charter"]>(() => analysis.charter ? { ...analysis.charter } : undefined);
  const handleCharterUpdate = useCallback((charter: NonNullable<AnalysisResult["charter"]>) => {
    setEditedCharter(charter);
  }, []);
  
  // Instagram bio fallback
  const instagramFailed = sourcesFailed.includes("instagram") || (analysis.sources_failed || []).includes("instagram");
  const [igBio, setIgBio] = useState("");
  const [showIgBioInput, setShowIgBioInput] = useState(false);
  
  // Project description fallback
  const [projectText, setProjectText] = useState("");
  const [showProjectInput, setShowProjectInput] = useState(false);

  const validatedCount = validated.size;
  const allDone = validatedCount === 7;

  // Log section_validated events — PostHog, PAS ai_usage : ai_usage est la table
  // de FACTURATION (checkQuota compte toutes ses lignes du mois dans le quota),
  // y écrire de la télémétrie brûlait des crédits gratuits à chaque validation.
  const logEvent = useCallback(async (eventType: string, meta?: Record<string, any>) => {
    if (!user?.id) return;
    try {
      posthog.capture(eventType, {
        source: "branding_autofill",
        workspace_id: workspaceId !== user.id ? workspaceId : null,
        ...meta,
      });
    } catch { /* silent */ }
  }, [user?.id, workspaceId]);

  const clearToReview = useCallback((key: SectionKey) => {
    setToReview((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  // « Garder tel quel » : on valide sans rien réécrire (l'existant prime).
  const handleKeepAsIs = useCallback((key: SectionKey) => {
    setValidated((prev) => new Set(prev).add(key));
    clearToReview(key);
    goNext();
  }, [clearToReview, goNext]);

  // « À revoir » : on ne jette rien — la section est mise de côté et rappelée
  // sur la carte de fin, avec le lien pour y revenir.
  const handleToReview = useCallback((key: SectionKey) => {
    setToReview((prev) => new Set(prev).add(key));
    goNext();
  }, [goNext]);

  const handleValidate = useCallback(async (key: SectionKey) => {
    if (!user?.id) return;
    setSavingSection(key);
    try {
      const dataToSave = key === "offers" ? { ...analysis.offers, offers: editedOffers }
        : key === "charter" ? editedCharter
        : analysis[key];
      // `allow_overwrite` est posé par diagnostic-enrichment quand la reprise
      // d'onboarding a été confirmée à l'écran : dans ce cas seulement, ce que
      // la personne valide ici écrase ce qui était en place.
      await SAVE_FNS[key](dataToSave, user.id, workspaceId, analysis.allow_overwrite === true);
      for (const qk of QUERY_KEYS[key]) queryClient.invalidateQueries({ queryKey: [qk] });
      setValidated((prev) => new Set(prev).add(key));
      clearToReview(key);
      toast.success("Section sauvegardée ✓");
      logEvent("section_validated");
      if (validated.size === 6) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 4000);
      }
      goNext();
    } catch (e) {
      console.error("Save error:", e);
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSavingSection(null);
    }
  }, [user?.id, workspaceId, analysis, editedOffers, editedCharter, validated.size, queryClient, preFilledSections, logEvent, clearToReview, goNext]);

  /* « Je valide tout » : le raccourci pour qui fait confiance à l'analyse.
     On enregistre section par section (les save* écrivent dans 7 tables
     différentes) et on NE dit jamais « tout est validé » si l'une d'elles a
     échoué — on ramène alors la carte fautive à l'écran. Une section vide est
     marquée validée sans écriture : les save* sortent tôt sur données nulles. */
  const handleValidateAll = useCallback(async () => {
    if (!user?.id || validatingAll) return;
    setValidatingAll(true);
    const failed: SectionKey[] = [];
    try {
      for (const sec of SECTIONS) {
        if (validated.has(sec.key)) continue;
        const dataToSave = sec.key === "offers" ? { ...analysis.offers, offers: editedOffers }
          : sec.key === "charter" ? editedCharter
          : analysis[sec.key];
        try {
          await SAVE_FNS[sec.key](dataToSave, user.id, workspaceId, analysis.allow_overwrite === true);
          for (const qk of QUERY_KEYS[sec.key]) queryClient.invalidateQueries({ queryKey: [qk] });
          setValidated((prev) => new Set(prev).add(sec.key));
          clearToReview(sec.key);
        } catch (e) {
          console.error("[valider tout]", sec.key, e);
          failed.push(sec.key);
        }
      }
      logEvent("branding_validate_all", { failed: failed.length });
      if (failed.length > 0) {
        const labels = failed.map((k) => SECTIONS.find((s) => s.key === k)?.title || k).join(", ");
        toast.error(`Je n'ai pas réussi à enregistrer : ${labels}. Reprends ${failed.length > 1 ? "ces cartes" : "cette carte"} une par une.`);
        setIndex(SECTIONS.findIndex((s) => s.key === failed[0]));
      } else {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 4000);
        toast.success("Toute ta fiche est validée ✓");
        setIndex(total);
      }
    } finally {
      setValidatingAll(false);
    }
  }, [user?.id, validatingAll, validated, analysis, editedOffers, editedCharter, workspaceId, queryClient, clearToReview, logEvent, total]);

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
    <div className="pb-40 md:pb-24">
      {showConfetti && <Confetti />}

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-8">
        <h1 className="font-display text-3xl sm:text-4xl text-foreground mb-2" style={{ fontWeight: 400 }}>
          Voici ce que j'ai compris de ton projet
        </h1>
        <p className="font-mono-ui text-sm text-muted-foreground mb-4 leading-relaxed">
          J'ai analysé {subtitleSources}. Une carte par morceau de ta marque : tu valides, ou tu mets de côté pour y revenir.
        </p>

        {hasPreFilled && (
          <p className="font-mono-ui text-sm text-success bg-success-bg border border-success/30 rounded-[12px] px-3 py-2 mb-3">
            ✅ J'ai gardé ce que tu avais déjà rempli et j'ai complété le reste.
          </p>
        )}

        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border text-sm mb-3">
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
          <div className="mt-4 bg-warning-bg border border-warning/30 rounded-[16px] p-4">
            <div className="flex items-start gap-2 mb-2">
              <Instagram className="h-5 w-5 text-warning shrink-0 mt-0.5" />
              <p className="text-sm text-warning">
                Je n'ai pas réussi à accéder à ton Instagram (c'est fréquent, Instagram bloque les analyses automatiques). Tu peux m'aider en copiant-collant ta bio ici.
              </p>
            </div>
            {!showIgBioInput ? (
              <button onClick={() => setShowIgBioInput(true)} className="text-sm font-semibold text-primary hover:underline">
                Coller ma bio Instagram →
              </button>
            ) : (
              <div className="space-y-2 mt-2">
                <Textarea
                  value={igBio}
                  onChange={(e) => setIgBio(e.target.value)}
                  placeholder="Colle ta bio Instagram ici..."
                  className="text-sm min-h-[80px]"
                />
                <Button
                  size="sm"
                  disabled={!igBio.trim()}
                  onClick={() => onReanalyzeWithBio?.(igBio.trim())}
                  className="bg-primary hover:bg-bordeaux text-white text-sm"
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
            <button onClick={() => setCoachingSection(null)} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground mb-4 transition-colors">
              <ArrowLeft className="h-4 w-4" /> Revenir à la vue d'ensemble
            </button>
            <BrandingCoachingFlow
              section={COACHING_SECTION_MAP[coachingSection] as any}
              autofillData={analysis[coachingSection]}
              autofillConfidence={getConfidence(analysis[coachingSection])}
              onComplete={() => {
                setValidated((prev) => new Set(prev).add(coachingSection));
                setRefinedSections((prev) => new Set(prev).add(coachingSection));
                for (const qk of QUERY_KEYS[coachingSection]) queryClient.invalidateQueries({ queryKey: [qk] });
                clearToReview(coachingSection);
                setCoachingSection(null);
                toast.success("Section affinée et sauvegardée ✓");
                logEvent("section_validated");
                if (validated.size === 6) { setShowConfetti(true); setTimeout(() => setShowConfetti(false), 4000); }
                goNext();
              }}
              onBack={() => setCoachingSection(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Carrousel : une carte par section */}
      {!coachingSection && !finished && (() => {
        const sec = SECTIONS[index];
        const conf = getConfidence(analysis[sec.key]);
        const isPreFilled = preFilledSections?.has(sec.key) ?? false;
        const isValidated = validated.has(sec.key);
        const isMarked = toReview.has(sec.key);
        const hasData = sectionHasData(sec.key, analysis);
        const isLow = conf === "low" && !hasData;
        const isSaving = savingSection === sec.key;
        const isRefined = refinedSections.has(sec.key);
        const sectionBody = sec.key === "offers"
          ? <OffersSection data={{ ...analysis.offers, offers: editedOffers }} onUpdate={handleOfferUpdate} onDelete={handleOfferDelete} />
          : sec.key === "charter"
            ? <CharterSection data={editedCharter} onUpdate={handleCharterUpdate} />
            : RENDERERS[sec.key](analysis);

        return (
          <div>
            {/* Fil de progression : où j'en suis, et ce que j'ai déjà répondu */}
            <div className="flex items-center justify-between gap-3 mb-3">
              <p className="font-mono-ui text-xs text-muted-foreground">Carte {index + 1} sur {total}</p>
              <div className="flex items-center gap-1.5">
                {SECTIONS.map((s, i) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => goTo(i)}
                    aria-label={`Aller à « ${s.title} »`}
                    aria-current={i === index ? "step" : undefined}
                    className={`h-2 rounded-full transition-all ${
                      i === index ? "w-6 bg-primary"
                        : validated.has(s.key) ? "w-2 bg-success"
                          : toReview.has(s.key) ? "w-2 bg-warning"
                            : "w-2 bg-border"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* La carte. `key` force le remontage à chaque section → l'animation
                d'entrée rejoue, et aucun état de carte ne fuit d'une section à l'autre. */}
            <div
              key={sec.key}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              className="bg-card rounded-[20px] shadow-card border border-border overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300"
            >
              <div className="flex items-center justify-between gap-3 p-5 sm:p-6 pb-0">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl shrink-0">{sec.emoji}</span>
                  <h2 className="font-display text-lg text-foreground" style={{ fontWeight: 400 }}>{sec.title}</h2>
                  {isValidated && <CheckCircle2 className="h-5 w-5 text-success shrink-0" />}
                  {isRefined && <span className="text-2xs text-success font-medium">Affiné</span>}
                  {isMarked && !isValidated && (
                    <span className="inline-flex items-center gap-1 text-2xs font-medium px-2 py-0.5 rounded-full bg-warning-bg text-warning shrink-0">
                      À revoir
                    </span>
                  )}
                  {isPreFilled && !isRefined && (
                    <span className="inline-flex items-center gap-1 text-2xs font-medium px-2 py-0.5 rounded-full bg-info-bg text-info shrink-0">
                      <Lock className="h-3 w-3" /> Déjà complété
                    </span>
                  )}
                </div>
                {!isValidated && !isPreFilled && <ConfidenceBadge level={conf} />}
              </div>

              <div className="px-5 sm:px-6 py-5 sm:py-6">
                {isPreFilled && !isRefined ? (
                  <>
                    <p className="text-sm text-muted-foreground mb-3 bg-info-bg border border-info/20 rounded-[12px] px-3 py-2">
                      Tu avais déjà commencé cette section. Voici ce que l'analyse a trouvé en plus — je <strong>complète seulement les champs vides</strong>, sans toucher à ce que tu as écrit.
                    </p>
                    <div className="mb-5">{sectionBody}</div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <button onClick={() => handleValidate(sec.key)} disabled={isSaving} className="inline-flex items-center justify-center gap-2 bg-primary text-white rounded-[12px] px-5 py-2 text-sm font-semibold transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50">
                        {isSaving ? <Spinner className="h-4 w-4 text-white" /> : <CheckCircle2 className="h-4 w-4" />}
                        Compléter les champs vides ✓
                      </button>
                      <button onClick={() => handleKeepAsIs(sec.key)} disabled={isSaving} className="inline-flex items-center justify-center gap-2 border-[1.5px] border-success text-success rounded-[12px] px-5 py-2 text-sm font-semibold hover:bg-success-bg transition-all disabled:opacity-50">
                        <CheckCircle2 className="h-4 w-4" /> Garder tel quel
                      </button>
                      <button onClick={() => setCoachingSection(sec.key)} className="inline-flex items-center justify-center gap-2 border-[1.5px] border-primary text-primary rounded-[12px] px-5 py-2 text-sm font-semibold hover:bg-rose-pale transition-all">
                        <Sparkles className="h-4 w-4" /> On affine ensemble →
                      </button>
                    </div>
                  </>
                ) : isLow ? (
                  <div className="text-center py-6">
                    <p className="text-sm text-muted-foreground mb-4">Je n'ai pas assez d'éléments pour cette section. On la remplit ensemble ?</p>
                    <div className="flex flex-col sm:flex-row gap-2 justify-center">
                      <button onClick={() => setCoachingSection(sec.key)} className="inline-flex items-center justify-center gap-2 bg-primary text-white rounded-[12px] px-6 py-2.5 text-sm font-semibold transition-all hover:scale-[1.02] hover:shadow-lg">
                        <Sparkles className="h-4 w-4" /> On la remplit ensemble →
                      </button>
                      <button onClick={() => handleToReview(sec.key)} className="inline-flex items-center justify-center gap-2 border-[1.5px] border-border text-muted-foreground rounded-[12px] px-5 py-2 text-sm font-semibold hover:border-warning hover:text-warning transition-all">
                        Plus tard
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-5">{sectionBody}</div>
                    {isValidated ? (
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                        <p className="text-sm text-success font-medium flex-1">✅ Cette carte est enregistrée.</p>
                        <button onClick={() => setCoachingSection(sec.key)} className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-primary hover:underline">
                          <Sparkles className="h-4 w-4" /> L'affiner quand même
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <button onClick={() => handleValidate(sec.key)} disabled={isSaving} className="inline-flex items-center justify-center gap-2 bg-primary text-white rounded-[12px] px-5 py-2 text-sm font-semibold transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50">
                            {isSaving ? <Spinner className="h-4 w-4 text-white" /> : <CheckCircle2 className="h-4 w-4" />}
                            C'est bon ✓
                          </button>
                          <button onClick={() => handleToReview(sec.key)} disabled={isSaving} className="inline-flex items-center justify-center gap-2 border-[1.5px] border-warning text-warning rounded-[12px] px-5 py-2 text-sm font-semibold hover:bg-warning-bg transition-all disabled:opacity-50">
                            <Pencil className="h-4 w-4" /> À revoir
                          </button>
                          <button onClick={() => setCoachingSection(sec.key)} className="inline-flex items-center justify-center gap-2 border-[1.5px] border-primary text-primary rounded-[12px] px-5 py-2 text-sm font-semibold hover:bg-rose-pale transition-all">
                            <Sparkles className="h-4 w-4" /> On affine ensemble →
                          </button>
                        </div>
                        {conf === "low" && (
                          <p className="text-xs text-muted-foreground mt-2">Je n'ai pas trouvé assez d'infos pour cette partie. Quelques questions vont m'aider à compléter.</p>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Navigation — le swipe est un raccourci, ces boutons restent la voie sûre */}
            <div className="flex items-center justify-between gap-3 mt-3">
              <button
                onClick={goPrev}
                disabled={index === 0}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4" /> Précédent
              </button>
              <p className="text-2xs text-muted-foreground hidden sm:block">Flèches ← → du clavier</p>
              <p className="text-2xs text-muted-foreground sm:hidden">Glisse pour changer de carte</p>
              <button
                onClick={goNext}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Suivant <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })()}

      {/* Carte de fin : ce qui est enregistré, et ce qui attend encore une réponse */}
      {!coachingSection && finished && (() => {
        const pending = SECTIONS.filter((s) => !validated.has(s.key));
        const done = pending.length === 0;
        return (
          <div className="bg-card rounded-[20px] shadow-card border border-border p-6 sm:p-8 text-center animate-in fade-in duration-300">
            <div className="text-3xl mb-2">{done ? "🎉" : "📝"}</div>
            <h2 className="font-display text-2xl text-foreground mb-2" style={{ fontWeight: 400 }}>
              {done ? "Ta marque est prête" : "Il reste des cartes sans réponse"}
            </h2>
            <p className="text-sm text-muted-foreground mb-5 max-w-md mx-auto leading-relaxed">
              {done
                ? "Tout est enregistré. C'est cette fiche que j'utilise pour écrire à ta place : tu pourras la retoucher quand tu veux depuis ton Branding."
                : `${pending.length} carte${pending.length > 1 ? "s attendent" : " attend"} encore ta réponse. Reprends-${pending.length > 1 ? "les" : "la"} une par une, ou valide tout d'un coup si l'analyse te convient.`}
            </p>

            {!done && (
              <div className="flex flex-wrap justify-center gap-2 mb-5">
                {pending.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => goTo(SECTIONS.findIndex((x) => x.key === s.key))}
                    className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:border-primary transition-colors"
                  >
                    <span>{s.emoji}</span> {s.title}
                    {toReview.has(s.key) && <span className="text-2xs text-warning font-medium">à revoir</span>}
                  </button>
                ))}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              {done ? (
                <button onClick={onDone} className="inline-flex items-center justify-center gap-2 bg-primary text-white rounded-[12px] px-6 py-2.5 text-sm font-semibold transition-all hover:scale-[1.02] hover:shadow-lg">
                  {mandatory ? "Créer mon premier contenu →" : "Voir mon branding complet →"}
                </button>
              ) : (
                <>
                  <button onClick={handleValidateAll} disabled={validatingAll} className="inline-flex items-center justify-center gap-2 bg-primary text-white rounded-[12px] px-6 py-2.5 text-sm font-semibold transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50">
                    {validatingAll ? <Spinner className="h-4 w-4 text-white" /> : <CheckCircle2 className="h-4 w-4" />}
                    Valider tout le reste
                  </button>
                  <button onClick={() => goTo(SECTIONS.findIndex((s) => !validated.has(s.key)))} className="inline-flex items-center justify-center gap-2 border-[1.5px] border-primary text-primary rounded-[12px] px-5 py-2.5 text-sm font-semibold hover:bg-rose-pale transition-all">
                    Reprendre les cartes
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })()}

      {/* Sticky bottom bar — décalée au-dessus de la barre d'onglets mobile (bottom-14 = 3.5rem) */}
      <div className="fixed bottom-14 md:bottom-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-sm border-t border-border px-4 py-3">
        <div className="mx-auto max-w-[900px] flex items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between gap-3 mb-1.5">
              <span className="text-sm font-semibold text-foreground">
                {allDone ? "Fiche validée ! 🎉" : `${validatedCount}/${total} validées`}
              </span>
              <div className="flex items-center gap-3 shrink-0">
                {allDone ? (
                  <button onClick={onDone} className="text-sm font-semibold text-primary hover:underline whitespace-nowrap">
                    {mandatory ? "Créer mon premier contenu →" : "Voir mon branding complet →"}
                  </button>
                ) : (
                  <>
                    {/* Le raccourci demandé : tout valider d'un coup, sans parcourir les 7 cartes. */}
                    <button
                      onClick={handleValidateAll}
                      disabled={validatingAll}
                      className="inline-flex items-center gap-1.5 bg-primary text-white rounded-pill px-4 py-1.5 text-xs font-semibold transition-all hover:scale-[1.02] hover:shadow-lg disabled:opacity-50 whitespace-nowrap"
                    >
                      {validatingAll ? <Spinner className="h-3.5 w-3.5 text-white" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                      Je valide tout
                    </button>
                    {/* Hors onboarding, la porte de sortie reste : sans elle, la
                        review remplacerait /branding à chaque visite. Dans
                        l'onboarding (mandatory), valider sa fiche EST l'étape. */}
                    {!mandatory && (
                      <button
                        onClick={onDone}
                        className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 whitespace-nowrap"
                        title="Les cartes validées sont gardées ; tu pourras finir le reste depuis ta page branding."
                      >
                        Finir plus tard
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="h-[6px] rounded-full bg-rose-pale overflow-hidden">
              {/* `initial` explicite : sans lui, framer-motion part de la largeur
                  mesurée (= 100 %) et la barre s'affiche PLEINE une fraction de
                  seconde alors que rien n'est validé. */}
              <motion.div className="h-full rounded-full" style={{ background: "linear-gradient(90deg, #ffa7c6, #fb3d80)" }} initial={{ width: 0 }} animate={{ width: `${(validatedCount / total) * 100}%` }} transition={{ type: "spring", stiffness: 60, damping: 20 }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
