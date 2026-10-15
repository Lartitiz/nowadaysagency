// Fil de conversation du Studio : messages, boutons proposés par le chat
// (mémoire, affiche, outils), carte de la demande à confirmer, relance après
// une image prête (mannequin), état des créations (en cours, échec, incertain).
// Fiche 4 de docs/robustesse/gros-fichiers.md, lot 5 : JSX déplacé à
// l'identique depuis src/pages/VisualStudioPage.tsx. La carte de la demande et
// le tiroir d'outils restent construits par la page (`proposalCard`,
// `children`) ; ouvrir l'éditeur d'affiche ou un outil aussi (`onEditComposition`,
// `onOpenExistingTool`).
import type { MutableRefObject, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { StudioMessage, StudioProposal, StudioReference, StudioState } from "@/features/visual-studio/api";
import { cleanStudioSummary } from "@/features/visual-studio/summary";

export function StudioMessageList({
  current,
  proposal,
  references,
  writable,
  busy,
  generating,
  mutate,
  readyFollowUp,
  identitySheet,
  productName,
  editDraft,
  setAutoSend,
  openCastingRef,
  onEditComposition,
  onOpenExistingTool,
  proposalCard,
  children,
}: {
  current: StudioState | undefined;
  proposal: StudioProposal | null | undefined;
  references: StudioReference[];
  writable: boolean;
  busy: string;
  generating: boolean | undefined;
  mutate: (action: string, extra?: Record<string, unknown>) => Promise<unknown>;
  readyFollowUp: string | null;
  identitySheet: boolean;
  productName: string;
  editDraft: (value: string) => void;
  setAutoSend: (value: string | null) => void;
  openCastingRef: MutableRefObject<(() => void) | null>;
  onEditComposition: (message: StudioMessage) => void;
  onOpenExistingTool: (message: StudioMessage) => void;
  proposalCard: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      {!current && (
        <div className="studio-message">
          <p>
            Quel visuel t’aiderait aujourd’hui ? Décris ton idée, pose
            une question ou choisis une photo. Je m’appuie sur
            l’identité de ta marque pour t’aider à préciser le
            résultat.
          </p>
        </div>
      )}
      {current?.session.messages.map((m, i) => proposal &&
        i === current.session.messages.length - 1 &&
        m.role === "assistant" && m.text === proposal.summary ? null : (
        <div
          key={m.id || i}
          className={m.role === "user"
            ? "studio-message mine"
            : "studio-message"}
        >
          <span className="block text-xs font-semibold mb-1">
            {m.role === "user" ? "Toi" : "Studio"}
          </span>
          {!!m.reference_ids?.length && <div className="studio-attached-images" aria-label="Images jointes à ce message">
            {m.reference_ids.map((id, index) => {
              const ref = m.reference_snapshot?.find((item) => item.id === id) || references.find((item) => item.id === id);
              return <div key={`${id}:${index}`} className="studio-attached-image">
                {ref?.url && <img src={ref.url} alt="" />}
                <span>Image {index + 1}{ref ? ` · ${ref.name}` : " · référence conservée"}</span>
              </div>;
            })}
          </div>}
          <p className="whitespace-pre-wrap">{m.role === "assistant" ? cleanStudioSummary(m.text) : m.text}</p>
          {!!m.suggestions?.length && m.role === "assistant" && <ul className="list-disc pl-5 mt-2 text-sm">{m.suggestions.map((suggestion, index) => <li key={index}>{suggestion}</li>)}</ul>}
          {m.suggested_memory_ids?.map((id) => {
            const item = current.memory?.find((entry) => entry.id === id);
            return item ? <Button key={id} variant="outline" className="my-2 max-w-full h-auto whitespace-normal break-words py-2" disabled={!writable || !!busy || !!generating || references.some((r) => r.memory_id === id)} onClick={() => void mutate("memory_apply", {memory_id:id,revision:current.session.revision})}>{item.kind === "casting" ? "Utiliser ce mannequin" : "Utiliser cette direction"} · {item.name}</Button> : null;
          })}
          {m.operation === "compose" && (
            <Button
              variant="link"
              disabled={!writable}
              onClick={() => onEditComposition(m)}
            >
              Corriger les textes de cette affiche
            </Button>
          )}
          {m.operation === "existing_tool" && (
            <Button
              variant="link"
              className="px-0"
              onClick={() => onOpenExistingTool(m)}
            >
              {m.existing_tool === "preparation" ? "Préparer cette photo sans la redessiner" : m.existing_tool === "before_after" ? "Créer l’avant/après" : "Créer le mockup"}
            </Button>
          )}
        </div>
      ))}
      {proposal && <div className="studio-chat-confirmation">{proposalCard}</div>}
      {!proposal && readyFollowUp && (
        <div className="studio-message">
          <span className="block text-xs font-semibold mb-1">Studio</span>
          <p>{readyFollowUp}</p>
          {identitySheet && (
            <div className="flex flex-wrap gap-2 mt-2">
              <Button type="button" variant="outline" className="h-auto whitespace-normal py-2"
                disabled={!writable || !!busy || !!generating}
                onClick={() => {
                  const text = `Ce mannequin me convient. Prépare maintenant la scène : elle porte ${productName ? `« ${productName} »` : "mon produit"}, dans la direction artistique choisie.`;
                  editDraft(text);
                  setAutoSend(text);
                }}>
                {productName ? `Préparer la scène avec « ${productName} »` : "Préparer la scène"}
              </Button>
              <Button type="button" variant="outline" className="h-auto whitespace-normal py-2"
                disabled={!writable || !!busy || !!generating}
                onClick={() => {
                  editDraft("Modifie le mannequin : ");
                  const box = document.getElementById("studio-draft") as HTMLTextAreaElement | null;
                  box?.focus();
                }}>
                Ajuster le mannequin
              </Button>
              <Button type="button" variant="outline" className="h-auto whitespace-normal py-2"
                disabled={!writable || !!busy || !!generating}
                onClick={() => openCastingRef.current?.()}>
                Le garder pour ma marque
              </Button>
            </div>
          )}
        </div>
      )}

      <section aria-label="État de la création">
        {generating && (
          <div
            role="status"
            className="rounded-xl border bg-card p-4 my-4 text-sm"
          >
            <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
            Création en cours.
            <p className="mt-2">
              Tu peux quitter le Studio et retrouver le résultat dans
              « Mes sessions ».
            </p>
          </div>
        )}
        {current?.versions
          .filter((v) => v.status === "failed")
          .map((v) => (
            <div
              key={v.id}
              className="rounded-xl border p-4 my-4 text-sm"
            >
              <p>{v.proposal.series_size ? `Image ${(v.proposal.series_index || 0) + 1} de la série · ` : ""}{v.error_message}</p>
              <Button
                variant="link"
                disabled={!writable || !!busy || !!generating}
                onClick={() => {
                  void mutate("retry", {
                    version_id: v.id,
                    revision: current!.session.revision,
                  });
                }}
              >
                Réessayer cette image seulement
              </Button>
            </div>
          ))}
        {current?.versions
          .filter((v) => v.status === "uncertain")
          .map((v) => (
            <div key={v.id} role="status" className="rounded-xl border p-4 my-4 text-sm">
              <p>{v.proposal.series_size ? `Image ${(v.proposal.series_index || 0) + 1} de la série · ` : ""}{v.error_message}</p>
              <p className="mt-2">Tu peux poursuivre une autre demande dans cette session. Cette image ne peut pas être relancée automatiquement.</p>
            </div>
          ))}
        {children}
      </section>
    </>
  );
}
