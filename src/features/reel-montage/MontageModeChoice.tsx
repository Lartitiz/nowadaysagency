// Choix du mode de montage (« Je me filme » / « Je ne me montre pas ») et
// rappel du mode choisi avec « Changer ». Sortis de ReelMontage.tsx à
// l'identique (fiche 16 de docs/robustesse/gros-fichiers.md, lot 2).
import { Video, EyeOff } from "lucide-react";
import type { MontageMode } from "./types";

// Fourche à deux modes ÉGAUX : aucun n'est présélectionné, beaucoup de
// clientes ne se montreront jamais.
export function MontageModeFork({ setMontageMode }: { setMontageMode: (mode: MontageMode) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-2xs text-muted-foreground">Comment veux-tu ce reel ?</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMontageMode("filme")}
          className="rounded-md border border-border p-3 text-left hover:border-primary/50"
        >
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <Video className="h-3.5 w-3.5" /> Je me filme
          </span>
          <span className="block text-2xs text-muted-foreground mt-1">
            Tu apparais à la caméra : on garde ta voix et le son tels quels, sous-titres compris.
          </span>
        </button>
        <button
          type="button"
          onClick={() => setMontageMode("cache")}
          className="rounded-md border border-border p-3 text-left hover:border-primary/50"
        >
          <span className="flex items-center gap-1.5 text-xs font-medium">
            <EyeOff className="h-3.5 w-3.5" /> Je ne me montre pas
          </span>
          <span className="block text-2xs text-muted-foreground mt-1">
            Tes vidéos ou des clips libres de droit, avec ta voix enregistrée ou sans voix.
          </span>
        </button>
      </div>
    </div>
  );
}

export function MontageModeSummary({ montageMode, voiceMode, setMontageMode }: { montageMode: MontageMode; voiceMode: "recorded" | "silent"; setMontageMode: (mode: MontageMode | null) => void }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <p className="text-2xs text-muted-foreground">
        {montageMode === "filme"
          ? "Une prise face cam par phrase : ta voix est déjà dedans, les sous-titres suivent."
          : voiceMode === "silent"
            ? "Un clip par phrase, sans piste voix : le texte reste visible à l'écran."
            : "Un clip par phrase, ta voix off par-dessus, les sous-titres suivent."}
      </p>
      <button
        type="button"
        onClick={() => setMontageMode(null)}
        className="text-2xs text-muted-foreground underline shrink-0"
      >
        Changer
      </button>
    </div>
  );
}
