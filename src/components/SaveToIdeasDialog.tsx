// ============= Full file contents =============

import { useState, useRef } from "react";
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
  onSavingChange?: (saving: boolean) => void;
  onSaved?: (id: string, complete: boolean) => void;
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
  onSavingChange,
  onSaved,
}: Props) {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

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
    if (savingRef.current) return;
    if (!user) { toast.error("Reconnecte-toi pour enregistrer ton contenu."); return; }
    savingRef.current = true;
    setSaving(true);
    onSavingChange?.(true);
    try {
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
        content_data: visualSlides?.length && typeof contentData === "object" ? { ...contentData, visual_html: visualSlides } : contentData,
        personal_elements: personalElements || null,
      };

      let targetId: string | null = null;
      let isUpdate = false;

      if (editingIdeaId) {
        isUpdate = true;
        // On range le contenu SUR l'idée de départ sans lui voler son identité :
        // le titre et l'angle notés par l'utilisatrice restent, seuls le contenu,
        // le format/canal et les notes sont mis à jour.
        const { titre: _titre, angle: _angle, ...contentFields } = baseFields;
        const { error } = await supabase
          .from("saved_ideas")
          .update({ ...contentFields, updated_at: new Date().toISOString() } as any)
          .eq("id", editingIdeaId).select("id").single();
        if (error) {
          setSaving(false);
          console.error("Update idea error:", error);
          throw error;
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
          console.error("Save to ideas error:", error);
          throw error;
        }
        targetId = newIdea?.id ?? null;
      }

      if (!targetId) throw new Error("L’enregistrement n’a pas été confirmé.");
      // Close once the text is safe; the result keeps a visible progress status.
      onOpenChange(false);
      // Do not claim a complete save before the visuals have also been attached.
      const complete = visualSlides?.length && onUploadVisuals
        ? await attachVisualsInBackground(targetId) : true;
      onSaved?.(targetId, complete);
      if (complete) toast.success(isUpdate ? "Contenu mis à jour dans Mes idées → En cours." : "Contenu enregistré dans Mes idées → En cours.");
      setSelectedTags([]);
      setNote("");
    } catch (error) {
      console.error("Save content failed:", error);
      toast.error("L’enregistrement a échoué. Ton contenu reste ouvert : réessaie avant de fermer.");
    } finally {
      savingRef.current = false;
      setSaving(false);
      onSavingChange?.(false);
    }
  };

  const attachVisualsInBackground = async (ideaId: string) => {
    const total = visualSlides!.length;
    const toastId = toast.loading(`Visuels en cours d'ajout… 0/${total}`);
    try {
      const urls = await onUploadVisuals!(ideaId, (done, t) => {
        toast.loading(`Visuels en cours d'ajout… ${done}/${t}`, { id: toastId });
      });
      if (urls.length !== total) throw new Error("Tous les visuels n’ont pas pu être enregistrés.");
      const { error: visualError } = await supabase
        .from("saved_ideas")
        .update({
          content_data: { ...contentData, visual_urls: urls, visual_html: visualSlides },
        } as any)
        .eq("id", ideaId).select("id").single();
      if (visualError) throw visualError;
      toast.success("Texte et visuels enregistrés ✓", { id: toastId });
      return true;
    } catch (e) {
      console.warn("Visual upload failed (idea saved without visuals):", e);
      toast.warning("Texte enregistré, mais visuels incomplets. Garde cet onglet ouvert et réessaie.", { id: toastId });
      return false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!saving) onOpenChange(next); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-lg">Enregistrer mon contenu</DialogTitle>
          <DialogDescription>Tu le retrouveras dans Mes idées → En cours, avec son texte et ses visuels. Rien ne sera publié.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div>
            <label className="text-sm font-medium text-foreground block mb-2">
              Un mot-clé pour retrouver ce contenu ? (optionnel)
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
                    <span key={t} className="rounded-full border border-primary bg-rose-pale px-2 py-0.5 text-xs text-primary-text">
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
            {saving ? "Enregistrement du contenu…" : "Enregistrer dans Mes idées"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}