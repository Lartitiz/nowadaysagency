// Lot E3-6 (14/10/2026) : encadrés affichés sous les boutons de la page
// (sauvegarde fournie par la page, contrôle qualité), déplacés à l'identique
// depuis CarouselEditor.tsx. Le portail vers la page reste dans CarouselEditor.
import type { MutableRefObject, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { CarouselQuality } from "@/hooks/use-carousel-quality";
import { patchElement, type CarouselDocument } from "@/lib/carousel-editor";

/** Sauvegarde et contrôle qualité : bilan, Revérifier, Voir cet élément, Appliquer la correction. */
export function QualityPanel({ cloudTools, commit, current, document, quality, setActive, setSelected }: {
  cloudTools: ReactNode;
  commit: (next: CarouselDocument, key?: string) => void;
  current: MutableRefObject<CarouselDocument>;
  document: CarouselDocument;
  quality?: CarouselQuality;
  setActive: (index: number) => void;
  setSelected: (id: string | null) => void;
}) {
  return (
        <div className="grid gap-3 md:grid-cols-2">
      {cloudTools}
      {quality && quality.status !== "idle" && (
        <div
          className="min-w-0 rounded-xl border p-3 space-y-2 text-sm"
          aria-label="Contrôle qualité"
        >
          <div className="flex items-start justify-between gap-2">
            <p role="status" className="min-w-0 flex-1">
              {quality.status === "checking"
                ? "Contrôle de toutes les slides…"
                : quality.status === "error"
                  ? quality.message
                  : quality.issues.length
                    ? `${quality.issues.filter((i) => i.severity === "error").length} point(s) bloquant(s) · ${quality.issues.filter((i) => i.severity === "warning").length} conseil(s)`
                    : "Contrôle terminé : aucun problème détecté"}
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={quality.recheck}
              disabled={quality.status === "checking"}
            >
              Revérifier
            </Button>
          </div>
          {!!quality.issues.length && (
            <details>
              <summary className="cursor-pointer">
                Voir les points à vérifier
              </summary>
              <ul className="max-h-64 overflow-auto space-y-2 pt-2">
                {quality.issues.map((issue, index) => (
                  <li
                    key={`${issue.slide}-${issue.elementId}-${index}`}
                    className="rounded border p-2"
                  >
                    <p>
                      Slide {issue.slide + 1} —{" "}
                      {issue.severity === "error" ? "À corriger : " : ""}
                      {issue.message}
                    </p>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setActive(issue.slide);
                        setSelected(issue.elementId);
                      }}
                    >
                      Voir cet élément
                    </Button>
                    {issue.fix && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={document.slides[issue.slide]?.locked}
                        onClick={() => {
                          const target = current.current.slides[issue.slide];
                          if (!target || target.locked) return;
                          commit({
                            ...current.current,
                            slides: current.current.slides.map((s, i) =>
                              i === issue.slide
                                ? patchElement(s, issue.elementId, {
                                    styles: issue.fix,
                                  })
                                : s,
                            ),
                          });
                          setActive(issue.slide);
                          setSelected(issue.elementId);
                        }}
                      >
                        Appliquer la correction
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="text-xs text-muted-foreground">
            Bloquent la publication : textes coupés, textes trop petits pour le
            mobile et images manquantes. Le contraste et les textes posés sur
            une photo ou une transparence restent des conseils : vérifie-les à
            l’œil.
          </p>

        </div>
      )}
        </div>
  );
}
