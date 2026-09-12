import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { useCarouselAutosave } from "@/hooks/use-carousel-autosave";
export default function CarouselSaveStatus({
  save,
}: {
  save: ReturnType<typeof useCarouselAutosave>;
}) {
  const [version, setVersion] = useState("");
  if (!save.enabled) return null;
  const label =
    save.status === "saved"
      ? "Tout est enregistré dans ton compte"
      : save.status === "saving"
        ? "Enregistrement en cours…"
        : save.status === "offline"
          ? "Hors connexion : garde cet onglet ouvert. La sauvegarde reprendra à la reconnexion."
          : ["conflict", "blocked"].includes(save.status)
            ? save.message
            : save.status === "error"
              ? "Sauvegarde en ligne impossible. Tes dernières retouches ne sont pas encore enregistrées dans ton compte."
              : "Sauvegarde automatique en préparation…";
  return (
    <div
      className="rounded-xl border p-3 space-y-2 text-sm"
      aria-label="Sauvegarde automatique"
    >
      <p role="status" aria-live="polite">
        {label}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <Link className="underline" to="/idees">
          Retrouver dans Mes idées
        </Link>
        {["error", "offline"].includes(save.status) && (
          <Button size="sm" variant="outline" onClick={() => void save.flush()}>
            Réessayer
          </Button>
        )}
        {save.status === "conflict" && (
          <Button size="sm" variant="outline" onClick={save.saveCopy}>
            Enregistrer une copie
          </Button>
        )}
        {!!save.history.length && (
          <>
            <label className="text-xs">
              Version précédente
              <select
                className="ml-2 rounded border bg-background p-2"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              >
                <option value="">Choisir une version</option>
                {save.history.map((v) => (
                  <option key={v.savedAt} value={v.savedAt}>
                    {new Date(v.savedAt).toLocaleString("fr-FR")}
                  </option>
                ))}
              </select>
            </label>
            <Button
              size="sm"
              variant="outline"
              disabled={
                !save.history.some((v) => v.savedAt === version) ||
                save.status !== "saved"
              }
              onClick={() => {
                const previous = save.history.find(
                  (v) => v.savedAt === version,
                );
                if (previous) void save.restore(previous);
                setVersion("");
              }}
            >
              Restaurer cette version
            </Button>
          </>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Les retouches sont enregistrées automatiquement. Jusqu’à 3 versions
        espacées sont conservées, selon leur taille. La restauration conserve
        d’abord la version actuelle.
      </p>
    </div>
  );
}
