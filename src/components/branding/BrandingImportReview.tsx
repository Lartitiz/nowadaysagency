import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { readImportRows, saveImportRow, importTarget } from "@/lib/branding-import-persistence";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { BrandingExtraction } from "@/lib/branding-import-types";
import { FIELD_META } from "@/lib/branding-import-types";

interface Props {
  extraction: BrandingExtraction;
  onDone: () => void;
  onCancel: () => void;
  workspaceId?: string;
}

type FieldChoice = "keep" | "replace" | "merge";

interface FieldComparison {
  key: keyof BrandingExtraction;
  label: string;
  emoji: string;
  section: string;
  current: string | null;
  suggested: string | null;
  choice: FieldChoice;
  mergeText: string;
}

// Mapping from extraction field to DB table + column
const FIELD_DB_MAP: Record<string, { table: string; column: string }> = {
  positioning: { table: "brand_proposition", column: "version_final" },
  mission: { table: "brand_profile", column: "mission" },
  voice_description: { table: "brand_profile", column: "voice_description" },
  key_expressions: { table: "brand_profile", column: "key_expressions" },
  things_to_avoid: { table: "brand_profile", column: "things_to_avoid" },
  combat_cause: { table: "brand_profile", column: "combat_cause" },
  values: { table: "brand_proposition", column: "step_2b_values" },
  unique_proposition: { table: "brand_proposition", column: "version_final" },
  for_whom: { table: "brand_proposition", column: "step_3_for_whom" },
  target_description: { table: "brand_profile", column: "target_description" },
  target_frustrations: { table: "persona", column: "step_1_frustrations" },
  target_desires: { table: "persona", column: "step_2_transformation" },
  story: { table: "storytelling", column: "imported_text" },
  content_pillars: { table: "brand_strategy", column: "pillar_major" },
  channels: { table: "brand_profile", column: "channels" },
  offers: { table: "brand_profile", column: "offer" },
};

export default function BrandingImportReview({ extraction, onDone, onCancel, workspaceId }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const wsFilter = useWorkspaceFilter();
  // Respect an explicit workspaceId prop (client onboarding writes into a
  // specific workspace), otherwise fall back to the canonical scope helper —
  // the same one the branding read paths use — so writes land where reads look.
  const filterCol = workspaceId ? "workspace_id" : wsFilter.column;
  const filterVal = workspaceId || wsFilter.value;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [comparisons, setComparisons] = useState<FieldComparison[]>([]);

  const [loadError, setLoadError] = useState(false);
  const [rows, setRows] = useState<Record<string, Record<string, any>[]>>({});
  const [targets, setTargets] = useState<Record<string, Record<string, any> | null>>({});
  const savedIds = useRef<Record<string, string>>({});
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const scope = { column: filterCol, value: filterVal, userId: user?.id || "" };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    setComparisons([]);
    setApplied(new Set());
    savedIds.current = {};
    if (!user?.id || !filterVal) return;
    const loadScope = { column: filterCol, value: filterVal, userId: user.id };
    (async () => {
      try {
        const tables = ["brand_profile", "persona", "brand_proposition", "brand_strategy", "storytelling"];
        const results = await Promise.all(tables.map(table => readImportRows(table, loadScope)));
        if (cancelled) return;
        const loaded = Object.fromEntries(tables.map((table, i) => [table, results[i]]));
        setRows(loaded);
        setTargets(Object.fromEntries(tables.map(table => [table,
          table === "persona" || table === "storytelling"
            ? (loaded[table].find(row => row.is_primary) || loaded[table][0] || null)
            : importTarget(loaded[table]),
        ])));
      } catch (e) {
        if (cancelled) return;
        setLoadError(true);
        toast.error("Impossible de comparer les données. Aucune modification n’a été appliquée.");
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [user?.id, filterCol, filterVal, extraction]);

  useEffect(() => {
    if (loading || loadError) return;
    const brandRes = { data: targets.brand_profile };
    const personaRes = { data: targets.persona };
    const propRes = { data: targets.brand_proposition };
    const stratRes = { data: targets.brand_strategy };
    const storyRes = { data: targets.storytelling };
      const existing: Record<string, string | null> = {
        positioning: propRes.data?.version_final || propRes.data?.version_complete || propRes.data?.version_bio || propRes.data?.version_one_liner || null,
        mission: brandRes.data?.mission || null,
        voice_description: brandRes.data?.voice_description || null,
        key_expressions: brandRes.data?.key_expressions || null,
        things_to_avoid: brandRes.data?.things_to_avoid || null,
        combat_cause: brandRes.data?.combat_cause || null,
        target_description: brandRes.data?.target_description || null,
        values: propRes.data?.step_2b_values || null,
        unique_proposition: propRes.data?.version_final || propRes.data?.version_complete || propRes.data?.version_bio || propRes.data?.version_one_liner || null,
        for_whom: propRes.data?.step_3_for_whom || null,
        target_frustrations: personaRes.data?.step_1_frustrations || null,
        target_desires: personaRes.data?.step_2_transformation || null,
        story: storyRes.data?.step_7_polished || storyRes.data?.step_6_full_story || storyRes.data?.imported_text || storyRes.data?.step_1_raw || null,
        content_pillars: [stratRes.data?.pillar_major, stratRes.data?.pillar_minor_1, stratRes.data?.pillar_minor_2, stratRes.data?.pillar_minor_3].filter(Boolean).join(", ") || null,
        channels: Array.isArray(brandRes.data?.channels) ? brandRes.data.channels.join(", ") : null,
        offers: brandRes.data?.offer || null,
      };

      const comps: FieldComparison[] = [];
      for (const [key, meta] of Object.entries(FIELD_META)) {
        const suggested = extraction[key as keyof BrandingExtraction]?.value;
        if (!suggested) continue; // Only show fields where audit extracted something

        const current = existing[key] || null;
        const hasExisting = !!current?.trim();

        comps.push({
          key: key as keyof BrandingExtraction,
          label: key === "offers" ? "Description générale des offres" : key === "positioning" ? "Positionnement proposé (référence IA)" : key === "unique_proposition" ? "Proposition unique (référence IA)" : meta.label,
          emoji: meta.emoji,
          section: meta.section,
          current,
          suggested,
          choice: hasExisting || (key === "positioning" && !!extraction.unique_proposition?.value) ? "keep" : "replace",
          mergeText: current || "",
        });
      }

      setComparisons(prev => comps.map(comp => {
        const previous = prev.find(p => p.key === comp.key);
        return previous?.current === comp.current ? previous : comp;
      }));
  }, [loading, loadError, targets, extraction]);

  const updateChoice = (idx: number, choice: FieldChoice) => {
    setComparisons(prev => prev.map((c, i) => i === idx ? { ...c, choice, mergeText: choice === "merge" ? (c.current || c.suggested || "") : c.mergeText } : c));
  };

  const updateMergeText = (idx: number, text: string) => {
    setComparisons(prev => prev.map((c, i) => i === idx ? { ...c, mergeText: text } : c));
  };

  const handleSave = async () => {
    if (!user || saving || loadError || loading) return;
    setSaving(true);

    try {
      const updates: Record<string, Record<string, string>> = {};

      for (const comp of comparisons) {
        if (comp.choice === "keep" || applied.has(comp.key)) continue;

        const finalValue = comp.choice === "replace" ? comp.suggested! : comp.mergeText;
        if (!finalValue?.trim()) throw new Error("Un texte sélectionné est vide.");

        const dbMapping = FIELD_DB_MAP[comp.key];
        if (!dbMapping) continue;

        // Special handling for content_pillars (split into multiple columns)
        if (comp.key === "content_pillars") {
          const pillars = finalValue.split(/[,;\n]/).map(p => p.trim()).filter(Boolean);
          if (pillars.length > 4) throw new Error("Quatre piliers maximum : regroupe ton texte avant de valider.");
          if (!updates["brand_strategy"]) updates["brand_strategy"] = {};
          if (pillars[0]) updates["brand_strategy"]["pillar_major"] = pillars[0];
          if (pillars[1]) updates["brand_strategy"]["pillar_minor_1"] = pillars[1];
          if (pillars[2]) updates["brand_strategy"]["pillar_minor_2"] = pillars[2];
          if (pillars[3]) updates["brand_strategy"]["pillar_minor_3"] = pillars[3];
          continue;
        }

        // Special handling for channels (store as array)
        if (comp.key === "channels") {
          if (!updates["brand_profile"]) updates["brand_profile"] = {};
          // Will be converted to array later
          updates["brand_profile"]["__channels"] = finalValue;
          continue;
        }

        // Existing originals stay intact; the reviewed revision lives in step_7_polished.
        if (comp.key === "story") {
          updates.storytelling = targets.storytelling
            ? { step_7_polished: finalValue }
            : { imported_text: finalValue, source: "audit" };
          continue;
        }

        if (!updates[dbMapping.table]) updates[dbMapping.table] = {};
        const previousValue = updates[dbMapping.table][dbMapping.column];
        if (previousValue && previousValue !== finalValue) throw new Error("Deux textes différents sont sélectionnés pour la même référence IA. Garde une seule proposition ou fusionne les textes toi-même.");
        updates[dbMapping.table][dbMapping.column] = finalValue;
      }

      // Apply updates per table
      for (const [table, fields] of Object.entries(updates)) {
        const cleanFields: Record<string, any> = {};
        for (const [col, val] of Object.entries(fields)) {
          if (col === "__channels") {
            cleanFields["channels"] = val.split(/[,;\n]/).map((c: string) => c.trim()).filter(Boolean);
          } else {
            cleanFields[col] = val;
          }
        }

        const saved = await saveImportRow(table, scope, savedIds.current[table] || targets[table]?.id || null, {
          ...cleanFields,
          ...(!targets[table] && (table === "persona" || table === "storytelling") ? { is_primary: true } : {}),
        });
        // Keep the returned ID for a retry after a later table fails.
        savedIds.current[table] = saved.id;
        const savedKeys = comparisons.filter(c => FIELD_DB_MAP[c.key]?.table === table && c.choice !== "keep").map(c => c.key);
        setApplied(prev => new Set([...prev, ...savedKeys]));
      }
      for (const key of ["brand-profile", "persona", "brand-proposition", "brand-strategy", "storytelling-primary", "storytelling-list"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }

      const changedCount = comparisons.filter(c => c.choice !== "keep").length;
      toast.success(`✅ Branding mis à jour. ${changedCount} champ${changedCount > 1 ? "s" : ""} modifié${changedCount > 1 ? "s" : ""}.`);
      onDone();
    } catch (e: any) {
      console.error("Save error:", e);
      toast.error(e instanceof Error ? e.message : "L’import n’est pas terminé. Les champs déjà enregistrés sont indiqués ; réessaie pour les autres.");
    } finally {
      setSaving(false);
    }
  };

  // Group by section
  const sections: Record<string, FieldComparison[]> = {};
  for (const comp of comparisons) {
    if (!sections[comp.section]) sections[comp.section] = [];
    sections[comp.section].push(comp);
  }

  const kept = comparisons.filter(c => c.choice === "keep");
  const replaced = comparisons.filter(c => c.choice === "replace");
  const merged = comparisons.filter(c => c.choice === "merge");
  const changedCount = replaced.length + merged.length;

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">Comparaison avec tes données actuelles…</p>
      </div>
    );
  }

  if (loadError) return <div role="alert" className="space-y-3">
    <p>Les données existantes n’ont pas pu être chargées. Reviens à l’import pour réessayer.</p>
    <Button onClick={onCancel}>Retour</Button>
  </div>;

  if (comparisons.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-4">
        <p className="text-sm text-muted-foreground">L'analyse n'a rien extrait de nouveau. Ton branding est peut-être déjà complet !</p>
        <Button variant="outline" onClick={onCancel}>Retour</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="font-display text-xl font-bold text-foreground mb-1">
          📋 Pré-remplir ton branding
        </h2>
        <p className="text-sm text-muted-foreground">
          L'audit a extrait des infos. Pour chaque champ, choisis ce que tu veux garder.
        </p>
      </div>

      <p className="text-xs text-muted-foreground">Le positionnement et la proposition unique sont deux suggestions pour la même référence IA : choisis celle que tu veux utiliser. La description générale des offres est un texte séparé ; cet import ne modifie aucune fiche d’offre individuelle. Une histoire existante reçoit une version retravaillée ; son texte d’origine est conservé.</p>
      {["persona", "storytelling"].map(table => (rows[table]?.length || 0) > 0 && <label key={table} className="block text-sm">
        {table === "persona" ? "Public concerné" : "Histoire concernée"}
        <select aria-label={table === "persona" ? "Public concerné" : "Histoire concernée"}
          disabled={saving || applied.size > 0} value={targets[table]?.id || ""}
          onChange={e => setTargets(prev => ({ ...prev, [table]: rows[table].find(row => row.id === e.target.value) || null }))}
          className="block w-full rounded border border-border bg-background p-2">
          {rows[table].map((row, i) => <option key={row.id} value={row.id}>{row.label || row.portrait_prenom || row.title || `Fiche ${i + 1}`}{row.is_primary ? " (principale)" : ""}</option>)}
        </select>
      </label>)}

      {/* Field comparisons by section */}
      {Object.entries(sections).map(([sectionName, fields]) => (
        <div key={sectionName} className="space-y-4">
          <h3 className="font-body font-bold text-foreground text-sm flex items-center gap-2 border-b border-border pb-2">
            <span>{fields[0].emoji}</span> {sectionName}
          </h3>

          {fields.map((comp) => {
            const idx = comparisons.indexOf(comp);
            return (
              <div key={comp.key} className="rounded-xl border border-border bg-card p-4 space-y-3">
                <p className="text-sm font-semibold text-foreground">{comp.label}</p>

                {/* Side by side or stacked comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Current */}
                  <div className="rounded-lg border border-border bg-background p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Ce que tu as actuellement :</p>
                    {comp.current?.trim() ? (
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{comp.current}</p>
                    ) : (
                      <p className="text-sm text-muted-foreground/60 italic"> : Vide : </p>
                    )}
                  </div>

                  {/* Suggested */}
                  <div className="rounded-lg border border-primary/20 bg-[hsl(var(--rose-pale))] p-3">
                    <p className="text-xs font-medium text-muted-foreground mb-1.5">Ce que l'audit propose :</p>
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{comp.suggested}</p>
                  </div>
                </div>

                {applied.has(comp.key) && <p className="text-xs text-success">Enregistré</p>}
                {/* Choice radio */}
                <RadioGroup
                  disabled={saving || applied.has(comp.key)}
                  value={comp.choice}
                  onValueChange={(v) => updateChoice(idx, v as FieldChoice)}
                  className="space-y-2"
                >
                  <div className={`flex items-center gap-2.5 rounded-lg border p-2.5 transition-colors ${comp.choice === "keep" ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                    <RadioGroupItem value="keep" id={`${comp.key}-keep`} />
                    <Label htmlFor={`${comp.key}-keep`} className="text-sm cursor-pointer flex-1">
                      Garder mon texte actuel
                    </Label>
                  </div>

                  <div className={`flex items-center gap-2.5 rounded-lg border p-2.5 transition-colors ${comp.choice === "replace" ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                    <RadioGroupItem value="replace" id={`${comp.key}-replace`} />
                    <Label htmlFor={`${comp.key}-replace`} className="text-sm cursor-pointer flex-1">
                      Remplacer par la suggestion
                    </Label>
                  </div>

                  <div className={`rounded-lg border p-2.5 transition-colors ${comp.choice === "merge" ? "border-primary/40 bg-primary/5" : "border-border"}`}>
                    <div className="flex items-center gap-2.5">
                      <RadioGroupItem value="merge" id={`${comp.key}-merge`} />
                      <Label htmlFor={`${comp.key}-merge`} className="text-sm cursor-pointer flex-1">
                        Fusionner (je modifie moi-même)
                      </Label>
                    </div>
                    {comp.choice === "merge" && (
                      <div className="mt-2.5">
                        <Textarea
                          disabled={saving || applied.has(comp.key)}
                          value={comp.mergeText}
                          onChange={(e) => updateMergeText(idx, e.target.value)}
                          className="min-h-[80px] text-sm bg-accent/40 border-accent"
                          placeholder="Modifie le texte en t'inspirant de la suggestion…"
                        />
                      </div>
                    )}
                  </div>
                </RadioGroup>
              </div>
            );
          })}
        </div>
      ))}

      {/* Summary */}
      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2">
        <p className="text-sm font-semibold text-foreground">Résumé</p>
        {kept.length > 0 && (
          <p className="text-xs text-muted-foreground">
            ✅ Garder : {kept.map(c => c.label).join(", ")}
          </p>
        )}
        {replaced.length > 0 && (
          <p className="text-xs text-muted-foreground">
            🔄 Remplacer : {replaced.map(c => c.label).join(", ")}
          </p>
        )}
        {merged.length > 0 && (
          <p className="text-xs text-muted-foreground">
            ✏️ Fusionner : {merged.map(c => c.label).join(", ")}
          </p>
        )}
        {changedCount === 0 && (
          <p className="text-xs text-muted-foreground italic">Aucune modification sélectionnée.</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <Button onClick={handleSave} disabled={saving || changedCount === 0} className="flex-1 gap-2" size="lg">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Appliquer mes choix ({changedCount} modification{changedCount > 1 ? "s" : ""})
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={saving} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Annuler
        </Button>
      </div>
    </div>
  );
}
