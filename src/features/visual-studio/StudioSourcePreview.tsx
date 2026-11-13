// Studio ouvert sur une photo de « Mes photos », avant toute image créée :
// on montre la photo en grand à la place de « Tout commence par ton idée »
// (13/11/2026, suite de l'option B : « Modifier la photo » mène ici, la
// personne doit voir tout de suite sur quoi elle travaille).
import type { StudioReference } from "@/features/visual-studio/api";

export function StudioSourcePreview({
  reference,
  onImageExpired,
}: {
  reference: Pick<StudioReference, "name"> & { url?: string | null };
  onImageExpired: (url: string) => void;
}) {
  return (
    <figure className="studio-source-preview">
      {reference.url
        ? <img src={reference.url} alt={reference.name} onError={() => onImageExpired(reference.url!)} />
        : <div className="studio-source-preview-wait" role="status">Chargement de ta photo…</div>}
      <figcaption>
        <span className="font-medium text-foreground">{reference.name}</span>
        <span>Choisis une retouche rapide ou dis ce que tu veux changer : rien n’est créé avant ta confirmation.</span>
      </figcaption>
    </figure>
  );
}
