import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Check, Pencil, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { BrandingExtraction, ExtractedField } from "@/lib/branding-import-types";
import { FIELD_META } from "@/lib/branding-import-types";

interface Props {
  extraction: BrandingExtraction;
  onDone: () => void;
  onCancel: () => void;
}

function ConfidenceDots({ level }: { level: string }) {
  const filled = level === 'high' ? 3 : level === 'medium' ? 2 : 1;
  return (
    <div className="flex items-center gap-0.5" title={`Confiance : ${level}`}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={`w-2 h-2 rounded-full ${
            i <= filled ? 'bg-primary' : 'bg-muted-foreground/20'
          }`}
        />
      ))}
    </div>
  );
}

export default function BrandingImportReview({ extraction, onDone, onCancel }: Props) {
  const { user } = useAuth();
  const [fields, setFields] = useState<BrandingExtraction>({ ...extraction });
  const [saving, setSaving] = useState(false);

  const updateField = (key: keyof BrandingExtraction, value: string) => {
    setFields((prev) => ({
      ...prev,
      [key]: { ...prev[key], value: value || null },
    }));
  };

  // Group fields by section
  const sections = Object.entries(FIELD_META).reduce<
    Record<string, { key: keyof BrandingExtraction; meta: typeof FIELD_META[keyof typeof FIELD_META]; field: ExtractedField }[]>
  >((acc, [key, meta]) => {
    const f = fields[key as keyof BrandingExtraction];
    if (!acc[meta.section]) acc[meta.section] = [];
    acc[meta.section].push({ key: key as keyof BrandingExtraction, meta, field: f });
    return acc;
  }, {});

  const filledFields = Object.values(fields).filter((f) => f.value).length;
  const notFoundFields = Object.entries(FIELD_META).filter(
    ([key]) => !fields[key as keyof BrandingExtraction].value
  );

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);

    try {
      const uid = user.id;

      // Helper: only update if existing field is empty
      const mergeIfEmpty = (existing: any, newVal: string | null) =>
        existing ? existing : newVal;

      // 1. brand_profile
      const { data: existingBrand } = await supabase
        .from("brand_profile")
        .select("*")
        .eq("user_id", uid)
        .maybeSingle();

      const brandUpdate: Record<string, any> = {};
      if (fields.mission.value) brandUpdate.mission = mergeIfEmpty(existingBrand?.mission, fields.mission.value);
      if (fields.voice_description.value) brandUpdate.voice_description = mergeIfEmpty(existingBrand?.voice_description, fields.voice_description.value);
      if (fields.key_expressions.value) brandUpdate.key_expressions = mergeIfEmpty(existingBrand?.key_expressions, fields.key_expressions.value);
      if (fields.things_to_avoid.value) brandUpdate.things_to_avoid = mergeIfEmpty(existingBrand?.things_to_avoid, fields.things_to_avoid.value);
      if (fields.combat_cause.value) brandUpdate.combat_cause = mergeIfEmpty(existingBrand?.combat_cause, fields.combat_cause.value);
      if (fields.positioning.value) brandUpdate.offer = mergeIfEmpty(existingBrand?.offer, fields.positioning.value);

      if (Object.keys(brandUpdate).length > 0) {
        if (existingBrand) {
          await supabase.from("brand_profile").update(brandUpdate).eq("user_id", uid);
        } else {
          await supabase.from("brand_profile").insert({ user_id: uid, ...brandUpdate });
        }
      }

      // 2. persona
      const { data: existingPersona } = await supabase
        .from("persona")
        .select("*")
        .eq("user_id", uid)
        .maybeSingle();

      const personaUpdate: Record<string, any> = {};
      if (fields.target_frustrations.value) personaUpdate.step_1_frustrations = mergeIfEmpty(existingPersona?.step_1_frustrations, fields.target_frustrations.value);
      if (fields.target_desires.value) personaUpdate.step_2_transformation = mergeIfEmpty(existingPersona?.step_2_transformation, fields.target_desires.value);

      if (Object.keys(personaUpdate).length > 0) {
        if (existingPersona) {
          await supabase.from("persona").update(personaUpdate).eq("user_id", uid);
        } else {
          await supabase.from("persona").insert({ user_id: uid, ...personaUpdate });
        }
      }

      // 3. brand_proposition
      const { data: existingProp } = await supabase
        .from("brand_proposition")
        .select("*")
        .eq("user_id", uid)
        .maybeSingle();

      const propUpdate: Record<string, any> = {};
      if (fields.positioning.value) propUpdate.step_1_what = mergeIfEmpty(existingProp?.step_1_what, fields.positioning.value);
      if (fields.values.value) propUpdate.step_2b_values = mergeIfEmpty(existingProp?.step_2b_values, fields.values.value);
      if (fields.for_whom.value) propUpdate.step_3_for_whom = mergeIfEmpty(existingProp?.step_3_for_whom, fields.for_whom.value);
      if (fields.unique_proposition.value) propUpdate.version_final = mergeIfEmpty(existingProp?.version_final, fields.unique_proposition.value);

      if (Object.keys(propUpdate).length > 0) {
        if (existingProp) {
          await supabase.from("brand_proposition").update(propUpdate).eq("user_id", uid);
        } else {
          await supabase.from("brand_proposition").insert({ user_id: uid, ...propUpdate });
        }
      }

      // 4. brand_strategy (content pillars)
      if (fields.content_pillars.value) {
        const { data: existingStrat } = await supabase
          .from("brand_strategy")
          .select("*")
          .eq("user_id", uid)
          .maybeSingle();

        const pillars = fields.content_pillars.value.split(/[,;\n]/).map((p) => p.trim()).filter(Boolean);
        const stratUpdate: Record<string, any> = {};
        if (pillars[0]) stratUpdate.pillar_major = mergeIfEmpty(existingStrat?.pillar_major, pillars[0]);
        if (pillars[1]) stratUpdate.pillar_minor_1 = mergeIfEmpty(existingStrat?.pillar_minor_1, pillars[1]);
        if (pillars[2]) stratUpdate.pillar_minor_2 = mergeIfEmpty(existingStrat?.pillar_minor_2, pillars[2]);
        if (pillars[3]) stratUpdate.pillar_minor_3 = mergeIfEmpty(existingStrat?.pillar_minor_3, pillars[3]);

        if (Object.keys(stratUpdate).length > 0) {
          if (existingStrat) {
            await supabase.from("brand_strategy").update(stratUpdate).eq("user_id", uid);
          } else {
            await supabase.from("brand_strategy").insert({ user_id: uid, ...stratUpdate });
          }
        }
      }

      // 5. storytelling (only if none exists)
      if (fields.story.value) {
        const { data: existingStories } = await supabase
          .from("storytelling")
          .select("id")
          .eq("user_id", uid);

        if (!existingStories || existingStories.length === 0) {
          await supabase.from("storytelling").insert({
            user_id: uid,
            imported_text: fields.story.value,
            is_primary: true,
            completed: false,
          });
        }
      }

      toast.success("Branding pré-rempli avec succès ! Tu peux ajuster chaque section.");
      onDone();
    } catch (e: any) {
      console.error("Save error:", e);
      toast.error("Erreur lors de la sauvegarde. Réessaie.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-bold text-foreground mb-1">
          ✨ Voilà ce qu'on a trouvé dans ton document
        </h2>
        <p className="text-sm text-muted-foreground">
          Vérifie et ajuste avant de valider. {filledFields} champ{filledFields > 1 ? 's' : ''} extrait{filledFields > 1 ? 's' : ''}.
        </p>
      </div>

      {/* Extracted fields by section */}
      {Object.entries(sections).map(([sectionName, sectionFields]) => {
        const hasAnyValue = sectionFields.some((sf) => sf.field.value);
        if (!hasAnyValue) return null;

        return (
          <div key={sectionName} className="space-y-3">
            <h3 className="font-display font-bold text-foreground text-sm flex items-center gap-2">
              <span>{sectionFields[0].meta.emoji}</span> {sectionName}
            </h3>
            {sectionFields
              .filter((sf) => sf.field.value)
              .map((sf) => (
                <div key={sf.key} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-foreground">{sf.meta.label}</span>
                    <ConfidenceDots level={sf.field.confidence} />
                  </div>
                  <Textarea
                    value={sf.field.value || ""}
                    onChange={(e) => updateField(sf.key, e.target.value)}
                    className="min-h-[60px] text-sm"
                  />
                </div>
              ))}
          </div>
        );
      })}

      {/* Not found fields */}
      {notFoundFields.length > 0 && (
        <div className="rounded-xl bg-muted/40 border border-border p-4">
          <p className="text-sm font-medium text-muted-foreground mb-2">❌ Non trouvé :</p>
          <ul className="space-y-1">
            {notFoundFields.map(([key, meta]) => (
              <li key={key} className="text-xs text-muted-foreground">
                · {meta.label}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground/70 mt-2 italic">
            Tu pourras les remplir après dans le module Branding.
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <Button onClick={handleSave} disabled={saving || filledFields === 0} className="flex-1 gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Valider et remplir mon branding
        </Button>
        <Button variant="outline" onClick={onCancel} className="gap-2">
          <Pencil className="h-4 w-4" />
          Je préfère remplir manuellement
        </Button>
      </div>
    </div>
  );
}
