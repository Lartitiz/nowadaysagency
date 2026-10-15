// Choix de la voix en mode « Je ne me montre pas » (« Ma voix off » / « Sans
// voix »), mention honnête sur le son des vidéos et téléprompteur. Sorti de
// ReelMontage.tsx à l'identique (fiche 16 de docs/robustesse/gros-fichiers.md, lot 2).
import { Mic, VolumeX } from "lucide-react";
import ReelVoiceRecorder from "@/components/creer/ReelVoiceRecorder";
import type { VoiceClip } from "@/lib/reel-voice";
import type { Section } from "./types";

interface MontageVoiceChoiceProps {
  voiceMode: "recorded" | "silent";
  setVoiceMode: (mode: "recorded" | "silent") => void;
  spoken: Section[];
  voiceClips: (VoiceClip | null)[];
  setVoiceClips: (clips: (VoiceClip | null)[]) => void;
}

export function MontageVoiceChoice({ voiceMode, setVoiceMode, spoken, voiceClips, setVoiceClips }: MontageVoiceChoiceProps) {
  return (
  <>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => setVoiceMode("recorded")}
        className={`flex-1 rounded-md border px-3 py-2 text-left ${
          voiceMode === "recorded" ? "border-primary bg-primary/5" : "border-border"
        }`}
      >
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <Mic className="h-3.5 w-3.5" /> Ma voix off
        </span>
        <span className="block text-2xs text-muted-foreground">J'enregistre en lisant le script</span>
      </button>
      <button
        type="button"
        onClick={() => setVoiceMode("silent")}
        className={`flex-1 rounded-md border px-3 py-2 text-left ${
          voiceMode === "silent" ? "border-primary bg-primary/5" : "border-border"
        }`}
      >
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <VolumeX className="h-3.5 w-3.5" /> Sans voix
        </span>
        <span className="block text-2xs text-muted-foreground">Texte à l'écran ; ajoute ta musique dans Instagram si tu veux</span>
      </button>
    </div>

    {/* Mention honnête : le moteur coupe le son des clips (`muted: true`
        dans recipe.ts) et pose la voix par-dessus. Une prise face cam où
        elle parle sort donc muette dans CE mode — on le dit plutôt que
        de laisser croire à un micro cassé ; le mode "Je me filme" existe
        pour ce cas. */}
    <p className="text-2xs text-muted-foreground">
      Le son de tes vidéos n'est pas conservé dans ce mode. Choisis « Ma voix off » pour
      raconter le reel, ou « Sans voix » pour un montage visuel avec texte à l'écran. Pour une
      prise face cam où tu parles, choisis « Je me filme ».
    </p>

    {voiceMode === "recorded" && (
      <ReelVoiceRecorder
        texts={spoken.map((s) => s.texte_parle as string)}
        initialClips={voiceClips}
        onVoicesChange={setVoiceClips}
      />
    )}
  </>
  );
}
