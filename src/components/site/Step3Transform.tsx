import { Copy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import { StepProps } from "./SiteShared";

export default function Step3Transform({ data, save, callAI, aiLoading, aiResults, copyText }: StepProps) {
  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-bold">✨ Montre où tu l'emmènes</h2>
      {data.framework === "storybrand" && (
        <div className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground mb-3">
          📖 <strong>StoryBrand — Le succès :</strong> la vie après. Bénéfices émotionnels + concrets.
        </div>
      )}
      <div>
        <h3 className="font-display text-base font-bold mb-2">A. Les bénéfices</h3>
        <p className="text-sm text-muted-foreground mb-3">Ta cliente achète le résultat et la transformation.</p>
        <Button variant="outline" size="sm" onClick={() => callAI("benefits")} disabled={aiLoading === "benefits"}>
          <Sparkles className="h-4 w-4 mr-1" /> {aiLoading === "benefits" ? "Génération..." : "Générer le bloc bénéfices"}
        </Button>
        {typeof aiResults.benefits === "string" && (
          <div className="rounded-xl bg-rose-pale p-3 text-[13px] mt-3 cursor-pointer hover:ring-2 ring-primary transition-all" onClick={() => save({ benefits_block: aiResults.benefits })}>{aiResults.benefits}</div>
        )}
        <Textarea className="mt-3 min-h-[120px]" placeholder="Mon bloc bénéfices..." value={data.benefits_block} onChange={(e) => save({ benefits_block: e.target.value })} />
        <RedFlagsChecker content={data.benefits_block} onFix={(v) => save({ benefits_block: v })} />
        {data.benefits_block && <Button variant="ghost" size="sm" onClick={() => copyText(data.benefits_block)}><Copy className="h-4 w-4 mr-1" /> Copier</Button>}
      </div>
      {data.framework === "storybrand" && (
        <div>
          <h3 className="font-display text-base font-bold mb-2">B. Ce qui se passe si elle ne fait rien (optionnel)</h3>
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-[13px] text-foreground mb-3">
            ⚠️ <strong>Attention :</strong> cette section est puissante MAIS dangereuse. Utilise-la comme du sel : une pincée suffit.
          </div>
          <Textarea className="min-h-[80px] mb-3" placeholder="Qu'est-ce qui se passe si ta cliente ne fait rien ?" value={data.failure_block} onChange={(e) => save({ failure_block: e.target.value })} />
          <Button variant="outline" size="sm" onClick={async () => {
            const result = await callAI("failure-section", { failure_description: data.failure_block || "ne rien changer" });
            if (result?.failure_text) save({ failure_block: result.failure_text });
          }} disabled={aiLoading === "failure-section"}>
            <Sparkles className="h-4 w-4 mr-1" /> {aiLoading === "failure-section" ? "Génération..." : "Formuler avec éthique"}
          </Button>
        </div>
      )}
    </div>
  );
}
