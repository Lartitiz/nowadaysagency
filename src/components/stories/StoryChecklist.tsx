// ============= Full file contents =============

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";

interface ChecklistItem {
  id: string;
  label: string;
  autoChecked: boolean;
  manual: boolean;
}

interface Props {
  hasHook?: boolean;
  hasSticker?: boolean;
  hasCTA?: boolean;
  hasFaceCam?: boolean;
}

export default function StoryChecklist({ hasHook = false, hasSticker = false, hasCTA = false, hasFaceCam = false }: Props) {
  const items: ChecklistItem[] = [
    { id: "hook", label: "Hook fort dans les 1-2 premières secondes de story 1", autoChecked: hasHook, manual: false },
    { id: "lisible", label: "Texte lisible en 3-5 secondes max par story", autoChecked: true, manual: false },
    { id: "sticker", label: "Au moins 1 sticker interactif dans la séquence", autoChecked: hasSticker, manual: false },
    { id: "cta", label: "CTA clair (même léger : \"tu en penses quoi ?\")", autoChecked: hasCTA, manual: false },
    { id: "soustitres", label: "Si face cam : sous-titres prévus", autoChecked: false, manual: true },
    { id: "univers", label: "Lien avec ton univers pro (même indirect)", autoChecked: true, manual: false },
    { id: "gif", label: "Pas de sticker/GIF décoratif inutile", autoChecked: true, manual: false },
    { id: "charte", label: "Cohérence avec ta charte graphique (couleurs, typo)", autoChecked: false, manual: true },
  ];

  const [manualChecks, setManualChecks] = useState<Record<string, boolean>>({});

  const toggleManual = (id: string) => {
    setManualChecks((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const isChecked = (item: ChecklistItem) => {
    if (item.manual) return manualChecks[item.id] || false;
    return item.autoChecked;
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <h3 className="font-display text-sm font-bold text-foreground">✅ Checklist avant de publier</h3>

      <div className="space-y-2">
        {items.map((item) => {
          // Skip face cam subtitle check if no face cam
          if (item.id === "soustitres" && !hasFaceCam) return null;
          const checked = isChecked(item);
          return (
            <label
              key={item.id}
              className="flex items-start gap-2.5 text-sm cursor-pointer"
              onClick={item.manual ? () => toggleManual(item.id) : undefined}
            >
              <Checkbox
                checked={checked}
                onCheckedChange={item.manual ? () => toggleManual(item.id) : undefined}
                disabled={!item.manual}
                className="mt-0.5"
              />
              <span className={checked ? "text-foreground" : "text-muted-foreground"}>
                {item.label}
              </span>
            </label>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground">
        💡 Les cases pré-cochées sont celles que l'IA a vérifiées. Les cases non cochées sont à vérifier manuellement.
      </p>
    </div>
  );
}