import { Copy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { Checkbox } from "@/components/ui/checkbox";
import { StepProps } from "./SiteShared";

const CHECKLIST = [
  { cat: "CLARTÉ", items: [
    { key: "title_clear", label: "Titre compréhensible en 3 secondes" },
    { key: "value_prop", label: "Proposition de valeur claire above the fold" },
    { key: "cta_clear", label: "CTA dit exactement ce qui se passe au clic" },
  ]},
  { cat: "ÉTHIQUE", items: [
    { key: "no_urgency", label: "Aucune fausse urgence" },
    { key: "no_shaming", label: "Aucun shaming (ni copy, ni popups, ni CTA)" },
    { key: "honest_price", label: "Prix présenté honnêtement" },
    { key: "real_testimonials", label: "Témoignages vrais" },
  ]},
  { cat: "COPYWRITING", items: [
    { key: "tone_ok", label: "Ton incarné, direct, chaleureux" },
    { key: "oral_ok", label: "Expressions orales naturelles" },
    { key: "no_dash", label: "Pas de tiret cadratin" },
    { key: "inclusive", label: "Écriture inclusive point médian" },
  ]},
  { cat: "PREUVE SOCIALE", items: [
    { key: "testimonials", label: "2-3 témoignages minimum" },
    { key: "testimonial_context", label: "Prénom + contexte + résultat" },
  ]},
  { cat: "SEO", items: [
    { key: "title_tag", label: "Title tag renseigné (50-60 car.)" },
    { key: "meta_desc", label: "Meta description rédigée (150-160 car.)" },
    { key: "h1_ok", label: "H1 unique avec mot-clé principal" },
  ]},
];

export default function Step10SeoLayout({ data, save, callAI, aiLoading, aiResults, copyText }: StepProps) {
  const checklist = data.checklist_data || {};
  const toggleCheck = (key: string) => {
    const updated = { ...checklist, [key]: !checklist[key] };
    save({ checklist_data: updated });
  };
  const totalItems = CHECKLIST.reduce((n, c) => n + c.items.length, 0);
  const checkedItems = Object.values(checklist).filter(Boolean).length;

  return (
    <div className="space-y-6">
      <h2 className="font-display text-xl font-bold">🔍 SEO + Checklist qualité</h2>

      {/* SEO */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-display text-base font-bold mb-3">🔍 SEO de ta page</h3>
        <Button variant="outline" size="sm" className="mb-4" onClick={async () => {
          const result = await callAI("seo", { page_type: data.page_type });
          if (result) {
            save({ seo_title: result.title_tag || "", seo_meta: result.meta_description || "", seo_h1: result.h1 || "" });
          }
        }} disabled={aiLoading === "seo"}>
          <Sparkles className="h-4 w-4 mr-1" /> {aiLoading === "seo" ? "Génération..." : "Générer le SEO"}
        </Button>

        <div className="space-y-3">
          <div>
            <label htmlFor="seo-title" className="text-sm font-semibold block mb-1">Title tag (ce qui apparaît dans Google)</label>
            <Input id="seo-title" value={data.seo_title} onChange={(e) => save({ seo_title: e.target.value })} placeholder="Mon titre SEO..." />
            <p className="font-mono-ui text-2xs text-muted-foreground mt-1">📊 {data.seo_title.length} / 60 caractères</p>
          </div>
          <div>
            <label htmlFor="seo-meta" className="text-sm font-semibold block mb-1">Meta description</label>
            <Textarea id="seo-meta" className="min-h-[60px]" value={data.seo_meta} onChange={(e) => save({ seo_meta: e.target.value })} placeholder="Ma meta description..." />
            <p className="font-mono-ui text-2xs text-muted-foreground mt-1">📊 {data.seo_meta.length} / 160 caractères</p>
          </div>
          <div>
            <label htmlFor="seo-h1" className="text-sm font-semibold block mb-1">H1 suggéré</label>
            <Input id="seo-h1" value={data.seo_h1} onChange={(e) => save({ seo_h1: e.target.value })} placeholder="Mon H1..." />
          </div>
          {(data.seo_title || data.seo_meta) && (
            <Button variant="ghost" size="sm" onClick={() => copyText(`Title: ${data.seo_title}\nMeta: ${data.seo_meta}\nH1: ${data.seo_h1}`)}>
              <Copy className="h-4 w-4 mr-1" /> Copier le SEO
            </Button>
          )}
        </div>
      </div>

      {/* Checklist */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="font-display text-base font-bold mb-3">✅ Checklist qualité de ta page</h3>
        <p className="font-mono-ui text-2xs text-muted-foreground mb-4">Score : {checkedItems}/{totalItems} éléments ✅</p>

        <div className="space-y-4">
          {CHECKLIST.map((cat) => (
            <div key={cat.cat}>
              <p className="font-mono-ui text-2xs font-semibold text-primary mb-2">{cat.cat}</p>
              <div className="space-y-1.5">
                {cat.items.map((item) => (
                  <label key={item.key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={!!checklist[item.key]} onCheckedChange={() => toggleCheck(item.key)} />
                    {item.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Layout notes */}
      <div>
        <label htmlFor="layout-notes" className="text-sm font-semibold block mb-2">Mes notes de mise en forme</label>
        <Textarea id="layout-notes" className="min-h-[80px]" placeholder="Notes sur la mise en forme de ma page..." value={data.layout_notes} onChange={(e) => save({ layout_notes: e.target.value })} />
      </div>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={data.layout_done} onCheckedChange={(v) => save({ layout_done: !!v })} /> Mon titre et sous-titre sont en haut, visibles sans scroller</label>
    </div>
  );
}
