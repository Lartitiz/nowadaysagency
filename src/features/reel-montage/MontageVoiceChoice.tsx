// Choix de la voix en mode « Je ne me montre pas » (« Ma voix » / « Sans
// voix ») et mention honnête sur le son des vidéos. L'enregistreur vit dans le
// passage affiché depuis l'atelier du 26/11/2026 (MontagePassageCard, `voiceSlot`). Sorti de
// ReelMontage.tsx à l'identique (fiche 16 de docs/robustesse/gros-fichiers.md, lot 2).
import { Mic, VolumeX } from "lucide-react";

interface MontageVoiceChoiceProps {
  voiceMode: "recorded" | "silent";
  setVoiceMode: (mode: "recorded" | "silent") => void;
}

export function MontageVoiceChoice({ voiceMode, setVoiceMode }: MontageVoiceChoiceProps) {
  const option = (mode: "recorded" | "silent", label: string, Icon: typeof Mic) => (
    <button type="button" onClick={() => setVoiceMode(mode)} aria-pressed={voiceMode === mode}
      className={`flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium ${
        voiceMode === mode ? "border-primary bg-primary/5" : "border-border text-muted-foreground"}`}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
  return (
  <>
    <div className="grid grid-cols-2 gap-2">
      {option("recorded", "Ma voix", Mic)}
      {option("silent", "Sans voix", VolumeX)}
    </div>
    {/* Mention honnête : le moteur coupe le son des clips (`muted: true` dans recipe.ts)
        et pose la voix par-dessus. Une prise face cam où elle parle sort donc muette
        dans CE mode ; le mode « Je me filme » existe pour ce cas. */}
    <p className="text-2xs text-muted-foreground">
      {voiceMode === "recorded" ? "J'enregistre en lisant le script." : "Texte à l'écran ; ajoute ta musique dans Instagram si tu veux."}{" "}
      Ici, le son de tes vidéos est coupé : pour parler face à la caméra, choisis « Je me filme ».
    </p>
  </>
  );
}
