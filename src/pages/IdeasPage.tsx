import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Lightbulb, PenLine, CalendarDays, Trash2, Copy, ChevronDown, X, ExternalLink, Sparkles, SlidersHorizontal } from "lucide-react";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { ContentPreview, RevertToOriginalButton } from "@/components/ContentPreview";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { format as fnsFormat } from "date-fns";
import { fr } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { SkeletonCard } from "@/components/ui/skeleton-card";

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
const STATUS_OPTIONS = [
  { id: "to_explore", label: "💭 À creuser", bg: "bg-[#F0E4EC]", text: "text-[#6B5E7B]" },
  { id: "drafting", label: "✏️ En rédaction", bg: "bg-accent", text: "text-accent-foreground" },
  { id: "ready", label: "✅ Prête", bg: "bg-primary", text: "text-primary-foreground" },
  { id: "planned", label: "📅 Planifiée", bg: "bg-cal-published", text: "text-[#2E7D32]" },
  { id: "published", label: "✔️ Publiée", bg: "bg-foreground", text: "text-background" },
];

const OBJECTIF_OPTIONS = [
  { id: "visibilite", label: "🔍 Visibilité", bg: "bg-[#EDE9FE]", text: "text-[#7C3AED]" },
  { id: "confiance", label: "💛 Confiance", bg: "bg-[#FFF9DB]", text: "text-[#92400E]" },
  { id: "vente", label: "🛒 Vente", bg: "bg-rose-pale", text: "text-primary" },
  { id: "credibilite", label: "🎓 Crédibilité", bg: "bg-[#F0E4EC]", text: "text-[#6B5E7B]" },
];

const CANAL_OPTIONS = [
  { id: "instagram", label: "📱 Instagram", enabled: true },
  { id: "linkedin", label: "💼 LinkedIn", enabled: true },
  { id: "newsletter", label: "✉️ Newsletter", enabled: true },
  { id: "pinterest", label: "📌 Pinterest", enabled: true },
];

const TYPE_OPTIONS = [
  { id: "idea", label: "💡 Idée" },
  { id: "draft", label: "✏️ Brouillon" },
  { id: "hook", label: "🎣 Accroche" },
  { id: "brief", label: "📋 Brief créatif" },
];

const SORT_OPTIONS = [
  { id: "newest", label: "Plus récentes" },
  { id: "oldest", label: "Plus anciennes" },
  { id: "by_objectif", label: "Par objectif" },
  { id: "by_status", label: "Par statut" },
];

/* ─── Preview helpers ─── */
function cleanSlideMarkers(text: string): string {
  return text
    .replace(/^SLIDE\s+\d+\s*(?:\[[^\]]*\])?\s*[:\-–]?\s*/gim, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getIdeaPreview(idea: SavedIdea): { title?: string; text?: string } {
  // a. content_data (objet ou string JSON)
  let data: any = idea.content_data;
  if (typeof data === "string") {
    try { data = JSON.parse(data); } catch { data = null; }
  }
  if (data && typeof data === "object") {
    const title = typeof data.chosen_angle?.title === "string" && data.chosen_angle.title.trim()
      ? data.chosen_angle.title.trim()
      : undefined;
    const firstSlide = Array.isArray(data.slides) ? data.slides[0] : null;
    const scriptHook = Array.isArray(data.script)
      ? data.script.find((s: any) => s?.section === "hook")?.texte_parle
      : undefined;
    const rawText =
      (typeof data.chosen_angle?.description === "string" && data.chosen_angle.description.trim()) ||
      (firstSlide && (firstSlide.hook || firstSlide.text || firstSlide.titre || firstSlide.title || firstSlide.body || firstSlide.caption || firstSlide.overlay_text)) ||
      scriptHook ||
      (typeof data.hook === "object" ? data.hook?.texte_parle : data.hook) ||
      (typeof data.caption === "object" ? (data.caption?.hook || data.caption?.body || data.caption?.text) : data.caption) ||
      data.body ||
      data.content ||
      undefined;
    const cleanText = typeof rawText === "string" && rawText.trim() ? cleanSlideMarkers(rawText) : undefined;
    if (title || cleanText) return { title, text: cleanText };
    // content_data inexploitable → on continue vers les fallbacks
  }
  // b. accroche_short
  if (idea.accroche_short?.trim()) return { text: `🎣 ${idea.accroche_short.trim()}` };
  // c. content_draft nettoyé
  if (idea.content_draft?.trim()) return { text: cleanSlideMarkers(idea.content_draft) };
  return {};
}


export default function IdeasPage({ embedded = false }: { embedded?: boolean }) {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [ideas, setIdeas] = useState<SavedIdea[]>([]);
  const [briefs, setBriefs] = useState<SavedIdea[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [objectifFilter, setObjectifFilter] = useState("all");
  const [canalFilter, setCanalFilter] = useState(searchParams.get("canal") || "all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeAdvancedCount = (objectifFilter !== "all" ? 1 : 0) + (canalFilter !== "all" ? 1 : 0) + (typeFilter !== "all" ? 1 : 0);

  // Detail panel
  const [selectedIdea, setSelectedIdea] = useState<SavedIdea | null>(null);
  const [detailNotes, setDetailNotes] = useState("");

  useEffect(() => {
    if (!user || !value) return;
    fetchIdeas();
  }, [user?.id, column, value]);

  const fetchIdeas = async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("saved_ideas" as any)
      .select("*")
      .eq(column, value)
      .order("created_at", { ascending: false });
    if (!error && data) setIdeas(data as unknown as SavedIdea[]);

    // Charger les briefs créatifs
    const { data: briefsData } = await supabase
      .from("content_briefs" as any)
      .select("*")
      .eq(column, value)
      .order("created_at", { ascending: false });
    if (briefsData) {
      const briefsAsIdeas: SavedIdea[] = (briefsData as any[]).map((b: any) => ({
        id: b.id,
        titre: `📋 ${b.subject}`,
        angle: b.editorial_angle || "libre",
        format: b.format || "post",
        canal: b.format === "linkedin" ? "linkedin" : b.format === "newsletter" ? "newsletter" : "instagram",
        objectif: b.objective || null,
        type: "brief",
        status: b.calendar_post_id ? "planned" : "to_explore",
        content_draft: Object.entries(b.answers || {})
          .filter(([, v]) => v && (v as string).trim())
          .map(([k, v]) => `Q: ${k}\nR: ${v}`)
          .join("\n\n"),
        content_data: { questions: b.questions, answers: b.answers },
        source_module: "creer",
        personal_elements: b.answers,
        accroche_short: null,
        accroche_long: null,
        format_technique: null,
        notes: null,
        planned_date: null,
        calendar_post_id: b.calendar_post_id || null,
        created_at: b.created_at,
        updated_at: null,
      }));
      setBriefs(briefsAsIdeas);
    }

    setLoading(false);
  };

  const filtered = useMemo(() => {
    let result = [...ideas, ...briefs];
    if (statusFilter !== "all") result = result.filter((i) => (i.status || "to_explore") === statusFilter);
    if (objectifFilter !== "all") result = result.filter((i) => i.objectif === objectifFilter);
    if (canalFilter !== "all") result = result.filter((i) => i.canal === canalFilter);
    if (typeFilter !== "all") result = result.filter((i) => (i.type || "idea") === typeFilter);

    switch (sort) {
      case "oldest": result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()); break;
      case "by_objectif": result.sort((a, b) => (a.objectif || "").localeCompare(b.objectif || "")); break;
      case "by_status": result.sort((a, b) => (a.status || "").localeCompare(b.status || "")); break;
      default: result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return result;
  }, [ideas, briefs, statusFilter, objectifFilter, canalFilter, typeFilter, sort]);

  const handleDelete = async (id: string) => {
    const isBrief = briefs.some(b => b.id === id);
    if (isBrief) {
      await supabase.from("content_briefs").delete().eq("id", id);
      setBriefs(prev => prev.filter(b => b.id !== id));
    } else {
      await supabase.from("saved_ideas").delete().eq("id", id);
      setIdeas(prev => prev.filter(i => i.id !== id));
    }
    if (selectedIdea?.id === id) setSelectedIdea(null);
    toast({ title: isBrief ? "Brief supprimé" : "Idée supprimée" });
  };

  const handleStatusChange = async (id: string, newStatus: string) => {
    const isBrief = briefs.some(b => b.id === id);
    if (isBrief) {
      setBriefs(prev => prev.map(b => b.id === id ? { ...b, status: newStatus } : b));
    } else {
      await supabase.from("saved_ideas").update({ status: newStatus } as any).eq("id", id);
      setIdeas(prev => prev.map(i => i.id === id ? { ...i, status: newStatus } : i));
    }
    if (selectedIdea?.id === id) setSelectedIdea(prev => prev ? { ...prev, status: newStatus } : null);
  };

  const handlePlan = async (idea: SavedIdea, date: Date) => {
    if (!user) return;
    const isBrief = briefs.some(b => b.id === idea.id);
    const dateStr = fnsFormat(date, "yyyy-MM-dd");
    const { data: calPost, error } = await supabase
      .from("calendar_posts")
      .insert({
        user_id: user.id,
        workspace_id: workspaceId !== user.id ? workspaceId : undefined,
        theme: idea.titre,
        angle: idea.angle,
        canal: idea.canal || "instagram",
        objectif: idea.objectif,
        date: dateStr,
        status: "idea",
      })
      .select("id")
      .single();
    if (error) { toast({ title: "Erreur", description: error.message, variant: "destructive" }); return; }
    if (!isBrief) {
      await supabase.from("saved_ideas").update({ status: "planned", planned_date: dateStr, calendar_post_id: calPost.id } as any).eq("id", idea.id);
      setIdeas(prev => prev.map(i => i.id === idea.id ? { ...i, status: "planned", planned_date: dateStr, calendar_post_id: calPost.id } : i));
    } else {
      await supabase.from("content_briefs").update({ calendar_post_id: calPost.id } as any).eq("id", idea.id);
      setBriefs(prev => prev.map(b => b.id === idea.id ? { ...b, status: "planned", calendar_post_id: calPost.id } : b));
    }
    toast({ title: `Planifiée le ${fnsFormat(date, "d MMM yyyy", { locale: fr })}` });
  };

  const handleRediger = (idea: SavedIdea) => {
    // Navigate to /creer with sujet+angle pré-remplis pour aller direct aux questions
    const params = new URLSearchParams({ sujet: idea.titre, angle: idea.angle, format: idea.format, canal: idea.canal, objectif: idea.objectif || "", idea_id: idea.id });
    navigate(`/creer?${params.toString()}`);
  };

  const handleSaveNotes = async (id: string, notes: string) => {
    const isBrief = briefs.some(b => b.id === id);
    if (isBrief) {
      setBriefs(prev => prev.map(b => b.id === id ? { ...b, notes } : b));
    } else {
      await supabase.from("saved_ideas").update({ notes } as any).eq("id", id);
      setIdeas(prev => prev.map(i => i.id === id ? { ...i, notes } : i));
    }
    toast({ title: "Notes sauvegardées" });
  };

  const getStatusBadge = (status: string | null) => {
    const s = STATUS_OPTIONS.find((o) => o.id === (status || "to_explore"));
    if (!s) return null;
    return s;
  };

  const getObjectifBadge = (objectif: string | null) => {
    if (!objectif) return null;
    return OBJECTIF_OPTIONS.find((o) => o.id === objectif);
  };

  const mainContent = (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="font-display text-[22px] sm:text-[26px] font-bold text-foreground">Ma boîte à idées</h1>
          <p className="text-[15px] text-muted-foreground mt-1">Tout ce que tu as généré, sauvegardé, commencé. Rien ne se perd.</p>
        </div>
        <Link to="/creer">
          <Button className="rounded-pill bg-primary text-primary-foreground hover:bg-bordeaux shrink-0">
            💡 Nouvelle idée
          </Button>
        </Link>
      </div>
        <p className="font-mono-ui text-[12px] text-muted-foreground mb-4">{filtered.length} idée{filtered.length !== 1 ? "s" : ""}{statusFilter !== "all" || objectifFilter !== "all" || canalFilter !== "all" || typeFilter !== "all" ? " filtrées" : " au total"}</p>

        {/* Filters */}
        <div className="sticky top-14 z-30 bg-background py-3 -mx-6 px-6 max-md:-mx-4 max-md:px-4 border-b border-border mb-4 space-y-2">
          {/* Status (always visible) + sort + Filtres toggle */}
          <div className="flex gap-1.5 flex-wrap items-center">
            <FilterChip active={statusFilter === "all"} onClick={() => setStatusFilter("all")}>Tout</FilterChip>
            {STATUS_OPTIONS.map((s) => (
              <FilterChip key={s.id} active={statusFilter === s.id} onClick={() => setStatusFilter(s.id)}>{s.label}</FilterChip>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <select value={sort} onChange={(e) => setSort(e.target.value)}
                className="text-[11px] font-mono-ui bg-card border border-border rounded-lg px-2 py-1 text-muted-foreground">
                {SORT_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <button
                type="button"
                onClick={() => setFiltersOpen((v) => !v)}
                className={`inline-flex items-center gap-1.5 text-[11px] font-mono-ui rounded-lg border px-2 py-1 transition-colors ${
                  activeAdvancedCount > 0 || filtersOpen
                    ? "bg-foreground text-background border-foreground"
                    : "bg-card text-muted-foreground border-border hover:text-foreground"
                }`}
                aria-expanded={filtersOpen}
              >
                <SlidersHorizontal className="h-3 w-3" />
                {activeAdvancedCount > 0 ? `Filtres · ${activeAdvancedCount}` : "Filtres"}
              </button>
            </div>
          </div>

          <Collapsible open={filtersOpen}>
            <CollapsibleContent className="space-y-2 pt-2 overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
              <div className="flex gap-1.5 flex-wrap items-center">
                <span className="text-[11px] text-muted-foreground font-mono-ui mr-1">Objectif:</span>
                <FilterChip active={objectifFilter === "all"} onClick={() => setObjectifFilter("all")}>Tout</FilterChip>
                {OBJECTIF_OPTIONS.map((o) => (
                  <FilterChip key={o.id} active={objectifFilter === o.id} onClick={() => setObjectifFilter(o.id)}>{o.label}</FilterChip>
                ))}
              </div>
              <div className="flex gap-1.5 flex-wrap items-center">
                <span className="text-[11px] text-muted-foreground font-mono-ui mr-1">Canal:</span>
                <FilterChip active={canalFilter === "all"} onClick={() => setCanalFilter("all")}>Tout</FilterChip>
                {CANAL_OPTIONS.map((c) => (
                  <FilterChip key={c.id} active={canalFilter === c.id} onClick={() => c.enabled && setCanalFilter(c.id)} disabled={!c.enabled}>
                    {c.label}{!c.enabled && " (V2)"}
                  </FilterChip>
                ))}
              </div>
              <div className="flex gap-1.5 flex-wrap items-center">
                <span className="text-[11px] text-muted-foreground font-mono-ui mr-1">Type:</span>
                <FilterChip active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>Tout</FilterChip>
                {TYPE_OPTIONS.map((t) => (
                  <FilterChip key={t.id} active={typeFilter === t.id} onClick={() => setTypeFilter(t.id)}>{t.label}</FilterChip>
                ))}
                {activeAdvancedCount > 0 && (
                  <button
                    type="button"
                    onClick={() => { setObjectifFilter("all"); setCanalFilter("all"); setTypeFilter("all"); }}
                    className="ml-auto text-[11px] font-mono-ui text-muted-foreground hover:text-foreground underline underline-offset-2"
                  >
                    Réinitialiser
                  </button>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>


        {/* Ideas list */}
        {loading ? (
          <div className="space-y-3">
            <SkeletonCard variant="small" />
            <SkeletonCard variant="small" />
            <SkeletonCard variant="small" />
            <SkeletonCard variant="small" />
            <SkeletonCard variant="small" />
            <SkeletonCard variant="small" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
            <Lightbulb className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <h2 className="font-display text-lg font-bold text-foreground mb-1">
              {ideas.length === 0 ? "Ta boîte à idées est vide" : "Aucune idée ne correspond"}
            </h2>
            <p className="text-sm text-muted-foreground mb-4">
              {ideas.length === 0 ? "Commence par générer des idées dans l'atelier. Elles atterriront ici automatiquement." : "Essaie de modifier tes filtres."}
            </p>
            {ideas.length === 0 && (
              <Link to="/creer">
                <Button className="rounded-pill">💡 Aller à l'atelier →</Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((idea, idx) => {
              const statusBadge = getStatusBadge(idea.status);
              const objBadge = getObjectifBadge(idea.objectif);
              return (
                <div
                  key={idea.id}
                  className="relative rounded-xl border border-[#F0E4EC] bg-card p-4 hover:shadow-md hover:border-rose-medium transition-all cursor-pointer animate-fade-in"
                  style={{ animationDelay: `${idx * 0.05}s` }}
                  onClick={() => { setSelectedIdea(idea); setDetailNotes(idea.notes || ""); }}
                >
                  {/* Delete button — top right */}
                  <div className="absolute top-2 right-2" onClick={(e) => e.stopPropagation()}>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full hover:bg-destructive/10 hover:text-destructive">
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer cette idée ?</AlertDialogTitle>
                          <AlertDialogDescription>Tu veux vraiment supprimer cette idée ? Cette action est irréversible.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(idea.id)}>Supprimer</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  {/* Badges */}
                  <div className="flex gap-1.5 flex-wrap mb-2">
                    {statusBadge && (
                      idea.type === "brief" ? (
                        <span className={`font-mono-ui text-[10px] font-semibold px-2 py-0.5 rounded-pill ${statusBadge.bg} ${statusBadge.text}`}>
                          {statusBadge.label}
                        </span>
                      ) : (
                        <StatusDropdown ideaId={idea.id} current={idea.status || "to_explore"} onSelect={handleStatusChange}>
                          <span className={`font-mono-ui text-[10px] font-semibold px-2 py-0.5 rounded-pill cursor-pointer ${statusBadge.bg} ${statusBadge.text}`}>
                            {statusBadge.label}
                          </span>
                        </StatusDropdown>
                      )
                    )}
                    {objBadge && (
                      <span className={`font-mono-ui text-[10px] font-semibold px-2 py-0.5 rounded-pill ${objBadge.bg} ${objBadge.text}`}>
                        {objBadge.label}
                      </span>
                    )}
                    <span className="font-mono-ui text-[10px] font-semibold px-2 py-0.5 rounded-pill bg-primary text-primary-foreground">
                      📱 {idea.canal || "Instagram"}
                    </span>
                    {idea.type === "brief" && (
                      <span className="font-mono-ui text-[10px] font-semibold px-2 py-0.5 rounded-pill bg-accent text-accent-foreground">
                        📋 Brief créatif
                      </span>
                    )}
                  </div>

                  {/* Title */}
                  <h3 className="font-display text-base font-bold text-foreground mb-1">{idea.titre}</h3>
                  {idea.angle?.trim() && <p className="text-[13px] text-muted-foreground">Angle : {idea.angle}</p>}
                  {idea.format?.trim() && <p className="text-[13px] text-muted-foreground">Format : {idea.format}</p>}

                  {/* Preview (scannable, 2 lignes max) */}
                  {(() => {
                    const preview = getIdeaPreview(idea);
                    if (!preview.title && !preview.text) return null;
                    return (
                      <div className="mt-2 space-y-0.5">
                        {preview.title && <p className="font-semibold text-[13px] text-foreground line-clamp-1">{preview.title}</p>}
                        {preview.text && <p className="text-[13px] text-foreground/70 line-clamp-2">{preview.text}</p>}
                      </div>
                    );
                  })()}


                  {/* Date + planned */}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="font-mono-ui text-[11px] text-muted-foreground">
                      Créée le {fnsFormat(new Date(idea.created_at), "d MMM yyyy", { locale: fr })}
                    </span>
                    {idea.planned_date && (
                      <span className="font-mono-ui text-[11px] text-[#2E7D32]">
                        📅 {fnsFormat(new Date(idea.planned_date), "d MMM yyyy", { locale: fr })}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-3 flex-wrap" onClick={(e) => e.stopPropagation()}>
                    {idea.type === "brief" ? (
                      <Button
                        variant="default"
                        size="sm"
                        className="rounded-pill text-xs gap-1.5 w-full"
                        onClick={() => navigate(`/creer?sujet=${encodeURIComponent(idea.titre.replace("📋 ", ""))}&objectif=${idea.objectif || ""}`)}
                      >
                        <Sparkles className="h-3.5 w-3.5" /> Créer à partir de ce brief
                      </Button>
                    ) : (
                      <>
                        <Button variant="outline" size="sm" className="rounded-pill text-xs gap-1" onClick={() => handleRediger(idea)}>
                          <PenLine className="h-3 w-3" /> Rédiger
                        </Button>
                        <PlanifierPopover idea={idea} onPlan={handlePlan} />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="outline" size="sm" className="rounded-pill text-xs gap-1 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-3 w-3" /> Supprimer
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Supprimer cette idée ?</AlertDialogTitle>
                              <AlertDialogDescription>Tu veux vraiment supprimer cette idée ? Cette action est irréversible.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annuler</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(idea.id)}>Supprimer</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Detail Sheet */}
        <Dialog open={!!selectedIdea} onOpenChange={(open) => { if (!open) setSelectedIdea(null); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
            {selectedIdea && (
              <>
                <DialogHeader className="px-6 pt-6 pb-4 space-y-0">
                  <DialogTitle className="sr-only">Détail de l'idée sauvegardée</DialogTitle>
                  <DialogDescription className="sr-only">Détails de l'idée sauvegardée</DialogDescription>
                  <div className="flex gap-1.5 flex-wrap pr-8">
                    {getStatusBadge(selectedIdea.status) && (() => {
                      const sb = getStatusBadge(selectedIdea.status)!;
                      return selectedIdea.type === "brief" ? (
                        <span className={`font-mono-ui text-[10px] font-semibold px-2 py-0.5 rounded-pill ${sb.bg} ${sb.text}`}>{sb.label}</span>
                      ) : (
                        <StatusDropdown ideaId={selectedIdea.id} current={selectedIdea.status || "to_explore"} onSelect={(id, s) => { handleStatusChange(id, s); setSelectedIdea((prev) => prev ? { ...prev, status: s } : null); }}>
                          <span className={`font-mono-ui text-[10px] font-semibold px-2 py-0.5 rounded-pill cursor-pointer ${sb.bg} ${sb.text}`}>{sb.label}</span>
                        </StatusDropdown>
                      );
                    })()}
                    {getObjectifBadge(selectedIdea.objectif) && (() => {
                      const ob = getObjectifBadge(selectedIdea.objectif)!;
                      return <span className={`font-mono-ui text-[10px] font-semibold px-2 py-0.5 rounded-pill ${ob.bg} ${ob.text}`}>{ob.label}</span>;
                    })()}
                    <span className="font-mono-ui text-[10px] font-semibold px-2 py-0.5 rounded-pill bg-primary text-primary-foreground">📱 {selectedIdea.canal}</span>
                    <span className="font-mono-ui text-[10px] font-semibold px-2 py-0.5 rounded-pill bg-rose-pale text-foreground">{(selectedIdea.type || "idea") === "idea" ? "💡 Idée" : (selectedIdea.type || "idea") === "draft" ? "✏️ Brouillon" : "🎣 Accroche"}</span>
                  </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-8">
                  {/* The Idea — focal point */}
                  <p className="font-display text-xl md:text-2xl text-foreground leading-relaxed">
                    {selectedIdea.titre}
                  </p>

                  {/* Accroche */}
                  {(selectedIdea.accroche_short || selectedIdea.accroche_long) && (
                    <section className="pt-6 border-t border-border/60 space-y-2">
                      <p className="font-mono-ui text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Accroche</p>
                      {selectedIdea.accroche_short && <p className="text-sm text-foreground font-semibold">{selectedIdea.accroche_short}</p>}
                      {selectedIdea.accroche_long && <p className="text-sm text-foreground/80 italic">{selectedIdea.accroche_long}</p>}
                    </section>
                  )}

                  {/* Draft / Content */}
                  {(selectedIdea.content_data || selectedIdea.content_draft) && (
                    <section className="pt-6 border-t border-border/60 space-y-2">
                      <p className="font-mono-ui text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Contenu</p>
                      <div className="rounded-xl bg-rose-pale p-3 max-h-[400px] overflow-y-auto">
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
                            if (selectedIdea.type !== "brief") {
                              await supabase.from("saved_ideas").update(updatePayload as any).eq("id", selectedIdea.id);
                              setIdeas((prev) => prev.map((i) => i.id === selectedIdea.id ? { ...i, ...(isJson ? { content_data: updatedData } : { content_draft: updatedData }) } : i));
                            }
                            setSelectedIdea((prev) => prev ? { ...prev, ...(isJson ? { content_data: updatedData } : { content_draft: updatedData }) } : null);
                          }}
                        />
                      </div>
                    </section>
                  )}

                  {/* Metadata grid */}
                  <section className="pt-6 border-t border-border/60 grid grid-cols-2 gap-y-4 gap-x-8">
                    <div className="space-y-1">
                      <p className="font-mono-ui text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Angle</p>
                      <p className="text-sm text-foreground">{selectedIdea.angle}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="font-mono-ui text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Format</p>
                      <p className="text-sm text-foreground">{selectedIdea.format}</p>
                    </div>
                    {selectedIdea.format_technique && (
                      <div className="space-y-1 col-span-2">
                        <p className="font-mono-ui text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Format technique</p>
                        <p className="text-sm text-foreground">{selectedIdea.format_technique}</p>
                      </div>
                    )}
                    <div className="space-y-1">
                      <p className="font-mono-ui text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Créée le</p>
                      <p className="text-xs text-muted-foreground">{fnsFormat(new Date(selectedIdea.created_at), "d MMMM yyyy", { locale: fr })}</p>
                    </div>
                    {selectedIdea.updated_at && (
                      <div className="space-y-1">
                        <p className="font-mono-ui text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Modifiée le</p>
                        <p className="text-xs text-muted-foreground">{fnsFormat(new Date(selectedIdea.updated_at), "d MMMM yyyy", { locale: fr })}</p>
                      </div>
                    )}
                    {selectedIdea.planned_date && (
                      <div className="space-y-1 col-span-2">
                        <p className="font-mono-ui text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Planifiée le</p>
                        <p className="text-xs text-[#2E7D32]">📅 {fnsFormat(new Date(selectedIdea.planned_date), "d MMMM yyyy", { locale: fr })}</p>
                      </div>
                    )}
                  </section>

                  {/* Notes — accented block */}
                  {selectedIdea.type !== "brief" && (
                    <section className="bg-rose-pale/40 border-l-4 border-primary/40 rounded-r-lg p-5">
                      <div className="flex justify-between items-center mb-3">
                        <p className="font-mono-ui text-[10px] uppercase tracking-wider font-bold text-primary">Mes notes personnelles</p>
                        <button
                          type="button"
                          onClick={() => handleSaveNotes(selectedIdea.id, detailNotes)}
                          className="font-mono-ui text-[10px] uppercase tracking-wider font-bold text-primary hover:underline"
                        >
                          Sauvegarder
                        </button>
                      </div>
                      <Textarea
                        value={detailNotes}
                        onChange={(e) => setDetailNotes(e.target.value)}
                        placeholder="Ajoute tes notes personnelles ici..."
                        className="bg-transparent border-none focus-visible:ring-0 focus-visible:ring-offset-0 shadow-none p-0 text-sm leading-relaxed text-foreground/90 min-h-[100px] resize-none"
                      />
                    </section>
                  )}
                </div>

                {/* Sticky footer actions */}
                <div className="px-6 py-4 border-t border-border bg-background flex flex-col gap-3">
                  <Button onClick={() => handleRediger(selectedIdea)} className="rounded-pill gap-2 w-full">
                    <PenLine className="h-4 w-4" /> Continuer la rédaction
                  </Button>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <PlanifierPopover idea={selectedIdea} onPlan={handlePlan} fullWidth />
                    </div>
                    {(selectedIdea.content_draft || selectedIdea.content_data) && !selectedIdea.content_data?.script && (
                      <Button variant="outline" size="sm" className="rounded-pill gap-1 text-xs" onClick={async () => {
                        const text = selectedIdea.content_draft && !selectedIdea.content_draft.startsWith("{")
                          ? selectedIdea.content_draft
                          : "Contenu copié depuis le composant de prévisualisation.";
                        await navigator.clipboard.writeText(text);
                        toast({ title: "Copié !" });
                      }}>
                        <Copy className="h-3 w-3" /> Copier
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="rounded-pill text-muted-foreground hover:text-destructive hover:bg-destructive/10" aria-label="Supprimer">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Supprimer cette idée ?</AlertDialogTitle>
                          <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(selectedIdea.id)}>Supprimer</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </>
    );

  if (embedded) {
    return <div className="max-w-[900px]">{mainContent}</div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[900px] px-6 py-8 max-md:px-4">
        {mainContent}
      </main>
    </div>
  );
}

/* ─── Filter Chip ─── */
function FilterChip({ active, onClick, disabled, children }: { active: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`font-mono-ui text-[11px] font-semibold px-2.5 py-1 rounded-pill transition-all whitespace-nowrap ${
        active
          ? "bg-primary text-primary-foreground"
          : disabled
            ? "bg-muted text-muted-foreground/50 cursor-not-allowed"
            : "bg-card border border-border text-muted-foreground hover:border-primary/40"
      }`}
    >
      {children}
    </button>
  );
}

/* ─── Status Dropdown ─── */
function StatusDropdown({ ideaId, current, onSelect, children }: { ideaId: string; current: string; onSelect: (id: string, status: string) => void; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span onClick={(e) => { e.stopPropagation(); }}>{children}</span>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start" onClick={(e) => e.stopPropagation()}>
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => { onSelect(ideaId, s.id); setOpen(false); }}
            className={`w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-muted transition-colors ${current === s.id ? "font-semibold text-primary" : "text-foreground"}`}
          >
            {s.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/* ─── Planifier Popover ─── */
function PlanifierPopover({ idea, onPlan, fullWidth }: { idea: SavedIdea; onPlan: (idea: SavedIdea, date: Date) => void; fullWidth?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={`rounded-pill text-xs gap-1 ${fullWidth ? "w-full" : ""}`} onClick={(e) => e.stopPropagation()}>
          <CalendarDays className="h-3 w-3" /> Planifier
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
