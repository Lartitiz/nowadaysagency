import { useState } from "react";
import { Copy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { StepProps, AISuggestions, CTA_OBJECTIVES, OFFER_TYPES } from "./SiteShared";

export default function Step9FaqCta({ data, save, callAI, aiLoading, aiResults, copyText }: StepProps) {
  const [offerType, setOfferType] = useState("formation");
  const [objections, setObjections] = useState("");

  const updateFaqItem = (index: number, field: "question" | "reponse", value: string) => {
    const newFaq = [...data.faq];
    newFaq[index] = { ...newFaq[index], [field]: value };
    save({ faq: newFaq });
  };

  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-bold">🦋 Lève les derniers freins</h2>

      {/* FAQ */}
      <div>
        <h3 className="font-display text-base font-bold mb-2">A. Ta FAQ</h3>
        <p className="text-sm text-muted-foreground mb-3">Une FAQ qui répond aux objections avant même qu'elles ne soient formulées. +10-20% de conversion.</p>

        <div className="flex flex-wrap gap-2 mb-3">
          {OFFER_TYPES.map((t) => (
            <button key={t.value} onClick={() => setOfferType(t.value)} className={`font-mono-ui text-[12px] font-semibold px-3 py-1.5 rounded-pill border-2 transition-colors ${offerType === t.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary"}`}>{t.label}</button>
          ))}
        </div>

        <Input className="mb-3" value={objections} onChange={(e) => setObjections(e.target.value)} placeholder="Objections que tu entends souvent : 'J'ai pas le temps', 'C'est trop cher'..." />

        <Button variant="outline" size="sm" onClick={async () => {
          const result = await callAI("faq-by-type", { offer_type: offerType, objections });
          if (Array.isArray(result)) save({ faq: result });
        }} disabled={aiLoading === "faq-by-type"}>
          <Sparkles className="h-4 w-4 mr-1" /> {aiLoading === "faq-by-type" ? "Génération..." : "Générer la FAQ"}
        </Button>

        {data.faq.length > 0 && (
          <div className="space-y-3 mt-4">
            {data.faq.map((item, i) => (
              <div key={i} className="rounded-xl border border-border p-4">
                <Input className="font-semibold mb-2" value={item.question} onChange={(e) => updateFaqItem(i, "question", e.target.value)} placeholder="Question..." />
                <Textarea className="min-h-[80px]" value={item.reponse} onChange={(e) => updateFaqItem(i, "reponse", e.target.value)} placeholder="Réponse..." />
                <button onClick={() => save({ faq: data.faq.filter((_, j) => j !== i) })} className="text-xs text-muted-foreground hover:text-destructive mt-1">🗑️ Supprimer</button>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => copyText(data.faq.map((f) => `Q : ${f.question}\nR : ${f.reponse}`).join("\n\n"))}>
              <Copy className="h-4 w-4 mr-1" /> Copier la FAQ
            </Button>
          </div>
        )}
      </div>

      {/* CTA */}
      <div>
        <h3 className="font-display text-base font-bold mb-2">B. Tes CTA (appels à l'action)</h3>
        <p className="text-sm text-muted-foreground mb-3">Les CTA personnalisés convertissent 202% mieux que les génériques (HubSpot).</p>

        <p className="text-sm font-semibold mb-2">Objectif principal :</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {CTA_OBJECTIVES.map((obj) => (
            <button key={obj.value} onClick={() => save({ cta_objective: obj.value })} className={`font-mono-ui text-[12px] font-semibold px-3 py-1.5 rounded-pill border-2 transition-colors ${data.cta_objective === obj.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary"}`}>{obj.label}</button>
          ))}
        </div>

        {data.cta_objective && (
          <Button variant="outline" size="sm" onClick={async () => {
            const result = await callAI("cta-personalized", { page_type: data.page_type, section: "final", objective: data.cta_objective, offer_name: data.offer_name });
            if (result?.button_text) {
              save({ cta_primary: result.button_text, cta_micro_copy: result.micro_copy || "" });
            }
          }} disabled={aiLoading === "cta-personalized"}>
            <Sparkles className="h-4 w-4 mr-1" /> {aiLoading === "cta-personalized" ? "Génération..." : "Générer mes CTA"}
          </Button>
        )}

        {Array.isArray(aiResults.cta) && <AISuggestions items={aiResults.cta} onSelect={(v) => save({ cta_primary: v })} />}

        <div className="space-y-3 mt-4">
          <div>
            <label className="text-sm font-semibold">Mon CTA principal</label>
            <Input value={data.cta_primary} onChange={(e) => save({ cta_primary: e.target.value })} placeholder="Ex : Je réserve mon appel découverte" />
          </div>
          <div>
            <label className="text-sm font-semibold">Micro-copy (sous le bouton)</label>
            <Input value={data.cta_micro_copy} onChange={(e) => save({ cta_micro_copy: e.target.value })} placeholder="Ex : Gratuit · 30 minutes · Sans engagement" />
          </div>
          <div>
            <label className="text-sm font-semibold">Mon CTA secondaire (optionnel)</label>
            <Input value={data.cta_secondary} onChange={(e) => save({ cta_secondary: e.target.value })} placeholder="Ex : Télécharger le guide gratuit" />
          </div>
        </div>
      </div>
    </div>
  );
}
