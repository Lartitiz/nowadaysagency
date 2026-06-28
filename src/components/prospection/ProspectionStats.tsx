import type { Prospect } from "./ProspectionSection";

interface Props {
  prospects: Prospect[];
}

export default function ProspectionStats({ prospects }: Props) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const thisMonth = prospects.filter(p => new Date(p.created_at) >= monthStart);
  const conversions = prospects.filter(p => p.stage === "converted");
  const totalCA = conversions.reduce((sum, p) => sum + (p.conversion_amount || 0), 0);

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <h3 className="font-display text-sm font-bold text-foreground">📊 Ce mois</h3>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-muted-foreground">Prospects ajoutés</span>
          <span className="block font-bold">{thisMonth.length}</span>
        </div>
        <div>
          <span className="text-muted-foreground">En conversation</span>
          <span className="block font-bold">{prospects.filter(p => p.stage === "in_conversation").length}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Offres proposées</span>
          <span className="block font-bold">{prospects.filter(p => p.stage === "offer_proposed").length}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Conversions</span>
          <span className="block font-bold">{conversions.length}{totalCA > 0 ? ` → ${totalCA}€` : ""}</span>
        </div>
      </div>
      {prospects.length > 0 && (
        <p className="text-2xs text-muted-foreground italic">
          💡 Envoie 2-3 DM personnalisés par semaine. La régularité bat le volume.
        </p>
      )}
    </div>
  );
}
