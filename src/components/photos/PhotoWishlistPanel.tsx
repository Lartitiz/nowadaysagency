/**
 * PhotoWishlistPanel — « Photos à prendre » (liste de courses photos).
 *
 * Panneau ambre à côté de la grille : les photos que les contenus ont
 * demandées et qui n'existent pas encore. Cocher = prise, survol = supprimer,
 * champ en bas = ajout manuel.
 */

import { useState } from "react";
import { Camera, Check, ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  usePhotoWishlist,
  usePhotoWishlistMutations,
  type PhotoWishlistRow,
} from "@/hooks/use-photo-wishlist";

const MAX_DONE_SHOWN = 3;

interface PhotoWishlistPanelProps {
  /** Replie le panneau derrière une ligne cliquable (bibliothèque : sous la grille). */
  collapsible?: boolean;
}

export function PhotoWishlistPanel({ collapsible = false }: PhotoWishlistPanelProps) {
  const { data: items = [], isLoading } = usePhotoWishlist();
  const { addMany, setDone, remove } = usePhotoWishlistMutations();
  const [newLabel, setNewLabel] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const open = items.filter((i) => i.status === "open");
  const done = items
    .filter((i) => i.status === "done")
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, MAX_DONE_SHOWN);

  async function handleToggle(item: PhotoWishlistRow) {
    setBusyId(item.id);
    try {
      await setDone(item, item.status === "open");
    } catch (e: any) {
      toast.error(e?.message || "Impossible de mettre à jour");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemove(item: PhotoWishlistRow) {
    setBusyId(item.id);
    try {
      await remove(item.id);
    } catch (e: any) {
      toast.error(e?.message || "Suppression impossible");
    } finally {
      setBusyId(null);
    }
  }

  async function handleAdd() {
    const label = newLabel.trim();
    if (!label) return;
    setAdding(true);
    try {
      await addMany([label], "manual");
      setNewLabel("");
    } catch (e: any) {
      toast.error(e?.message || "Ajout impossible");
    } finally {
      setAdding(false);
    }
  }

  // Replié : une seule ligne cliquable qui dit combien il en reste. La liste
  // ne s'ouvre que quand on prépare une séance photo.
  if (collapsible && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-expanded={false}
        className="flex w-full items-center gap-2 rounded-2xl border border-warning/25 bg-warning-bg px-4 py-3 text-left transition-colors hover:border-warning/50"
      >
        <Camera className="h-4 w-4 shrink-0 text-warning" />
        <span className="text-sm font-medium text-foreground">Photos à prendre</span>
        <span className="text-xs text-muted-foreground">
          {isLoading
            ? "…"
            : open.length === 0
              ? "rien pour l'instant"
              : `${open.length} en attente`}
        </span>
        <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-warning/25 bg-warning-bg p-4">
      <div className="flex items-center gap-2 mb-1">
        <Camera className="h-4 w-4 text-warning" />
        <h2 className="text-sm font-semibold text-foreground">Photos à prendre</h2>
        {collapsible && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-expanded
            aria-label="Replier « Photos à prendre »"
            className="ml-auto text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        Les photos que tes contenus réclament et qui n'existent pas encore.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : open.length === 0 && done.length === 0 ? (
        <p className="text-xs text-muted-foreground italic mb-3">
          Rien pour l'instant : les demandes s'accumuleront ici au fil de tes créations.
        </p>
      ) : (
        <ul className="space-y-2 mb-3">
          {open.map((item) => (
            <li key={item.id} className="group flex items-start gap-2">
              <button
                type="button"
                onClick={() => handleToggle(item)}
                disabled={busyId === item.id}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border border-warning/50 hover:bg-warning/20 transition-colors flex items-center justify-center"
                aria-label={`Marquer « ${item.label} » comme prise`}
              >
                {busyId === item.id && <Loader2 className="h-3 w-3 animate-spin text-warning" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground leading-snug line-clamp-2" title={item.label}>
                  {item.label}
                </p>
                {item.requested_count > 1 && (
                  <p className="text-2xs text-warning">
                    demandée {item.requested_count} fois
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleRemove(item)}
                disabled={busyId === item.id}
                /* coarse: au doigt il n'y a pas de survol — sans ça, on ne peut
                   pas supprimer une ligne depuis un téléphone (audit 14/08). */
                className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 coarse:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                aria-label={`Supprimer « ${item.label} »`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
          {done.map((item) => (
            <li key={item.id} className="group flex items-start gap-2">
              <button
                type="button"
                onClick={() => handleToggle(item)}
                disabled={busyId === item.id}
                className="mt-0.5 h-4 w-4 shrink-0 rounded bg-success flex items-center justify-center"
                aria-label={`Remettre « ${item.label} » à prendre`}
              >
                <Check className="h-3 w-3 text-white" />
              </button>
              <p className="flex-1 min-w-0 text-xs text-muted-foreground line-through leading-snug">
                {item.label}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-1.5">
        <Input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Ajouter une photo à prendre…"
          maxLength={80}
          className={cn("h-8 text-xs bg-background")}
          disabled={adding}
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={adding || !newLabel.trim()}
          className="h-8 w-8 shrink-0 rounded-md border border-warning/40 text-warning hover:bg-warning/15 transition-colors flex items-center justify-center disabled:opacity-40"
          aria-label="Ajouter à la liste"
        >
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
