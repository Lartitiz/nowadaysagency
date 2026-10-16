// ============= Full file contents =============

import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { externalizeCarouselMedia } from "@/lib/carousel-media";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { clearFlowState } from "@/hooks/use-flow-persistence";
import { resumeIdea } from "@/lib/resume-idea";
import { cleanIdeaTitle } from "@/lib/idea-to-calendar";

/**
 * L'idée a changé ailleurs (autre onglet, autre appareil) depuis son ouverture,
 * ou elle a été supprimée : rien n'a été écrit. Même contrôle que l'autosave
 * carrousel (`use-carousel-autosave.ts`) et le retour vers le calendrier
 * (`use-calendar-save.ts`) : `updated_at` attendu, jamais d'écrasement en douce.
 */
class IdeaVersionConflict extends Error {
  constructor(readonly deleted: boolean) {
    super("idea_version_conflict");
  }
}

const TAG_OPTIONS = [
  { id: "education", label: "Éducation" },
  { id: "storytelling", label: "Histoire" },
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
  sourcePhotos?: { userPhotoId?: string; edited?: boolean }[];
  personalElements?: any;
  sourceModule: string;
  format?: string;
  objectif?: string;
  visualSlides?: { slide_number: number; html: string }[];
  onUploadVisuals?: (ideaId: string, onProgress?: (done: number, total: number) => void) => Promise<string[]>;
  editingIdeaId?: string | null;
  onSavingChange?: (saving: boolean) => void;
  isSaveCurrent?: () => boolean;
  onSaveContent?: (fields: Record<string, any>) => Promise<string>;
  onPrepareContent?: (content: any) => Promise<{ contentData: any; rollback?: () => Promise<void> }>;
  onSaved?: (id: string, complete: boolean, preparedContent?: any) => void;
}

export function SaveToIdeasDialog({
  open,
  onOpenChange,
  contentType,
  subject,
  contentData,
  sourcePhotos,
  personalElements,
  sourceModule,
  format,
  objectif,
  visualSlides,
  onUploadVisuals,
  editingIdeaId,
  onSavingChange,
  onSaved,
  onSaveContent,
  onPrepareContent,
  isSaveCurrent,
}: Props) {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const scopeRef = useRef("");
  scopeRef.current = `${user?.id || ""}:${workspaceId || ""}`;
  const [conflict, setConflict] = useState<{ ideaId: string; deleted: boolean } | null>(null);

  // Version de l'idée lue À L'OUVERTURE du contenu (pas au moment d'enregistrer :
  // sinon on validerait en douce la version d'un autre onglet), puis mise à jour
  // après chacune de nos propres écritures.
  const versionRead = useRef<{ id: string; promise: Promise<string | null> } | null>(null);
  const readVersion = (id: string): Promise<string | null> => {
    if (versionRead.current?.id === id) return versionRead.current.promise;
    const promise = (async () => {
      const { data, error } = await supabase.from("saved_ideas").select("updated_at").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) throw new IdeaVersionConflict(true);
      return (data as { updated_at?: string | null }).updated_at ?? null;
    })();
    versionRead.current = { id, promise };
    promise.catch(() => { if (versionRead.current?.promise === promise) versionRead.current = null; });
    return promise;
  };
  const rememberVersion = (id: string, updatedAt: string | null | undefined) => {
    versionRead.current = { id, promise: Promise.resolve(updatedAt ?? null) };
  };
  useEffect(() => {
    setConflict(null);
    if (editingIdeaId && user?.id) void readVersion(editingIdeaId).catch(() => {});
    // Capture la version quand l'idée est ouverte, pas après l'avoir modifiée.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingIdeaId, user?.id]);

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

  const handleSave = async ({ asCopy = false }: { asCopy?: boolean } = {}) => {
    if (savingRef.current) return;
    if (!user) { toast.error("Reconnecte-toi pour enregistrer ton contenu."); return; }
    const scope = scopeRef.current;
    const isCurrent = () => scopeRef.current === scope && (!isSaveCurrent || isSaveCurrent());
    if (!isCurrent()) return;
    let prepared: { contentData: any; rollback?: () => Promise<void> } | undefined;
    let writeStarted = false;
    const rollbackPrepared = async () => {
      const rollback = prepared?.rollback;
      if (prepared) prepared.rollback = undefined;
      if (rollback) {
        try { await rollback(); } catch (error) { console.warn("Temporary idea media cleanup failed:", error); }
      }
    };
    savingRef.current = true;
    setSaving(true);
    onSavingChange?.(true);
    try {
      // Version attendue lue avant tout envoi de photos : un conflit déjà connu
      // ne doit rien téléverser.
      const updatesExisting = !onSaveContent && !!editingIdeaId && !asCopy;
      const expectedUpdatedAt = updatesExisting ? await readVersion(editingIdeaId!) : null;
      prepared = onPrepareContent ? await onPrepareContent(contentData) : undefined;
      if (!isCurrent()) { await rollbackPrepared(); return; }
      const preparedContent = prepared ? prepared.contentData : contentData;
      const provenance = (sourcePhotos || []).flatMap((photo, index) =>
        photo.userPhotoId
          ? [{ index, photo_id: photo.userPhotoId, edited: !!photo.edited }]
          : []
      );
      const currentContent = sourcePhotos?.length && preparedContent &&
          typeof preparedContent === "object" && !Array.isArray(preparedContent)
        ? (() => {
          const content = { ...preparedContent };
          delete content.source_photo_ids;
          delete content.photo_provenance;
          return provenance.length
            ? {
              ...content,
              source_photo_ids: provenance.map((entry) => entry.photo_id),
              photo_provenance: provenance,
            }
            : content;
        })()
        : preparedContent;
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

      const storedContent = visualSlides?.length && currentContent && typeof currentContent === "object" && !Array.isArray(currentContent)
        ? { ...currentContent, visual_html: visualSlides }
        : currentContent;
      // Photos des slides rangées à part : l'idée (données ET texte) ne garde que leurs liens.
      const contentWithOrigin = await externalizeCarouselMedia(storedContent && typeof storedContent === "object" && !Array.isArray(storedContent)
        ? { ...storedContent, _ai_generated: true }
        : storedContent, user.id);

      const baseFields = {
        titre: `${contentEmoji} ${subject || contentType}`,
        angle: selectedTags.length > 0 ? selectedTags.join(", ") : contentType,
        format: formatLabel,
        canal: canalValue,
        objectif: objectif || null,
        notes: note || null,
        content_draft: typeof contentWithOrigin === "string" ? contentWithOrigin : JSON.stringify(contentWithOrigin),
        content_data: contentWithOrigin,
        personal_elements: personalElements || null,
      };

      let targetId: string | null = null;
      let isUpdate = false;

      writeStarted = true;
      if (onSaveContent) {
        targetId = await onSaveContent(baseFields);
      } else if (updatesExisting) {
        isUpdate = true;
        // On range le contenu SUR l'idée de départ sans lui voler son identité :
        // le titre et l'angle notés par l'utilisatrice restent, seuls le contenu,
        // le format/canal et les notes sont mis à jour.
        const { titre: _titre, angle: _angle, ...contentFields } = baseFields;
        // Écriture conditionnelle : seulement si l'idée est encore dans la
        // version ouverte ici. Sinon, aucune ligne touchée → conflit.
        let query = supabase
          .from("saved_ideas")
          .update({ ...contentFields, updated_at: new Date().toISOString() } as any)
          .eq("id", editingIdeaId!);
        query = expectedUpdatedAt === null ? query.is("updated_at", null) : query.eq("updated_at", expectedUpdatedAt);
        const { data: updated, error } = await query.select("id,updated_at").maybeSingle();
        if (error) {
          setSaving(false);
          console.error("Update idea error:", error);
          throw error;
        }
        if (!updated) {
          const { data: stillThere } = await supabase.from("saved_ideas").select("id").eq("id", editingIdeaId!).maybeSingle();
          throw new IdeaVersionConflict(!stillThere);
        }
        rememberVersion(editingIdeaId!, (updated as { updated_at?: string | null }).updated_at);
        targetId = editingIdeaId!;
      } else {
        const { data: newIdea, error } = await supabase.from("saved_ideas").insert({
          user_id: user.id,
          workspace_id: workspaceId !== user.id ? workspaceId : undefined,
          ...baseFields,
          ...(asCopy ? { titre: `${baseFields.titre} (copie)` } : {}),
          type: "draft",
          status: "to_explore",
          source_module: sourceModule,
        } as any).select("id,updated_at").single();

        if (error) {
          setSaving(false);
          console.error("Save to ideas error:", error);
          throw error;
        }
        targetId = newIdea?.id ?? null;
        if (targetId) rememberVersion(targetId, (newIdea as { updated_at?: string | null }).updated_at);
      }

      if (!isCurrent()) return;
      if (!targetId) throw new Error("L’enregistrement n’a pas été confirmé.");
      setConflict(null);
      // Close once the text is safe; the result keeps a visible progress status.
      onOpenChange(false);
      // Do not claim a complete save before the visuals have also been attached.
      const complete = visualSlides?.length && onUploadVisuals
        ? await attachVisualsInBackground(targetId, currentContent) : true;
      if (prepared || provenance.length) onSaved?.(targetId, complete, currentContent);
      else onSaved?.(targetId, complete);
      if (complete) toast.success(isUpdate ? "Contenu mis à jour dans Mes idées → En cours."
        : asCopy ? "Copie enregistrée dans Mes idées → En cours. L’autre version n’a pas été touchée."
        : "Contenu enregistré dans Mes idées → En cours.");
      setSelectedTags([]);
      setNote("");
    } catch (error) {
      if (error instanceof IdeaVersionConflict) {
        // Réponse reçue : rien n'a été écrit, les photos préparées sont inutiles.
        await rollbackPrepared();
        if (!isCurrent()) return;
        setConflict({ ideaId: editingIdeaId!, deleted: error.deleted });
        return;
      }
      // A transport failure can arrive after commit: keep media unless SQL
      // explicitly rejected the write, or no write was attempted.
      const code = (error as { code?: string })?.code || "";
      if (!writeStarted || /^(22|23|42)/.test(code)) await rollbackPrepared();
      if (!isCurrent()) return;
      console.error("Save content failed:", error);
      toast.error("L’enregistrement a échoué. Ton contenu reste ouvert : réessaie avant de fermer.");
    } finally {
      savingRef.current = false;
      setSaving(false);
      onSavingChange?.(false);
    }
  };

  const attachVisualsInBackground = async (ideaId: string, currentContent: any) => {
    const total = visualSlides!.length;
    const toastId = toast.loading(`Visuels en cours d'ajout… 0/${total}`);
    try {
      const urls = await onUploadVisuals!(ideaId, (done, t) => {
        toast.loading(`Visuels en cours d'ajout… ${done}/${t}`, { id: toastId });
      });
      if (urls.length !== total) throw new Error("Tous les visuels n’ont pas pu être enregistrés.");
      const { data: withVisuals, error: visualError } = await supabase
        .from("saved_ideas")
        .update({
          content_data: await externalizeCarouselMedia({ ...currentContent, visual_urls: urls, visual_html: visualSlides }, user?.id || ""),
        } as any)
        .eq("id", ideaId).select("id,updated_at").single();
      if (visualError) throw visualError;
      // Notre propre écriture : la version attendue suit, sinon le prochain
      // enregistrement verrait un faux conflit.
      if (versionRead.current?.id === ideaId) rememberVersion(ideaId, (withVisuals as { updated_at?: string | null } | null)?.updated_at);
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

          {conflict ? (
            <div role="alert" className="space-y-3 rounded-xl border border-primary/30 bg-rose-pale p-3">
              <p className="text-sm font-medium text-foreground">
                {conflict.deleted ? "Cette idée n’existe plus dans Mes idées" : "Une version plus récente existe"}
              </p>
              <p className="text-sm text-muted-foreground">
                {conflict.deleted
                  ? "Elle a été supprimée depuis que tu l’as ouverte. Ton contenu est toujours là : enregistre-le comme nouvelle idée."
                  : "Cette idée a été modifiée ailleurs (un autre onglet ou un autre appareil) depuis que tu l’as ouverte. Pour ne rien perdre, on n’a rien écrasé. Qu’est-ce qu’on fait ?"}
              </p>
              <div className="flex flex-col gap-2">
                <Button onClick={() => void handleSave({ asCopy: true })} disabled={saving} className="w-full rounded-pill">
                  {saving ? "Enregistrement de la copie…" : conflict.deleted ? "Enregistrer comme nouvelle idée" : "Enregistrer une copie de mon contenu"}
                </Button>
                {!conflict.deleted && <ReloadLatestButton ideaId={conflict.ideaId} disabled={saving} />}
              </div>
            </div>
          ) : (
            <Button onClick={() => void handleSave()} disabled={saving} className="w-full rounded-pill">
              {saving ? "Enregistrement du contenu…" : "Enregistrer dans Mes idées"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Abandonne le contenu ouvert ici et rouvre la dernière version enregistrée de
 * l'idée (même chemin que « Ouvrir l'éditeur » depuis Mes idées). Composant à
 * part : il n'est monté qu'en cas de conflit, donc toujours sous le routeur.
 */
function ReloadLatestButton({ ideaId, disabled }: { ideaId: string; disabled?: boolean }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const reload = async () => {
    setLoading(true);
    try {
      const { data: idea, error } = await supabase.from("saved_ideas").select("*").eq("id", ideaId).maybeSingle();
      if (error) throw error;
      if (!idea) throw new Error("idea_not_found");
      const params = new URLSearchParams({
        sujet: cleanIdeaTitle(idea.titre),
        angle: idea.angle || "",
        format: idea.format || "",
        canal: idea.canal || "instagram",
        objectif: idea.objectif || "",
        idea_id: idea.id,
      });
      // La copie de secours du navigateur porte encore l'ancienne version :
      // on la retire, sinon /creer proposerait de la reprendre.
      clearFlowState();
      navigate(`/creer?${params.toString()}`, { state: { resumeIdea: resumeIdea(idea as any), ideaId: idea.id } });
    } catch (error) {
      console.error("Reload latest idea failed:", error);
      toast.error("Impossible de recharger la dernière version. Ton contenu est toujours là : enregistre plutôt une copie.");
      setLoading(false);
    }
  };
  return (
    <>
      <Button variant="outline" onClick={() => void reload()} disabled={disabled || loading} className="w-full rounded-pill">
        {loading ? "Chargement de la dernière version…" : "Recharger la dernière version"}
      </Button>
      <p className="text-xs text-muted-foreground">En rechargeant, les modifications faites ici sont abandonnées.</p>
    </>
  );
}
