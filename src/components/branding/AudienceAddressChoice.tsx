import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useDemoContext } from "@/contexts/DemoContext";
import { parseAudienceAddress, withAudienceAddress, type AudienceAddress } from "@/lib/audience-address";

type Choice = AudienceAddress | "none";

const OPTIONS: { key: Choice; label: string }[] = [
  { key: "tu", label: "Tu" },
  { key: "vous", label: "Vous" },
  { key: "none", label: "Pas de préférence" },
];

/**
 * Réglage « Je m'adresse à mon public en : tu / vous / pas de préférence »
 * (décision de Laetitia, 04/10/2026). Écrit brand_profile.tone_register ; les
 * générateurs en font une règle ferme et la vérifient après rédaction.
 */
export default function AudienceAddressChoice({ value, recordId, onSaved }: {
  value: string | null | undefined;
  recordId?: string | null;
  onSaved: (newValue: string, oldValue: string) => void;
}) {
  const { isDemoMode } = useDemoContext();
  const [saving, setSaving] = useState<Choice | null>(null);
  const current: Choice = parseAudienceAddress(value) ?? "none";
  const raw = (value || "").trim();
  const legacy = current === "none" && raw ? raw : "";

  const choose = async (choice: Choice) => {
    if (choice === current || saving) return;
    const next = withAudienceAddress(raw, choice === "none" ? null : choice);
    if (isDemoMode) {
      onSaved(next, raw);
      return;
    }
    if (!recordId) return;
    setSaving(choice);
    const { data: rows, error } = await (supabase.from("brand_profile") as any)
      .update({ tone_register: next, updated_at: new Date().toISOString() })
      .eq("id", recordId)
      .select("id");
    setSaving(null);
    // Aucune ligne modifiée (droits, fiche supprimée) = pas enregistré.
    if (error || !rows?.length) {
      toast.error("Erreur de sauvegarde, réessaie");
      return;
    }
    onSaved(next, raw);
    toast.success("C'est noté ! Tes prochains contenus suivront ce choix.");
  };

  return (
    <div className="rounded-xl p-4 sm:p-5 bg-[#FFF4F8] border border-[#ffa7c6]/30 mb-6">
      <p id="audience-address-label" className="font-body text-sm font-bold text-foreground mb-3">
        Je m'adresse à mon public en :
      </p>
      <div role="radiogroup" aria-labelledby="audience-address-label" className="flex flex-wrap gap-2">
        {OPTIONS.map((o) => {
          const selected = current === o.key;
          return (
            <button
              key={o.key}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={!!saving || (!recordId && !isDemoMode)}
              onClick={() => choose(o.key)}
              className={`inline-flex items-center gap-1.5 text-sm font-medium px-4 py-1.5 rounded-full border transition-colors disabled:opacity-60 ${
                selected
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:border-primary/50"
              }`}
            >
              {saving === o.key && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {o.label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
        Tes contenus (carrousels, posts, légendes…) suivent ce choix. L'appli, elle, continue de te tutoyer.
        {legacy && <> Ta fiche indique aujourd'hui « {legacy} » : choisis tu ou vous pour que ce soit clair.</>}
      </p>
    </div>
  );
}
