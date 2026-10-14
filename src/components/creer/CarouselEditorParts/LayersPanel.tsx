// Lot E3-4 (14/10/2026) : calques et sélection multiple du panneau de réglages,
// déplacés à l'identique depuis CarouselEditor.tsx (les valeurs de l'éditeur
// arrivent en props, sous leur nom d'origine).
import type { MutableRefObject } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, Image as ImageIcon, Layers, LockKeyhole, RotateCcw, Square, Trash2, Type, Unlock } from "lucide-react";
import { listLayers, moveLayer, restoreLayer, setLayerHidden, type EditorSlide, type RemovedLayer } from "@/lib/carousel-editor";
import { type AlignMode, type CanvasApi } from "@/components/creer/CarouselEditorParts/canvas-geometry";
import { PanelSection } from "@/components/creer/CarouselEditorParts/PanelBits";

/** Section « Calques » : choisir, monter / descendre, verrouiller, masquer, retirer, remettre. */
export function LayersPanel({ changeSlide, group, layers, lockElement, remove, removedLayers, selectAdd, selectOne, selected, setSelected, slide }: {
  changeSlide: (next: EditorSlide, key?: string) => void;
  group: string[];
  layers: ReturnType<typeof listLayers>;
  lockElement: (id: string, locked: boolean) => void;
  remove: (id: string) => void;
  removedLayers: RemovedLayer[];
  selectAdd: (id: string) => void;
  selectOne: (id: string | null) => void;
  selected: string | null;
  setSelected: (id: string | null) => void;
  slide: EditorSlide;
}) {
  return (
    <>
          <PanelSection title={`Calques (${layers.length})`} storageKey="Calques" icon={<Layers size={14} aria-hidden="true" />}>
          <div className="space-y-1">
            <p className="text-2xs text-muted-foreground">Le plus haut en premier.</p>
            <ul
              aria-label="Calques de la slide"
              className="max-h-72 space-y-0.5 overflow-auto rounded-md border bg-background p-1"
            >
              {layers.map((layer, i) => {
                const Icon =
                  layer.kind === "photo"
                    ? ImageIcon
                    : layer.kind === "text"
                      ? Type
                      : Square;
                const peers = layers.filter((l) => l.topLevel);
                const rank = peers.findIndex((l) => l.id === layer.id);
                return (
                  <li
                    key={layer.id}
                    className={`flex items-center gap-1 rounded px-1 ${selected === layer.id ? "bg-primary/10 ring-1 ring-primary" : group.includes(layer.id) ? "bg-primary/5 ring-1 ring-dashed ring-primary/60" : "hover:bg-muted"}`}
                    style={{ paddingLeft: 4 + layer.depth * 16 }}
                  >
                    <button
                      type="button"
                      aria-pressed={group.includes(layer.id)}
                      aria-label={`Choisir le calque ${layer.label}`}
                      onClick={(e) => (e.shiftKey ? selectAdd(layer.id) : selectOne(layer.id))}
                      className={`flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-left text-xs ${layer.hidden ? "text-muted-foreground line-through" : ""}`}
                    >
                      <Icon size={13} className="shrink-0" aria-hidden="true" />
                      <span className="truncate">{layer.label}</span>
                    </button>
                    {layer.topLevel && (
                      <>
                        <button
                          type="button"
                          disabled={slide.locked || rank <= 0}
                          aria-label={`Monter le calque ${layer.label}`}
                          title="Monter (passer devant)"
                          onClick={() => changeSlide(moveLayer(slide, layer.id, "up"))}
                          className="rounded p-1 hover:bg-muted disabled:opacity-30"
                        >
                          <ChevronUp size={13} />
                        </button>
                        <button
                          type="button"
                          disabled={slide.locked || rank === peers.length - 1}
                          aria-label={`Descendre le calque ${layer.label}`}
                          title="Descendre (passer derrière)"
                          onClick={() => changeSlide(moveLayer(slide, layer.id, "down"))}
                          className="rounded p-1 hover:bg-muted disabled:opacity-30"
                        >
                          <ChevronDown size={13} />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      disabled={slide.locked || layer.fixed}
                      aria-pressed={!!layer.locked}
                      aria-label={`${layer.locked ? "Déverrouiller" : "Verrouiller"} le calque ${layer.label}`}
                      title={layer.locked ? "Déverrouiller" : "Verrouiller : il ne bougera plus par erreur"}
                      onClick={() => lockElement(layer.id, !layer.locked)}
                      className={`rounded p-1 hover:bg-muted disabled:opacity-30 ${layer.locked ? "text-primary" : "opacity-40 hover:opacity-100"}`}
                    >
                      {layer.locked ? <LockKeyhole size={13} /> : <Unlock size={13} />}
                    </button>
                    <button
                      type="button"
                      disabled={slide.locked || layer.fixed}
                      aria-label={`${layer.hidden ? "Afficher" : "Masquer"} le calque ${layer.label}`}
                      title={layer.hidden ? "Afficher" : "Masquer (ni exporté ni publié)"}
                      onClick={() => changeSlide(setLayerHidden(slide, layer.id, !layer.hidden))}
                      className="rounded p-1 hover:bg-muted disabled:opacity-30"
                    >
                      {layer.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    <button
                      type="button"
                      disabled={slide.locked || layer.fixed || layer.locked}
                      aria-label={`Retirer le calque ${layer.label}`}
                      title={layer.frame ? "Retirer le fond (garder le texte)" : "Retirer"}
                      onClick={() => remove(layer.id)}
                      className="rounded p-1 hover:bg-muted disabled:opacity-30"
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                );
              })}
            </ul>
            {!!removedLayers.length && (
              <details className="text-xs">
                <summary className="cursor-pointer py-1">
                  Éléments retirés ({removedLayers.length})
                </summary>
                <ul className="space-y-1 pt-1" aria-label="Éléments retirés">
                  {removedLayers.map((r, i) => (
                    <li key={`${r.label}-${i}`} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
                      <span className="truncate">
                        {r.unwrapOf ? `Fond : ${r.label}` : r.label}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={slide.locked}
                        onClick={() => {
                          changeSlide(restoreLayer(slide, i));
                          setSelected(null);
                        }}
                      >
                        <RotateCcw size={13} className="mr-1" />
                        Remettre
                      </Button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
          </PanelSection>
    </>
  );
}

/** Sélection multiple : aligner, répartir, grouper, copier, retirer. */
export function MultiSelectPanel({ canvasApi, copySelection, group, groupSelection, removeMany, selectOne, selected }: {
  canvasApi: MutableRefObject<CanvasApi | null>;
  copySelection: () => void;
  group: string[];
  groupSelection: () => void;
  removeMany: (ids: string[]) => void;
  selectOne: (id: string | null) => void;
  selected: string | null;
}) {
  return (
    <>
            <div className="space-y-2 rounded-lg border border-dashed border-primary/60 p-2" aria-label="Sélection multiple">
              <p className="text-xs font-medium">
                {group.length} éléments sélectionnés · glisse-les ou aligne-les :
              </p>
              <div className="grid grid-cols-3 gap-1">
                {([
                  ["left", "À gauche"],
                  ["center", "Centrés"],
                  ["right", "À droite"],
                  ["top", "En haut"],
                  ["middle", "Au milieu"],
                  ["bottom", "En bas"],
                ] as [AlignMode, string][]).map(([mode, label]) => (
                  <Button key={mode} size="sm" variant="outline" className="h-7 px-1 text-2xs" onClick={() => canvasApi.current?.align(mode)}>
                    {label}
                  </Button>
                ))}
              </div>
              {group.length > 2 && (
                <div className="grid grid-cols-2 gap-1">
                  <Button size="sm" variant="outline" className="h-7 px-1 text-2xs" onClick={() => canvasApi.current?.align("spread-x")}>
                    Répartir en largeur
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 px-1 text-2xs" onClick={() => canvasApi.current?.align("spread-y")}>
                    Répartir en hauteur
                  </Button>
                </div>
              )}
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="outline" className="h-7 text-2xs" onClick={groupSelection} title="⌘G">
                  Grouper
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-2xs" onClick={copySelection}>
                  <Copy size={12} className="mr-1" /> Copier
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-2xs" onClick={() => removeMany(group)}>
                  <Trash2 size={12} className="mr-1" /> Retirer
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-2xs" onClick={() => selectOne(selected)}>
                  Ne garder que le premier
                </Button>
              </div>
              <p className="text-2xs text-muted-foreground">Maj + clic pour ajouter ou retirer un élément.</p>
            </div>
    </>
  );
}
