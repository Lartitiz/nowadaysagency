import { useMemo } from "react";
import { usePinterestEditor } from "@/hooks/use-pinterest-editor";
import PinterestSaveStatus from "@/components/pinterest/PinterestSaveStatus";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

export default function PinterestRoutine() {
  const currentMonth = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  }, []);
  const monthLabel = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

  const editor = usePinterestEditor("pinterest_routine", { rhythm: "2h_monthly", pins_done: 0, pins_target: 5, current_month: currentMonth, recycled_done: false, links_checked: false, stats_checked: false, top_pins_noted: false, keywords_adjusted: false }, currentMonth);
  const row = editor.rows[0];
  const rhythm = row.rhythm ?? "2h_monthly";
  const pinsDone = row.pins_done ?? 0;
  const recycledDone = row.recycled_done ?? false;
  const linksChecked = row.links_checked ?? false;
  const statsChecked = row.stats_checked ?? false;
  const topPinsNoted = row.top_pins_noted ?? false;
  const keywordsAdjusted = row.keywords_adjusted ?? false;
  const pinsTarget = rhythm === "2h_biweekly" ? 10 : 5;
  const save = (overrides: Record<string, any> = {}) => {
    const next = { ...row, ...overrides };
    next.pins_target = next.rhythm === "2h_biweekly" ? 10 : 5;
    return editor.save([next], "");
  };
  const changeRhythm = (rhythm: string) => save({ rhythm });
  const incrementPins = () => save({ pins_done: Math.min(pinsDone + 1, pinsTarget) });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <PinterestSaveStatus editor={editor} />
        <fieldset disabled={editor.disabled} className="min-w-0">
        <SubPageHeader parentTo="/pinterest" parentLabel="Pinterest" currentLabel="Ma routine Pinterest" useFromParam />
        <h1 className="font-display text-2xl font-bold text-foreground mb-1">Ta routine Pinterest</h1>
        <p className="text-sm text-muted-foreground italic mb-6">Pinterest ne demande pas d'être là tous les jours. Un bon rythme : 2h par mois. C'est tout.</p>

        {/* Rhythm selection */}
        <section className="mb-8">
          <h3 className="font-body text-base font-bold mb-3">Ton rythme</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { id: "2h_monthly", label: "2h par mois", desc: "Le minimum efficace. Tu publies tes épingles et tu lies à ton site." },
              { id: "2h_biweekly", label: "2h toutes les 2 semaines", desc: "Plus régulier. Tu postes, tu recycles, tu observes ce qui marche." },
            ].map(opt => (
              <button key={opt.id} onClick={() => changeRhythm(opt.id)} className={`rounded-xl border p-5 text-left transition-all ${rhythm === opt.id ? "border-primary border-2 bg-rose-pale" : "border-border bg-card hover:border-primary/40"}`}>
                <h4 className="font-body text-sm font-bold text-foreground">{opt.label}</h4>
                <p className="text-xs text-muted-foreground mt-1">{opt.desc}</p>
              </button>
            ))}
          </div>
        </section>

        {/* Monthly checklist */}
        <section className="rounded-xl border border-border bg-card p-5 space-y-4 mb-8">
          <h3 className="font-body text-base font-bold">📌 Ma routine Pinterest — {monthLabel}</h3>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold">CRÉATION</span>
              <span className="font-mono-ui text-xs font-bold text-primary">{pinsDone}/{pinsTarget}</span>
            </div>
            <Progress value={(pinsDone / pinsTarget) * 100} className="h-2 mb-3" />
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: pinsTarget }).map((_, i) => (
                <div key={i} className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs transition-all ${i < pinsDone ? "bg-primary border-primary text-primary-foreground" : "border-border text-muted-foreground"}`}>
                  {i < pinsDone ? "✓" : i + 1}
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={incrementPins} disabled={pinsDone >= pinsTarget} className="ml-auto text-xs">+1 épingle</Button>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-border">
            <p className="text-sm font-semibold">RECYCLAGE</p>
            <div className="flex items-center gap-2"><Checkbox checked={recycledDone} onCheckedChange={v => { save({ recycled_done: !!v }); }} /><span className="text-sm">J'ai recyclé des photos/posts Instagram en épingles</span></div>
            <div className="flex items-center gap-2"><Checkbox checked={linksChecked} onCheckedChange={v => { save({ links_checked: !!v }); }} /><span className="text-sm">J'ai ajouté les liens vers mon site sur chaque épingle</span></div>
          </div>

          <div className="space-y-2 pt-2 border-t border-border">
            <p className="text-sm font-semibold">OPTIMISATION</p>
            <div className="flex items-center gap-2"><Checkbox checked={statsChecked} onCheckedChange={v => { save({ stats_checked: !!v }); }} /><span className="text-sm">J'ai vérifié mes statistiques Pinterest</span></div>
            <div className="flex items-center gap-2"><Checkbox checked={topPinsNoted} onCheckedChange={v => { save({ top_pins_noted: !!v }); }} /><span className="text-sm">J'ai noté les épingles qui marchent le mieux</span></div>
            <div className="flex items-center gap-2"><Checkbox checked={keywordsAdjusted} onCheckedChange={v => { save({ keywords_adjusted: !!v }); }} /><span className="text-sm">J'ai ajusté mes mots-clés si besoin</span></div>
          </div>
        </section>

        {editor.dirty && <Button onClick={() => save()} className="mb-6">Réessayer l’enregistrement</Button>}

        {/* Tips */}
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold text-foreground"><ChevronDown className="h-4 w-4" /> 💡 Astuces gain de temps</CollapsibleTrigger>
          <CollapsibleContent className="mt-3 rounded-xl bg-rose-pale p-5 text-sm space-y-2">
            <p>• Recycle tes photos Instagram et tes shootings produit</p>
            <p>• Utilise Canva pour créer des épingles en lot (format 1000×1500px)</p>
            <p>• Si possible, utilise Tailwind pour programmer tes épingles</p>
            <p>• Les légendes courtes marchent très bien sur Pinterest</p>
            <p>• Épingle le même contenu dans plusieurs tableaux pertinents</p>
          </CollapsibleContent>
        </Collapsible>
        </fieldset>
      </main>
    </div>
  );
}
