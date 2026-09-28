import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { StudioMemory } from "./api";
type Draft = {
  id: string;
  revision: number;
  kind: StudioMemory["kind"];
  name: string;
  note: string;
  fictional: boolean;
};
export function StudioMemoryPanel(
  { memory, selectedVersion, brief, disabled, onSave, onApply }: {
    memory: StudioMemory[];
    selectedVersion?: string;
    brief: string;
    disabled: boolean;
    onSave: (values: Record<string, unknown>) => Promise<unknown>;
    onApply: (id: string) => Promise<unknown>;
  },
) {
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState<Draft | null>(null),
    [pending, setPending] = useState(false);
  const blocked = disabled || pending;
  const start = (kind: Draft["kind"]) =>
    setDraft({
      id: crypto.randomUUID(),
      revision: -1,
      kind,
      name: "",
      note: kind === "preference" ? "" : brief.slice(0, 1500),
      fictional: false,
    });
  async function save(remove = false) {
    if (!draft || blocked) return;
    setPending(true);
    try {
      const result = await onSave({
        memory_id: draft.id,
        memory_revision: draft.revision,
        memory_kind: draft.kind,
        memory_name: draft.name,
        memory_note: draft.note,
        version_id: draft.revision === -1 ? selectedVersion : undefined,
        fictional_model: draft.fictional ? true : undefined,
        remove,
      });
      if (result) setDraft(null);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="my-4">
      <Button variant="outline" onClick={() => setOpen(true)}>
        Mémoire de marque{memory.length ? ` · ${memory.length}` : ""}
      </Button>
      {selectedVersion && (
        <Button
          variant="ghost"
          disabled={blocked}
          onClick={() => {
            setOpen(true);
            start("casting");
          }}
        >
          Garder ce mannequin
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!pending) {
            setOpen(v);
            if (!v) setDraft(null);
          }
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Mémoire de marque</DialogTitle>
            <DialogDescription>
              Choisis ce que le Studio pourra réutiliser. Tes demandes
              ponctuelles ne changent pas ces éléments.
            </DialogDescription>
          </DialogHeader>
          {draft
            ? (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <p className="font-medium">
                  {draft.kind === "casting"
                    ? "Mannequin fictif"
                    : draft.kind === "direction"
                    ? "Direction visuelle"
                    : "Préférence de marque"}
                </p>
                <label className="block text-sm">
                  Nom<Input
                    value={draft.name}
                    maxLength={120}
                    required
                    disabled={blocked}
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  À retenir<Textarea
                    value={draft.note}
                    maxLength={1500}
                    required
                    disabled={blocked}
                    onChange={(e) =>
                      setDraft({ ...draft, note: e.target.value })}
                  />
                </label>
                {draft.kind === "casting" && draft.revision === -1 && (
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft.fictional}
                      disabled={blocked}
                      onChange={(e) =>
                        setDraft({ ...draft, fictional: e.target.checked })}
                    />Cette image représente un mannequin fictif, pas une
                    personne réelle.
                  </label>
                )}
                <p className="text-xs text-muted-foreground">
                  {draft.kind === "preference"
                    ? "Cette préférence sera utilisée dans les prochaines conversations. Tu peux demander une exception pour une séance."
                    : "Cette référence restera disponible pour être choisie dans une prochaine session. L’identité et le produit devront toujours être vérifiés."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="submit"
                    disabled={blocked || !draft.name.trim() ||
                      !draft.note.trim() ||
                      (draft.kind === "casting" && draft.revision === -1 &&
                        !draft.fictional)}
                  >
                    Enregistrer pour ma marque
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={blocked}
                    onClick={() => setDraft(null)}
                  >
                    Annuler
                  </Button>
                </div>
                {draft.revision >= 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={blocked}
                    onClick={() => void save(true)}
                  >
                    Retirer de la mémoire
                  </Button>
                )}
              </form>
            )
            : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={blocked}
                    onClick={() => start("preference")}
                  >
                    Ajouter une préférence
                  </Button>
                  <Button
                    variant="outline"
                    disabled={blocked}
                    onClick={() => start("direction")}
                  >
                    Garder cette direction
                  </Button>
                </div>
                {!memory.length && (
                  <p className="text-sm text-muted-foreground">
                    Aucun élément enregistré. Par exemple : « Des couleurs
                    franches, sans accessoires ajoutés automatiquement. »
                  </p>
                )}
                {memory.map((item) => (
                  <article
                    key={item.id}
                    className="rounded-xl border p-3 space-y-2"
                  >
                    <h3 className="font-medium">{item.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {item.kind === "casting"
                        ? "Mannequin fictif"
                        : item.kind === "direction"
                        ? "Direction visuelle"
                        : "Préférence"}
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{item.note}</p>
                    <div className="flex gap-2">
                      {item.kind !== "preference" && (
                        <Button
                          size="sm"
                          disabled={blocked}
                          onClick={async () => {
                            setPending(true);
                            try {
                              if (await onApply(item.id)) setOpen(false);
                            } finally {
                              setPending(false);
                            }
                          }}
                        >
                          Utiliser ici
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={blocked}
                        onClick={() => setDraft({ ...item, fictional: false })}
                      >
                        Modifier ou retirer
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
