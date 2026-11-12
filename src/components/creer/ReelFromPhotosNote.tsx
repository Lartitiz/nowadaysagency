import { useState } from "react";
import { Clapperboard } from "lucide-react";
import { useUserPlan } from "@/hooks/use-user-plan";
import type { PhotoItem } from "./PhotoUploadZone";
import ReelPhotosStudioDialog from "./ReelPhotosStudioDialog";

/**
 * Reel à partir de photos : dire ce qu'elle obtiendra (un script, pas une vidéo),
 * l'ordre avant / après, et lui permettre d'animer ses photos sans quitter /creer.
 * Vu le 12/11/2026 : une utilisatrice pensait que l'outil montait un Reel à partir
 * de ses photos avant / après.
 */
export default function ReelFromPhotosNote({ photos }: { photos: PhotoItem[] }) {
  const { plan } = useUserPlan();
  const [open, setOpen] = useState(false);
  const many = photos.length > 1;
  return (
    <div className="animate-fade-in rounded-xl border border-primary/20 bg-primary/5 p-3.5 flex items-start gap-2.5" data-testid="reel-from-photos-note">
      <Clapperboard className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div className="min-w-0 space-y-1">
        <p className="text-sm text-foreground">
          Tu vas obtenir <strong>un script et un plan de tournage</strong> inspirés de {many ? "tes photos" : "ta photo"}, pas une vidéo toute faite.
        </p>
        {photos.length === 2 && (
          <p className="text-xs text-muted-foreground" data-testid="reel-before-after-hint">
            Avec 2 photos, la 1ʳᵉ est lue comme l'<strong>avant</strong> et la 2ᵉ comme l'<strong>après</strong>. Si besoin, fais glisser les photos pour changer l'ordre.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Envie que {many ? "tes photos s'animent" : "ta photo s'anime"} (un avant / après, par exemple) ? Le Studio vidéo en fait un court clip
          {plan === "free" ? ", avec Premium" : ""}.{" "}
          <button type="button" onClick={() => setOpen(true)} className="font-medium text-primary hover:underline">
            Animer {many ? "mes photos" : "ma photo"}
          </button>
        </p>
      </div>
      {open && <ReelPhotosStudioDialog open onClose={() => setOpen(false)} photos={photos} isFree={plan === "free"} />}
    </div>
  );
}
