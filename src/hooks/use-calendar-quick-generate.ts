// Brouillon rapide par l'IA dans la fenêtre d'un post du calendrier
// (generate-content, type « calendar-quick »). Sorti de CalendarPostDialog.tsx
// à l'identique (fiche 13 de docs/robustesse/gros-fichiers.md, lot 4). Le corps
// envoyé est figé côté serveur par supabase/functions/generate-content/
// contract_test.ts (cas « calendar-quick Instagram (CalendarPostDialog) ») et
// côté front par src/test/calendar-post-dialog.test.tsx. L'appel passe par
// invokeWithTimeout (étiquetage Sentry). Les valeurs du post arrivent à chaque
// rendu : la fonction lit toujours les dernières.
import { useState } from "react";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { friendlyError } from "@/lib/error-messages";
import { toast } from "sonner";

export interface CalendarQuickGenerateInput {
  theme: string;
  objectif: string | null;
  angle: string | null;
  format: string | null;
  notes: string;
  profileData: unknown;
  postCanal: string;
  workspaceId: string | null | undefined;
  user: { id: string } | null | undefined;
  status: string;
  setContentDraft: (v: string | null) => void;
  setAccroche: (v: string | null) => void;
  setStatus: (v: string) => void;
}

export function useCalendarQuickGenerate({ theme, objectif, angle, format, notes, profileData, postCanal, workspaceId, user, status, setContentDraft, setAccroche, setStatus }: CalendarQuickGenerateInput) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleQuickGenerate = async () => {
    if (!theme.trim()) { toast.error("Il me faut un sujet !", { description: "Remplis le thème au-dessus." }); return; }
    setIsGenerating(true);
    try {
      const validObjectifs = ["visibilite", "confiance", "vente", "credibilite"];
      const safeObjectif = objectif && validObjectifs.includes(objectif) ? objectif : null;
      const res = await invokeWithTimeout("generate-content", {
        body: { type: "calendar-quick", theme, objectif: safeObjectif, angle, format: format || "post_carrousel", notes, profile: profileData || {}, canal: postCanal, workspace_id: workspaceId !== user?.id ? workspaceId : undefined },
        // Budget serveur pire cas (LinkedIn) : génération 60s + passe de
        // correction 60s = 120s bornées côté edge (audit timeouts 17/08).
        // Marge de 30s côté client pour ne pas courir la même ligne d'arrivée.
      }, 150000);
      // Handle quota limit
      if (res.data?.error === "limit_reached") {
        toast("Plus de crédits ce mois-ci 🌸", { description: res.data.message || "Tes crédits se renouvellent le 1er du mois." });
        setIsGenerating(false);
        return;
      }
      if (res.error) throw res.error;
      const generated = res.data?.content || "";
      setContentDraft(generated);
      setAccroche(generated.split(/[.\n]/)[0]?.trim() || null);
      if (status === "idea" || status === "a_rediger") setStatus("drafting");
      toast.success("Contenu généré !");
    } catch (e: any) {
      toast.error(e?.isTimeout ? "Ça prend plus longtemps que prévu" : "Erreur de génération", { description: friendlyError(e) });
    } finally { setIsGenerating(false); }
  };

  return { isGenerating, handleQuickGenerate };
}
