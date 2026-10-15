import { Play } from "lucide-react";
import examplePhoto from "@/assets/laetitia-photo.webp";
import CarouselFormatPreview from "./CarouselFormatPreview";

/** Illustrations de formats uniquement ; aucun contenu du brouillon n'est modifié. */
export default function ContentFormatPreview({ format, compact = false }: { format: string; compact?: boolean }) {
  const box = compact ? "mb-2 h-16 sm:h-20 p-1.5" : "mb-3 h-40";
  if (format === "carousel") {
    return <div className={`${box} flex items-center justify-center overflow-hidden rounded-lg bg-rose-pale/60 ${compact ? "" : "p-4"}`} aria-hidden="true"><div className={compact ? "w-24 sm:w-28" : "max-w-56"}><CarouselFormatPreview mode="mix" compact={compact} /></div></div>;
  }
  const vertical = format === "reel" || format === "story";
  return (
    <div aria-hidden="true" className={`${compact ? "mb-2 h-16 sm:h-20 p-1.5 gap-1" : "mb-3 h-40 p-2 gap-2"} flex items-center justify-center overflow-hidden rounded-lg bg-rose-pale/60`}>
      {(format === "story" ? [0, 1, 2] : [0]).map((i) => (
        <div key={i} className={`relative h-full overflow-hidden rounded-md border border-primary/10 bg-card ${vertical ? "aspect-[9/16]" : "aspect-[4/5]"}`}>
          <img src={examplePhoto} alt="" className="h-full w-full object-cover" style={{ objectPosition: `${45 + i * 15}% center` }} />
          {format === "reel" && !compact && <span className="absolute inset-0 flex items-center justify-center"><Play size={26} className="rounded-full bg-black/50 p-1 text-white" /></span>}
          {format === "story" && <span className="absolute inset-x-2 top-2 h-0.5 rounded bg-white" />}
          {!compact && <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-6 text-left text-[10px] leading-tight text-white">{format === "reel" ? "Une idée en vidéo" : format === "story" ? ["En coulisses", "Le détail", "À toi de jouer"][i] : "Un instant à partager"}</span>}
        </div>
      ))}
    </div>
  );
}
