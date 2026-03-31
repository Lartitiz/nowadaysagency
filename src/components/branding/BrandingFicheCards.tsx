import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Plus, Pencil, Loader2, Wand2 } from "lucide-react";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { Button } from "@/components/ui/button";
import { useDemoContext } from "@/contexts/DemoContext";
import { toast } from "sonner";

/* ── Field-level emoji map ── */
const FIELD_EMOJI: Record<string, string> = {
  step_1_frustrations: "😤",
  step_2_transformation: "✨",
  step_3a_objections: "🤔",
  step_3b_cliches: "💭",
  step_4_beautiful: "🌸",
  step_4_inspiring: "💡",
  step_4_repulsive: "🚫",
  step_4_feeling: "❤️",
  step_5_actions: "🎯",
  pitch_short: "💬",
  pitch_medium: "💬",
  pitch_long: "💬",
  step_1_what: "💼",
  step_2a_process: "⚙️",
  step_2b_values: "💎",
  step_2c_feedback: "🗣️",
  step_2d_refuse: "🚫",
  step_3_for_whom: "🎯",
  version_pitch_naturel: "🎤",
  version_bio: "📝",
  version_networking: "🤝",
  version_site_web: "🌐",
  version_engagee: "✊",
  version_one_liner: "⚡",
  version_final: "⭐",
  voice_description: "🗣️",
  combat_cause: "✊",
  combat_fights: "🥊",
  combat_alternative: "🌱",
  combat_refusals: "🚫",
  tone_register: "📖",
  tone_level: "🎚️",
  tone_style: "🎨",
  tone_humor: "😄",
  tone_engagement: "📢",
  key_expressions: "✏️",
  things_to_avoid: "❌",
  target_verbatims: "💬",
  step_1_hidden_facets: "🔮",
  facet_1: "🎭",
  facet_2: "🎭",
  facet_3: "🎭",
  pillar_major: "🏛️",
  pillar_minor_1: "🧱",
  pillar_minor_2: "🧱",
  pillar_minor_3: "🧱",
  creative_concept: "💡",
};

function truncate(text: string, max: number) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "…" : text;
}

/* ══════════════════════════════════════════════════════
   STORY SECTION – one card per storytelling
   ══════════════════════════════════════════════════════ */

interface StorytellingRow {
  id: string;
  title?: string | null;
  step_7_polished?: string | null;
  is_primary?: boolean;
  updated_at?: string | null;
}

function StoryCards() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const navigate = useNavigate();
  const [stories, setStories] = useState<StorytellingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (supabase.from("storytelling" as any) as any)
      .select("id, title, step_7_polished, is_primary, updated_at")
      .eq(column, value)
      .order("is_primary", { ascending: false })
      .order("updated_at", { ascending: false })
      .then(({ data }: any) => {
        setStories((data as StorytellingRow[]) || []);
        setLoading(false);
      });
  }, [user?.id]);

  if (loading) return <div className="py-8 text-center text-muted-foreground text-sm">Chargement…</div>;

  if (stories.length === 0) {
    return (
      <Card className="p-6 text-center border-dashed">
        <p className="text-muted-foreground text-sm mb-3">Aucun storytelling pour l'instant.</p>
        <Button size="sm" className="rounded-pill text-xs" onClick={() => navigate("/branding/coaching?section=story")}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Créer mon premier storytelling
        </Button>
      </Card>
    );
  }

  const single = stories.length === 1;

  return (
    <div className="space-y-3">
      {stories.map((s) => {
        const preview = s.step_7_polished
          ? single ? s.step_7_polished : truncate(s.step_7_polished, 80)
          : "Storytelling en cours…";
        const label = s.title || "Mon histoire";

        return (
          <Card
            key={s.id}
            className="p-5 cursor-pointer border-border hover:border-[hsl(var(--primary)/0.3)] hover:shadow-md transition-all"
            onClick={() => navigate(`/branding/storytelling/${s.id}/edit`)}
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="font-display text-sm font-bold text-foreground">{label}</h3>
              {s.is_primary && <Badge variant="default" className="text-[10px] shrink-0">Principal</Badge>}
            </div>
            <p className={`text-[13px] text-muted-foreground leading-relaxed ${single ? "" : "line-clamp-3"}`}>
              {preview}
            </p>
            {s.updated_at && (
              <p className="text-[11px] text-muted-foreground/60 mt-2">
                Mis à jour le {format(new Date(s.updated_at), "d MMM yyyy", { locale: fr })}
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   GENERIC SECTION – field cards with inline editing
   ══════════════════════════════════════════════════════ */

interface FieldDef {
  key: string;
  label: string;
  multiline?: boolean;
}

interface FieldCardsProps {
  fields: FieldDef[];
  data: Record<string, any>;
  table: string;
  recordId?: string;
  onFieldUpdate?: (field: string, value: string, oldValue?: string) => void;
}

function FieldCards({ fields, data, table, recordId, onFieldUpdate }: FieldCardsProps) {
  const { user } = useAuth();
  const { isDemoMode } = useDemoContext();
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const filled = fields.filter((f) => {
    const v = data[f.key];
    return v && typeof v === "string" && v.trim().length > 0;
  });
  const total = fields.length;

  const handleStartEdit = (field: FieldDef) => {
    setEditingField(field.key);
    setEditValue((data[field.key] as string) || "");
  };

  const handleCancelEdit = () => {
    setEditingField(null);
    setEditValue("");
  };

  const handleSave = async (field: FieldDef) => {
    if (isDemoMode) {
      onFieldUpdate?.(field.key, editValue, data[field.key] || "");
      setEditingField(null);
      toast.success("C'est noté !");
      return;
    }
    if (!user || !recordId) return;
    setIsSaving(true);
    try {
      const oldValue = (data[field.key] as string) || "";
      await (supabase.from(table as any) as any)
        .update({ [field.key]: editValue, updated_at: new Date().toISOString() })
        .eq("id", recordId);
      onFieldUpdate?.(field.key, editValue, oldValue);
      setEditingField(null);
      toast.success("C'est noté !");
    } catch {
      toast.error("Erreur de sauvegarde");
    }
    setIsSaving(false);
  };

  return (
    <div>
      {/* Counter */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-semibold text-foreground">
          {filled.length}/{total} champs remplis
        </span>
        <div className="h-1.5 bg-muted rounded-full flex-1 overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${total ? Math.round((filled.length / total) * 100) : 0}%` }}
          />
        </div>
      </div>

      {/* Cards for ALL fields (filled AND empty) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map((f) => {
          const emoji = FIELD_EMOJI[f.key] || "📄";
          const rawValue = (data[f.key] as string)?.trim() || "";
          const isFilled = rawValue.length > 0;
          const isEditing = editingField === f.key;
          const isMultiline = f.multiline !== false;

          return (
            <Card
              key={f.key}
              className="group p-4 border-border hover:border-[hsl(338,100%,71%,0.2)] transition-all"
            >
              {/* Header: emoji + label + pencil */}
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">{emoji}</span>
                  <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide">{f.label}</h4>
                </div>
                {!isEditing && (
                  <button
                    onClick={() => handleStartEdit(f)}
                    className="text-muted-foreground/40 hover:text-primary transition-colors opacity-0 group-hover:opacity-100"
                    aria-label={`Modifier ${f.label}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Content or Edit mode */}
              {isEditing ? (
                <div className="mt-1">
                  {isMultiline ? (
                    <textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="w-full border border-primary/30 rounded-lg p-3 text-foreground text-sm focus:border-primary focus:ring-2 focus:ring-primary/10 min-h-[100px] bg-card resize-none outline-none"
                      aria-label={f.label}
                      autoFocus
                    />
                  ) : (
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="w-full border border-primary/30 rounded-lg p-3 text-foreground text-sm focus:border-primary focus:ring-2 focus:ring-primary/10 bg-card outline-none"
                      aria-label={f.label}
                      autoFocus
                    />
                  )}
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" onClick={() => handleSave(f)} disabled={isSaving} className="text-xs rounded-lg">
                      {isSaving ? <><Loader2 className="h-3 w-3 animate-spin mr-1" /> Sauvegarde...</> : "Sauvegarder"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={handleCancelEdit} className="text-xs text-muted-foreground">
                      Annuler
                    </Button>
                  </div>
                </div>
              ) : isFilled ? (
                <p className="text-[13px] text-muted-foreground leading-relaxed whitespace-pre-line">
                  {rawValue}
                </p>
              ) : (
                <p className="text-[13px] text-muted-foreground/50 italic">
                  Pas encore renseigné ·{" "}
                  <button onClick={() => handleStartEdit(f)} className="text-primary hover:underline">
                    Remplir manuellement
                  </button>
                </p>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN EXPORT
   ══════════════════════════════════════════════════════ */

interface BrandingFicheCardsProps {
  section: string;
  fields: FieldDef[];
  data: Record<string, any>;
  table?: string;
  recordId?: string;
  onFieldUpdate?: (field: string, value: string, oldValue?: string) => void;
}

export default function BrandingFicheCards({ section, fields, data, table, recordId, onFieldUpdate }: BrandingFicheCardsProps) {
  if (section === "story") {
    return <StoryCards />;
  }
  return <FieldCards fields={fields} data={data} table={table || ""} recordId={recordId} onFieldUpdate={onFieldUpdate} />;
}
