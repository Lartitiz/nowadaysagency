import { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";

import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import { GripVertical, Trash2, CalendarIcon, Undo2, Search, X } from "lucide-react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { Link } from "react-router-dom";
import { getIdeaState, ideaContentLabel, formatLabel } from "@/lib/idea-state";
import { planSavedIdea } from "@/lib/idea-calendar-persistence";
import { calendarSaveError } from "@/lib/calendar-persistence";

export interface SavedIdea {
  id: string;
  updated_at?: string | null;
  angle?: string | null;
  series_id?: string | null;
  episode_number?: number | null;
  titre: string;
  format: string | null;
  objectif: string | null;
  notes: string | null;
  status: string;
  canal: string | null;
  content_draft: string | null;
  content_data: any;
  source_module: string | null;
  planned_date: string | null;
  calendar_post_id: string | null;
}

const FORMAT_FILTERS = [
  { id: "all", label: "Tous" },
  { id: "post", label: "Posts" },
  { id: "carousel", label: "Carrousels" },
  { id: "reel", label: "Reels" },
  { id: "story", label: "Stories" },
];

interface Props {
  onIdeaPlanned: () => void;
  onIdeaClick?: (idea: SavedIdea) => void;
  isMobile?: boolean;
  onCollapse?: () => void;
  refreshKey?: number;
}

export function CalendarIdeasSidebar(props: Props) {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  return <IdeasInWorkspace key={JSON.stringify([user?.id, column, value])} {...props} />;
}

function IdeasInWorkspace({ onIdeaPlanned, onIdeaClick, isMobile, onCollapse, refreshKey }: Props) {
  const { user } = useAuth();
  const { isDemoMode, demoData } = useDemoContext();
  const { column, value } = useWorkspaceFilter();
  const request = useRef(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current++; }; }, []);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const planning = useRef(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [ideas, setIdeas] = useState<SavedIdea[]>([]);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "objective">("recent");
  const [showAddForm, setShowAddForm] = useState(false);
  const [planDialogIdea, setPlanDialogIdea] = useState<SavedIdea | null>(null);
  const [planDate, setPlanDate] = useState<Date | undefined>();

  const fetchIdeas = async () => {
    const started = ++request.current;
    if (!mounted.current) return;
    setLoading(true);
    setLoadError(false);
    try {
      if (isDemoMode && demoData) {
        setIdeas(((demoData as any).saved_ideas || []) as SavedIdea[]);
        return;
      }
      if (!user || !value) { setIdeas([]); return; }
      let query = (supabase.from("saved_ideas") as any)
        .select("id, titre, format, objectif, notes, status, canal, content_draft, content_data, source_module, planned_date, calendar_post_id, updated_at, angle, series_id, episode_number")
        .eq(column, value);
      if (column === "user_id") query = query.is("workspace_id", null);
      const { data, error } = await query.order("created_at", { ascending: false });
      if (!mounted.current || started !== request.current) return;
      if (error) throw error;
      setIdeas((data || []) as SavedIdea[]);
    } catch {
      if (mounted.current && started === request.current) setLoadError(true);
    } finally {
      if (mounted.current && started === request.current) setLoading(false);
    }
  };

  useEffect(() => { fetchIdeas(); }, [user?.id, isDemoMode, column, value, refreshKey]);

  const filteredIdeas = useMemo(() => {
    // Le panneau sert à POSER une idée sur une date : celles déjà créées
    // (contenu au calendrier) n'ont rien à y faire — elles vivent dans /idees.
    let result = ideas.filter(i => getIdeaState(i) !== "created");

    if (filter !== "all") {
      result = result.filter(i => {
        const f = i.format || "";
        if (filter === "post") return f.includes("post") || f === "";
        if (filter === "carousel") return f.includes("carrousel") || f === "carousel";
        if (filter === "reel") return f === "reel";
        if (filter === "story") return f.includes("story");
        return true;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(i =>
        (i.titre || "").toLowerCase().includes(q) ||
        (i.notes || "").toLowerCase().includes(q)
      );
    }

    if (sortBy === "objective") {
      const objOrder: Record<string, number> = { visibilite: 0, confiance: 1, vente: 2 };
      result = [...result].sort((a, b) =>
        (objOrder[a.objectif || ""] ?? 99) - (objOrder[b.objectif || ""] ?? 99)
      );
    }

    return result;
  }, [ideas, filter, searchQuery, sortBy]);

  const handleDeleteIdea = async (id: string) => {
    const { error } = await supabase.from("saved_ideas").delete().eq("id", id);
    if (error) {
      toast.error("Suppression impossible", { description: "Réessaie dans un instant." });
      return;
    }
    setIdeas(prev => prev.filter(i => i.id !== id));
    toast.success("Idée supprimée");
  };

  const handlePlan = async () => {
    if (!planDialogIdea || !planDate || !user || planning.current) return;
    planning.current = true;
    setIsPlanning(true);
    const dateStr = format(planDate, "yyyy-MM-dd");
    let receipt;
    try { receipt = await planSavedIdea(planDialogIdea, dateStr); }
    catch (error) { if (mounted.current) toast.error(calendarSaveError(error)); return; }
    finally { planning.current = false; if (mounted.current) setIsPlanning(false); }
    if (!mounted.current) return;
    setPlanDialogIdea(null);
    fetchIdeas();
    onIdeaPlanned();
    toast.success(`${receipt.replayed ? "Déjà prévue" : "Prévue"} au calendrier le ${format(new Date(receipt.date + "T12:00:00"), "d MMMM", { locale: fr })}`);
  };

  const handleIdeaClick = (idea: SavedIdea) => {
    if (onIdeaClick) {
      onIdeaClick(idea);
    }
  };

  const { setNodeRef: dropRef, isOver: isOverSidebar } = useDroppable({
    id: "ideas-sidebar",
    data: { type: "ideas_sidebar" },
  });

  return (
    <div ref={dropRef} className={cn("flex flex-col h-full transition-colors rounded-xl", isOverSidebar && "bg-primary/10 ring-2 ring-primary/30 ring-inset")}>
      {isOverSidebar && (
        <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-primary bg-primary/5 rounded-lg py-2 mb-2 border border-dashed border-primary/40">
          <Undo2 className="h-3.5 w-3.5" /> Remettre en idée
        </div>
      )}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h2 className="font-display text-lg font-bold">Mes idées à placer</h2>
        {onCollapse && <button onClick={onCollapse} aria-label="Replier le panneau idées" className="p-1 rounded-md text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>}
      </div>
      <p className="text-xs text-muted-foreground mb-4">{isMobile ? "Choisis une idée, puis une date." : "Glisse une fiche sur une date, ou clique sur Placer."}</p>

      {/* Search */}
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          aria-label="Chercher une idée à placer"
          placeholder="Chercher une idée…"
          className="w-full text-xs border border-border rounded-lg pl-8 pr-8 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/50"
        />
        {searchQuery && (
          <button
            aria-label="Effacer la recherche"
            onClick={() => setSearchQuery("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Filters + sort */}
      <details className="mb-3 text-xs">
        <summary className="cursor-pointer text-muted-foreground py-1">Filtrer et trier</summary>
        <div className="flex items-center justify-between mt-2">
        <div className="flex gap-1 flex-wrap">
          {FORMAT_FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}
              className={cn("text-2xs px-2 py-1 rounded-full border transition-colors",
                filter === f.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setSortBy(prev => prev === "recent" ? "objective" : "recent")}
          className="text-2xs text-muted-foreground hover:text-primary shrink-0 ml-1"
          title={sortBy === "recent" ? "Trier par objectif" : "Trier par date"}
        >
          {sortBy === "recent" ? "🕐" : "🎯"}
        </button>
      </div>

      </details>

      {/* Ideas list */}
      <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
        {loading && <p role="status" className="text-xs text-muted-foreground py-4">Chargement des idées…</p>}
        {!loading && loadError && <div role="alert" className="text-xs p-3 rounded-lg bg-muted"><p>Impossible de charger tes idées.</p><button onClick={fetchIdeas} className="underline mt-2">Réessayer</button></div>}
        {!loading && !loadError && filteredIdeas.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            {searchQuery.trim()
              ? `Aucune idée trouvée pour "${searchQuery}"`
              : "Aucune idée en attente"}
          </p>
        )}
        {!loading && !loadError && filteredIdeas.map(idea => (
          <IdeaCard key={idea.id} idea={idea} isMobile={isMobile} onDelete={handleDeleteIdea}
            onPlan={() => { setPlanDialogIdea(idea); setPlanDate(undefined); }}
            onClick={() => handleIdeaClick(idea)} />
        ))}
      </div>

      {/* Add idea button */}
      {!isDemoMode && (
        <button onClick={() => setShowAddForm(true)}
          className="mt-3 w-full text-center text-xs font-medium text-primary hover:underline py-2 border border-dashed border-primary/30 rounded-lg hover:bg-primary/5 transition-colors">
          + Ajouter une idée
        </button>
      )}

      <Link to="/idees" className="text-xs text-primary text-center hover:underline py-3">Voir toutes mes idées →</Link>

      {/* Add idea dialog */}
      <AddIdeaDialog open={showAddForm} onOpenChange={setShowAddForm} onAdded={fetchIdeas} />

      {/* Même transaction au clic, sur ordinateur et mobile. */}
      <Dialog open={!!planDialogIdea} onOpenChange={open => { if (!open && !planning.current) setPlanDialogIdea(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" /> Placer au calendrier
            </DialogTitle>
            <DialogDescription>Cette date organise ton contenu. Elle ne programme pas sa publication automatique.</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">« {planDialogIdea?.titre} »</p>
          <Calendar mode="single" selected={planDate} onSelect={setPlanDate}
            disabled={date => date < new Date(new Date().setHours(0, 0, 0, 0))}
            className={cn("p-3 pointer-events-auto mx-auto")} locale={fr} />
          <Button onClick={handlePlan} disabled={!planDate || isPlanning} className="w-full rounded-pill">
            {isPlanning ? "Enregistrement…" : planDate ? `Placer le ${format(planDate, "d MMMM", { locale: fr })}` : "Choisis une date"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* Une vraie action au clic complète le glisser-déposer. */
function IdeaCard({ idea, isMobile, onDelete, onPlan, onClick }: { idea: SavedIdea; isMobile?: boolean; onDelete: (id: string) => void; onPlan: () => void; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `idea-${idea.id}`, data: { type: "idea", idea }, disabled: isMobile,
  });
  const style: React.CSSProperties = {
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    opacity: isDragging ? 0.4 : 1, zIndex: isDragging ? 50 : undefined,
  };
  return (
    <article ref={setNodeRef} style={style} className="rounded-xl border border-border bg-background p-3 hover:border-primary/30 transition-colors">
      <div className="flex items-start gap-1">
        <button onClick={onClick} className="flex-1 min-w-0 text-left text-sm font-semibold leading-snug hover:underline break-words">{idea.titre}</button>
        {!isMobile && <button {...attributes} {...listeners} aria-label={`Glisser : ${idea.titre}`} className="cursor-grab touch-none p-1 -mr-1 text-muted-foreground"><GripVertical className="h-4 w-4" /></button>}
      </div>
      <p className="text-xs text-primary-text mt-2">{ideaContentLabel(idea)}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{formatLabel(idea.format)}{idea.canal ? ` · ${idea.canal === "linkedin" ? "LinkedIn" : idea.canal.charAt(0).toUpperCase() + idea.canal.slice(1)}` : ""}</p>
      <div className="flex items-center gap-2 mt-3">
        <button onClick={onClick} className="text-xs text-muted-foreground hover:underline py-1">Ouvrir</button>
        <button onClick={onPlan} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-accent"><CalendarIcon className="h-3.5 w-3.5" /> Placer</button>
        {isMobile && <button onClick={() => onDelete(idea.id)} aria-label={`Supprimer : ${idea.titre}`} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>}
      </div>
    </article>
  );
}

/* ── Add Idea Dialog ── */
export function AddIdeaDialog({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; onAdded: () => void }) {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const [title, setTitle] = useState("");
  const [ideaFormat, setIdeaFormat] = useState("post");
  const [objective, setObjective] = useState("visibilite");
  const [notes, setNotes] = useState("");

  const handleAdd = async () => {
    if (!user || !title.trim()) return;
    const { error } = await supabase.from("saved_ideas").insert({
      user_id: user.id,
      workspace_id: workspaceId !== user.id ? workspaceId : undefined,
      titre: title.trim(),
      format: ideaFormat,
      angle: "",
      objectif: objective,
      notes: notes || null,
      status: "to_explore",
      canal: ideaFormat === "linkedin" ? "linkedin" : "instagram",
    });
    if (error) {
      console.error("Erreur technique:", error);
      toast.error("Erreur", { description: friendlyError(error) });
      return;
    }
    toast.success("Idée notée");
    setTitle(""); setNotes("");
    onOpenChange(false);
    onAdded();
  };

  const FORMAT_OPTIONS = [
    { id: "post", label: "📝 Post" },
    { id: "carousel", label: "🎠 Carrousel" },
    { id: "reel", label: "🎬 Reel" },
    { id: "story", label: "📱 Story" },
    { id: "linkedin", label: "💼 LinkedIn" },
  ];

  const OBJ_OPTIONS = [
    { id: "visibilite", label: "👀 Visibilité" },
    { id: "confiance", label: "🤝 Confiance" },
    { id: "vente", label: "💰 Vente" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">Noter une idée</DialogTitle>
          <DialogDescription className="sr-only">Formulaire pour ajouter une nouvelle idée de contenu</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <label htmlFor="new-idea-title" className="text-xs font-medium mb-1 block">Titre</label>
            <Input id="new-idea-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Une phrase suffit : « pourquoi je refuse les commandes en urgence »" className="rounded-[10px] h-10 text-sm" autoFocus />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Format</label>
            <div className="flex flex-wrap gap-1.5">
              {FORMAT_OPTIONS.map(f => (
                <button key={f.id} onClick={() => setIdeaFormat(f.id)}
                  className={cn("text-xs px-2.5 py-1 rounded-full border transition-all",
                    ideaFormat === f.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40")}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block">Objectif</label>
            <div className="flex flex-wrap gap-1.5">
              {OBJ_OPTIONS.map(o => (
                <button key={o.id} onClick={() => setObjective(o.id)}
                  className={cn("text-xs px-2.5 py-1 rounded-full border transition-all",
                    objective === o.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40")}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="new-idea-notes" className="text-xs font-medium mb-1 block">Notes (optionnel)</label>
            <Textarea id="new-idea-notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Idées en vrac..." className="rounded-[10px] min-h-[50px] text-sm" />
          </div>
          <Button onClick={handleAdd} disabled={!title.trim()} className="w-full rounded-pill">
            Noter cette idée
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
