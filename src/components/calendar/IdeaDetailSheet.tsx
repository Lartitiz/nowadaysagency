import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarIcon, Sparkles, Trash2, Save, RefreshCw } from "lucide-react";
import type { SavedIdea } from "./CalendarIdeasSidebar";

const FORMAT_OPTIONS = [
  { id: "post", label: "📝 Post" },
  { id: "carousel", label: "🎠 Carrousel" },
  { id: "reel", label: "🎬 Reel" },
  { id: "story", label: "📱 Story" },
  { id: "linkedin", label: "💼 LinkedIn" },
];

const OBJ_OPTIONS = [
  { id: "visibilite", label: "👀 Visibilité", color: "text-blue-600" },
  { id: "confiance", label: "🤝 Confiance", color: "text-green-600" },
  { id: "vente", label: "💰 Vente", color: "text-orange-600" },
];

const FORMAT_ROUTES: Record<string, string> = {
  post: "/creer",
  carousel: "/instagram/carousel",
  post_carrousel: "/instagram/carousel",
  reel: "/instagram/reels",
  story: "/instagram/stories",
  story_serie: "/instagram/stories",
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
  const { toast } = useToast();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  const [title, setTitle] = useState("");
  const [ideaFormat, setIdeaFormat] = useState("post");
  const [objective, setObjective] = useState("visibilite");
  const [notes, setNotes] = useState("");
  const [contentDraft, setContentDraft] = useState("");
  const [planDate, setPlanDate] = useState<Date | undefined>();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showTransformPicker, setShowTransformPicker] = useState(false);

  useEffect(() => {
    if (idea) {
      setTitle(idea.titre);
      setIdeaFormat(idea.format || "post");
      setObjective(idea.objectif || "visibilite");
      setNotes(idea.notes || "");
      setContentDraft(idea.content_draft || "");
      setConfirmDelete(false);
      setShowDatePicker(false);
      setShowTransformPicker(false);
      setPlanDate(undefined);
    }
  }, [idea]);

  const handleSave = async () => {
    if (!idea || !user) return;
    await supabase.from("saved_ideas").update({
      titre: title.trim(),
      format: ideaFormat,
      objectif: objective,
      notes: notes || null,
      content_draft: contentDraft || null,
      canal: ideaFormat === "linkedin" ? "linkedin" : "instagram",
    }).eq("id", idea.id);
    toast({ title: "Idée enregistrée !" });
    onUpdated();
  };

  const handlePlan = async () => {
    if (!idea || !planDate || !user) return;
    const dateStr = format(planDate, "yyyy-MM-dd");
    const { data: newPost } = await supabase.from("calendar_posts").insert({
      user_id: user.id,
      date: dateStr,
      theme: title.trim(),
      status: "idea",
      canal: ideaFormat === "linkedin" ? "linkedin" : "instagram",
      objectif: objective,
      format: ideaFormat,
      notes: notes || null,
      content_draft: idea.content_draft,
    }).select("id").single();
    if (newPost) {
      await supabase.from("saved_ideas").update({ calendar_post_id: newPost.id, planned_date: dateStr }).eq("id", idea.id);
    }
    toast({ title: `Planifié le ${format(planDate, "d MMMM", { locale: fr })}` });
    onOpenChange(false);
    onPlanned();
  };

  const handleDelete = async () => {
    if (!idea) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    await supabase.from("saved_ideas").delete().eq("id", idea.id);
    toast({ title: "Idée supprimée" });
    onOpenChange(false);
    onUpdated();
  };

  const handleGenerate = () => {
    if (!idea) return;
    // Save changes first
    handleSave();
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

  const handleTransform = (targetFormat: string) => {
    if (!idea) return;
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

  const content = (

    <div className="space-y-5 mt-2">
      {/* Titre */}
      <div>
        <label className="text-sm font-medium mb-1.5 block">Titre</label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Mon idée de contenu..."
          className="rounded-[10px] h-11"
        />
      </div>

      {/* Format */}
      <div>
        <label className="text-sm font-medium mb-1.5 block">Format</label>
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
        <label className="text-sm font-medium mb-1.5 block">Objectif</label>
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
        <label className="text-sm font-medium mb-1.5 block">Notes</label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Idées, brouillon, remarques..."
          className="rounded-[10px] min-h-[80px] text-sm"
        />
      </div>

      {/* Generated content */}
      {(idea?.content_draft || contentDraft) && (
        <div>
          <label className="text-xs font-semibold mb-1.5 block text-foreground flex items-center gap-1.5">
            ✨ Contenu généré
          </label>
          <Textarea
            value={contentDraft}
            onChange={(e) => setContentDraft(e.target.value)}
            placeholder="Le contenu généré apparaîtra ici..."
            className="rounded-[10px] min-h-[120px] text-sm"
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

      {/* Actions */}
      <div className="border-t border-border pt-4 space-y-2">
        <div className="flex flex-wrap gap-2">
          {!showDatePicker && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDatePicker(true)}
              className="rounded-pill text-xs gap-1.5"
            >
              <CalendarIcon className="h-3.5 w-3.5" /> Planifier
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerate}
            className="rounded-pill text-xs gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" /> Générer le contenu
          </Button>
          {idea?.content_draft && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTransformPicker((v) => !v)}
              className="rounded-pill text-xs gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Transformer dans un autre format
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            className={cn(
              "rounded-pill text-xs gap-1.5",
              confirmDelete ? "text-destructive border-destructive" : "text-muted-foreground"
            )}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {confirmDelete ? "Confirmer la suppression" : "Supprimer"}
          </Button>
        </div>
        {showTransformPicker && (
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
        )}
        <Button onClick={handleSave} disabled={!title.trim()} className="w-full rounded-pill gap-1.5">
          <Save className="h-3.5 w-3.5" /> Enregistrer
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display">✏️ Modifier l'idée</DialogTitle>
            <DialogDescription className="sr-only">Formulaire de modification de l'idée</DialogDescription>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-display">✏️ Modifier l'idée</SheetTitle>
          <SheetDescription className="sr-only">Formulaire de modification de l'idée</SheetDescription>
        </SheetHeader>
        {content}
      </SheetContent>
    </Sheet>
  );
}
