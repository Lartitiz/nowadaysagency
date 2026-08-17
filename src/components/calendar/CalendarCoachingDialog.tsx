import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import CoachingShell from "@/components/coaching/CoachingShell";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Loader2, ArrowRight, CalendarPlus, Sparkles, ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { toast } from "sonner";
import { toLocalDateStr } from "@/lib/utils";
import { friendlyError } from "@/lib/error-messages";
import { normalizeObjectif } from "@/lib/chat-plan";
import { dropAlreadyPlanned, duplicateMessage } from "@/lib/calendar-duplicates";

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
  existingPosts?: { date: string; theme: string; format: string; canal: string; objectif: string | null }[];
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

const WEEK_DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

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

export default function CalendarCoachingDialog({ open, onOpenChange, onPostAdded, existingPosts }: CalendarCoachingDialogProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const workspaceId = useWorkspaceId();
  const hasExisting = existingPosts && existingPosts.length > 0;
  const [step, setStep] = useState(hasExisting ? 0 : 1);
  const [mode, setMode] = useState<"complete" | "full">(hasExisting ? "complete" : "full");
  const [postsPerWeek, setPostsPerWeek] = useState<number | null>(null);
  const [contextWeek, setContextWeek] = useState("");
  const [mixOrFocus, setMixOrFocus] = useState<"mix" | "focus" | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<CoachingResult | null>(null);
  const [addedItems, setAddedItems] = useState<Set<number>>(new Set());
  /** Jour choisi à la main pour une carte (index → "Mardi"), avant l'ajout */
  const [dayOverrides, setDayOverrides] = useState<Record<number, string>>({});
  const [addingAll, setAddingAll] = useState(false);

  // Reset when opening
  useEffect(() => {
    if (open) {
      const has = existingPosts && existingPosts.length > 0;
      setStep(has ? 0 : 1);
      setMode(has ? "complete" : "full");
      setPostsPerWeek(null);
      setContextWeek("");
      setMixOrFocus(null);
      setLoading(false);
      setResult(null);
      setAddedItems(new Set());
      setDayOverrides({});
      setAddingAll(false);
    }
  }, [open, existingPosts]);

  const reset = () => {
    const has = existingPosts && existingPosts.length > 0;
    setStep(has ? 0 : 1);
    setMode(has ? "complete" : "full");
    setPostsPerWeek(null);
    setContextWeek("");
    setMixOrFocus(null);
    setLoading(false);
    setResult(null);
    setAddedItems(new Set());
    setDayOverrides({});
    setAddingAll(false);
  };

  const handleGenerate = async () => {
    if (!user || !postsPerWeek || !mixOrFocus) return;
    setLoading(true);
    try {
      const { data, error } = await invokeWithTimeout("calendar-coaching", {
        body: {
          posts_per_week: postsPerWeek,
          context_week: contextWeek,
          mix_or_focus: mixOrFocus,
          mode,
          existing_posts: mode === "complete" ? existingPosts : undefined,
          workspace_id: workspaceId !== user?.id ? workspaceId : undefined,
        },
      }, 120000);
      if (error) throw error;
      if (data?.error) throw new Error(data.message || data.error);
      setResult(data);
    } catch (e: any) {
      if (e?.isTimeout) { toast.error("Le coaching prend plus de temps que prévu. Réessaie."); }
      else toast.error(friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  /** Jour effectif d'une carte : celui choisi par l'utilisatrice, sinon celui de l'IA. */
  const dayOf = (item: PlanningItem, index: number) => dayOverrides[index] || item.day;

  const handleAddToCalendar = async (item: PlanningItem, index: number): Promise<boolean> => {
    if (!user) return false;
    const day = dayOf(item, index);
    try {
      const date = getNextDayDate(day);
      // Déjà prévu ce jour-là ? On coche la carte au lieu d'empiler un 2ᵉ exemplaire.
      const { duplicates } = await dropAlreadyPlanned(
        [{ date, theme: item.subject, canal: "instagram" }],
        { userId: user.id, workspaceId },
      );
      if (duplicates.length > 0) {
        setAddedItems((prev) => new Set(prev).add(index));
        toast(duplicateMessage(1, 1));
        return true;
      }
      const { error: insertError } = await supabase.from("calendar_posts").insert({
        user_id: user.id,
        workspace_id: workspaceId !== user.id ? workspaceId : undefined,
        date,
        theme: item.subject,
        format: item.format === "carousel" ? "post_carrousel" : item.format === "story" || item.format === "story_serie" ? "story_serie" : item.format,
        canal: "instagram",
        status: "a_rediger",
        objectif: normalizeObjectif(item.objective),
        accroche: item.hook_idea,
        notes: `Pilier : ${item.pillar}`,
      } as any);
      if (insertError) throw insertError;
      setAddedItems(prev => new Set(prev).add(index));
      toast.success(`📅 "${item.subject}" ajouté au ${day.toLowerCase()}`);
      onPostAdded?.();
      return true;
    } catch (e: any) {
      toast.error("Erreur lors de l'ajout");
      return false;
    }
  };

  /** Poser toute la semaine d'un coup : les cartes déjà ajoutées sont ignorées. */
  const handleAddAll = async () => {
    if (!result) return;
    const pending = result.planning
      .map((item, i) => ({ item, i }))
      .filter(({ i }) => !addedItems.has(i));
    if (pending.length === 0) return;
    setAddingAll(true);
    let ok = 0;
    for (const { item, i } of pending) {
      if (await handleAddToCalendar(item, i)) ok++;
    }
    setAddingAll(false);
    if (ok === pending.length) toast.success(`📅 Ta semaine est posée : ${ok} contenu${ok > 1 ? "s" : ""}`);
    else if (ok > 0) toast.warning(`${ok} sur ${pending.length} ajoutés. Réessaie pour le reste.`);
  };

  const pendingCount = result ? result.planning.filter((_, i) => !addedItems.has(i)).length : 0;


  /**
   * Créer un contenu ne doit pas faire perdre le reste de la semaine : on pose
   * d'abord l'idée au calendrier, puis on part dans le générateur.
   */
  const handleCreateContent = async (item: PlanningItem, index: number) => {
    if (!addedItems.has(index)) {
      const ok = await handleAddToCalendar(item, index);
      if (!ok) return;
    }
    const route = FORMAT_ROUTES[item.format] || "/creer";
    onOpenChange(false);
    const formatParam = item.format === "newsletter" ? "&format=newsletter" : "";
    navigate(`${route}?subject=${encodeURIComponent(item.subject)}&objective=${encodeURIComponent(normalizeObjectif(item.objective) || item.objective)}${formatParam}`);
  };


  return (
    <CoachingShell
      open={open}
      onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}
      title="Planifier ma semaine"
      description="Coaching pour planifier ta semaine de contenu"
      emoji="📅"
    >
        {/* Step 0: Mode selection */}
        {!loading && !result && step === 0 && (
          <div className="space-y-4 animate-fade-in">
            <p className="text-sm font-medium text-foreground">Qu'est-ce que tu veux faire ?</p>
            <div className="space-y-2">
              <button
                onClick={() => { setMode("complete"); setStep(1); }}
                className="w-full text-left rounded-xl border-2 border-border bg-card hover:border-primary/40 p-4 transition-all"
              >
                <p className="text-sm font-semibold text-foreground">✨ Complète ma semaine</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  J'ai déjà {existingPosts?.length || 0} post(s) de prévu.
                  Suggère-moi des compléments qui s'articulent avec.
                </p>
              </button>
              <button
                onClick={() => { setMode("full"); setStep(1); }}
                className="w-full text-left rounded-xl border-2 border-border bg-card hover:border-primary/40 p-4 transition-all"
              >
                <p className="text-sm font-semibold text-foreground">📅 Planifie toute ma semaine</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  L'IA propose un planning complet de zéro.
                </p>
              </button>
            </div>
          </div>
        )}

        {/* Step 1: Posts per week */}
        {!loading && !result && step === 1 && (
          <div className="space-y-4 animate-fade-in">
            <p className="text-sm font-medium text-foreground">
              {mode === "complete"
                ? "Combien de posts tu veux AJOUTER cette semaine ?"
                : "Combien de posts tu veux publier cette semaine ?"}
            </p>
            {mode === "complete" && hasExisting && (
              <div className="rounded-lg bg-muted/40 border border-border p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Tu as déjà {existingPosts!.length} post(s) de prévu :</p>
                {existingPosts!.slice(0, 5).map((p, i) => (
                  <p key={i}>• {p.date} — {p.theme.slice(0, 50)}{p.theme.length > 50 ? "…" : ""}</p>
                ))}
                {existingPosts!.length > 5 && <p>… et {existingPosts!.length - 5} autre(s)</p>}
              </div>
            )}
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
                <Sparkles className="h-4 w-4" /> {mode === "complete" ? "Compléter ma semaine" : "Planifier ma semaine"}
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

            {/* Récap de la semaine : elle se remplit au fur et à mesure des ajouts */}
            <div className="rounded-xl border border-border bg-card p-3">
              <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Ma semaine</p>
              <div className="grid grid-cols-7 gap-1.5">
                {WEEK_DAYS.map((day) => {
                  const posed = result.planning
                    .map((item, i) => ({ item, i }))
                    .filter(({ item, i }) => addedItems.has(i) && dayOf(item, i) === day);
                  return (
                    <div key={day} className="text-center">
                      <p className="text-2xs text-muted-foreground mb-1">{day.slice(0, 3)}</p>
                      <div
                        className={`rounded-lg h-9 flex items-center justify-center text-xs transition-colors ${
                          posed.length > 0 ? "bg-[hsl(var(--rose-pale))] border border-primary/30" : "bg-muted/40 border border-transparent"
                        }`}
                      >
                        {posed.length > 0
                          ? posed.map(({ item }) => FORMAT_ICONS[item.format] || "📝").join("")
                          : <span className="text-muted-foreground/50">·</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Planning cards */}
            <div className="space-y-3">
              {result.planning.map((item, i) => {
                const isAdded = addedItems.has(i);
                const day = dayOf(item, i);
                return (
                  <div key={i} className={`rounded-xl border p-4 space-y-2 transition-all ${isAdded ? "border-success/30 bg-success-bg/50" : "border-border bg-card"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {isAdded ? (
                          <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-pill">{day}</span>
                        ) : (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                aria-label={`Changer le jour (actuellement ${day})`}
                                className="text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 px-2 py-0.5 rounded-pill inline-flex items-center gap-1 transition-colors"
                              >
                                {day} <ChevronDown className="h-3 w-3" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-36 p-1.5" align="start">
                              {WEEK_DAYS.map((d) => (
                                <button
                                  key={d}
                                  type="button"
                                  onClick={() => setDayOverrides((prev) => ({ ...prev, [i]: d }))}
                                  className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted/60 transition-colors ${
                                    d === day ? "font-semibold text-primary" : "text-foreground"
                                  }`}
                                >
                                  {d}
                                </button>
                              ))}
                            </PopoverContent>
                          </Popover>
                        )}
                        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-pill">{item.pillar}</span>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
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
                        disabled={isAdded || loading || addingAll}
                        onClick={() => handleAddToCalendar(item, i)}
                      >
                        {isAdded ? "✅ Posé" : <><CalendarPlus className="h-3 w-3" /> Ajouter à ma semaine</>}
                      </Button>
                      <Button
                        size="sm"
                        variant={isAdded ? "default" : "secondary"}
                        className="text-xs gap-1 flex-1"
                        disabled={addingAll}
                        onClick={() => handleCreateContent(item, i)}
                      >
                        <Sparkles className="h-3 w-3" /> Créer ce contenu
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Poser toute la semaine d'un coup */}
            {pendingCount > 1 && (
              <Button className="w-full gap-2" disabled={addingAll} onClick={handleAddAll}>
                {addingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarPlus className="h-4 w-4" />}
                Tout ajouter à ma semaine ({pendingCount})
              </Button>
            )}

            {/* Fin de parcours : on sort quand la semaine est posée */}
            {addedItems.size > 0 && (
              <div className="flex items-center justify-between gap-3 flex-wrap border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  ✅ {addedItems.size} contenu{addedItems.size > 1 ? "s" : ""} posé{addedItems.size > 1 ? "s" : ""} cette semaine
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" className="text-xs" onClick={() => { reset(); onOpenChange(false); }}>
                    Fermer
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs gap-1"
                    onClick={() => { onOpenChange(false); navigate("/calendrier"); }}
                  >
                    Voir mon calendrier <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}
          </div>

        )}
    </CoachingShell>
  );
}
