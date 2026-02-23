import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { CalendarIcon, Sparkles, Trash2, Save } from "lucide-react";
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
  post: "/instagram/creer",
  carousel: "/instagram/carousel",
  post_carrousel: "/instagram/carousel",
  reel: "/instagram/reels",
  story: "/instagram/stories",
  story_serie: "/instagram/stories",
  linkedin: "/linkedin",
  post_photo: "/instagram/creer",
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
  const [planDate, setPlanDate] = useState<Date | undefined>();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (idea) {
      setTitle(idea.titre);
      setIdeaFormat(idea.format || "post");
      setObjective(idea.objectif || "visibilite");
      setNotes(idea.notes || "");
      setConfirmDelete(false);
      setShowDatePicker(false);
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
    const route = FORMAT_ROUTES[ideaFormat] || "/instagram/creer";
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
        </SheetHeader>
        {content}
      </SheetContent>
    </Sheet>
  );
}
