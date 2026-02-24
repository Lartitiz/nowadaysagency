import { Copy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import { StepProps } from "./SiteShared";

export default function Step2Problem({ data, save, callAI, aiLoading, aiResults, copyText }: StepProps) {
  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-bold">😩 Montre que tu comprends sa douleur</h2>
      <p className="text-sm text-muted-foreground">Ta visiteuse doit se dire « Oui, c'est exactement moi ! »</p>
      {data.framework === "storybrand" && (
        <div className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground mb-3">
          📖 <strong>StoryBrand — Le problème à 3 niveaux :</strong>
          <ul className="list-disc pl-4 mt-2 space-y-1">
            <li><strong>Externe :</strong> le truc concret</li>
            <li><strong>Interne :</strong> le ressenti</li>
            <li><strong>Philosophique :</strong> l'injustice</li>
          </ul>
        </div>
      )}
      <Button variant="outline" size="sm" onClick={() => callAI("problem")} disabled={aiLoading === "problem"}>
        <Sparkles className="h-4 w-4 mr-1" /> {aiLoading === "problem" ? "Génération..." : "Générer le bloc problème"}
      </Button>
      {aiResults.problem && typeof aiResults.problem === "object" && (
        <div className="space-y-3 mt-3">
          {["empathique", "directe"].map((v) => aiResults.problem[v] && (
            <div key={v}>
              <p className="font-mono-ui text-[11px] font-semibold text-primary mb-1">Version {v} :</p>
              <div className="rounded-xl bg-rose-pale p-3 text-[13px] cursor-pointer hover:ring-2 ring-primary transition-all" onClick={() => save({ problem_block: aiResults.problem[v] })}>{aiResults.problem[v]}</div>
            </div>
          ))}
        </div>
      )}
      <Textarea className="min-h-[150px]" placeholder="Mon bloc problème..." value={data.problem_block} onChange={(e) => save({ problem_block: e.target.value })} />
      <RedFlagsChecker content={data.problem_block} onFix={(v) => save({ problem_block: v })} />
      {data.problem_block && <Button variant="ghost" size="sm" onClick={() => copyText(data.problem_block)}><Copy className="h-4 w-4 mr-1" /> Copier</Button>}
    </div>
  );
}
