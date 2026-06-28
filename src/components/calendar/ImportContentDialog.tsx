import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useProfile } from "@/hooks/use-profile";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { isPublicImageUrl } from "@/lib/instagram-publish";
import { toLocalDateStr, cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Instagram, Linkedin, Loader2 } from "lucide-react";
import { SocialMockup } from "@/components/social-mockup/SocialMockup";
import { pdfToImageFiles, isPdfFile } from "@/lib/pdf-to-images";

const MAX_IMAGES = 10;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Date pré-sélectionnée (depuis le menu "+" d'un jour) ; sinon aujourd'hui. */
  selectedDate: string | null;
  defaultCanal: string;
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

export function ImportContentDialog({ open, onOpenChange, selectedDate, defaultCanal, onSaved }: Props) {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { data: profileData } = useProfile();

  const ownerName = (profileData as any)?.prenom || "Moi";
  const igUsername = (profileData as any)?.instagram_username || ownerName;
  const avatarUrl = (profileData as any)?.avatar_url || undefined;

  const [contentText, setContentText] = useState("");
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadLabel, setUploadLabel] = useState("Ajouter des visuels ou un PDF");
  const [canal, setCanal] = useState<Canal>("instagram");
  const [mode, setMode] = useState<Mode>("place");
  const [dateStr, setDateStr] = useState("");
  const [time, setTime] = useState("09:00");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setContentText("");
    setMediaUrls([]);
    setUploading(false);
    setCanal(defaultCanal === "linkedin" ? "linkedin" : "instagram");
    setMode("place");
    setDateStr(selectedDate || toLocalDateStr(new Date()));
    setTime("09:00");
    setSaving(false);
  }, [open, selectedDate, defaultCanal]);

  const igValidImages = useMemo(() => mediaUrls.filter(isPublicImageUrl), [mediaUrls]);
  const text = contentText.trim();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    setUploading(true);
    try {
      // 1) Étendre : un PDF est rendu en une image JPEG par page (côté navigateur).
      const imageFiles: File[] = [];
      for (const file of Array.from(files)) {
        if (isPdfFile(file)) {
          setUploadLabel("Conversion du PDF…");
          const { files: pages, totalPages } = await pdfToImageFiles(file, { maxPages: MAX_IMAGES });
          if (pages.length === 0) { toast({ title: "PDF illisible", description: "Aucune page n'a pu être convertie.", variant: "destructive" }); continue; }
          if (totalPages > MAX_IMAGES) {
            toast({ title: `PDF de ${totalPages} pages`, description: `Seules les ${MAX_IMAGES} premières ont été importées (limite carrousel Instagram).` });
          }
          imageFiles.push(...pages);
        } else if (file.type.startsWith("image/")) {
          if (file.size > 10 * 1024 * 1024) { toast({ title: "Image trop lourde (max 10 Mo)", variant: "destructive" }); continue; }
          imageFiles.push(file);
        } else {
          toast({ title: "Format non géré", description: "Ajoute des images ou un PDF.", variant: "destructive" });
        }
      }

      // 2) Plafonner à 10 visuels au total (limite carrousel Instagram).
      const remaining = Math.max(0, MAX_IMAGES - mediaUrls.length);
      const toUpload = imageFiles.slice(0, remaining);
      if (imageFiles.length > remaining) {
        toast({ title: "Maximum 10 visuels", description: "Les visuels en trop n'ont pas été ajoutés." });
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
      toast({ title: "Erreur à l'import", description: friendlyError(err), variant: "destructive" });
    } finally {
      setUploading(false);
      setUploadLabel("Ajouter des visuels ou un PDF");
      e.target.value = "";
    }
  };

  // ── Validation ──
  const validationError = (() => {
    if (canal === "instagram") {
      if (igValidImages.length === 0) return "Ajoute au moins un visuel pour Instagram.";
      if (igValidImages.length > 10) return "Instagram limite les carrousels à 10 images.";
    }
    if (canal === "linkedin" && !text) return "Écris le texte du post pour LinkedIn.";
    if (mode === "schedule") {
      if (!dateStr || !time) return "Choisis une date et une heure.";
      const when = new Date(`${dateStr}T${time}`);
      if (isNaN(when.getTime())) return "Date invalide.";
      if (when.getTime() < Date.now() + 60000) return "Choisis une date/heure dans le futur.";
    }
    return null;
  })();

  const handleSave = async () => {
    if (!user) { toast({ title: "Tu dois être connectée.", variant: "destructive" }); return; }
    if (validationError) { toast({ title: validationError, variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload: any = {
        user_id: user.id,
        workspace_id: workspaceId !== user.id ? workspaceId : undefined,
        date: dateStr,
        theme: deriveTheme(contentText),
        status: "ready",
        canal,
        content_draft: text || null,
        accroche: text ? text.split("\n").map((l) => l.trim()).find(Boolean)?.slice(0, 120) || null : null,
        media_urls: mediaUrls.length > 0 ? mediaUrls : null,
        format: canal === "instagram" ? (igValidImages.length > 1 ? "carousel" : "post") : null,
      };
      if (mode === "schedule") {
        payload.scheduled_publish_at = new Date(`${dateStr}T${time}`).toISOString();
        payload.auto_publish = true;
        payload.publish_status = "scheduled";
      }
      const { error } = await supabase.from("calendar_posts").insert(payload);
      if (error) throw error;
      toast({
        title: mode === "schedule" ? "Publication programmée ! 🗓️" : "Contenu ajouté au calendrier !",
        description: mode === "schedule"
          ? `${canal === "linkedin" ? "LinkedIn" : "Instagram"} publiera ce post automatiquement à l'heure prévue.`
          : undefined,
      });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Échec de l'enregistrement", description: friendlyError(err), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // ── Sous-blocs ──
  const formBlock = (
    <div className="space-y-5 min-w-0">
      <div>
        <label className="text-xs font-semibold mb-1.5 block text-foreground">📝 Ton contenu</label>
        <Textarea
          autoFocus
          value={contentText}
          onChange={(e) => setContentText(e.target.value)}
          placeholder="Colle ici le texte de ton post (légende, accroche…)"
          className="rounded-[10px] min-h-[120px]"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold block text-foreground">🖼️ Tes visuels</label>
        {mediaUrls.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {mediaUrls.map((url, i) => (
              <div key={i} className="relative group w-16 h-16 rounded-lg overflow-hidden border border-border">
                <img src={url} alt={`Visuel ${i + 1}`} className="w-full h-full object-cover" />
                <span className="absolute bottom-0.5 left-0.5 text-[9px] font-semibold bg-black/60 text-white px-1 rounded">{i + 1}</span>
                <button
                  onClick={() => setMediaUrls((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label={`Supprimer le visuel ${i + 1}`}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-foreground/60 text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                >×</button>
              </div>
            ))}
          </div>
        )}
        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors">
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {uploading ? uploadLabel : "Ajouter des visuels ou un PDF"}
          <input type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
        </label>
        <p className="text-[11px] text-muted-foreground">
          {canal === "instagram"
            ? (igValidImages.length > 1
                ? `Carrousel de ${igValidImages.length} images · ordre = ordre d'ajout`
                : "1 image = post simple · jusqu'à 10 pour un carrousel. Un PDF est découpé en slides.")
            : "Un PDF est découpé en une image par page."}
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold block text-foreground">📣 Où publier</label>
        <div className="flex gap-2">
          {([
            { id: "instagram" as Canal, label: "Instagram", Icon: Instagram },
            { id: "linkedin" as Canal, label: "LinkedIn", Icon: Linkedin },
          ]).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setCanal(id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs transition-colors",
                canal === id ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" /> {label}
            </button>
          ))}
        </div>
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
          <p className="text-[11px] text-muted-foreground">
            Publié automatiquement sur {canal === "linkedin" ? "LinkedIn" : "Instagram"} à l'heure prévue.
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">Placé dans le calendrier au statut « prêt ». Pas de publication automatique.</p>
        )}
      </div>
    </div>
  );

  const previewBlock = (
    <div>
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Aperçu</p>
      {text || igValidImages.length > 0 ? (
        <SocialMockup
          canal={canal}
          format={canal === "instagram" && igValidImages.length > 1 ? "carousel" : "post"}
          username={igUsername}
          displayName={ownerName}
          avatarUrl={avatarUrl}
          caption={contentText}
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
      <span className="text-[11px] text-muted-foreground hidden sm:block">
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
          <DialogDescription>Un post déjà prêt — tu colles, tu déposes, tu programmes.</DialogDescription>
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
