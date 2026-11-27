// Zone de saisie du Studio : glisser-déposer, barre d'outils (un seul menu
// « Plus d'outils » depuis l'écran simplifié du 13/11/2026, image sélectionnée), choix de branche, photos de référence, texte de
// la demande (Entrée pour envoyer), import, bibliothèque, bouton Envoyer ou
// Générer. Fiche 4 de docs/robustesse/gros-fichiers.md, lot 5 : JSX déplacé à
// l'identique depuis src/pages/VisualStudioPage.tsx ; chaque valeur lue dans la
// page arrive en prop sous le même nom. Les `id` `studio-draft` /
// `studio-draft-mobile` ne changent pas (un bouton du fil les cherche).
import { useEffect, useState, type MutableRefObject, type RefObject } from "react";
import { ChevronDown, ImagePlus, Library, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { StudioProposal, StudioReference, StudioState, StudioVersion } from "@/features/visual-studio/api";
import { ReferenceCards } from "@/features/visual-studio/ReferenceCards";
import type { StudioExistingTool } from "@/features/visual-studio/StudioToolDialogs";
import type { UserPhotoRow } from "@/lib/photo-storage";
import { StudioPhotoMenuItems, StudioPhotoToolDialogs, type StudioPhotoTool } from "@/features/visual-studio/StudioPhotoShortcuts";

export function StudioComposer({
  mobile,
  dropActive,
  setDropActive,
  dragDepth,
  writable,
  busy,
  generating,
  addLocalFiles,
  hasExtraTools,
  setToolsOpen,
  current,
  setExistingTool,
  updateSelection,
  selectedId,
  setSelectedId,
  setSelectedReferenceId,
  setCompare,
  version,
  openCastingRef,
  activeBranchChoice,
  send,
  branchChoice,
  attachedReferences,
  photosOpen,
  setPhotosOpen,
  mutate,
  draft,
  editDraft,
  proposal,
  error,
  proposalGenerateDisabled,
  runProposalGenerate,
  proposalGenerateLabel,
  fileInput,
  references,
  setPicker,
  sourcePhoto,
  onPrepare,
  pendingMessage = "",
}: {
  mobile: boolean;
  dropActive: boolean;
  setDropActive: (value: boolean) => void;
  dragDepth: MutableRefObject<number>;
  writable: boolean;
  busy: string;
  generating: boolean | undefined;
  addLocalFiles: (files: FileList | File[] | null) => Promise<unknown>;
  hasExtraTools: boolean;
  setToolsOpen: (open: boolean) => void;
  current: StudioState | undefined;
  setExistingTool: (tool: StudioExistingTool) => void;
  updateSelection: (ids: string[], newRequest?: boolean) => Promise<unknown>;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  setSelectedReferenceId: (id: string | null) => void;
  setCompare: (value: boolean) => void;
  version: StudioVersion | undefined;
  openCastingRef: MutableRefObject<(() => void) | null>;
  activeBranchChoice: boolean;
  send: (branchReferenceMode?: "version" | "current") => Promise<unknown>;
  branchChoice: { versionNames?: string[]; currentNames?: string[] } | null;
  attachedReferences: StudioReference[];
  photosOpen: boolean;
  setPhotosOpen: (open: boolean) => void;
  mutate: (action: string, extra?: Record<string, unknown>) => Promise<unknown>;
  draft: string;
  editDraft: (value: string) => void;
  proposal: StudioProposal | null | undefined;
  error: string;
  proposalGenerateDisabled: boolean;
  runProposalGenerate: () => Promise<unknown>;
  proposalGenerateLabel: string;
  fileInput: RefObject<HTMLInputElement>;
  references: StudioReference[];
  setPicker: (open: boolean) => void;
  /** Photo de « Mes photos » d'où vient la session (outils photo du menu). */
  sourcePhoto: UserPhotoRow | null;
  /** Ouvre « Format et lumière » (sans crédit) sur cette photo. */
  onPrepare: () => void;
  /** Message parti, réponse attendue : il est déjà dans le fil. */
  pendingMessage?: string;
}) {
  const [photoTool, setPhotoTool] = useState<StudioPhotoTool>(null);
  // Loom du 27/11/2026 : « il faudrait que ce soit refermé pour mieux voir le
  // texte ». Le bas de la colonne prenait près de la moitié de la hauteur :
  // les photos jointes se replient en une pastille (elles s'ouvrent quand on
  // en ajoute une, se referment quand le message part) et le champ vide tient
  // sur une ligne tant qu'on n'écrit pas.
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (pendingMessage) setPhotosOpen(false); }, [pendingMessage, setPhotosOpen]);
  // Le message envoyé s'affiche déjà dans le fil : le champ ne le montre pas
  // une deuxième fois pendant l'attente (il reste gardé pour réessayer).
  const echo = !!pendingMessage && draft.trim() === pendingMessage;
  const compact = !focused && !draft.trim();
  return (
    <div
      className={`studio-composer p-3 border-t space-y-2${dropActive ? " studio-drop-active" : ""}`}
      onDragEnter={(e) => {
        if (!writable || !!busy || generating) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDropActive(true);
      }}
      onDragOver={(e) => {
        if (writable && !busy && !generating) e.preventDefault();
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDropActive(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDropActive(false);
        if (!writable || !!busy || generating) return;
        const dropped = Array.from(e.dataTransfer?.files ?? []);
        const images = dropped.filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
        if (!images.length) {
          if (dropped.length) toast.error("Seules des images peuvent être ajoutées ici (JPG, PNG, HEIC…).");
          return;
        }
        if (dropped.length > images.length) toast.info(`${dropped.length - images.length} fichier${dropped.length - images.length > 1 ? "s ignorés" : " ignoré"} : seules les images peuvent être jointes.`);
        void addLocalFiles(images);
      }}
    >
      <div className="studio-toolbar">
        <div className="studio-toolbar-group">
          {(current || hasExtraTools) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="studio-toolbar-btn" disabled={!writable || !!busy}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Plus d’outils
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-w-xs">
                {current?.session.source_photo_id && (
                  <StudioPhotoMenuItems photo={sourcePhoto} disabled={!writable || !!busy || !!generating}
                    onPrepare={onPrepare} onTool={setPhotoTool} />
                )}
                {hasExtraTools && <DropdownMenuItem onClick={() => setToolsOpen(true)}>Photos proposées et compositions</DropdownMenuItem>}
                {current && <>
                  <DropdownMenuItem disabled={!writable || !!busy} onClick={() => setExistingTool("before_after")}>Avant / après</DropdownMenuItem>
                  <DropdownMenuItem disabled={!writable || !!busy} onClick={() => setExistingTool("mockup")}>Mockup d’offre</DropdownMenuItem>
                  <DropdownMenuItem disabled={!writable || !!busy || generating}
                    aria-label="Nouvelle demande sans ces références" onClick={() => void updateSelection([], true)}>Nouvelle demande</DropdownMenuItem>
                </>}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {attachedReferences.length > 0 && <button type="button" className="studio-photos-pill"
          aria-expanded={photosOpen} onClick={() => setPhotosOpen(!photosOpen)}>
          <span className="studio-photos-pill-thumbs" aria-hidden="true">
            {attachedReferences.slice(0, 3).map((ref) => <img key={ref.id} src={ref.url} alt="" />)}
          </span>
          {attachedReferences.length === 1 ? "1 photo jointe" : `${attachedReferences.length} photos jointes`}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform${photosOpen ? " rotate-180" : ""}`} aria-hidden="true" />
        </button>}
        {!!selectedId && <button type="button" className="studio-selection-pill" onClick={() => { setSelectedId(null); setSelectedReferenceId(null); setCompare(false); }}>
          <span className="studio-selection-dot" aria-hidden="true" />
          Image sélectionnée
          <span className="studio-selection-clear" aria-hidden="true">×</span>
        </button>}
      </div>
      <StudioPhotoToolDialogs photo={sourcePhoto} tool={photoTool} onClose={() => setPhotoTool(null)} />
      {version?.status === "ready" && version.proposal.person_reference && (
        <p className="text-sm text-muted-foreground">
          Ce mannequin te plaît ? Tu peux <button type="button" className="studio-link" disabled={!writable || !!busy || !!generating} onClick={() => openCastingRef.current?.()}>le garder pour ta marque</button>.
        </p>
      )}
      {activeBranchChoice && (
        <div role="status" className="rounded-lg border border-primary/30 bg-card p-3 space-y-2 text-sm">
          <p>Les références ont changé depuis cette version. Lesquelles veux-tu utiliser pour cette nouvelle demande ? Aucune image n’a été lancée.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={!!busy}
              onClick={() => void send("version")}>
              Celles de cette version{branchChoice?.versionNames?.length ? ` : ${branchChoice.versionNames.join(", ")}` : ""}
            </Button>
            <Button type="button" variant="outline" disabled={!!busy}
              onClick={() => void send("current")}>
              Mes photos actuelles{branchChoice?.currentNames?.length ? ` : ${branchChoice.currentNames.join(", ")}` : ""}
            </Button>
          </div>
        </div>
      )}
      <label
        className="sr-only"
        htmlFor={mobile ? "studio-draft-mobile" : "studio-draft"}
      >
        Ta demande
      </label>
      {attachedReferences.length > 0 && photosOpen && (
        <ReferenceCards references={attachedReferences} disabled={!writable || !!busy || !!generating}
          onSelection={ids => void updateSelection(ids)}
          onRole={(id, role) => void mutate("reference", { reference_id: id, reference_role: role, role_source: "user", revision: current!.session.revision })}
          onGroup={(id, group) => void mutate("reference", { reference_id: id, subject_group: group, revision: current!.session.revision })} />
      )}

      <Textarea
        className={`${compact ? "min-h-[44px]" : "min-h-[88px]"} max-h-36 overflow-y-auto`}
        rows={compact ? 1 : undefined}
        id={mobile ? "studio-draft-mobile" : "studio-draft"}
        value={echo ? "" : draft}
        readOnly={echo}
        maxLength={6000}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => editDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
          e.preventDefault();
          if (draft.trim()) {
            if (!writable || !!busy || generating || activeBranchChoice) return;
            void send();
          } else if (proposal && !error && !proposalGenerateDisabled) {
            void runProposalGenerate();
          }
        }}
        disabled={!writable}
        placeholder={proposal ? "Réponds pour ajuster la proposition…" : "Une idée, une question, une image à améliorer…"}
      />
      <input ref={fileInput} type="file" accept="image/*,.heic,.heif" multiple className="sr-only" aria-label="Importer plusieurs images" onChange={(event) => void addLocalFiles(event.target.files)} />
      <div className="flex items-center gap-1 flex-wrap">
        <Button variant="ghost" size="icon" className="studio-icon-btn shrink-0" title="Importer" aria-label="Ajouter des images" disabled={!writable || !!busy || generating || references.length >= 8} onClick={() => fileInput.current?.click()}>
          <ImagePlus className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="studio-icon-btn shrink-0" title="Bibliothèque" aria-label="Depuis ma bibliothèque" disabled={!writable || !!busy || generating || references.length >= 8} onClick={() => setPicker(true)}>
          <Library className="h-4 w-4" />
        </Button>
        {proposal && !draft.trim() && !error ? (
          <Button
            className="ml-auto shrink-0 rounded-full px-5 h-auto min-h-10 py-2 whitespace-normal text-left"
            disabled={proposalGenerateDisabled}
            onClick={() => void runProposalGenerate()}
          >
            {busy === "generate"
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : null}
            {proposalGenerateLabel}
          </Button>
        ) : (
          <Button
            className="ml-auto shrink-0 rounded-full px-6"
            disabled={!writable || !!busy || generating || activeBranchChoice ||
              !draft.trim()}
            onClick={() => void send()}
          >
            {busy === "message"
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : null}
            Envoyer
          </Button>
        )}
      </div>
      {references.length >= 8 && <p className="text-xs text-muted-foreground">Huit références maximum. Retire une photo pour en choisir une autre.</p>}
    </div>
  );
}
