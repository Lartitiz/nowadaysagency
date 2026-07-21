// ============= Full file contents =============

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";

const TAG_OPTIONS = [
  { id: "education", label: "Éducation" },
  { id: "storytelling", label: "Storytelling" },
  { id: "vente", label: "Vente" },
  { id: "engagement", label: "Engagement" },
  { id: "coup_de_gueule", label: "Coup de gueule" },
  { id: "permission", label: "Permission" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentType: "story" | "reel" | "post_instagram" | "post_linkedin" | "newsletter" | "pinterest";
  subject: string;
  contentData: any;
  personalElements?: any;
  sourceModule: string;
  format?: string;
  objectif?: string;
  visualSlides?: { slide_number: number; html: string }[];
  onUploadVisuals?: (ideaId: string, onProgress?: (done: number, total: number) => void) => Promise<string[]>;
  editingIdeaId?: string | null;
}

export function SaveToIdeasDialog({
  open,
  onOpenChange,
  contentType,
  subject,
  contentData,
  personalElements,
  sourceModule,
  format,
  objectif,
  visualSlides,
  onUploadVisuals,
  editingIdeaId,
}: Props) {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleAddCustomTag = () => {
    const trimmed = customTag.trim();
    if (trimmed && !selectedTags.includes(trimmed)) {
      setSelectedTags((prev) => [...prev, trimmed]);
      setCustomTag("");
    }
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    const contentEmoji =
      contentType === "newsletter" ? "📧" :
      contentType === "story" ? "📱" :
      contentType === "reel" ? "🎬" :
      contentType === "pinterest" ? "📌" : "📸";
    const formatLabel =
      contentType === "newsletter" ? "newsletter" :
      contentType === "story" ? "story_serie" :
      contentType === "reel" ? "reel" :
      contentType === "pinterest" ? (format || "pinterest") : (format || "post");
    const canalValue =
      contentType === "newsletter" ? "newsletter" :
      contentType === "post_linkedin" ? "linkedin" :
      contentType === "pinterest" ? "pinterest" : "instagram";

    const baseFields = {
      titre: `${contentEmoji} ${subject || contentType}`,
      angle: selectedTags.length > 0 ? selectedTags.join(", ") : contentType,
      format: formatLabel,
      canal: canalValue,
      objectif: objectif || null,
      notes: note || null,
      content_draft: typeof contentData === "string" ? contentData : JSON.stringify(contentData),
      content_data: contentData,
      personal_elements: personalElements || null,
    };

    let targetId: string | null = null;
    let isUpdate = false;

    if (editingIdeaId) {
      isUpdate = true;
      const { error } = await supabase
        .from("saved_ideas")
        .update({ ...baseFields, updated_at: new Date().toISOString() } as any)
        .eq("id", editingIdeaId);
      if (error) {
        setSaving(false);
        onOpenChange(false);
        console.error("Update idea error:", error);
        toast.error("Erreur lors de la mise à jour");
        return;
      }
      targetId = editingIdeaId;
    } else {
      const { data: newIdea, error } = await supabase.from("saved_ideas").insert({
        user_id: user.id,
        workspace_id: workspaceId !== user.id ? workspaceId : undefined,
        ...baseFields,
        type: "draft",
        status: "to_explore",
        source_module: sourceModule,
      } as any).select("id").single();

      if (error) {
        setSaving(false);
        onOpenChange(false);
        console.error("Save to ideas error:", error);
        toast.error("Erreur lors de la sauvegarde");
        return;
      }
      targetId = newIdea?.id ?? null;
    }

    // L'idée est en base : on ferme tout de suite, l'attache des visuels
    // (rasterisation + upload, plusieurs secondes par slide) se fait en arrière-plan.
    setSaving(false);
    onOpenChange(false);
    toast.success(isUpdate ? "💡 Idée mise à jour !" : "💡 Idée sauvegardée ! Tu la retrouveras dans Mes idées.");
    setSelectedTags([]);
    setNote("");

    if (visualSlides && visualSlides.length > 0 && onUploadVisuals && targetId) {
      void attachVisualsInBackground(targetId);
    }
  };

  const attachVisualsInBackground = async (ideaId: string) => {
    const total = visualSlides!.length;
    const toastId = toast.loading(`Visuels en cours d'ajout… 0/${total}`);
    try {
      const urls = await onUploadVisuals!(ideaId, (done, t) => {
        toast.loading(`Visuels en cours d'ajout… ${done}/${t}`, { id: toastId });
      });
      if (urls.length === 0) throw new Error("Aucun visuel n'a pu être uploadé");
      const { error: visualError } = await supabase
        .from("saved_ideas")
        .update({
          content_data: { ...contentData, visual_urls: urls, visual_html: visualSlides },
        } as any)
        .eq("id", ideaId);
      if (visualError) throw visualError;
      toast.success("Visuels attachés à ton idée ✓", { id: toastId });
    } catch (e) {
      console.warn("Visual upload failed (idea saved without visuals):", e);
      toast.warning("Idée sauvegardée, mais ses visuels n'ont pas pu y être attachés.", { id: toastId });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">💡 Sauvegarder dans mes idées</DialogTitle>
          <DialogDescription className="sr-only">Enregistrer ce contenu dans ta banque d'idées</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <label className="text-sm font-medium text-foreground block mb-2">
              Un tag pour retrouver cette idée ? (optionnel)
            </label>
            <div className="flex flex-wrap gap-2">
              {TAG_OPTIONS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => toggleTag(t.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs transition-all ${
                    selectedTags.includes(t.id)
                      ? "border-primary bg-rose-pale font-bold text-primary"
                      : "border-border bg-background hover:border-primary/50 text-muted-foreground"
                  }`}
                >
                  {t.label}
                </button>
              ))}
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={customTag}
                  onChange={(e) => setCustomTag(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddCustomTag()}
                  placeholder="+ Autre"
                  className="w-20 rounded-full border border-border bg-background px-3 py-1.5 text-xs placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                />
              </div>
            </div>
            {selectedTags.filter((t) => !TAG_OPTIONS.find((o) => o.id === t)).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedTags
                  .filter((t) => !TAG_OPTIONS.find((o) => o.id === t))
                  .map((t) => (
                    <span key={t} className="rounded-full border border-primary bg-rose-pale px-2 py-0.5 text-xs text-primary">
                      {t}
                      <button onClick={() => toggleTag(t)} className="ml-1 text-primary/60 hover:text-primary">×</button>
                    </span>
                  ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-foreground block mb-1.5">
              Note perso (optionnel)
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="À utiliser pour le lancement de mars"
              className="min-h-[60px]"
            />
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full rounded-pill">
            {saving ? "Sauvegarde..." : "💾 Sauvegarder"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}