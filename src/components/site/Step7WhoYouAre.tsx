import { Link } from "react-router-dom";
import { Copy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Checkbox } from "@/components/ui/checkbox";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import { StepProps } from "./SiteShared";

export default function Step7WhoYouAre({ data, save, callAI, aiLoading, aiResults, copyText }: StepProps) {
  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-bold">👋 Présente-toi et rassure</h2>
      {data.framework === "storybrand" && (
        <div className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground mb-3">
          📖 <strong>StoryBrand — Le guide :</strong> empathie d'abord ("Je sais ce que c'est...") puis autorité.
        </div>
      )}
      <div>
        <h3 className="font-display text-base font-bold mb-2">A. Ta présentation</h3>
        <Button variant="outline" size="sm" onClick={() => callAI("presentation")} disabled={aiLoading === "presentation"}>
          <Sparkles className="h-4 w-4 mr-1" /> {aiLoading === "presentation" ? "Génération..." : "Générer ma présentation"}
        </Button>
        {typeof aiResults.presentation === "string" && (
          <div className="rounded-xl bg-rose-pale p-3 text-[13px] mt-3 cursor-pointer hover:ring-2 ring-primary transition-all" onClick={() => save({ presentation_block: aiResults.presentation })}>{aiResults.presentation}</div>
        )}
        <Textarea className="mt-3 min-h-[150px]" placeholder="Ma présentation..." value={data.presentation_block} onChange={(e) => save({ presentation_block: e.target.value })} />
        <RedFlagsChecker content={data.presentation_block} onFix={(v) => save({ presentation_block: v })} />
        {data.presentation_block && <Button variant="ghost" size="sm" onClick={() => copyText(data.presentation_block)}><Copy className="h-4 w-4 mr-1" /> Copier</Button>}
      </div>
      <div>
        <h3 className="font-display text-base font-bold mb-2">B. Preuve sociale</h3>
        <p className="text-sm text-muted-foreground mb-3">87% des acheteur·euses disent que la preuve sociale influence leur achat.</p>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={data.social_proof_done} onCheckedChange={(v) => save({ social_proof_done: !!v })} /> J'ai ajouté au moins 2 témoignages sur ma page</label>
        <Link to="/site/temoignages" className="block mt-2 text-sm text-primary font-semibold hover:underline">💬 Récolter et structurer mes témoignages →</Link>
      </div>
    </div>
  );
}
