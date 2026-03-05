import { useState } from "react";
import { useNavigate } from "react-router-dom";
import CoachingShell from "@/components/coaching/CoachingShell";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Loader2, ArrowRight, CalendarPlus, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { toast } from "sonner";
import { toLocalDateStr } from "@/lib/utils";

interface PlanningItem {
  day: string;
  pillar: string;
  subject: string;
  format: string;
  hook_idea: string;
  objective: string;
}

interface CoachingResult {
  planning: PlanningItem[];
  week_theme: string;
  tip: string;
}

interface CalendarCoachingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPostAdded?: () => void;
}

const FORMAT_ICONS: Record<string, string> = {
  post: "📝",
  carousel: "🎠",
  reel: "🎬",
  story: "📱",
  newsletter: "✉️",
};

const FORMAT_ROUTES: Record<string, string> = {
  post: "/creer",
  carousel: "/creer?format=carousel",
  reel: "/creer?format=reel",
  story: "/creer?format=story",
  newsletter: "/creer",
};

const OBJ_LABELS: Record<string, string> = {
  inspirer: "🌟 Inspirer",
  eduquer: "📚 Éduquer",
  vendre: "💰 Vendre",
  lien: "💬 Lien",
};

const DAY_DATES: Record<string, number> = {
  Lundi: 1, Mardi: 2, Mercredi: 3, Jeudi: 4, Vendredi: 5, Samedi: 6, Dimanche: 0,
};

function getNextDayDate(dayName: string): string {
  const target = DAY_DATES[dayName];
  if (target === undefined) return toLocalDateStr(new Date());
  const now = new Date();
  const current = now.getDay();
  let diff = target - current;
  if (diff <= 0) diff += 7;
  const date = new Date(now);
  date.setDate(now.getDate() + diff);
  return toLocalDateStr(date);
}

export default function CalendarCoachingDialog({ open, onOpenChange, onPostAdded }: CalendarCoachingDialogProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const workspaceId = useWorkspaceId();
  const [step, setStep] = useState(1);
  const [postsPerWeek, setPostsPerWeek] = useState<number | null>(null);
  const [contextWeek, setContextWeek] = useState("");
  const [mixOrFocus, setMixOrFocus] = useState<"mix" | "focus" | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CoachingResult | null>(null);
  const [addedItems, setAddedItems] = useState<Set<number>>(new Set());

  const reset = () => {
    setStep(1);
    setPostsPerWeek(null);
    setContextWeek("");
    setMixOrFocus(null);
    setLoading(false);
    setResult(null);
    setAddedItems(new Set());
  };

  const handleGenerate = async () => {
    if (!user || !postsPerWeek || !mixOrFocus) return;
    setLoading(true);
    try {
      const { data, error } = await invokeWithTimeout("calendar-coaching", {
        body: { posts_per_week: postsPerWeek, context_week: contextWeek, mix_or_focus: mixOrFocus },
      }, 120000);
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult(data);
    } catch (e: any) {
      if (e?.isTimeout) { toast.error("Le coaching prend plus de temps que prévu. Réessaie."); }
      else toast.error(e.message || "Erreur lors de la génération");
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCalendar = async (item: PlanningItem, index: number) => {
    if (!user) return;
    try {
      const date = getNextDayDate(item.day);
      await supabase.from("calendar_posts").insert({
        user_id: user.id,
        workspace_id: workspaceId !== user.id ? workspaceId : undefined,
        date,
        theme: item.subject,
        format: item.format === "carousel" ? "post_carrousel" : item.format === "story" || item.format === "story_serie" ? "story_serie" : item.format,
        canal: "instagram",
        status: "a_rediger",
        objectif: item.objective,
        accroche: item.hook_idea,
        notes: `Pilier : ${item.pillar}`,
      } as any);
      setAddedItems(prev => new Set(prev).add(index));
      toast.success(`📅 "${item.subject}" ajouté au ${item.day}`);
      onPostAdded?.();
    } catch (e: any) {
      toast.error("Erreur lors de l'ajout");
    }
  };

  const handleCreateContent = (item: PlanningItem) => {
    const route = FORMAT_ROUTES[item.format] || "/creer";
    onOpenChange(false);
    const formatParam = item.format === "newsletter" ? "&format=newsletter" : "";
    navigate(`${route}?subject=${encodeURIComponent(item.subject)}&objective=${encodeURIComponent(item.objective)}${formatParam}`);
  };

  return (
    <CoachingShell
      open={open}
      onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}
      title="Planifier ma semaine"
      description="Coaching pour planifier ta semaine de contenu"
      emoji="📅"
    >
        {/* Step 1: Posts per week */}
        {!loading && !result && step === 1 && (
          <div className="space-y-4 animate-fade-in">
            <p className="text-sm font-medium text-foreground">Combien de posts tu veux publier cette semaine ?</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => { setPostsPerWeek(n); setStep(2); }}
                  className={`w-12 h-12 rounded-xl border-2 text-lg font-bold transition-all ${
                    postsPerWeek === n ? "border-primary bg-[hsl(var(--rose-pale))] text-primary" : "border-border bg-card text-foreground hover:border-primary/40"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">💡 La régularité bat la quantité. 2 bons posts &gt; 5 posts bâclés.</p>
          </div>
        )}

        {/* Step 2: Week context */}
        {!loading && !result && step === 2 && (
          <div className="space-y-4 animate-fade-in">
            <p className="text-sm font-medium text-foreground">Il se passe quoi cette semaine dans ton activité ?</p>
            <Textarea
              value={contextWeek}
              onChange={(e) => setContextWeek(e.target.value)}
              placeholder="Un lancement, un événement, une promo, ou rien de spécial..."
              className="min-h-[80px]"
            />
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { setContextWeek("Rien de spécial, semaine normale."); setStep(3); }}>
                Rien de spécial
              </Button>
              <Button size="sm" onClick={() => setStep(3)} disabled={!contextWeek.trim()} className="gap-1">
                Suivant <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Mix or focus */}
        {!loading && !result && step === 3 && (
          <div className="space-y-4 animate-fade-in">
            <p className="text-sm font-medium text-foreground">Tu préfères quoi ?</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setMixOrFocus("mix"); }}
                className={`rounded-xl border-2 p-4 text-left transition-all ${
                  mixOrFocus === "mix" ? "border-primary bg-[hsl(var(--rose-pale))]" : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <p className="text-lg mb-1">🎨</p>
                <p className="text-sm font-semibold text-foreground">Mix de mes piliers</p>
                <p className="text-xs text-muted-foreground">Varié et dynamique</p>
              </button>
              <button
                onClick={() => { setMixOrFocus("focus"); }}
                className={`rounded-xl border-2 p-4 text-left transition-all ${
                  mixOrFocus === "focus" ? "border-primary bg-[hsl(var(--rose-pale))]" : "border-border bg-card hover:border-primary/40"
                }`}
              >
                <p className="text-lg mb-1">🎯</p>
                <p className="text-sm font-semibold text-foreground">Focus sur un sujet</p>
                <p className="text-xs text-muted-foreground">Cohérent et approfondi</p>
              </button>
            </div>
            {mixOrFocus && (
              <Button onClick={handleGenerate} disabled={loading} className="w-full gap-2">
                <Sparkles className="h-4 w-4" /> Planifier ma semaine
              </Button>
            )}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">L'IA prépare ta semaine…</p>
            <p className="text-xs text-muted-foreground mt-1">Ça prend quelques secondes.</p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-5 animate-fade-in">
            {/* Week theme + tip */}
            <div className="rounded-xl border border-primary/20 bg-[hsl(var(--rose-pale))] p-4 space-y-2">
              <p className="text-sm font-semibold text-foreground">🎯 {result.week_theme}</p>
              <p className="text-xs text-muted-foreground italic">💡 {result.tip}</p>
            </div>

            {/* Planning cards */}
            <div className="space-y-3">
              {result.planning.map((item, i) => {
                const isAdded = addedItems.has(i);
                return (
                  <div key={i} className={`rounded-xl border p-4 space-y-2 transition-all ${isAdded ? "border-emerald-200 bg-emerald-50/50" : "border-border bg-card"}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-pill">{item.day}</span>
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-pill">{item.pillar}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {FORMAT_ICONS[item.format] || "📝"} {item.format}
                        {OBJ_LABELS[item.objective] && ` · ${OBJ_LABELS[item.objective]}`}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-foreground">{item.subject}</p>
                    <p className="text-xs text-muted-foreground italic">💬 {item.hook_idea}</p>
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs gap-1 flex-1"
                        disabled={isAdded || loading}
                        onClick={() => handleAddToCalendar(item, i)}
                      >
                        {isAdded ? "✅ Ajouté" : <><CalendarPlus className="h-3 w-3" /> Ajouter au calendrier</>}
                      </Button>
                      <Button
                        size="sm"
                        className="text-xs gap-1 flex-1"
                        onClick={() => handleCreateContent(item)}
                      >
                        <Sparkles className="h-3 w-3" /> Créer ce contenu
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
    </CoachingShell>
  );
}
