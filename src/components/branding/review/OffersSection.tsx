import { useState } from "react";
import { Pencil, Trash2, X, Check } from "lucide-react";
import type { AnalysisResult, OfferItem } from "./types";

// On ne parle de doublon que s'il y en a un VRAI : la règle affichée en dur
// à toutes les inscrites laissait croire qu'elles avaient déjà des offres.
export function offerClashes(offers: OfferItem[], existingOfferNames: string[] = []): string[] {
  const existing = new Set(existingOfferNames.map(n => n.toLocaleLowerCase().trim()).filter(Boolean));
  return offers.map(o => o.name?.trim()).filter((n): n is string => !!n && existing.has(n.toLocaleLowerCase()));
}

export function OffersSection({ data, onUpdate, onDelete, existingOfferNames = [] }: { data: AnalysisResult["offers"]; onUpdate?: (index: number, offer: OfferItem) => void; onDelete?: (index: number) => void; existingOfferNames?: string[] }) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<OfferItem>({});

  if (!data?.offers?.length) return null;

  const clashes = offerClashes(data.offers, existingOfferNames);

  const startEdit = (i: number) => {
    setEditDraft({ ...data.offers![i] });
    setEditingIndex(i);
  };
  const cancelEdit = () => { setEditingIndex(null); setEditDraft({}); };
  const confirmEdit = () => {
    if (editingIndex !== null && onUpdate) {
      onUpdate(editingIndex, editDraft);
    }
    setEditingIndex(null);
    setEditDraft({});
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {clashes.length > 0 && (
        <p className="text-xs text-warning bg-warning-bg border border-warning/30 rounded-[12px] px-3 py-2 sm:col-span-2">
          {clashes.map(n => `« ${n} »`).join(", ")} {clashes.length > 1 ? "existent" : "existe"} déjà dans Mes offres : renomme ou retire {clashes.length > 1 ? "ces offres" : "cette offre"} de cet import. La fiche existante est conservée.
        </p>
      )}
      {data.offers.map((o, i) => (
        <div key={i} className="p-4 rounded-[12px] border border-border bg-background relative group">
          {editingIndex === i ? (
            <div className="space-y-2">
              <input value={editDraft.name || ""} onChange={e => setEditDraft(d => ({ ...d, name: e.target.value }))} placeholder="Nom de l'offre" className="w-full text-sm font-body border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
              <input value={editDraft.price || ""} onChange={e => setEditDraft(d => ({ ...d, price: e.target.value }))} placeholder="Prix" className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
              <input value={editDraft.description || ""} onChange={e => setEditDraft(d => ({ ...d, description: e.target.value }))} placeholder="Description" className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
              <input value={editDraft.target || ""} onChange={e => setEditDraft(d => ({ ...d, target: e.target.value }))} placeholder="Pour qui ?" className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
              <input value={editDraft.promise || ""} onChange={e => setEditDraft(d => ({ ...d, promise: e.target.value }))} placeholder="Promesse" className="w-full text-sm border border-border rounded-lg px-3 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary" />
              <div className="flex gap-2 pt-1">
                <button onClick={confirmEdit} className="inline-flex items-center gap-1 text-xs font-medium text-success hover:text-success"><Check className="h-3.5 w-3.5" /> Appliquer mes modifications</button>
                <button onClick={cancelEdit} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /> Annuler</button>
              </div>
            </div>
          ) : (
            <>
              {(onUpdate || onDelete) && (
                <div className="absolute top-2.5 right-2.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {onUpdate && <button onClick={() => startEdit(i)} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title="Modifier"><Pencil className="h-3.5 w-3.5 text-muted-foreground" /></button>}
                  {onDelete && <button onClick={() => onDelete(i)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors" title="Supprimer"><Trash2 className="h-3.5 w-3.5 text-destructive" /></button>}
                </div>
              )}
              <div className="flex items-baseline justify-between mb-2 pr-14">
                <p className="font-body text-base">{o.name || "Offre"}</p>
                {o.price && <span className="text-sm font-semibold text-primary">{o.price}</span>}
              </div>
              {o.description && <p className="text-sm text-muted-foreground mb-1">{o.description}</p>}
              {o.target && <p className="text-xs"><span className="font-semibold text-bordeaux">Pour :</span> {o.target}</p>}
              {o.promise && <p className="text-xs"><span className="font-semibold text-bordeaux">Promesse :</span> {o.promise}</p>}
            </>
          )}
        </div>
      ))}
    </div>
  );
}
