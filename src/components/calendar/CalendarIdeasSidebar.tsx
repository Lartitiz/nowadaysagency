import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { DEMO_DATA } from "@/lib/demo-data";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import { Plus, GripVertical, MoreVertical, Trash2, CalendarIcon, Undo2, Search, X } from "lucide-react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export interface SavedIdea {
  id: string;
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

const FORMAT_ICONS: Record<string, string> = {
  post: "📝", carousel: "🎠", reel: "🎬", story: "📱", linkedin: "💼",
  post_carrousel: "🎠", post_photo: "📝", story_serie: "📱",
};

const OBJECTIVE_COLORS: Record<string, string> = {
  visibilite: "text-blue-600", confiance: "text-green-600", vente: "text-orange-600",
  visibility: "text-blue-600", trust: "text-green-600", sales: "text-orange-600",
};

const FORMAT_FILTERS = [
  { id: "all", label: "Tous" },
  { id: "post", label: "📝 Posts" },
  { id: "carousel", label: "🎠 Carrousels" },
  { id: "reel", label: "🎬 Reels" },
  { id: "story", label: "📱 Stories" },
];

interface Props {
  onIdeaPlanned: () => void;
  onIdeaClick?: (idea: SavedIdea) => void;
  isMobile?: boolean;
}

export function CalendarIdeasSidebar({ onIdeaPlanned, onIdeaClick, isMobile }: Props) {
  const { user } = useAuth();
  const { isDemoMode } = useDemoContext();
  const { column, value } = useWorkspaceFilter();
  const { toast } = useToast();
  const [ideas, setIdeas] = useState<SavedIdea[]>([]);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "objective">("recent");
  const [showAddForm, setShowAddForm] = useState(false);
  const [planDialogIdea, setPlanDialogIdea] = useState<SavedIdea | null>(null);
  const [planDate, setPlanDate] = useState<Date | undefined>();

  const fetchIdeas = async () => {
    if (isDemoMode) {
      const demoIdeas = (DEMO_DATA as any).saved_ideas || [];
      setIdeas(demoIdeas as SavedIdea[]);
      return;
    }
    if (!user) return;
    const { data } = await (supabase.from("saved_ideas") as any)
      .select("id, titre, format, objectif, notes, status, canal, content_draft, content_data, source_module, planned_date, calendar_post_id")
      .eq(column, value)
      .is("calendar_post_id", null)
      .order("created_at", { ascending: false });
    if (data) setIdeas(data as SavedIdea[]);
  };

  useEffect(() => { fetchIdeas(); }, [user?.id, isDemoMode]);

  // Expose refresh so parent can trigger after unplan
  useEffect(() => {
    (window as any).__refreshIdeasSidebar = fetchIdeas;
    return () => { delete (window as any).__refreshIdeasSidebar; };
  }, [user?.id]);

  const filteredIdeas = useMemo(() => {
    let result = ideas;

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
    await supabase.from("saved_ideas").delete().eq("id", id);
    setIdeas(prev => prev.filter(i => i.id !== id));
    toast({ title: "Idée supprimée" });
  };

  const handleMobilePlan = async () => {
    if (!planDialogIdea || !planDate || !user) return;
    const dateStr = format(planDate, "yyyy-MM-dd");
    const { data: newPost } = await supabase.from("calendar_posts").insert({
      user_id: user.id,
      date: dateStr,
      theme: planDialogIdea.titre,
      status: "idea",
      canal: planDialogIdea.canal || "instagram",
      objectif: planDialogIdea.objectif,
      format: planDialogIdea.format,
      notes: planDialogIdea.notes,
      content_draft: planDialogIdea.content_draft,
    }).select("id").single();

    if (newPost) {
      await supabase.from("saved_ideas").update({ calendar_post_id: newPost.id, planned_date: dateStr }).eq("id", planDialogIdea.id);
    }
    setPlanDialogIdea(null);
    fetchIdeas();
    onIdeaPlanned();
    toast({ title: `Idée planifiée le ${format(planDate, "d MMMM", { locale: fr })}` });
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
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-sm font-bold text-foreground">💡 Mes idées</h3>
        <span className="text-xs text-muted-foreground">
          {filteredIdeas.length !== ideas.length
            ? `${filteredIdeas.length}/${ideas.length}`
            : ideas.length}
        </span>
      </div>

      {/* Search */}
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Chercher une idée..."
          className="w-full text-xs border border-border rounded-lg pl-8 pr-8 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground/50"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Filters + sort */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex gap-1 flex-wrap">
          {FORMAT_FILTERS.map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={cn("text-[11px] px-2 py-1 rounded-full border transition-colors",
                filter === f.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/40")}>
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setSortBy(prev => prev === "recent" ? "objective" : "recent")}
          className="text-[10px] text-muted-foreground hover:text-primary shrink-0 ml-1"
          title={sortBy === "recent" ? "Trier par objectif" : "Trier par date"}
        >
          {sortBy === "recent" ? "🕐" : "🎯"}
        </button>
      </div>

      {/* Ideas list */}
      <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
        {filteredIdeas.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            {searchQuery.trim()
              ? `Aucune idée trouvée pour "${searchQuery}"`
              : "Aucune idée en attente"}
          </p>
        )}
        {filteredIdeas.map(idea => (
          isMobile
            ? <MobileIdeaCard key={idea.id} idea={idea} onDelete={handleDeleteIdea}
                onPlan={() => { setPlanDialogIdea(idea); setPlanDate(undefined); }}
                onClick={() => handleIdeaClick(idea)} />
            : <DraggableIdeaCard key={idea.id} idea={idea} onDelete={handleDeleteIdea}
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

      {/* Add idea dialog */}
      <AddIdeaDialog open={showAddForm} onOpenChange={setShowAddForm} onAdded={fetchIdeas} />

      {/* Mobile plan dialog */}
      <Dialog open={!!planDialogIdea} onOpenChange={open => { if (!open) setPlanDialogIdea(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" /> Planifier l'idée
            </DialogTitle>
            <DialogDescription className="sr-only">Choisir une date pour planifier cette idée</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">« {planDialogIdea?.titre} »</p>
          <Calendar mode="single" selected={planDate} onSelect={setPlanDate}
            disabled={date => date < new Date(new Date().setHours(0, 0, 0, 0))}
            className={cn("p-3 pointer-events-auto mx-auto")} locale={fr} />
          <Button onClick={handleMobilePlan} disabled={!planDate} className="w-full rounded-pill">
            {planDate ? `Planifier le ${format(planDate, "d MMMM", { locale: fr })}` : "Choisis une date"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Draggable idea card (desktop) ── */
function DraggableIdeaCard({ idea, onDelete, onClick }: { idea: SavedIdea; onDelete: (id: string) => void; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `idea-${idea.id}`,
    data: { type: "idea", idea },
  });
  const style: React.CSSProperties = {
    transform: transform ? `translate(${transform.x}px, ${transform.y}px)` : undefined,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  const icon = FORMAT_ICONS[idea.format || ""] || "📝";
  const objColor = OBJECTIVE_COLORS[idea.objectif || ""] || "text-muted-foreground";

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}
      className="rounded-lg border border-border bg-card p-2 hover:border-primary/30 hover:bg-accent/30 transition-colors cursor-grab"
      onClick={onClick}
    >
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{icon} {idea.titre}</p>
        <p className={cn("text-[10px] truncate", objColor)}>
          {idea.format || "Post"} {idea.objectif ? `· ${idea.objectif}` : ""}
        </p>
        {idea.status && idea.status !== "idea" && (
          <p className="text-[10px] text-muted-foreground capitalize">{idea.status}</p>
        )}
      </div>
    </div>
  );
}

/* ── Mobile idea card ── */
function MobileIdeaCard({ idea, onDelete, onPlan, onClick }: { idea: SavedIdea; onDelete: (id: string) => void; onPlan: () => void; onClick: () => void }) {
  const icon = FORMAT_ICONS[idea.format || ""] || "📝";
  const objColor = OBJECTIVE_COLORS[idea.objectif || ""] || "text-muted-foreground";

  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-border bg-card p-2.5 cursor-pointer hover:bg-accent/30 transition-colors"
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{icon} {idea.titre}</p>
        <p className={cn("text-[10px] truncate", objColor)}>
          {idea.format || "Post"} {idea.objectif ? `· ${idea.objectif}` : ""}
        </p>
      </div>
      <div className="flex gap-1 shrink-0">
        <button onClick={(e) => { e.stopPropagation(); onPlan(); }} className="text-[10px] text-primary font-medium px-2 py-1 rounded border border-primary/30 hover:bg-primary/5">
          📅
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(idea.id); }} className="text-muted-foreground hover:text-destructive p-1">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

/* ── Add Idea Dialog ── */
function AddIdeaDialog({ open, onOpenChange, onAdded }: { open: boolean; onOpenChange: (o: boolean) => void; onAdded: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [ideaFormat, setIdeaFormat] = useState("post");
  const [objective, setObjective] = useState("visibilite");
  const [notes, setNotes] = useState("");

  const handleAdd = async () => {
    if (!user || !title.trim()) return;
    await supabase.from("saved_ideas").insert({
      user_id: user.id,
      titre: title.trim(),
      format: ideaFormat,
      angle: "",
      objectif: objective,
      notes: notes || null,
      status: "idea",
      canal: ideaFormat === "linkedin" ? "linkedin" : "instagram",
    });
    toast({ title: "Idée ajoutée !" });
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
          <DialogTitle className="font-display">💡 Nouvelle idée</DialogTitle>
          <DialogDescription className="sr-only">Formulaire pour ajouter une nouvelle idée de contenu</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <label className="text-xs font-medium mb-1 block">Titre</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Mon idée de contenu..." className="rounded-[10px] h-10 text-sm" />
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
            <label className="text-xs font-medium mb-1 block">Notes (optionnel)</label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Idées en vrac..." className="rounded-[10px] min-h-[50px] text-sm" />
          </div>
          <Button onClick={handleAdd} disabled={!title.trim()} className="w-full rounded-pill">
            Ajouter l'idée
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
