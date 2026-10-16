// Carte « demande à confirmer » du Studio : résumé, coût, presets Soul,
// détails (références, format, outil, contexte de marque), pilote de série,
// avertissements. Fiche 4 de docs/robustesse/gros-fichiers.md, lot 3 : ancienne
// fonction interne `confirmation()` de src/pages/VisualStudioPage.tsx, JSX
// déplacé à l'identique ; ce qu'elle lisait dans la page arrive en props.
import { AccessNotice } from "@/components/AccessNotice";
import { Button } from "@/components/ui/button";
import type { StudioProposal, StudioReference, StudioState } from "@/features/visual-studio/api";
import { referenceLabels } from "@/features/visual-studio/reference-labels";
import { StudioBrandContext } from "@/features/visual-studio/StudioBrandContext";
import { cleanStudioSummary } from "@/features/visual-studio/summary";

export function StudioProposalCard({
  proposal,
  current,
  references,
  selectedId,
  premiumBlocked,
  insufficientSeries,
  onRetryAccess,
  busy,
  generating,
  writable,
  draft,
  error,
  setError,
  editDraft,
  mutate,
}: {
  proposal: StudioProposal | null | undefined;
  current: StudioState | undefined;
  references: StudioReference[];
  selectedId: string | null;
  premiumBlocked: boolean;
  insufficientSeries: boolean | undefined;
  onRetryAccess: () => void;
  busy: string;
  generating: boolean | undefined;
  writable: boolean;
  draft: string;
  error: string;
  setError: (value: string) => void;
  editDraft: (value: string) => void;
  mutate: (action: string, extra?: Record<string, unknown>) => Promise<unknown>;
}) {
  return proposal
    ? (
      <section className="studio-proposal-chat" aria-label="Demande à confirmer">
        <div className="studio-message">
          <span className="block text-xs font-semibold mb-1">Studio</span>
          <p className="whitespace-pre-wrap">{cleanStudioSummary(proposal.summary)}</p>
        </div>
        <p className="studio-proposal-hint">
          {proposal.scene_workflow?.phase === "scene" && proposal.operation === "create"
            ? `Cette scène compte 1 image${proposal.soul_style?.name ? ` · rendu ${proposal.soul_style.name}` : ""}. `
            : `Cette demande compte ${proposal.cost} image${proposal.cost > 1 ? "s" : ""}, décomptée${proposal.cost > 1 ? "s" : ""} si la génération aboutit. `}
          Pour changer quelque chose, réponds-moi simplement ci-dessous.
        </p>
        <AccessNotice quota={current?.quota} premiumBlocked={premiumBlocked}
          insufficient={insufficientSeries} onRetry={onRetryAccess} />
        <details className="studio-proposal-details">
          <summary>Voir les détails de la demande</summary>
        <div className="space-y-4 pt-3">
        <h2 className="font-display text-base">
          {proposal.scene_workflow?.phase === "scene" ? "La scène à valider" : {
            background: "Un nouveau fond",
            create: "Une nouvelle image",
            edit: "Une image ajustée",
            product: "Ton produit en situation",
          }[proposal.operation]}
        </h2>
        <div className="text-sm">
          {proposal.photo_treatment === "natural" && <p className="text-sm text-muted-foreground">Rendu photographique naturel, selon la direction de ta marque.</p>}
          {proposal.provider === "higgsfield" && proposal.model?.startsWith("marketing-studio/") && <p className="text-xs text-muted-foreground mt-1">Réalisée avec l'outil photo du Studio.</p>}
          {proposal.scene_workflow?.phase === "scene" && proposal.operation === "create" && <div className="text-sm mt-3 space-y-2" aria-label="Style de rendu proposé">
            <p><strong>Style de rendu :</strong> {proposal.soul_style?.name || "Sans style imposé, direction propre à cette photo"}</p>
            {proposal.soul_style?.description_fr && <p>{proposal.soul_style.description_fr}</p>}
            {!!proposal.soul_style_options?.length && <details><summary className="cursor-pointer">Voir les autres rendus</summary>
              <p className="text-xs my-2">Exemples d'effets : leur effet sera adapté à ta scène. Le choix sera reformulé avant de générer.</p>
              <div className="grid grid-cols-2 gap-2">
                {proposal.soul_style_options.map(style => <button type="button" key={style.id} disabled={!!busy || !!generating || !writable} className="border rounded-lg p-2 text-left text-sm" onClick={() => editDraft(`Pour cette même scène, utilise le preset Soul « ${style.name} ». Adapte la consigne à ce rendu en conservant les sujets, leurs références et les décisions déjà prises.`)}>
                  {style.preview_url && <img src={style.preview_url} alt={`Exemple du style ${style.name}`} loading="lazy" className="aspect-square w-full object-cover rounded mb-1" />}
                  <strong>{style.name}</strong>
                  {style.description_fr && <p className="text-xs mt-1">{style.description_fr}</p>}
                </button>)}
              </div>
              <Button type="button" variant="link" disabled={!!busy || !!generating || !writable} onClick={() => editDraft("Pour cette même scène, choisis sans preset Soul. Garde les sujets, leurs références et la direction de ma marque, sans imposer une ambiance générique.")}>Choisir sans style imposé</Button>
            </details>}
          </div>}
          {!!proposal.product_placement && <p className="mt-2"><strong>Position du produit :</strong> {proposal.product_placement}</p>}
        </div>
        {proposal.scene_workflow && <div className="text-sm space-y-2">
          <p><strong>Point de vue :</strong> {proposal.scene_workflow.camera_match}</p>
          {proposal.scene_workflow.phase === "scene" && <p>Tu pourras voir et ajuster cette scène avant d’y intégrer tes références originales. Les personnes et objets à remplacer sont provisoires. Chaque génération est décomptée séparément.</p>}
        </div>}
        {!!proposal.planning_references?.length && <div className="text-sm"><strong>Références observées pour préparer la scène :</strong><ul className="list-disc pl-5">{proposal.planning_references.map(ref => <li key={ref.id}>{ref.name}</li>)}</ul></div>}
        {proposal.person_reference && proposal.scene_workflow?.phase !== "scene" && <div className="text-sm space-y-2" aria-label="Identité de référence à confirmer">
          <p><strong>{proposal.person_reference.name} · {proposal.person_reference.mode === "sheet" ? "Planche de référence" : "Même personne dans une nouvelle scène"}</strong></p>
          <p><strong>Traits à conserver : </strong>{proposal.person_reference.stable_traits}</p>
          <p><strong>Pour cette image : </strong>{proposal.person_reference.variable_details}</p>
          {!!proposal.person_reference.views.length && <p><strong>Vues : </strong>{proposal.person_reference.views.join(" · ")}</p>}
        </div>}
        {!!proposal.exact_text?.length && <div className="text-sm">
          <strong>Texte à afficher dans l’image :</strong>
          <ul className="list-disc pl-5 mt-1">{proposal.exact_text.map((item, index) => <li key={`${item}:${index}`}>« {item} »</li>)}</ul>
        </div>}
        {!!proposal.reference_snapshot?.length && <div className="text-sm">
          <strong>Images utilisées :</strong>
          <ol className="list-decimal pl-5 mt-1">{proposal.reference_snapshot.map((ref) => <li key={ref.id}>{ref.name} · {referenceLabels[ref.role]}</li>)}</ol>
        </div>}
        {proposal.composition && (
          <p className="text-sm">
            L’image de fond sera créée par l’IA. Tu ajouteras ensuite les
            textes exacts et ton logo dans l’affiche.
          </p>
        )}
        {!!proposal.shots?.length && (
          <div className="text-sm space-y-2">
            <h3 className="font-medium">Prises supplémentaires</h3>
            <ol className="list-decimal pl-5">
              {proposal.shots.map((shot) => (
                <li key={shot.id}>{shot.summary}</li>
              ))}
            </ol>
          </div>
        )}
        <dl className="text-sm space-y-3">
          <div>
            <dt className="text-muted-foreground">
              {proposal.operation === "create" ? "Image utilisée en référence" : "Photo réellement utilisée"}
            </dt>
            <dd>
              {proposal.viewed_version_id
                ? `Version ${
                  (current?.versions.filter((v) => v.status === "ready")
                    .findIndex((v) => v.id === proposal.viewed_version_id) ??
                    -1) + 1
                }`
                : proposal.viewed_reference_id
                ? references.find(
                  (r) => r.id === proposal.viewed_reference_id,
                )?.name || "Référence choisie"
                : proposal.reference_snapshot?.length
                ? `${proposal.reference_snapshot.length} référence${proposal.reference_snapshot.length > 1 ? "s" : ""} indiquée${proposal.reference_snapshot.length > 1 ? "s" : ""} ci-dessus`
                : "Création sans photo de départ"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Outil</dt>
            <dd>
              {proposal.operation === "background"
                ? "Changer le décor"
                : "Création générative"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Format</dt>
            <dd>
              {proposal.operation === "background"
                ? "Dimensions de la photo source"
                : {
                  portrait: "Portrait",
                  landscape: "Paysage",
                  square: "Carré",
                }[proposal.format || "square"]}
            </dd>
          </div>
        </dl>
        {proposal.brand_context && <details className="text-sm"><summary>Contexte de marque utilisé</summary><StudioBrandContext context={proposal.brand_context} /></details>}
        {proposal.preserve?.length
          ? (
            <p className="text-sm">
              <strong>À conserver :</strong>
              {proposal.preserve.join(" · ")}
            </p>
          )
          : null}
        {proposal.change?.length
          ? (
            <p className="text-sm">
              <strong>À changer :</strong>
              {proposal.change.join(" · ")}
            </p>
          )
          : null}
        <p className="text-sm">
          {proposal.operation === "background"
            ? "Le fond sera remplacé. Le sujet n’est pas redessiné. Vérifie le détourage avant d’utiliser l’image."
            : proposal.warning ||
              "Vérifie les détails du résultat avant de l’utiliser."}
        </p>
        {proposal.scene_workflow?.phase === "scene" && <p className="text-xs text-muted-foreground">La scène coûte 1 image. Si tu valides ensuite l’intégration de tes références, cette seconde génération coûtera 1 image supplémentaire.</p>}
        {!!proposal.shots?.length && <Button variant="outline" className="w-full h-auto whitespace-normal py-2" disabled={!writable || !!busy || !!generating} onClick={() => void mutate("pilot", { proposal_id: proposal.id, revision: current!.session.revision })}>D’abord une image pilote · 1 image</Button>}
        <p className="text-xs text-muted-foreground">
          Une image réussie compte même si tu ne la gardes pas. Un échec
          technique n’est pas décompté.
        </p>
        </div>
        </details>
        {proposal.viewed_version_id && proposal.viewed_version_id !== selectedId && (
          <p className="studio-proposal-hint text-primary">La demande vise une autre version que celle que tu regardes.</p>
        )}
        {proposal.operation === "create" && selectedId && !proposal.viewed_version_id &&
          !proposal.reference_snapshot?.some((ref) => ref.version_id === selectedId) && (
          <p className="studio-proposal-hint text-primary">L’image affichée ne sera pas envoyée pour cette création. Si tu veux en reprendre un élément, dis-le dans ta réponse.</p>
        )}
        {(!!draft.trim() || !!error) && <div className="studio-proposal-hint" role="status">
          <p>Envoie ta réponse pour actualiser la proposition avant de générer.</p>
          <Button variant="ghost" size="sm" onClick={() => { editDraft(""); setError(""); }}>Revenir à cette proposition</Button>
        </div>}
      </section>
    )
    : (
      <div className="studio-confirm space-y-3">
        <h2 className="font-display text-xl">
          Une idée, une question, une image
        </h2>
        <p className="text-sm">
          Décris ton idée. La conversation prépare ta demande ; seule ta
          confirmation lance la création.
        </p>
        <p className="text-xs text-muted-foreground">
          Fonds, créations, mises en scène et transformations comptent dans
          ton quota d'images (5 par mois en gratuit). Les textes des
          compositions restent modifiables sans crédit image.
        </p>
      </div>
    );
}
