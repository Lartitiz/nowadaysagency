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
  contentType: "story" | "reel" | "post_instagram" | "post_linkedin";
  subject: string;
  contentData: any;
  personalElements?: any;
  sourceModule: string;
  format?: string;
  objectif?: string;
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

    const contentEmoji = contentType === "story" ? "📱" : contentType === "reel" ? "🎬" : "📸";
    const formatLabel = contentType === "story" ? "story_serie" : contentType === "reel" ? "reel" : format || "post";

    const { error } = await supabase.from("saved_ideas").insert({
      user_id: user.id,
      workspace_id: workspaceId !== user.id ? workspaceId : undefined,
      titre: `${contentEmoji} ${subject || contentType}`,
      angle: selectedTags.length > 0 ? selectedTags.join(", ") : contentType,
      format: formatLabel,
      canal: "instagram",
      objectif: objectif || null,
      type: "draft",
      status: "to_explore",
      notes: note || null,
      content_draft: typeof contentData === "string" ? contentData : JSON.stringify(contentData),
      content_data: contentData,
      source_module: sourceModule,
      personal_elements: personalElements || null,
    } as any);

    setSaving(false);
    onOpenChange(false);

    if (error) {
      console.error("Save to ideas error:", error);
      toast.error("Erreur lors de la sauvegarde");
    } else {
      toast.success("💡 Idée sauvegardée ! Tu la retrouveras dans Mes idées.");
      setSelectedTags([]);
      setNote("");
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