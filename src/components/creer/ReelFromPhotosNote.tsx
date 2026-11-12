import { Clapperboard } from "lucide-react";
import { useUserPlan } from "@/hooks/use-user-plan";

/** Studio vidéo (Higgsfield) : seul endroit qui fait une vraie vidéo à partir de photos. */
export const STUDIO_VIDEO_URL = "/photos/studio?tab=video";

/**
 * Reel à partir de photos : dire ce qu'elle obtiendra (un script, pas une vidéo)
 * et où animer ses photos. Vu le 12/11/2026 : une utilisatrice pensait que l'outil
 * montait un Reel à partir de ses photos avant / après.
 */
export default function ReelFromPhotosNote({ photoCount }: { photoCount: number }) {
  const { plan } = useUserPlan();
  return (
    <div className="animate-fade-in rounded-xl border border-primary/20 bg-primary/5 p-3.5 flex items-start gap-2.5" data-testid="reel-from-photos-note">
      <Clapperboard className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div className="min-w-0 space-y-1">
        <p className="text-sm text-foreground">
          Tu vas obtenir <strong>un script et un plan de tournage</strong> inspirés de {photoCount > 1 ? "tes photos" : "ta photo"}, pas une vidéo toute faite.
        </p>
        <p className="text-xs text-muted-foreground">
          Envie que {photoCount > 1 ? "tes photos s'animent" : "ta photo s'anime"} (un avant / après, par exemple) ? Le Studio vidéo en fait un court clip
          {plan === "free" ? ", avec Premium" : ""}.{" "}
          <a href={STUDIO_VIDEO_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">
            Ouvrir le Studio vidéo
          </a>
        </p>
      </div>
    </div>
  );
}
