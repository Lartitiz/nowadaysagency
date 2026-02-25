import { Copy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { StepProps, HelpBlock } from "./SiteShared";

export default function Step5OfferPrice({ data, save, callAI, aiLoading, aiResults, copyText }: StepProps) {
  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-bold">💰 Ton offre et ton prix</h2>
      <p className="text-sm text-muted-foreground">Présente honnêtement ce que tu vends. Transparence = confiance.</p>

      <HelpBlock title="📏 Quelle longueur pour ta page ?">
        <table className="w-full text-[12px]">
          <thead><tr className="border-b"><th className="text-left py-1">Prix offre</th><th className="text-left py-1">Longueur</th><th className="text-left py-1">Pourquoi</th></tr></thead>
          <tbody>
            <tr><td className="py-1">Gratuit</td><td>200-400 mots</td><td>Friction faible</td></tr>
            <tr><td className="py-1">&lt;100€</td><td>500-1000 mots</td><td>Décision rapide</td></tr>
            <tr><td className="py-1">100-500€</td><td>1500-3000 mots</td><td>Besoin de rassurer</td></tr>
            <tr><td className="py-1">500-2000€</td><td>3000-5000 mots</td><td>Chaque objection traitée</td></tr>
            <tr><td className="py-1">2000€+</td><td>Longue ou moyenne</td><td>CTA = achat : longue / CTA = appel : moyenne</td></tr>
          </tbody>
        </table>
      </HelpBlock>

      <div className="space-y-4">
        <div>
          <label className="text-sm font-semibold block mb-1">Nom de l'offre</label>
          <Input value={data.offer_name} onChange={(e) => save({ offer_name: e.target.value })} placeholder="Ex : Accompagnement 6 mois" />
        </div>
        <div>
          <label className="text-sm font-semibold block mb-1">Prix</label>
          <Input value={data.offer_price} onChange={(e) => save({ offer_price: e.target.value })} placeholder="Ex : 290€/mois × 6 mois (1 740€ au total)" />
        </div>
        <div>
          <label className="text-sm font-semibold block mb-1">Ce qui est inclus</label>
          <Textarea className="min-h-[100px]" value={data.offer_included} onChange={(e) => save({ offer_included: e.target.value })} placeholder="Branding complet, stratégie réseaux, site web, SEO, newsletter, 6 mois de suivi..." />
        </div>
        <div>
          <label className="text-sm font-semibold block mb-1">Facilités de paiement</label>
          <Input value={data.offer_payment} onChange={(e) => save({ offer_payment: e.target.value })} placeholder="Paiement mensuel, en 3 fois..." />
        </div>
        <div>
          <label className="text-sm font-semibold block mb-1">Comparaison contextuelle (optionnel)</label>
          <Input value={data.offer_comparison} onChange={(e) => save({ offer_comparison: e.target.value })} placeholder="Moins qu'un·e freelance pour 1 mois..." />
        </div>
      </div>

      <Button variant="outline" size="sm" onClick={async () => {
        const result = await callAI("offer-price", {
          offer_name: data.offer_name, offer_price: data.offer_price,
          offer_included: data.offer_included, offer_payment: data.offer_payment,
          offer_comparison: data.offer_comparison,
        });
        if (result?.full_text) save({ offer_block: result.full_text });
      }} disabled={aiLoading === "offer-price"}>
        <Sparkles className="h-4 w-4 mr-1" /> {aiLoading === "offer-price" ? "Génération..." : "Générer la section prix"}
      </Button>

      {data.offer_block && (
        <div className="rounded-xl bg-rose-pale p-4 text-[13px] text-foreground whitespace-pre-line">
          {data.offer_block}
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => copyText(data.offer_block)}>
            <Copy className="h-4 w-4 mr-1" /> Copier
          </Button>
        </div>
      )}
    </div>
  );
}
