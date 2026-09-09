import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Lightbulb, PenLine, CalendarDays, Trash2, Copy, X, Sparkles, Plus, Instagram, Linkedin, Mail, Pin, ArrowRight, type LucideIcon } from "lucide-react";
import { ContentPreview } from "@/components/ContentPreview";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { format as fnsFormat } from "date-fns";
import { fr } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { SkeletonCard } from "@/components/ui/skeleton-card";
import { friendlyError } from "@/lib/error-messages";
import { getIdeaState, IDEA_STATE_LABELS, formatLabel, sourceLabel, type IdeaState } from "@/lib/idea-state";
import { AddIdeaDialog } from "@/components/calendar/CalendarIdeasSidebar";
import { buildCalendarPostFromIdea } from "@/lib/idea-to-calendar";

/* ─── Types ─── */
interface SavedIdea {
  id: string;
  titre: string;
  angle: string;
  format: string;
  canal: string;
  objectif: string | null;
  type: string | null;
  status: string | null;
  content_draft: string | null;
  content_data: any | null;
  source_module: string | null;
  personal_elements: any | null;
  accroche_short: string | null;
  accroche_long: string | null;
  format_technique: string | null;
  notes: string | null;
  planned_date: string | null;
  calendar_post_id: string | null;
  created_at: string;
  updated_at: string | null;
}

/* ─── Constants ─── */
const CANAL_OPTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "instagram", label: "Instagram", icon: Instagram },
  { id: "linkedin", label: "LinkedIn", icon: Linkedin },
  { id: "newsletter", label: "Newsletter", icon: Mail },
  { id: "pinterest", label: "Pinterest", icon: Pin },
];

const STATE_TABS: IdeaState[] = ["todo", "in_progress", "created"];

/** Un brief = les réponses déjà saisies dans Créer, reprises telles quelles. */
interface SavedBrief {
  id: string;
  subject: string;
  format: string | null;
  editorial_angle: string | null;
  objective: string | null;
  questions: any;
  answers: any;
  calendar_post_id: string | null;
  created_at: string | null;
}

/* ─── Preview helpers ─── */
function cleanSlideMarkers(text: string): string {
  return text
    .replace(/^SLIDE\s+\d+\s*(?:\[[^\]]*\])?\s*[:\-–]?\s*/gim, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getIdeaPreview(idea: SavedIdea): { title?: string; text?: string } {
  let data: any = idea.content_data;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { data = null; }
  }
  if (data && typeof data === "object") {
    const title = typeof data.chosen_angle?.title === "string" && data.chosen_angle.title.trim()
      ? data.chosen_angle.title.trim()
      : undefined;
    const firstSlide = Array.isArray(data.slides) ? data.slides[0] : null;
    const firstStory = Array.isArray(data.stories) ? data.stories[0] : null;
    const scriptHook = Array.isArray(data.script)
      ? data.script.find((s: any) => s?.section === "hook")?.texte_parle
      : undefined;
    const rawText =
      (typeof data.chosen_angle?.description === "string" && data.chosen_angle.description.trim()) ||
      (firstSlide && (firstSlide.hook || firstSlide.text || firstSlide.titre || firstSlide.title || firstSlide.body || firstSlide.caption || firstSlide.overlay_text)) ||
      (firstStory && (firstStory.text || firstStory.texte || firstStory.hook || firstStory.overlay_text || firstStory.titre)) ||
      scriptHook ||
      (typeof data.hook === "object" ? data.hook?.texte_parle : data.hook) ||
      (typeof data.caption === "object" ? (data.caption?.hook || data.caption?.body || data.caption?.text) : data.caption) ||
      data.body ||
      data.content ||
      data.resume ||
      undefined;
    const cleanText = typeof rawText === "string" && rawText.trim() ? cleanSlideMarkers(rawText) : undefined;
    if (title || cleanText) return { title, text: cleanText };
  }
  if (idea.accroche_short?.trim()) return { text: idea.accroche_short.trim() };
  if (idea.content_draft?.trim() && !idea.content_draft.trim().startsWith("{")) return { text: cleanSlideMarkers(idea.content_draft) };
  return {};
}

/** Titre sans l'emoji de rangement (« 📱 Mon sujet » → « Mon sujet »). */
function cleanTitle(titre: string): string {
  return (titre || "").replace(/^[\p{Extended_Pictographic}️\s]+/u, "").trim() || titre;
}

/** « Série de stories · Instagram · idée du diagnostic » */
function metaLine(idea: SavedIdea): string {
  const canal = CANAL_OPTIONS.find((c) => c.id === (idea.canal || "instagram"))?.label || "Instagram";
  const parts = [formatLabel(idea.format), canal];
  const src = sourceLabel(idea.source_module, idea.format);
  if (src) parts.push(src);
  return parts.join(" · ");
}

function formatDate(iso: string, pattern = "d MMM yyyy"): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : fnsFormat(d, pattern, { locale: fr });
}

export default function IdeasPage() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [ideas, setIdeas] = useState<SavedIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Filtres : l'état (onglet) + le canal (?canal=instagram depuis le hub Instagram)
  const paramState = searchParams.get("etat");
  const [stateTab, setStateTab] = useState<IdeaState>(
    paramState === "in_progress" || paramState === "created" ? paramState : "todo",
  );
  const [canalFilter, setCanalFilter] = useState(searchParams.get("canal") || "all");
  const [addOpen, setAddOpen] = useState(false);

  // Fiche détail
  const [selectedIdea, setSelectedIdea] = useState<SavedIdea | null>(null);
  const [detailNotes, setDetailNotes] = useState("");

  useEffect(() => {
    if (!user || !value) return;
    fetchIdeas();
  }, [user?.id, column, value]);

  const fetchIdeas = async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(false);
    try {
      const { data, error } = await supabase
        .from("saved_ideas" as any)
        .select("*")
        .eq(column, value)
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (data) setIdeas(data as unknown as SavedIdea[]);
    } catch (e) {
      // Échec réseau ≠ liste vide : on le dit, sinon l'écran « rien à faire » ment.
      console.error("[IdeasPage] saved_ideas fetch failed:", e);
      setLoadError(true);
    }
    setLoading(false);
  };

  const counts = useMemo(() => {
    const c: Record<IdeaState, number> = { todo: 0, in_progress: 0, created: 0 };
    for (const idea of ideas) c[getIdeaState(idea)]++;
    return c;
  }, [ideas]);

  const filtered = useMemo(() => {
    let result = ideas.filter((i) => getIdeaState(i) === stateTab);
    if (canalFilter !== "all") result = result.filter((i) => (i.canal || "instagram") === canalFilter);
    // Les plus fraîches d'abord (dernière modification, sinon création).
    result.sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());
    return result;
  }, [ideas, stateTab, canalFilter]);

  const changeTab = (tab: IdeaState) => {
    setStateTab(tab);
    const next = new URLSearchParams(searchParams);
    if (tab === "todo") next.delete("etat"); else next.set("etat", tab);
    setSearchParams(next, { replace: true });
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("saved_ideas").delete().eq("id", id);
    if (error) {
      toast.error("Suppression impossible", { description: friendlyError(error) });
      return;
    }
    setIdeas((prev) => prev.filter((i) => i.id !== id));
    if (selectedIdea?.id === id) setSelectedIdea(null);
    toast.success("Idée supprimée");
  };

  /** Pose l'idée à une date du calendrier. Tout son contenu part avec elle
      (stories, slides, accroche…), reconstruit comme Créer le ferait. */
  const handlePlan = async (idea: SavedIdea, date: Date) => {
    if (!user) return;
    const dateStr = fnsFormat(date, "yyyy-MM-dd");
    const { data: calPost, error } = await supabase
      .from("calendar_posts")
      .insert({
        user_id: user.id,
        workspace_id: workspaceId !== user.id ? workspaceId : undefined,
        date: dateStr,
        ...buildCalendarPostFromIdea(idea),
      } as any)
      .select("id")
      .single();
    if (error) { toast.error("Erreur", { description: friendlyError(error) }); return; }
    const patch = { status: "planned", planned_date: dateStr, calendar_post_id: calPost.id };
    const { error: updateError } = await supabase.from("saved_ideas").update(patch as any).eq("id", idea.id);
    if (updateError) { toast.error("Erreur", { description: friendlyError(updateError) }); return; }
    setIdeas((prev) => prev.map((i) => i.id === idea.id ? { ...i, ...patch } : i));
    setSelectedIdea((prev) => prev && prev.id === idea.id ? { ...prev, ...patch } : prev);
    toast.success(`Posée au calendrier le ${fnsFormat(date, "d MMMM", { locale: fr })}`);
  };

  /** Ouvre Créer avec l'idée en point de départ. Créer garde `idea_id` et
      relie le contenu à l'idée quand il le pose au calendrier. */
  const handleCreate = (idea: SavedIdea) => {
    const params = new URLSearchParams({
      sujet: cleanTitle(idea.titre),
      angle: idea.angle || "",
      format: idea.format || "",
      canal: idea.canal || "instagram",
      objectif: idea.objectif || "",
      idea_id: idea.id,
    });
    navigate(`/creer?${params.toString()}`);
  };

  const handleViewCalendar = (idea: SavedIdea) => {
    const params = new URLSearchParams();
    if (idea.planned_date) params.set("date", idea.planned_date);
    if (idea.calendar_post_id) params.set("post", idea.calendar_post_id);
    const qs = params.toString();
    navigate(`/calendrier${qs ? `?${qs}` : ""}`);
  };

  const handleSaveNotes = async (id: string, notes: string) => {
    const { error } = await supabase.from("saved_ideas").update({ notes } as any).eq("id", id);
    if (error) {
      toast.error("Erreur", { description: friendlyError(error) });
      return;
    }
    setIdeas((prev) => prev.map((i) => i.id === id ? { ...i, notes } : i));
    toast.success("Notes enregistrées");
  };

  const openDetail = (idea: SavedIdea) => {
    setSelectedIdea(idea);
    setDetailNotes(idea.notes || "");
  };

  /** Le bouton d'action d'une carte / de la fiche, selon l'état. */
  const primaryAction = (idea: SavedIdea, full = false) => {
    const state = getIdeaState(idea);
    const cls = `rounded-pill text-xs gap-1.5 ${full ? "w-full" : ""}`;
    if (state === "created") {
      return (
        <Button variant="outline" size="sm" className={cls} onClick={() => handleViewCalendar(idea)}>
          <CalendarDays className="h-3.5 w-3.5" /> Voir au calendrier
        </Button>
      );
    }
    if (state === "in_progress") {
      return (
        <Button variant="outline" size="sm" className={cls} onClick={() => openDetail(idea)}>
          <PenLine className="h-3.5 w-3.5" /> Reprendre
        </Button>
      );
    }
    return (
      <Button size="sm" className={cls} onClick={() => handleCreate(idea)}>
        <Sparkles className="h-3.5 w-3.5" /> Créer ce contenu
      </Button>
    );
  };

  const totalCount = ideas.length;
  const summary = STATE_TABS
    .map((s) => `${counts[s]} ${counts[s] === 1 ? IDEA_STATE_LABELS[s].singular : IDEA_STATE_LABELS[s].plural}`)
    .join(" · ");

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main id="main-content" className="mx-auto max-w-[900px] px-6 py-8 max-md:px-4">
        {/* En-tête */}
        <div className="flex flex-col gap-3 mb-1 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">Mes idées</h1>
            <p className="text-base text-muted-foreground mt-1">Tes points de départ. Une idée devient un contenu, puis elle passe dans « Créées ».</p>
          </div>
          <Button
            onClick={() => setAddOpen(true)}
            className="self-start shrink-0 rounded-pill bg-primary text-primary-foreground hover:bg-bordeaux gap-1.5"
          >
            <Plus className="h-4 w-4" strokeWidth={2} /> Noter une idée
          </Button>
        </div>
        <p className="font-mono-ui text-xs text-muted-foreground mb-4" data-testid="ideas-summary">
          {loading ? "…" : totalCount === 0 ? "Aucune idée pour l'instant" : summary}
        </p>

        {/* Onglets d'état + canal */}
        <div className="sticky top-14 z-30 bg-background py-3 -mx-6 px-6 max-md:-mx-4 max-md:px-4 border-b border-border mb-4">
          <div className="flex gap-1.5 flex-wrap items-center">
            {STATE_TABS.map((s) => (
              <FilterChip key={s} active={stateTab === s} onClick={() => changeTab(s)}>
                {IDEA_STATE_LABELS[s].tab}
                <span className={`ml-1.5 tabular-nums ${stateTab === s ? "text-primary-foreground/80" : "text-muted-foreground/70"}`}>{counts[s]}</span>
              </FilterChip>
            ))}
            <div className="ml-auto flex items-center gap-1">
              <select
                value={canalFilter}
                onChange={(e) => setCanalFilter(e.target.value)}
                aria-label="Filtrer par canal"
                className="text-2xs font-mono-ui bg-card border border-border rounded-lg px-2 py-1 text-muted-foreground"
              >
                <option value="all">Tous les canaux</option>
                {CANAL_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Liste */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} variant="small" />)}
          </div>
        ) : loadError && ideas.length === 0 ? (
          <EmptyState
            title="Impossible de charger tes idées"
            body="Une erreur réseau est survenue. Tes idées n'ont pas été perdues : réessaie dans un instant."
            action={<Button className="rounded-pill" onClick={() => fetchIdeas()}>Réessayer</Button>}
          />
        ) : filtered.length === 0 ? (
          <EmptyTab state={stateTab} filteredByCanal={canalFilter !== "all"} onAdd={() => setAddOpen(true)} onResetCanal={() => setCanalFilter("all")} />
        ) : (
          <ul className="space-y-2.5" data-testid="ideas-list">
            {filtered.map((idea, idx) => {
              const state = getIdeaState(idea);
              const preview = state === "in_progress" ? getIdeaPreview(idea) : {};
              return (
                <li
                  key={idea.id}
                  className={`relative rounded-xl border bg-card px-4 py-3.5 transition-all cursor-pointer animate-fade-in hover:border-rose-medium hover:shadow-sm ${
                    state === "created" ? "border-dashed border-[#E8D3DE] bg-rose-pale/30" : "border-[#F0E4EC]"
                  }`}
                  style={{ animationDelay: `${Math.min(idx, 10) * 0.04}s` }}
                  onClick={() => openDetail(idea)}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1 pr-6 sm:pr-0">
                      <h3 className={`font-body text-[15px] font-bold leading-snug ${state === "created" ? "text-foreground/70" : "text-foreground"}`}>
                        {cleanTitle(idea.titre)}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        {metaLine(idea)}
                        {state === "created" && idea.planned_date && (
                          <> · <span className="text-[#2E7D32]">programmée le {formatDate(idea.planned_date, "d MMM")}</span></>
                        )}
                        {state === "in_progress" && idea.updated_at && (
                          <> · reprise le {formatDate(idea.updated_at, "d MMM")}</>
                        )}
                      </p>
                      {preview.text && (
                        <p className="text-sm text-foreground/70 line-clamp-1 mt-1">{preview.text}</p>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center gap-1 sm:ml-auto" onClick={(e) => e.stopPropagation()}>
                      <div className="w-full sm:w-auto [&>button]:w-full sm:[&>button]:w-auto">{primaryAction(idea)}</div>
                      {/* Supprimer — à côté de l'action sur grand écran */}
                      <div className="hidden sm:block">
                        <DeleteIdeaDialog onConfirm={() => handleDelete(idea.id)}>
                          <Button variant="ghost" size="sm" aria-label="Supprimer cette idée" className="h-7 w-7 p-0 rounded-full text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive">
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </DeleteIdeaDialog>
                      </div>
                    </div>
                  </div>

                  {/* Supprimer — en haut à droite au doigt (le bouton d'action prend toute la largeur) */}
                  <div className="absolute top-2 right-2 sm:hidden" onClick={(e) => e.stopPropagation()}>
                    <DeleteIdeaDialog onConfirm={() => handleDelete(idea.id)}>
                      <Button variant="ghost" size="sm" aria-label="Supprimer cette idée" className="h-7 w-7 p-0 rounded-full text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </DeleteIdeaDialog>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <AddIdeaDialog open={addOpen} onOpenChange={setAddOpen} onAdded={() => { fetchIdeas(); changeTab("todo"); }} />

        {/* Fiche détail */}
        <Dialog open={!!selectedIdea} onOpenChange={(open) => { if (!open) setSelectedIdea(null); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
            {selectedIdea && (() => {
              const state = getIdeaState(selectedIdea);
              const hasContent = !!(selectedIdea.content_data || (selectedIdea.content_draft && selectedIdea.content_draft.trim()));
              const angle = selectedIdea.angle?.trim();
              const showAngle = !!angle && angle !== "libre" && angle !== "brouillon" && !/^(post|reel|story|carousel|newsletter|pinterest|linkedin)/i.test(angle);
              return (
                <>
                  <DialogHeader className="px-6 pt-6 pb-3 space-y-1 pr-12">
                    <DialogTitle className="font-display text-xl md:text-2xl font-bold text-foreground leading-snug text-left">
                      {cleanTitle(selectedIdea.titre)}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground text-left">
                      <span className="inline-flex items-center gap-1.5 rounded-pill bg-rose-pale px-2 py-0.5 text-2xs font-semibold text-primary-text mr-2">
                        {IDEA_STATE_LABELS[state].tab}
                      </span>
                      {metaLine(selectedIdea)}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6 min-w-0">
                    {showAngle && (
                      <p className="text-sm text-muted-foreground">Angle : {angle}</p>
                    )}

                    {(selectedIdea.accroche_short || selectedIdea.accroche_long) && (
                      <section className="space-y-1.5">
                        <p className="font-mono-ui text-2xs uppercase tracking-wider font-semibold text-muted-foreground">Accroche</p>
                        {selectedIdea.accroche_short && <p className="text-sm text-foreground font-semibold">{selectedIdea.accroche_short}</p>}
                        {selectedIdea.accroche_long && <p className="text-sm text-foreground/80 italic">{selectedIdea.accroche_long}</p>}
                      </section>
                    )}

                    {hasContent && selectedIdea.format !== "actu" && (
                      <section className="space-y-1.5 min-w-0">
                        <p className="font-mono-ui text-2xs uppercase tracking-wider font-semibold text-muted-foreground">Ton contenu</p>
                        <div className="rounded-xl bg-rose-pale p-3 max-h-[400px] overflow-y-auto min-w-0">
                          <ContentPreview
                            contentData={selectedIdea.content_data}
                            contentDraft={selectedIdea.content_draft}
                            contentType={selectedIdea.format === "reel" ? "reel" : selectedIdea.format === "story_serie" ? "stories" : undefined}
                            editable
                            onContentChange={async (updatedData) => {
                              const isJson = typeof updatedData === "object";
                              const updatePayload = isJson
                                ? { content_data: updatedData, updated_at: new Date().toISOString() }
                                : { content_draft: updatedData, updated_at: new Date().toISOString() };
                              const { error } = await supabase.from("saved_ideas").update(updatePayload as any).eq("id", selectedIdea.id);
                              if (error) {
                                toast.error("Erreur", { description: friendlyError(error) });
                                return;
                              }
                              const patch = isJson ? { content_data: updatedData } : { content_draft: updatedData };
                              setIdeas((prev) => prev.map((i) => i.id === selectedIdea.id ? { ...i, ...patch } : i));
                              setSelectedIdea((prev) => prev ? { ...prev, ...patch } : null);
                            }}
                          />
                        </div>
                      </section>
                    )}

                    {selectedIdea.format === "actu" && selectedIdea.notes && (
                      <section className="space-y-1.5">
                        <p className="font-mono-ui text-2xs uppercase tracking-wider font-semibold text-muted-foreground">L'actu</p>
                        <p className="text-sm text-foreground/90 whitespace-pre-wrap">{selectedIdea.notes}</p>
                      </section>
                    )}

                    <section className="grid grid-cols-2 gap-y-3 gap-x-8 text-xs text-muted-foreground border-t border-border/60 pt-4">
                      <div>
                        <p className="font-mono-ui text-2xs uppercase tracking-wider font-semibold">Notée le</p>
                        <p className="mt-0.5">{formatDate(selectedIdea.created_at, "d MMMM yyyy")}</p>
                      </div>
                      {selectedIdea.planned_date && (
                        <div>
                          <p className="font-mono-ui text-2xs uppercase tracking-wider font-semibold">Au calendrier le</p>
                          <p className="mt-0.5 text-[#2E7D32]">{formatDate(selectedIdea.planned_date, "d MMMM yyyy")}</p>
                        </div>
                      )}
                    </section>

                    {selectedIdea.format !== "actu" && (
                      <section className="bg-rose-pale/40 border-l-4 border-primary/40 rounded-r-lg p-4">
                        <div className="flex justify-between items-center mb-2">
                          <p className="font-mono-ui text-2xs uppercase tracking-wider font-bold text-primary">Mes notes</p>
                          <button
                            type="button"
                            onClick={() => handleSaveNotes(selectedIdea.id, detailNotes)}
                            className="font-mono-ui text-2xs uppercase tracking-wider font-bold text-primary hover:underline"
                          >
                            Enregistrer
                          </button>
                        </div>
                        <Textarea
                          value={detailNotes}
                          onChange={(e) => setDetailNotes(e.target.value)}
                          placeholder="Une précision, une envie, un souvenir à raconter…"
                          className="bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none p-0 text-sm leading-relaxed text-foreground/90 min-h-[80px] max-h-[200px] overflow-y-auto resize-none"
                        />
                      </section>
                    )}
                  </div>

                  {/* Pied : une action principale selon l'état, le reste en petit */}
                  <div className="px-6 py-4 border-t border-border bg-background flex flex-col gap-3">
                    {state === "created" ? (
                      <Button onClick={() => handleViewCalendar(selectedIdea)} className="rounded-pill gap-2 w-full">
                        <CalendarDays className="h-4 w-4" /> Voir au calendrier
                      </Button>
                    ) : (
                      <Button onClick={() => handleCreate(selectedIdea)} className="rounded-pill gap-2 w-full">
                        <Sparkles className="h-4 w-4" /> {state === "in_progress" ? "Retravailler dans Créer" : "Créer ce contenu"}
                      </Button>
                    )}
                    <div className="flex gap-2 min-w-0">
                      {state !== "created" && (
                        <div className="flex-1 min-w-0">
                          <PlanifierPopover idea={selectedIdea} onPlan={handlePlan} fullWidth />
                        </div>
                      )}
                      {selectedIdea.content_draft?.trim() && !selectedIdea.content_draft.trim().startsWith("{") && (
                        <Button variant="outline" size="sm" className="rounded-pill gap-1 text-xs" onClick={async () => {
                          await navigator.clipboard.writeText(selectedIdea.content_draft!.trim());
                          toast.success("Copié !");
                        }}>
                          <Copy className="h-3 w-3" /> Copier
                        </Button>
                      )}
                      <DeleteIdeaDialog onConfirm={() => handleDelete(selectedIdea.id)}>
                        <Button variant="ghost" size="icon" className="rounded-pill text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-auto" aria-label="Supprimer">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </DeleteIdeaDialog>
                    </div>
                  </div>
                </>
              );
            })()}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

/* ─── Vide, par onglet ─── */
function EmptyTab({ state, filteredByCanal, onAdd, onResetCanal }: { state: IdeaState; filteredByCanal: boolean; onAdd: () => void; onResetCanal: () => void }) {
  if (filteredByCanal) {
    return (
      <EmptyState
        title="Rien pour ce canal"
        body="Aucune idée dans cet état pour le canal choisi."
        action={<Button variant="outline" className="rounded-pill" onClick={onResetCanal}>Voir tous les canaux</Button>}
      />
    );
  }
  if (state === "todo") {
    return (
      <EmptyState
        title="Rien à faire pour l'instant"
        body="Note une idée qui te passe par la tête, ou lance-toi directement dans un contenu."
        action={
          <div className="flex flex-col sm:flex-row gap-2">
            <Button className="rounded-pill gap-1.5" onClick={onAdd}><Plus className="h-4 w-4" /> Noter une idée</Button>
            <Link to="/creer?new=1"><Button variant="outline" className="rounded-pill gap-1.5 w-full"><Sparkles className="h-4 w-4" /> Créer un contenu</Button></Link>
          </div>
        }
      />
    );
  }
  if (state === "in_progress") {
    return (
      <EmptyState
        title="Rien en cours"
        body="Ici tu retrouves les contenus que tu as gardés pour plus tard depuis Créer, avec le bouton « Garder en idée »."
      />
    );
  }
  return (
    <EmptyState
      title="Aucune idée créée pour l'instant"
      body="Quand tu crées un contenu à partir d'une idée et que tu le poses au calendrier, l'idée vient se ranger ici."
      action={<Link to="/calendrier"><Button variant="outline" className="rounded-pill gap-1.5">Voir mon calendrier <ArrowRight className="h-4 w-4" /></Button></Link>}
    />
  );
}

function EmptyState({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
      <Lightbulb className="h-10 w-10 text-muted-foreground/30 mb-3" strokeWidth={1.5} />
      <h2 className="font-display text-lg font-bold text-foreground mb-1">{title}</h2>
      <p className="text-sm text-muted-foreground mb-4 max-w-md">{body}</p>
      {action}
    </div>
  );
}

/* ─── Filter Chip ─── */
function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`font-mono-ui text-2xs font-semibold px-3 py-1.5 rounded-pill transition-all whitespace-nowrap ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-card border border-border text-muted-foreground hover:border-primary/40"
      }`}
    >
      {children}
    </button>
  );
}

/* ─── Suppression (confirmation) ─── */
function DeleteIdeaDialog({ onConfirm, children }: { onConfirm: () => void; children: React.ReactNode }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Supprimer cette idée ?</AlertDialogTitle>
          <AlertDialogDescription>Elle disparaît de ta liste. Un contenu déjà posé au calendrier, lui, reste en place.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Annuler</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Supprimer</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ─── Planifier Popover ─── */
function PlanifierPopover({ idea, onPlan, fullWidth }: { idea: SavedIdea; onPlan: (idea: SavedIdea, date: Date) => void; fullWidth?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={`rounded-pill text-xs gap-1 ${fullWidth ? "w-full" : ""}`} onClick={(e) => e.stopPropagation()}>
          <CalendarDays className="h-3 w-3" /> Poser au calendrier
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" onClick={(e) => e.stopPropagation()}>
        <Calendar
          mode="single"
          onSelect={(date) => { if (date) { onPlan(idea, date); setOpen(false); } }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}
