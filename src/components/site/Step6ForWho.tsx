import { Copy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { StepProps } from "./SiteShared";

export default function Step6ForWho({ data, save, callAI, aiLoading, aiResults, copyText }: StepProps) {
  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-bold">🎯 Pour qui / Pas pour qui</h2>
      <p className="text-sm text-muted-foreground">Un filtre de qualification puissant. Le "pas pour toi" n'est pas une punition, c'est un respect : on ne prend pas son argent si l'offre ne correspond pas.</p>

      <div>
        <label className="text-sm font-semibold block mb-1">Ta cliente idéale</label>
        <Textarea className="min-h-[80px]" value={data.for_who_ideal} onChange={(e) => save({ for_who_ideal: e.target.value })} placeholder="Créatrice lifestyle éthique, 1-3 ans d'activité, galère avec la visibilité..." />
      </div>
      <div>
        <label className="text-sm font-semibold block mb-1">Celles pour qui ce n'est PAS adapté</label>
        <Textarea className="min-h-[80px]" value={data.for_who_not} onChange={(e) => save({ for_who_not: e.target.value })} placeholder="Celles qui veulent des résultats magiques, du marketing agressif, pas prêtes à s'impliquer..." />
      </div>

      <Button variant="outline" size="sm" onClick={async () => {
        const result = await callAI("for-who", { ideal_client: data.for_who_ideal, not_for: data.for_who_not });
        if (result) {
          if (result.for_you) save({ for_who_ideal: result.for_you.map((s: string) => `✅ ${s}`).join("\n") });
          if (result.not_for_you) save({ for_who_not: result.not_for_you.map((s: string) => `❌ ${s}`).join("\n") });
        }
      }} disabled={aiLoading === "for-who"}>
        <Sparkles className="h-4 w-4 mr-1" /> {aiLoading === "for-who" ? "Génération..." : "Générer la section"}
      </Button>

      {(data.for_who_ideal || data.for_who_not) && (
        <Button variant="ghost" size="sm" onClick={() => copyText(`C'est pour toi si :\n${data.for_who_ideal}\n\nCe n'est PAS pour toi si :\n${data.for_who_not}`)}>
          <Copy className="h-4 w-4 mr-1" /> Copier la section
        </Button>
      )}
    </div>
  );
}
