import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Clock, FileEdit, ImagePlus, Link2, Loader2, Zap } from "lucide-react";
import AlreadyPlannedNotice from "@/components/calendar/AlreadyPlannedNotice";

export type PublishChannel = "instagram" | "linkedin" | null;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Canal de publication automatique du contenu affiché. null = pas de publication auto (Pinterest, newsletter, carrousel LinkedIn…) : seul le brouillon calendrier est proposé. */
  channel: PublishChannel;
  /** Raison de blocage de la publication (vaut pour « Maintenant » ET « Programmer »), null/undefined si publiable. */
  disabledReason?: string | null;
  /**
   * Action qui LÈVE le blocage (ex : ajouter l'image manquante au post) — sans elle,
   * la raison de blocage est un cul-de-sac. Affichée en bouton sous les deux options
   * bloquées ; `busy` pendant l'upload.
   */
  blockedAction?: { label: string; onClick: () => void; busy?: boolean } | null;
  /** Compte du canal connecté ? Sans connexion, publier/programmer échoueraient. */
  channelConnected: boolean;
  /**
   * Démarre la connexion OAuth du canal SANS quitter cet écran (popup au
   * retour). Affiché à la place de `blockedAction` quand le blocage vient
   * d'un compte non connecté — avant, le message renvoyait vers Paramètres
   * sans bouton, un cul-de-sac qui laissait le contenu généré à l'abandon.
   */
  onConnectChannel?: () => void;
  connectingChannel?: boolean;
  publishing?: boolean;
  onPublishNow: () => void;
  scheduling?: boolean;
  onSchedule: (isoLocalDateTime: string) => void;
  onDraft: (date: string) => void;
  defaultDraftDate?: string;
  /** Sujet du contenu — sert à prévenir s'il est DÉJÀ prévu à la date choisie. */
  theme?: string | null;
  /** Réseau visé (le doublon se juge par jour + réseau + sujet). */
  canal?: string | null;
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
 * calendrier » (brouillon). Trois issues, groupées visuellement en 2 blocs
 * pour qu'on ne confonde plus « Programmer » (auto) et « Brouillon » (manuel) :
 *  1. Maintenant — publication directe immédiate.
 *  2. Programmer — date + heure, le cron social-publish-scheduled publie tout seul.
 *  3. Brouillon — posé sur une date, sans auto-publication, séparé par un divider
 *     "sans publication auto" + icône/couleur différentes des deux options du dessus.
 */
export default function PublishOrScheduleDialog({
  open,
  onOpenChange,
  channel,
  disabledReason,
  blockedAction,
  channelConnected,
  onConnectChannel,
  connectingChannel,
  publishing,
  onPublishNow,
  scheduling,
  onSchedule,
  onDraft,
  defaultDraftDate,
  theme,
  canal,
}: Props) {
  const [mode, setMode] = useState<"schedule" | "draft" | null>(null);
  const [scheduleInput, setScheduleInput] = useState("");
  const [draftDate, setDraftDate] = useState("");

  const channelLabel = channel === "linkedin" ? "LinkedIn" : "Instagram";
  const notConnected = !!channel && !channelConnected;
  // Message court : le bouton "Connecter X" juste en dessous porte l'action —
  // pas besoin de répéter "connecte-le dans Paramètres" (le cul-de-sac d'avant).
  const blockedReason =
    disabledReason || (notConnected ? `Compte ${channelLabel} non connecté.` : null);

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
              <p className="text-xs font-medium text-muted-foreground px-1">
                Ça part tout seul sur {channelLabel}
              </p>
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
              {/* Action de déblocage : sans elle, la raison affichée serait un cul-de-sac.
                  Priorité au blocage le plus immédiat (image) ; la connexion ne s'affiche
                  que quand ce n'est PAS ce qui bloque — se corrige d'elle-même une fois
                  l'image ajoutée (disabledReason recalculé par le parent). */}
              {blockedReason && !disabledReason && notConnected && onConnectChannel ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2"
                  data-testid="publish-connect-action"
                  disabled={connectingChannel || publishing || scheduling}
                  onClick={onConnectChannel}
                >
                  {connectingChannel ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="h-4 w-4" />
                  )}
                  {connectingChannel ? "Connexion…" : `Connecter ${channelLabel}`}
                </Button>
              ) : (
                blockedReason && blockedAction && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full gap-2"
                    data-testid="publish-blocked-action"
                    disabled={blockedAction.busy || publishing || scheduling}
                    onClick={blockedAction.onClick}
                  >
                    {blockedAction.busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ImagePlus className="h-4 w-4" />
                    )}
                    {blockedAction.busy ? "Ajout en cours…" : blockedAction.label}
                  </Button>
                )
              )}
              {mode === "schedule" && !blockedReason && (
                <div className="rounded-xl bg-muted/40 p-3 space-y-2 animate-fade-in">
                  <Input
                    type="datetime-local"
                    value={scheduleInput}
                    onChange={(e) => setScheduleInput(e.target.value)}
                    min={new Date(Date.now() + 5 * 60000).toISOString().slice(0, 16)}
                  />
                  <AlreadyPlannedNotice date={scheduleInput.slice(0, 10)} theme={theme} canal={canal} />
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

          {/* 3. Brouillon (toujours disponible) — volontairement à part visuellement :
              c'est l'option qui NE publie rien seule, contrairement aux deux au-dessus. */}
          {channel && (
            <div className="flex items-center gap-2 pt-1 px-1">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[11px] text-muted-foreground">sans publication auto</span>
              <div className="h-px flex-1 bg-border" />
            </div>
          )}
          <button
            type="button"
            data-testid="publish-draft-option"
            className={`${optionClass} border-dashed bg-muted/20`}
            disabled={scheduling || publishing}
            onClick={() => {
              setMode((m) => (m === "draft" ? null : "draft"));
              if (!draftDate) setDraftDate(defaultDraftDate || todayISO());
            }}
          >
            <FileEdit className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">
                Brouillon (à publier toi-même)
              </span>
              <span className="block text-xs text-muted-foreground">
                Posé sur une date, mais rien ne part tout seul
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
              <AlreadyPlannedNotice date={draftDate} theme={theme} canal={canal} />
              <Button
                className="w-full gap-2"
                disabled={!draftDate || scheduling}
                onClick={() => onDraft(draftDate)}
              >
                {scheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileEdit className="h-4 w-4" />}
                {scheduling ? "Ajout en cours…" : "Enregistrer le brouillon"}
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
