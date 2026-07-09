/**
 * PhotoDumpProgress — avancement de la résolution d'un photo dump.
 *
 * Affiché à l'étape résultat, AVANT le loader carrousel habituel : le fil
 * narratif en titre, puis chaque beat du plan avec sa source (ta photo /
 * fond refait / générée / à prendre) et son état (fait / en cours / à venir).
 */

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DumpProgressItem } from "@/lib/photo-dump";

const SOURCE_META: Record<DumpProgressItem["source"], { emoji: string; label: string }> = {
  library: { emoji: "🖼", label: "ta photo" },
  photoroom: { emoji: "🪄", label: "fond refait" },
  generate_porte: { emoji: "✨", label: "générée" },
  generate_pose: { emoji: "✨", label: "générée" },
  missing: { emoji: "📝", label: "à prendre" },
};

interface Props {
  narrativeThread: string;
  items: DumpProgressItem[];
}

export default function PhotoDumpProgress({ narrativeThread, items }: Props) {
  return (
    <div className="py-10 max-w-md mx-auto space-y-5 animate-fade-in">
      <div className="text-center space-y-2">
        <span className="inline-block text-2xs font-semibold uppercase tracking-wide text-primary/70 bg-primary/10 rounded-full px-3 py-1">
          Photo dump · Préparation de tes photos
        </span>
        {narrativeThread && (
          <p className="text-sm font-medium text-foreground">{narrativeThread}</p>
        )}
      </div>

      <ul className="space-y-2">
        {items.map((item, i) => {
          const meta = SOURCE_META[item.source];
          return (
            <li
              key={i}
              className={cn(
                "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                item.status === "active" ? "border-primary/40 bg-primary/5" : "border-border bg-card",
                item.status === "skipped" && "opacity-50",
              )}
            >
              <span className="text-base shrink-0">{meta.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{item.beat}</p>
                <p className="text-2xs text-muted-foreground">{meta.label}</p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground flex items-center gap-1.5">
                {item.status === "done" && <span className="text-primary font-medium">✓ fait</span>}
                {item.status === "active" && (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> en cours…
                  </>
                )}
                {item.status === "pending" && "à venir"}
                {item.status === "skipped" && "sautée"}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-muted-foreground text-center">
        Tes vraies photos d'abord, l'IA pour le reste — ça peut prendre quelques minutes.
      </p>
    </div>
  );
}
