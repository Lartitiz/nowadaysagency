import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarIcon, Sparkles, Trash2, RefreshCw, Newspaper, Check, Loader2, ChevronDown } from "lucide-react";
import type { SavedIdea } from "./CalendarIdeasSidebar";

const FORMAT_OPTIONS = [
  { id: "post", label: "📝 Post" },
  { id: "carousel", label: "🎠 Carrousel" },
  { id: "reel", label: "🎬 Reel" },
  { id: "story", label: "📱 Story" },
  { id: "linkedin", label: "💼 LinkedIn" },
];

const OBJ_OPTIONS = [
  { id: "visibilite", label: "👀 Visibilité", color: "text-info" },
  { id: "confiance", label: "🤝 Confiance", color: "text-success" },
  { id: "vente", label: "💰 Vente", color: "text-warning" },
];

const FORMAT_ROUTES: Record<string, string> = {
  post: "/creer",
  carousel: "/creer?format=carousel",
  post_carrousel: "/creer?format=carousel",
  reel: "/creer?format=reel",
  story: "/creer?format=story",
  story_serie: "/creer?format=story",
  linkedin: "/linkedin",
  post_photo: "/creer",
};

interface Props {
  idea: SavedIdea | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
  onPlanned: () => void;
}

export function IdeaDetailSheet({ idea, open, onOpenChange, onUpdated, onPlanned }: Props) {
  const { user } = useAuth();
  const confirm = useConfirm();
  const workspaceId = useWorkspaceId();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [title, setTitle] = useState("");
  const [ideaFormat, setIdeaFormat] = useState("post");
  const [objective, setObjective] = useState("visibilite");
  const [notes, setNotes] = useState("");
  const [contentDraft, setContentDraft] = useState("");
  const [planDate, setPlanDate] = useState<Date | undefined>();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTransformPicker, setShowTransformPicker] = useState(false);
  // Auto-save silencieux (mêmes codes que l'éditeur de post)
  const [autoSaveState, setAutoSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const baselineRef = useRef<string>("");
  const savingRef = useRef<boolean>(false);

  const serializeIdea = (d: { title: string; ideaFormat: string; objective: string; notes: string; contentDraft: string }) =>
    JSON.stringify({ title: d.title.trim(), ideaFormat: d.ideaFormat, objective: d.objective, notes: d.notes, contentDraft: d.contentDraft });

  useEffect(() => {
    if (idea) {
      setTitle(idea.titre);
      setIdeaFormat(idea.format || "post");
      setObjective(idea.objectif || "visibilite");
      setNotes(idea.notes || "");
      setContentDraft(idea.content_draft || "");
      setShowDatePicker(false);
      setShowTransformPicker(false);
      setPlanDate(undefined);
      setAutoSaveState("idle");
      // Baseline calculée depuis l'idée elle-même → pas d'auto-save parasite à l'ouverture.
      baselineRef.current = serializeIdea({
        title: idea.titre || "", ideaFormat: idea.format || "post", objective: idea.objectif || "visibilite",
        notes: idea.notes || "", contentDraft: idea.content_draft || "",
      });
    }
  }, [idea]);

  // Persistance silencieuse (update par id, l'idée existe toujours).
  const persistIdea = async () => {
    if (!idea || !user) return;
    await supabase.from("saved_ideas").update({
      titre: title.trim(),
      format: ideaFormat,
      objectif: objective,
      notes: notes || null,
      content_draft: contentDraft || null,
      canal: ideaFormat === "linkedin" ? "linkedin" : "instagram",
    }).eq("id", idea.id);
  };

  // Auto-save (debounce) : sauve dès qu'un champ change, sans bouton ni toast.
  useEffect(() => {
    if (!open || !idea) return;
    if (!title.trim()) return;
    const serialized = serializeIdea({ title, ideaFormat, objective, notes, contentDraft });
    if (serialized === baselineRef.current) return;
    const t = setTimeout(async () => {
      if (savingRef.current) return;
      savingRef.current = true;
      setAutoSaveState("saving");
      try { await persistIdea(); } finally { savingRef.current = false; }
      baselineRef.current = serialized;
      setAutoSaveState("saved");
      onUpdated();
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, title, ideaFormat, objective, notes, contentDraft]);

  const handlePlan = async () => {
    if (!idea || !planDate || !user) return;
    const dateStr = format(planDate, "yyyy-MM-dd");
    const { data: newPost } = await supabase.from("calendar_posts").insert({
      user_id: user.id,
      workspace_id: workspaceId !== user.id ? workspaceId : undefined,
      date: dateStr,
      theme: title.trim(),
      status: "idea",
      canal: ideaFormat === "linkedin" ? "linkedin" : "instagram",
      objectif: objective,
      format: ideaFormat,
      notes: notes || null,
      content_draft: contentDraft || idea.content_draft || null,
      series_id: (idea as any).series_id ?? null,
      episode_number: (idea as any).episode_number ?? null,
    } as any).select("id").single();
    if (newPost) {
      await supabase.from("saved_ideas").update({ calendar_post_id: newPost.id, planned_date: dateStr }).eq("id", idea.id);
    }
    toast.success(`Planifié le ${format(planDate, "d MMMM", { locale: fr })}`);
    onOpenChange(false);
    onPlanned();
  };

  const handleDelete = async () => {
    if (!idea) return;
    if (!(await confirm({ title: "Supprimer cette idée ?", description: "Cette action est irréversible.", confirmText: "Supprimer", destructive: true }))) return;
    await supabase.from("saved_ideas").delete().eq("id", idea.id);
    toast.success("Idée supprimée");
    onOpenChange(false);
    onUpdated();
  };

  const handleGenerate = async () => {
    if (!idea) return;
    await persistIdea(); // sauvegarde silencieuse avant de quitter (l'auto-save gère le reste)
    const route = FORMAT_ROUTES[ideaFormat] || "/creer";
    navigate(route, {
      state: {
        fromIdeas: true,
        ideaId: idea.id,
        theme: title.trim(),
        objectif: objective,
        format: ideaFormat,
        notes,
      },
    });
    onOpenChange(false);
  };

  const handleTransform = async (targetFormat: string) => {
    if (!idea) return;
    await persistIdea();
    const route = FORMAT_ROUTES[targetFormat] || "/creer";
    navigate(route, {
      state: {
        fromIdeas: true,
        ideaId: idea.id,
        theme: title.trim(),
        objectif: objective,
        format: targetFormat,
        notes,
        sourceContent: idea.content_draft,
        transformFrom: ideaFormat,
      },
    });
    onOpenChange(false);
  };

  const transformFormats = FORMAT_OPTIONS.filter((f) => f.id !== ideaFormat);

  const isSavedActu = (idea as any)?.source_module === "newsjacking" && (idea as any)?.format === "actu";
  const actuData = isSavedActu ? (idea as any)?.content_data : null;

  const handleCreateFromActu = () => {
    if (!idea) return;
    const actu = actuData || {};
    const subject = actu.titre || idea.titre?.replace(/^📰\s*/, "") || "";
    const context = actu.titre
      ? `ACTUALITÉ : ${actu.titre}\nSource : ${actu.source || ""}\nRésumé : ${actu.resume || ""}\nPertinence : ${actu.pertinence || ""}`
      : idea.notes || "";
    onOpenChange(false);
    navigate("/creer", { state: { subject, context, fromIdeas: true, ideaId: idea.id } });
  };

  // En-tête de contexte glanceable (aligné sur l'éditeur de post)
  const formatLabel = (FORMAT_OPTIONS.find((f) => f.id === ideaFormat) || FORMAT_OPTIONS[0]).label;
  const objectifLabel = OBJ_OPTIONS.find((o) => o.id === objective)?.label;
  const contextHeader = (
    <div className="flex items-center gap-2 flex-wrap text-left">
      <span className="text-base leading-none" aria-hidden="true">💡</span>
      <span className="text-sm font-semibold text-foreground">Idée</span>
      <span className="text-border">·</span>
      <span className="text-xs text-muted-foreground">{formatLabel}</span>
      {objectifLabel && (
        <>
          <span className="text-border">·</span>
          <span className="text-xs text-muted-foreground">{objectifLabel}</span>
        </>
      )}
    </div>
  );

  const content = (

    <div className="space-y-5 mt-2">
      {/* Saved newsjacking banner */}
      {isSavedActu && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-primary">
            <Newspaper className="h-4 w-4" /> 📰 Actualité sauvegardée
          </div>
          {actuData?.source && (
            <p className="text-xs text-muted-foreground">Source : {actuData.source}</p>
          )}
          <Button
            onClick={handleCreateFromActu}
            size="sm"
            className="w-full rounded-pill gap-1.5 mt-1"
          >
            <Sparkles className="h-3.5 w-3.5" /> Créer un contenu à partir de cette actu
          </Button>
        </div>
      )}

      {/* Titre */}
      <div>
        <label htmlFor="idea-title" className="text-xs font-semibold mb-1.5 block text-foreground">Titre</label>
        <Input
          id="idea-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Mon idée de contenu..."
          className="rounded-[10px] h-11"
        />
      </div>

      {/* Format */}
      <div>
        <label className="text-xs font-semibold mb-1.5 block text-foreground">Format</label>
        <div className="flex flex-wrap gap-1.5">
          {FORMAT_OPTIONS.map((f) => (
            <button
              key={f.id}
              onClick={() => setIdeaFormat(f.id)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-full border transition-all",
                ideaFormat === f.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:border-primary/40"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Objectif */}
      <div>
        <label className="text-xs font-semibold mb-1.5 block text-foreground">Objectif</label>
        <div className="flex flex-wrap gap-1.5">
          {OBJ_OPTIONS.map((o) => (
            <button
              key={o.id}
              onClick={() => setObjective(o.id)}
              className={cn(
                "text-xs px-3 py-1.5 rounded-full border transition-all",
                objective === o.id
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:border-primary/40"
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="idea-notes" className="text-xs font-semibold mb-1.5 block text-foreground">Notes</label>
        <Textarea
          id="idea-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Idées, brouillon, remarques..."
          className="rounded-[10px] min-h-[80px] text-sm"
        />
      </div>

      {/* Generated content */}
      {(idea?.content_draft || contentDraft) && (
        <div>
          <label htmlFor="idea-content-draft" className="text-xs font-semibold mb-1.5 block text-foreground flex items-center gap-1.5">
            ✨ Contenu généré
          </label>
          <Textarea
            id="idea-content-draft"
            value={contentDraft}
            onChange={(e) => setContentDraft(e.target.value)}
            placeholder="Le contenu généré apparaîtra ici..."
            className="rounded-[10px] min-h-[120px] max-h-[260px] overflow-y-auto text-sm"
          />
        </div>
      )}

      {/* Script (reel) */}
      {(idea as any)?.content_data?.script && (
        <div>
          <label className="text-xs font-semibold mb-1.5 block text-foreground">
            🎬 Script
          </label>
          <div className="bg-muted/30 rounded-lg p-3 space-y-2 text-xs">
            {(idea as any).content_data.script.map((scene: any, i: number) => (
              <div key={i} className="border-b border-border/30 pb-2 last:border-0 last:pb-0">
                <span className="font-semibold text-muted-foreground">[{scene.timing}] {scene.section?.toUpperCase()}</span>
                <p className="text-foreground mt-0.5">"{scene.texte_parle}"</p>
                {scene.texte_overlay && (
                  <p className="text-muted-foreground mt-0.5">📝 {scene.texte_overlay}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Date picker for planning */}
      {showDatePicker && (
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-sm font-medium mb-2">📅 Choisir une date</p>
          <Calendar
            mode="single"
            selected={planDate}
            onSelect={setPlanDate}
            disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
            className={cn("p-3 pointer-events-auto mx-auto")}
            locale={fr}
          />
          <div className="flex gap-2 mt-2">
            <Button
              onClick={handlePlan}
              disabled={!planDate}
              className="flex-1 rounded-pill"
              size="sm"
            >
              {planDate ? `Planifier le ${format(planDate, "d MMMM", { locale: fr })}` : "Choisis une date"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDatePicker(false)}
              className="rounded-pill"
            >
              Annuler
            </Button>
          </div>
        </div>
      )}

      {/* Transformer : pills affichées quand on l'a demandé depuis le menu */}
      {showTransformPicker && idea?.content_draft && (
        <div className="rounded-[10px] border border-border bg-card/40 p-3 space-y-2">
          <p className="text-xs font-semibold text-foreground">🔄 Transformer dans un autre format</p>
          <div className="flex flex-wrap gap-1.5">
            {transformFormats.map((f) => (
              <button
                key={f.id}
                onClick={() => handleTransform(f.id)}
                className="text-xs px-3 py-1.5 rounded-full border border-border hover:border-primary hover:bg-primary hover:text-primary-foreground transition-all"
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Footer : auto-save silencieux + UN bouton « Générer » avec menu (aligné sur l'éditeur de post) */}
      <div className="border-t border-border pt-4 flex items-center gap-3">
        <span className="text-2xs text-muted-foreground flex items-center gap-1 min-w-0">
          {autoSaveState === "saving" ? (<><Loader2 className="h-3 w-3 animate-spin shrink-0" /> Enregistrement…</>)
            : autoSaveState === "saved" ? (<><Check className="h-3 w-3 text-success shrink-0" /> Enregistré</>)
            : title.trim() ? "Enregistrement automatique" : "Donne un titre pour commencer"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button onClick={handleGenerate} disabled={!title.trim()} className="rounded-pill gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90">
            <Sparkles className="h-4 w-4" /> Générer le contenu
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="rounded-pill" aria-label="Plus d'actions">
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => setShowDatePicker(true)}>
                <CalendarIcon className="h-4 w-4 mr-2" /> Planifier dans le calendrier
              </DropdownMenuItem>
              {idea?.content_draft && (
                <DropdownMenuItem onClick={() => setShowTransformPicker((v) => !v)}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Transformer dans un autre format
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="h-4 w-4 mr-2" /> Supprimer
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader className="text-left">
            <DialogTitle className="sr-only">Modifier l'idée</DialogTitle>
            <DialogDescription className="sr-only">Formulaire de modification de l'idée</DialogDescription>
            {contextHeader}
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="sr-only">Modifier l'idée</SheetTitle>
          <SheetDescription className="sr-only">Formulaire de modification de l'idée</SheetDescription>
          {contextHeader}
        </SheetHeader>
        {content}
      </SheetContent>
    </Sheet>
  );
}
