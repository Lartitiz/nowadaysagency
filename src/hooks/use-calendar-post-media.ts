// Ajout de visuels dans la fenêtre d'un post du calendrier : contrôle de
// taille, envoi dans le bucket calendar-media sous `<id utilisateur>/…`. Sorti
// de CalendarPostDialog.tsx à l'identique (fiche 13 de
// docs/robustesse/gros-fichiers.md, lot 4). ⚠️ Le chemin reste l'id de
// l'utilisatrice, jamais l'id d'espace : src/lib/reel-voice.ts et d'autres
// écrans lisent cette convention.
import { useState, type Dispatch, type SetStateAction } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UX_UPLOAD_LIMITS, uxSizeError } from "@/lib/upload-limits";
import { friendlyError } from "@/lib/error-messages";
import { toast } from "sonner";

export function useCalendarPostMedia(setMediaUrls: Dispatch<SetStateAction<string[]>>) {
  const [uploading, setUploading] = useState(false);

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    setUploading(true);
    try {
      const newUrls: string[] = [];
      for (const file of Array.from(files)) {
        const sizeErr = uxSizeError(file, UX_UPLOAD_LIMITS.media);
        if (sizeErr) { toast.error(sizeErr); continue; }
        const ext = file.name.split(".").pop()?.toLowerCase() || "png";
        const path = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error } = await supabase.storage.from("calendar-media").upload(path, file, { contentType: file.type });
        if (error) throw error;
        const { data } = supabase.storage.from("calendar-media").getPublicUrl(path);
        if (data?.publicUrl) newUrls.push(data.publicUrl);
      }
      setMediaUrls(prev => [...prev, ...newUrls]);
    } catch (err: any) {
      toast.error("Erreur upload", { description: friendlyError(err) });
    } finally {
      setUploading(false);
    }
  };

  return { uploading, handleMediaUpload };
}
