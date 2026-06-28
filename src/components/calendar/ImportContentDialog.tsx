import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/use-profile";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";
import { isPublicImageUrl } from "@/lib/instagram-publish";
import { toLocalDateStr, cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Instagram, Linkedin, Loader2, GripVertical, Check } from "lucide-react";
import { SocialMockup } from "@/components/social-mockup/SocialMockup";
import { pdfToImageFiles, isPdfFile } from "@/lib/pdf-to-images";
import { DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

const MAX_IMAGES = 10;

/** Vignette d'un visuel, réordonnable au glisser (dnd-kit). */
function SortableThumb({ url, index, onRemove }: { url: string; index: number; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: url });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group w-16 h-16 rounded-lg overflow-hidden border border-border bg-muted touch-none cursor-grab active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <img src={url} alt={`Visuel ${index + 1}`} className="w-full h-full object-cover pointer-events-none" />
      <span className="absolute bottom-0.5 left-0.5 text-2xs font-semibold bg-black/60 text-white px-1 rounded">{index + 1}</span>
      <span className="absolute bottom-0.5 right-0.5 text-white/80 opacity-0 group-hover:opacity-100 transition-opacity"><GripVertical className="h-3 w-3" /></span>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={onRemove}
        aria-label={`Supprimer le visuel ${index + 1}`}
        className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-foreground/60 text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs"
      >×</button>
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Date pré-sélectionnée (depuis le menu "+" d'un jour) ; sinon aujourd'hui. */
  selectedDate: string | null;
  defaultCanal: string;
  /** Fichiers déposés sur une case du calendrier — traités automatiquement à l'ouverture. */
  initialFiles?: File[] | null;
  /** Rafraîchir le calendrier après ajout. */
  onSaved: () => void;
}

type Canal = "instagram" | "linkedin";
type Mode = "place" | "schedule";

/** 1ʳᵉ ligne non vide du contenu → titre interne (theme est NOT NULL en base). */
function deriveTheme(text: string): string {
  const firstLine = text.split("\n").map((l) => l.trim()).find(Boolean) || "";
  return firstLine.slice(0, 80) || "Contenu importé";
}

export function ImportContentDialog({ open, onOpenChange, selectedDate, defaultCanal, initialFiles, onSaved }: Props) {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const isMobile = useIsMobile();
  const { data: profileData } = useProfile();

  const ownerName = (profileData as any)?.prenom || "Moi";
  const igUsername = (profileData as any)?.instagram_username || ownerName;
  const avatarUrl = (profileData as any)?.avatar_url || undefined;

  const [captions, setCaptions] = useState<Record<Canal, string>>({ instagram: "", linkedin: "" });
  const [canals, setCanals] = useState<Canal[]>(["instagram"]);
  const [activeCanal, setActiveCanal] = useState<Canal>("instagram");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadLabel, setUploadLabel] = useState("Ajouter des visuels ou un PDF");
  const [mode, setMode] = useState<Mode>("place");
  const [dateStr, setDateStr] = useState("");
  const [time, setTime] = useState("09:00");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    const start: Canal = defaultCanal === "linkedin" ? "linkedin" : "instagram";
    setCaptions({ instagram: "", linkedin: "" });
    setCanals([start]);
    setActiveCanal(start);
    setMediaUrls([]);
    setUploading(false);
    setMode("place");
    setDateStr(selectedDate || toLocalDateStr(new Date()));
    setTime("09:00");
    setSaving(false);
  }, [open, selectedDate, defaultCanal]);

  const igValidImages = useMemo(() => mediaUrls.filter(isPublicImageUrl), [mediaUrls]);
  const captionOf = (c: Canal) => (captions[c] || "").trim();
  const activeText = captions[activeCanal] || "";

  const toggleCanal = (c: Canal) => {
    setCanals((prev) => {
      if (prev.includes(c)) {
        const next = prev.filter((x) => x !== c);
        if (next.length > 0 && activeCanal === c) setActiveCanal(next[0]);
        return next;
      }
      setActiveCanal(c);
      return [...prev, c];
    });
  };

  const CANAL_LABEL: Record<Canal, string> = { instagram: "Instagram", linkedin: "LinkedIn" };

  const applySameTextEverywhere = () => {
    const v = captions[activeCanal] || "";
    setCaptions((prev) => {
      const next = { ...prev };
      canals.forEach((c) => { next[c] = v; });
      return next;
    });
  };

  // Réordonnancement des visuels au glisser. PointerSensor avec distance 5px
  // pour que le clic sur « × » (supprimer) ne déclenche pas un drag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleReorder = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setMediaUrls((prev) => {
      const from = prev.indexOf(String(active.id));
      const to = prev.indexOf(String(over.id));
      if (from === -1 || to === -1) return prev;
      return arrayMove(prev, from, to);
    });
  };

  /** Traite des fichiers (images + PDF) : expansion PDF → upload calendar-media. */
  const processFiles = async (rawFiles: File[], baseCount: number) => {
    if (rawFiles.length === 0) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    setUploading(true);
    try {
      // 1) Étendre : un PDF est rendu en une image JPEG par page (côté navigateur).
      const imageFiles: File[] = [];
      for (const file of rawFiles) {
        if (isPdfFile(file)) {
          setUploadLabel("Conversion du PDF…");
          const { files: pages, totalPages } = await pdfToImageFiles(file, { maxPages: MAX_IMAGES });
          if (pages.length === 0) { toast.error("PDF illisible", { description: "Aucune page n'a pu être convertie." }); continue; }
          if (totalPages > MAX_IMAGES) {
            toast(`PDF de ${totalPages} pages`, { description: `Seules les ${MAX_IMAGES} premières ont été importées (limite carrousel Instagram).` });
          }
          imageFiles.push(...pages);
        } else if (file.type.startsWith("image/")) {
          if (file.size > 10 * 1024 * 1024) { toast.error("Image trop lourde (max 10 Mo)"); continue; }
          imageFiles.push(file);
        } else {
          toast.error("Format non géré", { description: "Ajoute des images ou un PDF." });
        }
      }

      // 2) Plafonner à 10 visuels au total (limite carrousel Instagram).
      const remaining = Math.max(0, MAX_IMAGES - baseCount);
      const toUpload = imageFiles.slice(0, remaining);
      if (imageFiles.length > remaining) {
        toast("Maximum 10 visuels", { description: "Les visuels en trop n'ont pas été ajoutés." });
      }

      // 3) Upload vers le bucket public calendar-media.
      setUploadLabel("Upload en cours…");
      const newUrls: string[] = [];
      for (const file of toUpload) {
        const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
        const { error } = await supabase.storage.from("calendar-media").upload(path, file, { contentType: file.type || "image/jpeg" });
        if (error) throw error;
        const { data } = supabase.storage.from("calendar-media").getPublicUrl(path);
        if (data?.publicUrl) newUrls.push(data.publicUrl);
      }
      if (newUrls.length > 0) setMediaUrls((prev) => [...prev, ...newUrls]);
    } catch (err: any) {
      toast.error("Erreur à l'import", { description: friendlyError(err) });
    } finally {
      setUploading(false);
      setUploadLabel("Ajouter des visuels ou un PDF");
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    await processFiles(Array.from(files), mediaUrls.length);
    e.target.value = "";
  };

  // Fichiers déposés sur une case du calendrier : traités dès l'ouverture.
  useEffect(() => {
    if (open && initialFiles && initialFiles.length > 0) {
      void processFiles(initialFiles, 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialFiles]);

  // ── Validation (sur l'ensemble des réseaux cochés) ──
  const validationError = (() => {
    if (canals.length === 0) return "Choisis au moins un réseau où publier.";
    if (canals.includes("instagram")) {
      if (igValidImages.length === 0) return "Ajoute au moins un visuel pour Instagram.";
      if (igValidImages.length > 10) return "Instagram limite les carrousels à 10 images.";
    }
    if (canals.includes("linkedin") && !captionOf("linkedin")) return "Écris le texte du post LinkedIn.";
    if (mode === "schedule") {
      if (!dateStr || !time) return "Choisis une date et une heure.";
      const when = new Date(`${dateStr}T${time}`);
      if (isNaN(when.getTime())) return "Date invalide.";
      if (when.getTime() < Date.now() + 60000) return "Choisis une date/heure dans le futur.";
    }
    return null;
  })();

  const handleSave = async () => {
    if (!user) { toast.error("Tu dois être connectée."); return; }
    if (validationError) { toast.error(validationError); return; }
    setSaving(true);
    try {
      const scheduledAt = mode === "schedule" ? new Date(`${dateStr}T${time}`).toISOString() : null;
      // Un post par réseau coché (même visuels, même date/heure, légende propre à chaque réseau).
      const rows = canals.map((c) => {
        const cap = captionOf(c);
        const row: any = {
          user_id: user.id,
          workspace_id: workspaceId !== user.id ? workspaceId : undefined,
          date: dateStr,
          theme: deriveTheme(cap),
          status: "ready",
          canal: c,
          content_draft: cap || null,
          accroche: cap ? cap.split("\n").map((l) => l.trim()).find(Boolean)?.slice(0, 120) || null : null,
          media_urls: mediaUrls.length > 0 ? mediaUrls : null,
          format: c === "instagram" ? (igValidImages.length > 1 ? "carousel" : "post") : null,
        };
        if (scheduledAt) {
          row.scheduled_publish_at = scheduledAt;
          row.auto_publish = true;
          row.publish_status = "scheduled";
        }
        return row;
      });
      const { error } = await supabase.from("calendar_posts").insert(rows);
      if (error) throw error;
      const names = canals.map((c) => CANAL_LABEL[c]).join(" et ");
      toast({
        title: mode === "schedule" ? "Publication programmée ! 🗓️" : "Contenu ajouté au calendrier !",
        description: mode === "schedule"
          ? `${names} ${canals.length > 1 ? "publieront" : "publiera"} automatiquement à l'heure prévue.`
          : `Ajouté pour ${names}.`,
      });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Échec de l'enregistrement", { description: friendlyError(err) });
    } finally {
      setSaving(false);
    }
  };

  // ── Sous-blocs ──
  const formBlock = (
    <div className="space-y-5 min-w-0">
      {/* Où publier (multi-réseaux) */}
      <div className="space-y-2">
        <label className="text-xs font-semibold block text-foreground">📣 Où publier</label>
        <div className="flex gap-2">
          {([
            { id: "instagram" as Canal, label: "Instagram", Icon: Instagram },
            { id: "linkedin" as Canal, label: "LinkedIn", Icon: Linkedin },
          ]).map(({ id, label, Icon }) => {
            const on = canals.includes(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggleCanal(id)}
                aria-pressed={on}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs transition-colors",
                  on ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {on ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />} {label}
              </button>
            );
          })}
        </div>
        {canals.length > 1 && (
          <p className="text-2xs text-muted-foreground">Un post par réseau · mêmes visuels, légende propre à chacun.</p>
        )}
      </div>

      {/* Légende (par réseau actif) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-semibold text-foreground">✍️ Ta légende{canals.length > 1 ? ` — ${CANAL_LABEL[activeCanal]}` : ""}</label>
          {canals.length > 1 && (
            <button type="button" onClick={applySameTextEverywhere} className="text-2xs text-primary hover:underline">Même texte partout</button>
          )}
        </div>
        {canals.length > 1 && (
          <div className="flex gap-1">
            {canals.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setActiveCanal(c)}
                className={cn(
                  "rounded-pill px-2.5 py-1 text-2xs transition-colors",
                  activeCanal === c ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"
                )}
              >{CANAL_LABEL[c]}</button>
            ))}
          </div>
        )}
        <Textarea
          autoFocus
          value={activeText}
          onChange={(e) => setCaptions((prev) => ({ ...prev, [activeCanal]: e.target.value }))}
          placeholder={activeCanal === "linkedin" ? "Le texte de ton post LinkedIn…" : "La légende de ton post Instagram (optionnelle)…"}
          className="rounded-[10px] min-h-[110px]"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold block text-foreground">🖼️ Tes visuels</label>
        {mediaUrls.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleReorder}>
            <SortableContext items={mediaUrls} strategy={rectSortingStrategy}>
              <div className="flex flex-wrap gap-2">
                {mediaUrls.map((url, i) => (
                  <SortableThumb
                    key={url}
                    url={url}
                    index={i}
                    onRemove={() => setMediaUrls((prev) => prev.filter((u) => u !== url))}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {uploading ? uploadLabel : "Ajouter des visuels ou un PDF"}
          <input type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
        <p className="text-2xs text-muted-foreground">
          {canals.includes("instagram")
            ? (igValidImages.length > 1
                ? `Carrousel de ${igValidImages.length} images · glisse les vignettes pour les réordonner`
                : "1 image = post simple · jusqu'à 10 pour un carrousel. Un PDF est découpé en slides.")
            : "LinkedIn publie le texte ; les visuels restent attachés au post pour référence."}
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold block text-foreground">🗓️ Quand</label>
        <div className="flex rounded-pill border border-border bg-muted/40 p-0.5 max-w-xs">
          {([
            { id: "place" as Mode, label: "Juste le poser" },
            { id: "schedule" as Mode, label: "Programmer" },
          ]).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={cn(
                "flex-1 rounded-pill px-3 py-1.5 text-xs transition-colors",
                mode === id ? "bg-background text-foreground font-medium border border-border" : "text-muted-foreground"
              )}
            >{label}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <input
            type="date"
            value={dateStr}
            onChange={(e) => setDateStr(e.target.value)}
            className="rounded-[8px] border border-border bg-background px-2 py-1.5 text-xs text-foreground"
          />
          {mode === "schedule" && (
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="rounded-[8px] border border-border bg-background px-2 py-1.5 text-xs text-foreground"
            />
          )}
        </div>
        {mode === "schedule" ? (
          <p className="text-2xs text-muted-foreground">
            Publié automatiquement sur {canals.map((c) => CANAL_LABEL[c]).join(" et ")} à l'heure prévue.
          </p>
        ) : (
          <p className="text-2xs text-muted-foreground">Placé dans le calendrier au statut « prêt ». Pas de publication automatique.</p>
        )}
      </div>
    </div>
  );

  const previewBlock = (
    <div>
      <p className="text-2xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
        Aperçu{canals.length > 1 ? ` — ${CANAL_LABEL[activeCanal]}` : ""}
      </p>
      {activeText.trim() || igValidImages.length > 0 ? (
        <SocialMockup
          canal={activeCanal}
          format={activeCanal === "instagram" && igValidImages.length > 1 ? "carousel" : "post"}
          username={igUsername}
          displayName={ownerName}
          avatarUrl={avatarUrl}
          caption={activeText}
          mediaUrls={igValidImages.length > 0 ? igValidImages : undefined}
          showComments={false}
          readonly
          hideFollowButton
          compact
        />
      ) : (
        <div className="flex flex-col items-center justify-center py-10 text-center rounded-xl border border-dashed border-border">
          <p className="text-2xl mb-2">👁️</p>
          <p className="text-xs text-muted-foreground">Colle ton texte ou ajoute un visuel<br />pour voir l'aperçu.</p>
        </div>
      )}
    </div>
  );

  const footer = (
    <div className="flex items-center justify-between gap-3 pt-4 mt-2 border-t border-border">
      <span className="text-2xs text-muted-foreground hidden sm:block">
        {validationError
          ? validationError
          : `Au ${new Date(`${dateStr}T00:00:00`).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}${mode === "schedule" ? ` · ${time}` : ""}`}
      </span>
      <div className="flex gap-2 ml-auto">
        <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-pill">Annuler</Button>
        <Button onClick={handleSave} disabled={saving || !!validationError} className="rounded-pill bg-primary text-primary-foreground hover:bg-primary/90">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "schedule" ? "Programmer" : "Ajouter au calendrier"}
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("max-h-[90vh] overflow-hidden flex flex-col p-0", isMobile ? "sm:max-w-lg" : "sm:max-w-3xl")}>
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle className="font-display">📥 Importer un contenu</DialogTitle>
          <DialogDescription>Un post déjà prêt — choisis tes réseaux, et programme tout en une fois.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {isMobile ? (
            <div className="space-y-6">
              {formBlock}
              {previewBlock}
            </div>
          ) : (
            <div className="grid grid-cols-[1fr_280px] gap-6">
              <div>{formBlock}</div>
              <aside className="border-l border-border pl-6">{previewBlock}</aside>
            </div>
          )}
          {footer}
        </div>
      </DialogContent>
    </Dialog>
  );
}
