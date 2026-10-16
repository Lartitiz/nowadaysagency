// Pied de la fenêtre d'un post du calendrier : état de publication, panneau
// de programmation, indicateur d'auto-save + « Réessayer », « Supprimer » (un
// seul bouton, plus de doublon dans le menu depuis le 16/10/2026) et
// menu « Publier ▾ » / « Options ». Sorti de CalendarPostDialog.tsx à
// l'identique (fiche 13 de docs/robustesse/gros-fichiers.md, lot 3). Les
// valeurs calculées (raisons de blocage, publier / programmer) arrivent en
// props. Les libellés « Publier » / « Options », « Annuler » / « Fermer » ne
// suivent pas la règle « verbe + objet » : à changer dans une PR à part.
import type { NavigateFunction } from "react-router-dom";
import { Trash2, ChevronDown, Loader2, Check, Send, CalendarClock, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import type { useConfirm } from "@/components/ui/confirm-dialog";
import { versConnexions } from "@/lib/retour-apres-detour";
import { cn } from "@/lib/utils";
import type { CalendarPost } from "@/lib/calendar-constants";

interface PostActionsFooterProps {
  canSchedule: boolean;
  publishStatus: string | null;
  scheduledAt: string | null;
  handleCancelSchedule: () => Promise<void>;
  savingSchedule: boolean;
  publishError: string | null;
  schedulerOpen: boolean;
  setSchedulerOpen: (open: boolean) => void;
  postCanal: string;
  igValidImages: string[];
  connectionsKnown: boolean;
  connectionsLoading: boolean;
  refreshConnections: () => unknown;
  scheduleNeedsConnection: boolean;
  navigate: NavigateFunction;
  scheduleInput: string;
  setScheduleInput: (v: string) => void;
  handleSchedulePublish: () => Promise<void>;
  scheduleAfterTokenExpiry: boolean;
  scheduleTokenExpiry: string | null;
  igVideo: string | null;
  linkedInText: string;
  autoSaveState: "idle" | "saving" | "saved" | "error";
  runAutoSave: () => Promise<void>;
  theme: string;
  effectiveId: string | null;
  confirm: ReturnType<typeof useConfirm>;
  onDelete: (id?: string | null) => void;
  publishingInstagram: boolean;
  publishingLinkedIn: boolean;
  canPublishActions: boolean;
  handlePublishNow: () => void;
  publishNowDisabled: boolean;
  editingPost: CalendarPost | null;
  onUnplan: (() => void) | undefined;
}

export function PostActionsFooter({ canSchedule, publishStatus, scheduledAt, handleCancelSchedule, savingSchedule, publishError, schedulerOpen, setSchedulerOpen, postCanal, igValidImages, connectionsKnown, connectionsLoading, refreshConnections, scheduleNeedsConnection, navigate, scheduleInput, setScheduleInput, handleSchedulePublish, scheduleAfterTokenExpiry, scheduleTokenExpiry, igVideo, linkedInText, autoSaveState, runAutoSave, theme, effectiveId, confirm, onDelete, publishingInstagram, publishingLinkedIn, canPublishActions, handlePublishNow, publishNowDisabled, editingPost, onUnplan }: PostActionsFooterProps) {
  return (
    <div className="pt-3 mt-3 border-t border-border space-y-2">
      {/* État de publication (programmée / publiée / en cours / échec) */}
      {canSchedule && publishStatus === "scheduled" && (
        <div className="flex items-center gap-2 text-2xs">
          <span className="text-foreground">🗓️ Programmé pour le <strong>{scheduledAt ? new Date(scheduledAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" }) : "?"}</strong></span>
          <button type="button" onClick={handleCancelSchedule} disabled={savingSchedule} className="ml-auto text-primary hover:underline">Annuler</button>
        </div>
      )}
      {canSchedule && publishStatus === "published" && (
        <p className="text-2xs text-success">✅ Publié automatiquement{scheduledAt ? ` (le ${new Date(scheduledAt).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })})` : ""}.</p>
      )}
      {canSchedule && publishStatus === "publishing" && (
        <p className="text-2xs text-muted-foreground">⏳ Publication en cours…</p>
      )}
      {canSchedule && publishStatus === "failed" && (
        <p className="text-2xs text-destructive">❌ Échec de la dernière tentative{publishError ? ` : ${publishError}` : ""}.</p>
      )}

      {/* Panneau de programmation, ouvert depuis le menu « Publier » */}
      {schedulerOpen && canSchedule && (
        <div className="rounded-[10px] border border-border bg-card/40 p-3 space-y-2">
          <p className="text-xs font-semibold text-foreground">🗓️ Programmer la publication {postCanal === "linkedin" ? "LinkedIn" : "Instagram"}</p>
          <p className="text-2xs text-muted-foreground">{postCanal === "linkedin" ? "Choisis quand publier ce post texte : il partira automatiquement." : `Choisis quand publier ce post (${igValidImages.length > 1 ? `carrousel de ${igValidImages.length} images` : "1 image"}) — il partira automatiquement.`}</p>
          {!connectionsKnown && (
            <div className="text-2xs text-muted-foreground">
              {connectionsLoading ? "Vérification de la connexion…" : "Impossible de vérifier la connexion pour le moment."}
              <button type="button" disabled={connectionsLoading} onClick={() => void refreshConnections()} className="ml-2 underline">Réessayer</button>
            </div>
          )}
          {scheduleNeedsConnection && (
            <div className="rounded-[8px] border border-amber-300/60 bg-amber-50/60 px-2.5 py-2 text-2xs text-amber-900 flex items-center justify-between gap-2 flex-wrap dark:border-amber-400/30 dark:bg-amber-950/30 dark:text-amber-200">
              <span>⚠️ Connecte ton compte {postCanal === "linkedin" ? "LinkedIn" : "Instagram"} pour que la publication parte automatiquement.</span>
              <button type="button" onClick={() => versConnexions(navigate)} className="font-medium underline shrink-0">Connecter</button>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input type="datetime-local" value={scheduleInput} onChange={(e) => setScheduleInput(e.target.value)} className="rounded-[8px] border border-border bg-background px-2 py-1.5 text-xs text-foreground" />
            <Button type="button" size="sm" onClick={handleSchedulePublish} disabled={savingSchedule} className="rounded-pill text-xs bg-primary text-primary-foreground hover:bg-primary/90">{savingSchedule ? "…" : "Programmer"}</Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSchedulerOpen(false)} className="rounded-pill text-xs">Fermer</Button>
          </div>
          {scheduleAfterTokenExpiry && (
            <p className="text-2xs text-amber-900 dark:text-amber-200">
              ⚠️ Ta connexion {postCanal === "linkedin" ? "LinkedIn" : "Instagram"} expire le {new Date(scheduleTokenExpiry!).toLocaleDateString("fr-FR")}, avant cette date. Reconnecte ton compte d'ici là, sinon la publication échouera.
            </p>
          )}
          {(postCanal === "instagram" ? !igVideo && igValidImages.length === 0 : !linkedInText) && (
            <p className="text-2xs text-muted-foreground">{postCanal === "linkedin" ? "Rédige le texte du post pour pouvoir programmer." : "Ajoute une image ou monte ta vidéo pour pouvoir programmer."}</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        {/* Indicateur d'auto-save (remplace le bouton Enregistrer) */}
        <span className={cn("text-2xs flex items-center gap-1 min-w-0", autoSaveState === "error" ? "text-destructive" : "text-muted-foreground")}>
          {autoSaveState === "saving" ? (<><Loader2 className="h-3 w-3 animate-spin shrink-0" /> Enregistrement…</>)
            : autoSaveState === "saved" ? (<><Check className="h-3 w-3 text-success shrink-0" /> Enregistré</>)
            : autoSaveState === "error" ? (
              <>
                ⚠️ Non enregistré
                <button type="button" onClick={() => { void runAutoSave(); }} className="underline font-medium ml-1">
                  Réessayer
                </button>
              </>
            )
            : theme.trim() ? "Enregistrement automatique" : "Ajoute un sujet pour commencer"}
        </span>

        {/* Supprimer : visible directement, plus enterré dans le menu « Options »
            (qui est même désactivé tant qu'il n'y a pas de sujet). */}
        {effectiveId && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto rounded-pill text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
            onClick={async () => {
              if (await confirm({ title: "Supprimer ce post du calendrier ?", description: "Cette action est irréversible.", confirmText: "Supprimer", destructive: true })) onDelete(effectiveId);
            }}
          >
            <Trash2 className="h-4 w-4" /> Supprimer
          </Button>
        )}

        {/* Un seul bouton d'action principal */}
        <div className={effectiveId ? "" : "ml-auto"}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button disabled={!theme.trim()} className="rounded-pill bg-primary text-primary-foreground hover:bg-primary/90">
                {(publishingInstagram || publishingLinkedIn) && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                {canPublishActions ? "Publier" : "Options"}
                <ChevronDown className="h-4 w-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              {canPublishActions && (
                <DropdownMenuItem onClick={handlePublishNow} disabled={publishNowDisabled}>
                  <Send className="h-4 w-4 mr-2" /> Publier maintenant
                </DropdownMenuItem>
              )}
              {canPublishActions && (
                <DropdownMenuItem onClick={() => setSchedulerOpen(true)}>
                  <CalendarClock className="h-4 w-4 mr-2" /> {publishStatus === "scheduled" ? "Modifier la programmation" : "Programmer la publication"}
                </DropdownMenuItem>
              )}
              {canPublishActions && editingPost && onUnplan && <DropdownMenuSeparator />}
              {editingPost && onUnplan && (
                <DropdownMenuItem onClick={async () => { if (await confirm({ title: "Remettre ce post dans tes idées ?", description: "Il sera retiré du calendrier et rangé dans ta boîte à idées.", confirmText: "Remettre dans mes idées" })) onUnplan(); }}>
                  <Lightbulb className="h-4 w-4 mr-2" /> Remettre dans mes idées
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
