import { Copy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { StepProps, GUARANTEE_TYPES } from "./SiteShared";

export default function Step8Guarantee({ data, save, callAI, aiLoading, aiResults, copyText }: StepProps) {
  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-bold">🛡️ Ta garantie</h2>
      <p className="text-sm text-muted-foreground">La garantie réduit le risque perçu. "Je crois tellement en ce que je fais que je prends le risque à ta place."</p>
      <div className="grid grid-cols-2 gap-2">
        {GUARANTEE_TYPES.map((g) => (
          <button key={g.value} onClick={() => save({ guarantee_type: g.value })} className={`text-left rounded-xl border-2 p-3 transition-all ${data.guarantee_type === g.value ? "border-primary bg-rose-pale" : "border-border hover:border-primary/50 bg-card"}`}>
            <span className="text-lg">{g.emoji}</span>
            <p className="font-display text-sm font-bold text-foreground mt-1">{g.label}</p>
          </button>
        ))}
      </div>
      {data.guarantee_type && data.guarantee_type !== "none" && (
        <>
          <div>
            <p className="text-sm font-semibold mb-2">Conditions (si applicables) :</p>
            <Textarea className="min-h-[80px]" placeholder="Si après avoir suivi le programme..." value={data.guarantee_text} onChange={(e) => save({ guarantee_text: e.target.value })} />
          </div>
          <Button variant="outline" size="sm" onClick={async () => {
            const result = await callAI("guarantee", { guarantee_type: data.guarantee_type, conditions: data.guarantee_text, offer_name: data.offer_name });
            if (result?.body) save({ guarantee_text: `${result.title}\n\n${result.body}${result.micro_note ? `\n\n${result.micro_note}` : ""}` });
          }} disabled={aiLoading === "guarantee"}>
            <Sparkles className="h-4 w-4 mr-1" /> {aiLoading === "guarantee" ? "Génération..." : "Formuler la garantie"}
          </Button>
          {data.guarantee_text && <Button variant="ghost" size="sm" onClick={() => copyText(data.guarantee_text)}><Copy className="h-4 w-4 mr-1" /> Copier</Button>}
        </>
      )}
      {data.guarantee_type === "none" && <p className="text-sm text-muted-foreground italic">Pas de garantie spécifique.</p>}
    </div>
  );
}
