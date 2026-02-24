import { Copy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { StepProps } from "./SiteShared";

export default function Step4Plan({ data, save, callAI, aiLoading, aiResults, copyText }: StepProps) {
  const updatePlanStep = (index: number, field: "title" | "description", value: string) => {
    const newSteps = [...data.plan_steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    save({ plan_steps: newSteps });
  };

  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-bold">🗺️ Le plan en 3 étapes</h2>
      <p className="text-sm text-muted-foreground">3 étapes simples qui montrent le chemin. Ça réduit la complexité perçue et rassure.</p>
      <Button variant="outline" size="sm" onClick={async () => {
        const result = await callAI("plan-steps", { offer_description: data.offer_block });
        if (result?.steps && Array.isArray(result.steps)) save({ plan_steps: result.steps });
      }} disabled={aiLoading === "plan-steps"}>
        <Sparkles className="h-4 w-4 mr-1" /> {aiLoading === "plan-steps" ? "Génération..." : "Suggérer 3 étapes"}
      </Button>
      {data.plan_steps.length > 0 ? (
        <div className="space-y-4 mt-4">
          {data.plan_steps.map((s, i) => (
            <div key={i} className="rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold text-sm">{s.number}</span>
                <Input className="font-semibold flex-1" value={s.title} onChange={(e) => updatePlanStep(i, "title", e.target.value)} placeholder="Titre..." />
              </div>
              <Textarea className="min-h-[60px]" value={s.description} onChange={(e) => updatePlanStep(i, "description", e.target.value)} placeholder="Description..." />
            </div>
          ))}
          <Button variant="ghost" size="sm" onClick={() => copyText(data.plan_steps.map(s => `${s.number}. ${s.title}\n${s.description}`).join("\n\n"))}>
            <Copy className="h-4 w-4 mr-1" /> Copier le plan
          </Button>
        </div>
      ) : (
        <div className="space-y-3 mt-4">
          {[1, 2, 3].map((n) => (
            <div key={n} className="rounded-xl border border-dashed border-border p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-muted-foreground font-bold text-sm">{n}</span>
                <Input className="flex-1" placeholder={`Titre de l'étape ${n}...`} onChange={(e) => {
                  const steps = data.plan_steps.length === 3 ? [...data.plan_steps] : [{ number: 1, title: "", description: "" }, { number: 2, title: "", description: "" }, { number: 3, title: "", description: "" }];
                  steps[n - 1] = { ...steps[n - 1], title: e.target.value };
                  save({ plan_steps: steps });
                }} />
              </div>
              <Textarea className="min-h-[50px]" placeholder="Description..." onChange={(e) => {
                const steps = data.plan_steps.length === 3 ? [...data.plan_steps] : [{ number: 1, title: "", description: "" }, { number: 2, title: "", description: "" }, { number: 3, title: "", description: "" }];
                steps[n - 1] = { ...steps[n - 1], description: e.target.value };
                save({ plan_steps: steps });
              }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
