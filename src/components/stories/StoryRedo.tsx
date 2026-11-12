// « Refaire cette story · 1 crédit » (chantier 4, 12/11/2026), sur le modèle de
// « Refaire cette slide » : un champ libre facultatif, puis « Ta version » /
// « Nouvelle version » côte à côte. On peut fermer pendant l'attente : la
// proposition rouvre la fenêtre. Seul le texte de la story change.
import { useEffect, useRef, useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import { buildStoryRedoPrompt, cleanStoryRedo, STORY_REDO_EXAMPLES } from "@/lib/story-redo";

type RedoState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "result"; before: string; next: string };

/**
 * L'espace de travail n'est lu qu'à la première ouverture : StoryResult reste
 * affichable sans fournisseur d'authentification (tests, aperçus).
 */
function WorkspaceIdReader({ target }: { target: { current: string } }) {
  target.current = useWorkspaceId();
  return null;
}

const FAILED = "La nouvelle version n'est pas arrivée. Rien n'a été débité : réessaie.";

export default function StoryRedo({ number, total, role, text, previous, next, listNote, onKeep }: {
  number: number;
  total: number;
  role?: string | null;
  text: string;
  previous?: string | null;
  next?: string | null;
  /** Gabarit liste : les éléments affichés ne viennent pas du texte. */
  listNote?: boolean;
  onKeep: (text: string) => void;
}) {
  const workspaceId = useRef("");
  const [opened, setOpened] = useState(false);
  const [open, setOpenState] = useState(false);
  const setOpen = (v: boolean) => {
    if (v) setOpened(true);
    setOpenState(v);
  };
  const [instruction, setInstruction] = useState("");
  const [state, setState] = useState<RedoState>({ status: "idle" });
  const [example, setExample] = useState(0);
  const run = useRef(0);

  useEffect(() => {
    if (!open || instruction) return;
    const timer = setInterval(() => setExample((i) => (i + 1) % STORY_REDO_EXAMPLES.length), 2500);
    return () => clearInterval(timer);
  }, [open, instruction]);

  const empty = !text.trim();
  const pending = state.status === "loading" || state.status === "result";

  const submit = async () => {
    if (empty || state.status === "loading") return;
    const id = ++run.current;
    const before = text;
    setState({ status: "loading" });
    try {
      const { data, error } = await invokeWithTimeout("ai-text-action", {
        body: {
          selected_text: before,
          action_prompt: buildStoryRedoPrompt({ number, total, role, instruction, previous, next }),
          workspace_id: workspaceId.current,
        },
      }, 60000);
      if (id !== run.current) return;
      const proposal = cleanStoryRedo(data?.result);
      if (error || !proposal) {
        setState({ status: "error", message: error?.message || FAILED });
      } else {
        setState({ status: "result", before, next: proposal });
      }
    } catch {
      if (id !== run.current) return;
      setState({ status: "error", message: FAILED });
    }
    setOpen(true);
  };

  const close = () => {
    run.current++;
    setState({ status: "idle" });
    setInstruction("");
    setOpen(false);
  };

  const label = state.status === "result" ? "Voir la nouvelle version" : state.status === "loading" ? "Story en cours…" : "Refaire cette story";

  return (
    <>
      {opened && <WorkspaceIdReader target={workspaceId} />}
      <span title={empty && !pending ? "Écris d'abord un texte dans cette story" : undefined}>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-2xs gap-1.5 font-medium border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
          disabled={empty && !pending}
          aria-label={`${label} (story ${number})`}
          onClick={() => setOpen(true)}
        >
          {state.status === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
          {label}
        </Button>
      </span>
      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : state.status === "result" ? close() : setOpen(false))}>
        <DialogContent className="max-w-lg" data-testid="story-redo-dialog">
          {state.status === "result" ? (
            <>
              <DialogHeader>
                <DialogTitle className="font-display font-normal text-primary">Voici la nouvelle version</DialogTitle>
                <DialogDescription>Seul le texte change : le fond, la photo et le sticker restent.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <figure className="min-w-0 rounded-xl border border-border p-3">
                  <figcaption className="mb-1 text-xs font-semibold text-muted-foreground">Ta version</figcaption>
                  <p className="whitespace-pre-wrap text-sm">{state.before}</p>
                </figure>
                <figure className="min-w-0 rounded-xl border border-primary/40 bg-primary/5 p-3">
                  <figcaption className="mb-1 text-xs font-semibold text-primary">Nouvelle version</figcaption>
                  <p className="whitespace-pre-wrap text-sm" data-testid="story-redo-proposal">{state.next}</p>
                </figure>
              </div>
              {listNote && <p className="text-xs text-muted-foreground">Les éléments de la liste affichés sur l'image ne changent pas.</p>}
              <DialogFooter className="gap-2 sm:justify-start">
                <Button type="button" onClick={() => { onKeep(state.next); close(); }}>Garder la nouvelle</Button>
                <Button type="button" variant="outline" onClick={close}>Garder la mienne</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="font-display font-normal text-primary">Refaire la story {number}</DialogTitle>
                <DialogDescription>Les autres stories restent telles quelles.</DialogDescription>
              </DialogHeader>
              {state.status === "loading" ? (
                <div role="status" className="space-y-1 text-sm">
                  <p className="font-medium">L'Assistant Com' réécrit ta story…</p>
                  <p className="text-xs text-muted-foreground">Tu peux fermer cette fenêtre : la nouvelle version s'affichera ici dès qu'elle est prête.</p>
                </div>
              ) : (
                <>
                  <textarea
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    maxLength={300}
                    rows={3}
                    autoFocus
                    aria-label="Dis ce que tu veux changer sur cette story (facultatif)"
                    placeholder={`Facultatif : dis ce que tu veux changer… ex. « ${STORY_REDO_EXAMPLES[example]} »`}
                    className="w-full rounded-xl border border-primary bg-background p-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
                  />
                  {state.status === "error" && <p role="alert" className="text-sm text-error">{state.message}</p>}
                </>
              )}
              <DialogFooter className="gap-2 sm:justify-start">
                {state.status === "loading" ? (
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Fermer</Button>
                ) : (
                  <>
                    <Button type="button" onClick={submit} disabled={empty}>Refaire cette story · 1 crédit</Button>
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
