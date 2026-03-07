import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Sparkles, Loader2, X } from "lucide-react";
import type { BrandingPrefillFromSite } from "./SiteAuditAutoResult";

interface Props {
  prefill: BrandingPrefillFromSite;
  workspaceFilter?: { column: string; value: string };
  userId?: string;
}

interface Suggestion {
  icon: string;
  label: string;
  field: string;
  value: string;
}

export default function SiteAuditBrandingSuggestions({ prefill, workspaceFilter, userId }: Props) {
  const [showDetail, setShowDetail] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const emptyFields = prefill.empty_fields || {};

  // Build suggestion list
  const suggestions: Suggestion[] = [];
  if (emptyFields.tone_style && prefill.detected_tone) suggestions.push({ icon: "💬", label: "Ton & style", field: "tone_style", value: prefill.detected_tone });
  if (emptyFields.combat_cause && prefill.detected_combat_cause) suggestions.push({ icon: "✊", label: "Ta cause", field: "combat_cause", value: prefill.detected_combat_cause });
  if (emptyFields.combat_fights && prefill.detected_combat_fights) suggestions.push({ icon: "⚡", label: "Tes combats", field: "combat_fights", value: prefill.detected_combat_fights });
  if (emptyFields.positioning && prefill.detected_positioning) suggestions.push({ icon: "🎯", label: "Positionnement", field: "positioning", value: prefill.detected_positioning });
  if (emptyFields.charter_colors && prefill.detected_colors?.primary) suggestions.push({ icon: "🎨", label: "Couleurs", field: "colors", value: `${prefill.detected_colors.primary}${prefill.detected_colors.secondary ? `, ${prefill.detected_colors.secondary}` : ""}` });
  if (emptyFields.charter_fonts && prefill.detected_fonts?.title) suggestions.push({ icon: "🔤", label: "Typographie", field: "fonts", value: `${prefill.detected_fonts.title}${prefill.detected_fonts.body ? ` / ${prefill.detected_fonts.body}` : ""}` });
  if (emptyFields.mood_keywords && prefill.detected_mood?.length) suggestions.push({ icon: "✨", label: "Ambiance visuelle", field: "mood", value: prefill.detected_mood.join(", ") });

  // Editable values state
  const [editableValues, setEditableValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    suggestions.forEach(s => { init[s.field] = s.value; });
    return init;
  });

  if (suggestions.length === 0 || dismissed) return null;

  const handleApplyAll = async () => {
    if (!userId) return;
    setIsApplying(true);
    const filterCol = workspaceFilter?.column || "user_id";
    const filterVal = workspaceFilter?.value || userId;

    try {
      // brand_profile: tone_style, combat_cause, combat_fights, positioning
      const brandUpdates: Record<string, unknown> = {};
      if (emptyFields.tone_style && editableValues.tone_style) brandUpdates.tone_style = editableValues.tone_style;
      if (emptyFields.combat_cause && editableValues.combat_cause) brandUpdates.combat_cause = editableValues.combat_cause;
      if (emptyFields.combat_fights && editableValues.combat_fights) brandUpdates.combat_fights = editableValues.combat_fights;
      if (emptyFields.positioning && editableValues.positioning) brandUpdates.positioning = editableValues.positioning;

      if (Object.keys(brandUpdates).length > 0) {
        const { data: existing } = await (supabase.from("brand_profile") as any)
          .select("id").eq(filterCol, filterVal).maybeSingle();
        if (existing) {
          await (supabase.from("brand_profile") as any).update(brandUpdates).eq("id", existing.id);
        } else {
          await (supabase.from("brand_profile") as any).insert({
            user_id: userId,
            workspace_id: filterCol === "workspace_id" ? filterVal : null,
            ...brandUpdates,
          });
        }
      }

      // brand_charter: colors, fonts, mood
      const charterUpdates: Record<string, unknown> = {};

      if (emptyFields.charter_colors && prefill.detected_colors?.primary) {
        const editedColors = editableValues.colors;
        if (editedColors) {
          const hexMatches = editedColors.match(/#[0-9a-fA-F]{3,8}/g) || [];
          charterUpdates.color_primary = hexMatches[0] || prefill.detected_colors.primary;
          if (hexMatches[1] || prefill.detected_colors.secondary) charterUpdates.color_secondary = hexMatches[1] || prefill.detected_colors.secondary;
          if (hexMatches[2] || prefill.detected_colors.accent) charterUpdates.color_accent = hexMatches[2] || prefill.detected_colors.accent;
          if (hexMatches[3] || prefill.detected_colors.background) charterUpdates.color_background = hexMatches[3] || prefill.detected_colors.background;
        } else {
          charterUpdates.color_primary = prefill.detected_colors.primary;
          if (prefill.detected_colors.secondary) charterUpdates.color_secondary = prefill.detected_colors.secondary;
          if (prefill.detected_colors.accent) charterUpdates.color_accent = prefill.detected_colors.accent;
          if (prefill.detected_colors.background) charterUpdates.color_background = prefill.detected_colors.background;
        }
      }

      if (emptyFields.charter_fonts && prefill.detected_fonts?.title) {
        const editedFonts = editableValues.fonts;
        if (editedFonts) {
          const parts = editedFonts.split(/[\/,]/).map(s => s.trim()).filter(Boolean);
          charterUpdates.font_title = parts[0] || prefill.detected_fonts.title;
          if (parts[1] || prefill.detected_fonts.body) charterUpdates.font_body = parts[1] || prefill.detected_fonts.body;
        } else {
          charterUpdates.font_title = prefill.detected_fonts.title;
          if (prefill.detected_fonts.body) charterUpdates.font_body = prefill.detected_fonts.body;
        }
      }

      if (emptyFields.mood_keywords && prefill.detected_mood?.length) {
        charterUpdates.mood_keywords = editableValues.mood
          ? editableValues.mood.split(",").map(s => s.trim()).filter(Boolean)
          : prefill.detected_mood;
      }

      if (Object.keys(charterUpdates).length > 0) {
        const { data: existingCharter } = await (supabase.from("brand_charter") as any)
          .select("id").eq(filterCol, filterVal).maybeSingle();
        if (existingCharter) {
          await (supabase.from("brand_charter") as any).update(charterUpdates).eq("id", existingCharter.id);
        } else {
          await (supabase.from("brand_charter") as any).insert({
            user_id: userId,
            workspace_id: filterCol === "workspace_id" ? filterVal : null,
            ...charterUpdates,
          });
        }
      }

      // voice_profile: detected_tone → voice_summary
      if (emptyFields.voice && editableValues.tone_style) {
        const { data: existingVoice } = await (supabase.from("voice_profile") as any)
          .select("id, voice_summary").eq("user_id", userId).maybeSingle();
        if (existingVoice && !existingVoice.voice_summary) {
          await (supabase.from("voice_profile") as any).update({ voice_summary: editableValues.tone_style }).eq("id", existingVoice.id);
        } else if (!existingVoice) {
          await (supabase.from("voice_profile") as any).insert({ user_id: userId, voice_summary: editableValues.tone_style });
        }
      }

      toast.success(`${suggestions.length} champ${suggestions.length > 1 ? "s" : ""} pré-rempli${suggestions.length > 1 ? "s" : ""} depuis ton site ! 🌸`);
      setDismissed(true);
    } catch (e) {
      console.error("Apply branding prefill failed:", e);
      toast.error("Erreur lors du pré-remplissage");
    } finally {
      setIsApplying(false);
      setShowDetail(false);
    }
  };

  return (
    <>
      <div className="rounded-2xl border border-primary/20 bg-rose-pale p-6 space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h3 className="font-display text-base font-bold text-foreground">
              Ton site m'a appris des choses sur toi
            </h3>
          </div>
          <button onClick={() => setDismissed(true)} className="text-muted-foreground/50 hover:text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground">
          J'ai détecté {suggestions.length} info{suggestions.length > 1 ? "s" : ""} sur ton site qui {suggestions.length > 1 ? "peuvent" : "peut"} enrichir ton branding :
        </p>

        <div className="space-y-1.5">
          {suggestions.map((s, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-foreground">
              <span className="shrink-0">{s.icon}</span>
              <span className="font-medium">{s.label}</span>
              <span className="text-muted-foreground">— {s.value}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="gap-1.5 rounded-pill" onClick={() => setShowDetail(true)}>
            <Sparkles className="h-3.5 w-3.5" /> Voir et appliquer
          </Button>
          <Button variant="outline" size="sm" className="rounded-pill" onClick={() => setDismissed(true)}>
            Plus tard
          </Button>
        </div>
      </div>

      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pré-remplir ton branding depuis ton site</DialogTitle>
            <DialogDescription>Tu peux modifier les valeurs avant de les appliquer.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {suggestions.map((s) => (
              <div key={s.field} className="space-y-1.5">
                <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <span>{s.icon}</span>
                  {s.label}
                </label>
                <Textarea
                  value={editableValues[s.field] || ""}
                  onChange={(e) => setEditableValues(prev => ({ ...prev, [s.field]: e.target.value }))}
                  className="text-sm min-h-[50px]"
                />
              </div>
            ))}
          </div>
          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button onClick={handleApplyAll} disabled={isApplying} className="gap-1.5">
              {isApplying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Pré-remplir tout
            </Button>
            <Button variant="outline" onClick={() => setShowDetail(false)}>Annuler</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
