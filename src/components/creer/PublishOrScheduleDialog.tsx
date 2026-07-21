import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarDays, Clock, Loader2, Zap } from "lucide-react";

export type PublishChannel = "instagram" | "linkedin" | null;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Canal de publication automatique du contenu affiché. null = pas de publication auto (Pinterest, newsletter, carrousel LinkedIn…) : seul le brouillon calendrier est proposé. */
  channel: PublishChannel;
  /** Raison de blocage de la publication (vaut pour « Maintenant » ET « Programmer »), null/undefined si publiable. */
  disabledReason?: string | null;
  /** Compte du canal connecté ? Sans connexion, publier/programmer échoueraient. */
  channelConnected: boolean;
  publishing?: boolean;
  onPublishNow: () => void;
  scheduling?: boolean;
  onSchedule: (isoLocalDateTime: string) => void;
  onDraft: (date: string) => void;
  defaultDraftDate?: string;
}

/** Valeur datetime-local par défaut : demain 09:00 (heure locale). */
function tomorrowAtNine(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T09:00`;
}

function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Fenêtre unique « Publier ou programmer » : remplace les anciens boutons
 * « Publier sur Instagram/LinkedIn » (publication immédiate) et « Ajouter au
 * calendrier » (brouillon). Trois issues :
 *  1. Maintenant — publication directe immédiate.
 *  2. Programmer — date + heure, le cron social-publish-scheduled publie tout seul.
 *  3. Juste dans le calendrier — brouillon posé sur une date, sans auto-publication.
 */
export default function PublishOrScheduleDialog({
  open,
  onOpenChange,
  channel,
  disabledReason,
  channelConnected,
  publishing,
  onPublishNow,
  scheduling,
  onSchedule,
  onDraft,
  defaultDraftDate,
}: Props) {
  const [mode, setMode] = useState<"schedule" | "draft" | null>(null);
  const [scheduleInput, setScheduleInput] = useState("");
  const [draftDate, setDraftDate] = useState("");

  const channelLabel = channel === "linkedin" ? "LinkedIn" : "Instagram";
  const notConnected = !!channel && !channelConnected;
  const blockedReason =
    disabledReason ||
    (notConnected ? `Compte ${channelLabel} non connecté — connecte-le dans Paramètres → Connexions.` : null);

  const handleOpenChange = (next: boolean) => {
    if (!next) setMode(null);
    onOpenChange(next);
  };

  const optionClass =
    "w-full rounded-xl border border-border p-3 flex items-start gap-3 text-left transition-colors hover:bg-muted/40 disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-transparent";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quand publier ce contenu ?</DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-1">
          {channel && (
            <>
              {/* 1. Maintenant */}
              <button
                type="button"
                data-testid="publish-now-option"
                className={optionClass}
                disabled={!!blockedReason || publishing || scheduling}
                onClick={onPublishNow}
              >
                {publishing ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0 mt-0.5" />
                ) : (
                  <Zap className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                )}
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">Maintenant</span>
                  <span className="block text-xs text-muted-foreground">
                    Publié tout de suite sur {channelLabel}
                  </span>
                  {blockedReason && (
                    <span className="block text-xs text-amber-700 mt-0.5">{blockedReason}</span>
                  )}
                </span>
              </button>

              {/* 2. Programmer */}
              <button
                type="button"
                data-testid="publish-schedule-option"
                className={optionClass}
                disabled={!!blockedReason || publishing || scheduling}
                onClick={() => {
                  setMode((m) => (m === "schedule" ? null : "schedule"));
                  if (!scheduleInput) setScheduleInput(tomorrowAtNine());
                }}
              >
                <Clock className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">Programmer</span>
                  <span className="block text-xs text-muted-foreground">
                    Date + heure : publié tout seul sur {channelLabel}
                  </span>
                  {blockedReason && (
                    <span className="block text-xs text-amber-700 mt-0.5">{blockedReason}</span>
                  )}
                </span>
              </button>
              {mode === "schedule" && !blockedReason && (
                <div className="rounded-xl bg-muted/40 p-3 space-y-2 animate-fade-in">
                  <Input
                    type="datetime-local"
                    value={scheduleInput}
                    onChange={(e) => setScheduleInput(e.target.value)}
                    min={new Date(Date.now() + 5 * 60000).toISOString().slice(0, 16)}
                  />
                  <Button
                    className="w-full gap-2"
                    disabled={!scheduleInput || scheduling}
                    onClick={() => onSchedule(scheduleInput)}
                  >
                    {scheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
                    {scheduling ? "Programmation…" : "Programmer la publication"}
                  </Button>
                </div>
              )}
            </>
          )}

          {/* 3. Juste dans le calendrier (toujours disponible) */}
          <button
            type="button"
            data-testid="publish-draft-option"
            className={optionClass}
            disabled={scheduling || publishing}
            onClick={() => {
              setMode((m) => (m === "draft" ? null : "draft"));
              if (!draftDate) setDraftDate(defaultDraftDate || todayISO());
            }}
          >
            <CalendarDays className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">Juste dans le calendrier</span>
              <span className="block text-xs text-muted-foreground">
                Brouillon posé sur une date, tu publieras toi-même
              </span>
            </span>
          </button>
          {mode === "draft" && (
            <div className="rounded-xl bg-muted/40 p-3 space-y-2 animate-fade-in">
              <Input
                type="date"
                value={draftDate}
                onChange={(e) => setDraftDate(e.target.value)}
                min={todayISO()}
              />
              <Button
                className="w-full gap-2"
                disabled={!draftDate || scheduling}
                onClick={() => onDraft(draftDate)}
              >
                {scheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarDays className="h-4 w-4" />}
                {scheduling ? "Ajout en cours…" : "Ajouter au calendrier"}
              </Button>
            </div>
          )}

          {!channel && (
            <p className="text-xs text-muted-foreground px-1">
              La publication automatique n'est pas disponible pour ce format — ajoute-le au
              calendrier, puis publie-le depuis son réseau.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
