import type { StudioReference } from "./api";

import { referenceLabels } from "./reference-labels";

export function ReferenceCards({ references, disabled, onRole, onGroup, onSelection }: {
  references: StudioReference[];
  disabled: boolean;
  onRole: (id: string, role: StudioReference["role"]) => void;
  onGroup: (id: string, group: string) => void;
  onSelection: (ids: string[]) => void;
}) {
  if (!references.length) return null;
  return <section aria-label="Photos utilisées pour cette demande" className="space-y-2">
    <p className="text-sm font-medium">Photos utilisées pour cette demande</p>
    <div className="flex gap-3 overflow-x-auto pb-1">
      {references.map((ref, index) => <div key={ref.id} className="rounded-xl border bg-card p-2 w-44 shrink-0 space-y-2">
        <div className="flex gap-2 items-center">
          <img src={ref.url} alt={ref.name} className="h-12 w-12 rounded-md object-cover" />
          <span className="text-xs min-w-0 break-words">Image {index + 1} · {ref.name}</span>
        </div>
        <select aria-label={`Rôle de l’image ${index + 1}`} value={ref.role} disabled={disabled}
          className="w-full rounded border bg-background text-xs p-1.5"
          onChange={e => onRole(ref.id, e.target.value as StudioReference["role"])}>
          {(["auto", "person", "product", "scene", "style", "edit_source"] as const).map(role => <option key={role} value={role}>{referenceLabels[role]}</option>)}
          <optgroup label="Autres usages">{(["person_product", "subject", "casting", "composition", "logo"] as const).map(role => <option key={role} value={role}>{referenceLabels[role]}</option>)}</optgroup>
        </select>
        {ref.role_source === "conversation" && <p className="text-xs text-muted-foreground">Compris dans la conversation</p>}
        {["person", "product", "casting"].includes(ref.role) && references.some(other => other.id !== ref.id && other.role === ref.role) &&
          <select aria-label={`Même sujet pour l’image ${index + 1}`} className="w-full rounded border bg-background text-xs p-1.5"
            disabled={disabled} value={ref.subject_group || ref.id} onChange={e => onGroup(ref.id, e.target.value)}>
            <option value={ref.id}>Sujet distinct</option>
            {references.filter(other => other.id !== ref.id && other.role === ref.role && (other.subject_group || other.id) !== ref.id)
              .filter((other, i, all) => all.findIndex(r => (r.subject_group || r.id) === (other.subject_group || other.id)) === i)
              .map(other => <option key={other.id} value={other.subject_group || other.id}>Autre vue de {other.name}</option>)}
          </select>}
        <div className="flex justify-between text-xs">
          <button type="button" disabled={disabled || index === 0} aria-label={`Déplacer l’image ${index + 1} avant`}
            onClick={() => { const ids = references.map(r => r.id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; onSelection(ids); }}>←</button>
          <button type="button" disabled={disabled} aria-label={`Retirer ${ref.name} de cette demande`}
            onClick={() => onSelection(references.filter(r => r.id !== ref.id).map(r => r.id))}>Retirer</button>
        </div>
      </div>)}
    </div>
    <p className="text-xs text-muted-foreground">Tu peux aussi expliquer les rôles dans ton message. Un décor à conserver sert de base ; une inspiration guide seulement l’ambiance.</p>
  </section>;
}
