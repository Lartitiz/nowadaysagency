import { Copy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Checkbox } from "@/components/ui/checkbox";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import { StepProps, AISuggestions, HelpBlock } from "./SiteShared";

export default function Step1Hook({ data, save, callAI, aiLoading, aiResults, copyText }: StepProps) {
  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-bold">🎯 L'accroche qui arrête le scroll</h2>
      <div>
        <h3 className="font-display text-base font-bold mb-2">A. Ton titre (hook)</h3>
        <p className="text-sm text-muted-foreground mb-3">Ta visiteuse a 3 secondes. Ton titre doit être clair, court et intriguant.</p>
        <HelpBlock title="💡 Les 5 ingrédients d'un bon titre">
          <ul className="list-disc pl-4 space-y-1">
            <li><strong>Court :</strong> max 10-12 mots</li>
            <li><strong>Simple :</strong> des mots que ta grand-mère comprendrait</li>
            <li><strong>Surprenant :</strong> un élément qui pique la curiosité</li>
            <li><strong>Bénéfice client :</strong> le résultat concret, pas tes valeurs</li>
            <li><strong>Engageant :</strong> donne envie d'en savoir plus</li>
          </ul>
        </HelpBlock>
        <Button variant="outline" size="sm" onClick={() => callAI("titles")} disabled={aiLoading === "titles"}>
          <Sparkles className="h-4 w-4 mr-1" /> {aiLoading === "titles" ? "Génération..." : "Générer des titres"}
        </Button>
        {Array.isArray(aiResults.titles) && <AISuggestions items={aiResults.titles} onSelect={(v) => save({ hook_title: v })} />}
        <Textarea className="mt-3" placeholder="Ex : Comment remplir ton dressing sans vider la planète" value={data.hook_title} onChange={(e) => save({ hook_title: e.target.value })} />
        <RedFlagsChecker content={data.hook_title} onFix={(v) => save({ hook_title: v })} />
      </div>
      <div>
        <h3 className="font-display text-base font-bold mb-2">B. Ton sous-titre</h3>
        <p className="text-sm text-muted-foreground mb-3">Il précise comment et pour qui tu fais ce que tu promets dans ton titre.</p>
        {data.hook_title && (
          <Button variant="outline" size="sm" onClick={() => callAI("subtitles", { title: data.hook_title })} disabled={aiLoading === "subtitles"}>
            <Sparkles className="h-4 w-4 mr-1" /> {aiLoading === "subtitles" ? "Génération..." : "Générer des sous-titres"}
          </Button>
        )}
        {Array.isArray(aiResults.subtitles) && <AISuggestions items={aiResults.subtitles} onSelect={(v) => save({ hook_subtitle: v })} />}
        <Textarea className="mt-3" placeholder="Ex : Créations uniques en argent recyclé, façonnées à la main en France." value={data.hook_subtitle} onChange={(e) => save({ hook_subtitle: e.target.value })} />
      </div>
      <div>
        <h3 className="font-display text-base font-bold mb-2">C. Ton image principale</h3>
        <div className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground mb-3">
          📸 <strong>Conseils :</strong> Garde ton produit/service au premier plan. Montre-le en train d'être utilisé. Pas de photo random.
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={data.hook_image_done} onCheckedChange={(v) => save({ hook_image_done: !!v })} />
          ✅ J'ai choisi mon image principale
        </label>
      </div>
    </div>
  );
}
