import { useState } from "react";
import type { StudioReference } from "./api";

import { referenceLabels } from "./reference-labels";

// Écran simplifié du 13/11/2026 : chaque photo jointe n'est plus qu'une
// vignette avec une croix pour la retirer. Le rôle (décor à conserver,
// inspiration…) se comprend dans la conversation ; le réglage fin reste à un
// clic sur la vignette.
export function ReferenceCards({ references, disabled, onRole, onGroup, onSelection }: {
  references: StudioReference[];
  disabled: boolean;
  onRole: (id: string, role: StudioReference["role"]) => void;
  onGroup: (id: string, group: string) => void;
  onSelection: (ids: string[]) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (!references.length) return null;
  return <section aria-label="Photos utilisées pour cette demande" className="space-y-2">
    <div className="studio-ref-thumbs">
      {references.map((ref, index) => <div key={ref.id} className="studio-ref-thumb">
        <button type="button" className="studio-ref-thumb-img" aria-expanded={openId === ref.id}
          aria-label={`Régler l’image ${index + 1} · ${ref.name}`} title={ref.name}
          onClick={() => setOpenId(openId === ref.id ? null : ref.id)}>
          <img src={ref.url} alt="" />
        </button>
        <button type="button" className="studio-ref-thumb-remove" disabled={disabled} aria-label={`Retirer ${ref.name} de cette demande`}
          onClick={() => onSelection(references.filter(r => r.id !== ref.id).map(r => r.id))}>×</button>
      </div>)}
    </div>
    {references.map((ref, index) => <div key={ref.id}>
      {/* Réglages gardés dans la page (fermés) : seule la vignette ouverte les montre. */}
      <div className="studio-ref-settings" hidden={openId !== ref.id}>
        <p className="text-xs font-medium">Image {index + 1} · {ref.name}</p>
        <select title="Un décor à conserver sert de base ; une inspiration guide seulement l’ambiance. Tu peux aussi préciser les rôles dans le chat." aria-label={`Rôle de l’image ${index + 1}`} value={ref.role} disabled={disabled}
          className="w-full rounded border bg-background text-xs px-1 py-1"
          onChange={e => onRole(ref.id, e.target.value as StudioReference["role"])}>
          {(["auto", "person", "product", "scene", "style", "edit_source"] as const).map(role => <option key={role} value={role}>{referenceLabels[role]}</option>)}
          <optgroup label="Autres usages">{(["person_product", "subject", "casting", "composition", "logo"] as const).map(role => <option key={role} value={role}>{referenceLabels[role]}</option>)}</optgroup>
        </select>
        {ref.role_source === "conversation" && <p className="text-xs text-muted-foreground">Compris dans la conversation</p>}
        {["person", "product", "casting"].includes(ref.role) && references.some(other => other.id !== ref.id && other.role === ref.role) &&
          <select aria-label={`Même sujet pour l’image ${index + 1}`} className="w-full rounded border bg-background text-xs px-1 py-1"
            disabled={disabled} value={ref.subject_group || ref.id} onChange={e => onGroup(ref.id, e.target.value)}>
            <option value={ref.id}>Sujet distinct</option>
            {references.filter(other => other.id !== ref.id && other.role === ref.role && (other.subject_group || other.id) !== ref.id)
              .filter((other, i, all) => all.findIndex(r => (r.subject_group || r.id) === (other.subject_group || other.id)) === i)
              .map(other => <option key={other.id} value={other.subject_group || other.id}>Autre vue de {other.name}</option>)}
          </select>}
        {index > 0 && <button type="button" className="studio-link text-xs" disabled={disabled} aria-label={`Déplacer l’image ${index + 1} avant`}
          onClick={() => { const ids = references.map(r => r.id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; onSelection(ids); }}>Passer avant</button>}
      </div>
    </div>)}
  </section>;
}
