import { HelpTip } from "@/components/creer/CarouselEditorParts/HelpTip";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { useCarouselAutosave } from "@/hooks/use-carousel-autosave";
import type { useCalendarFollow } from "@/hooks/use-calendar-follow";
import { useTypingPending } from "@/components/creer/CarouselEditorParts/inline-typing";
export default function CarouselSaveStatus({
  save,
  calendar,
}: {
  save: ReturnType<typeof useCarouselAutosave>;
  /** Contenu déjà mis au calendrier : il suit les retouches (choix C3). */
  calendar?: ReturnType<typeof useCalendarFollow>;
}) {
  // Un texte tapé sur la slide pas encore parti : ce n'est pas « tout enregistré ».
  const typing = useTypingPending();
  if (!save.enabled) return null;
  const label =
    save.status === "saved" && !typing
      ? "Tout est enregistré dans ton compte"
      : save.status === "saving" || (typing && save.status === "saved")
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
      className="rounded-xl border px-3 py-2 space-y-1 text-xs"
      aria-label="Sauvegarde automatique"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <p role="status" aria-live="polite" className="flex items-center gap-1.5">
          {label}
          <HelpTip label="sauvegarde">
            Les retouches sont enregistrées automatiquement. Sont gardées les 3 dernières versions et la dernière de
            chaque jour précédent (8 au plus, selon leur taille). Restaurer garde d’abord la version actuelle.
          </HelpTip>
        </p>
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
      </div>
      {calendar && <CalendarFollowLine calendar={calendar} />}
      {!!save.history.length && (
        <details className="text-xs">
          <summary className="cursor-pointer py-1 font-medium">
            Historique des versions ({save.history.length})
          </summary>
          <ul className="space-y-1.5 pt-1" aria-label="Versions précédentes">
            {save.history.map((v) => (
              <li key={v.savedAt} className="flex items-center gap-2 rounded-lg border p-1.5">
                <VersionThumb html={v.raw?.visual_html?.[0]?.html} />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{versionLabel(v.savedAt)}</span>
                  <span className="block text-muted-foreground">
                    {(v.raw?.visual_html?.length || v.raw?.slides?.length || 0)} slides
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-2xs"
                  disabled={save.status !== "saved"}
                  title={save.status !== "saved" ? "Attends la fin de l’enregistrement" : undefined}
                  onClick={() => void save.restore(v)}
                >
                  Restaurer
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Ce que devient le contenu du calendrier quand on retouche ici. */
function CalendarFollowLine({ calendar }: { calendar: ReturnType<typeof useCalendarFollow> }) {
  const text =
    calendar.status === "syncing" || (calendar.pending && calendar.status !== "error" && calendar.status !== "blocked")
      ? "Mise à jour de ton calendrier…"
      : calendar.status === "updated"
        ? "Mis à jour dans ton calendrier"
        : calendar.status === "following"
          ? "Ce contenu est dans ton calendrier : tes retouches y iront toutes seules."
          : calendar.status === "published"
            ? "Déjà publié : ton calendrier garde la version publiée. Tes retouches restent ici et dans Mes idées."
            : calendar.status === "conflict"
              ? "Ce contenu a été modifié ailleurs dans ton calendrier : ta retouche n’y est pas allée."
              : calendar.status === "blocked" || calendar.status === "error"
                ? `Ton calendrier n’a pas été mis à jour. ${calendar.message}`
                : null;
  if (!text) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="calendar-follow-status">
      <p role="status" aria-live="polite">{text}</p>
      {calendar.status === "conflict" && (
        <Button size="sm" variant="outline" onClick={() => calendar.retry(true)}>
          Mettre à jour quand même
        </Button>
      )}
      {calendar.status === "error" && (
        <Button size="sm" variant="outline" onClick={() => calendar.retry()}>
          Réessayer
        </Button>
      )}
    </div>
  );
}

/** « Aujourd'hui 14:32 », « Hier 18:05 », ou la date. */
function versionLabel(savedAt: string): string {
  const d = new Date(savedAt);
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return `Aujourd’hui ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Hier ${time}`;
  return `${d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })} ${time}`;
}
/** Miniature de la première slide d'une version. */
function VersionThumb({ html }: { html?: string }) {
  const W = 40;
  return (
    <span className="relative block shrink-0 overflow-hidden rounded bg-muted" style={{ width: W, height: W * 1.25 }} aria-hidden="true">
      {html && (
        <iframe
          title=""
          tabIndex={-1}
          sandbox="allow-same-origin"
          srcDoc={`<!doctype html><html><head><style>html,body{margin:0;width:1080px;height:1350px;overflow:hidden}</style></head><body>${html}</body></html>`}
          style={{ position: "absolute", width: 1080, height: 1350, border: 0, transform: `scale(${W / 1080})`, transformOrigin: "top left", pointerEvents: "none" }}
        />
      )}
    </span>
  );
}
