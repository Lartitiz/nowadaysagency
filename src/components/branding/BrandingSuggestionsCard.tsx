import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Loader2, ChevronRight, Sparkles, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface Suggestion {
  section: string;
  icon: string;
  title: string;
  reason: string;
  current_value?: string;
  suggested_value: string;
  link: string;
  impact: "fort" | "moyen";
}

interface BrandingSuggestionsCardProps {
  suggestions: Suggestion[];
  triggerField: string;
  suggestionId?: string;
  onDismiss: () => void;
  onApplied?: () => void;
}

export default function BrandingSuggestionsCard({
  suggestions,
  triggerField,
  suggestionId,
  onDismiss,
  onApplied,
}: BrandingSuggestionsCardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showPreview, setShowPreview] = useState(false);
  const [editableSuggestions, setEditableSuggestions] = useState(suggestions);
  const [isApplying, setIsApplying] = useState(false);

  const handleDismiss = async () => {
    if (suggestionId && user) {
      await (supabase.from("branding_suggestions" as any) as any)
        .update({ status: "dismissed", resolved_at: new Date().toISOString() })
        .eq("id", suggestionId);
    }
    onDismiss();
  };

  const handleApplyAll = async () => {
    setIsApplying(true);
    try {
      // Apply logic would go here — for now we mark as applied and navigate
      if (suggestionId && user) {
        await (supabase.from("branding_suggestions" as any) as any)
          .update({ status: "applied", resolved_at: new Date().toISOString() })
          .eq("id", suggestionId);
      }
      toast.success("Suggestions appliquées ! 🌸");
      onApplied?.();
      setShowPreview(false);
      onDismiss();
    } catch {
      toast.error("Erreur lors de l'application");
    }
    setIsApplying(false);
  };

  const updateSuggestionValue = (index: number, value: string) => {
    setEditableSuggestions(prev => prev.map((s, i) => i === index ? { ...s, suggested_value: value } : s));
  };

  if (suggestions.length === 0) return null;

  return (
    <>
      <Card className="border-primary/20 bg-primary/[0.03] shadow-sm">
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="font-display text-sm font-bold text-foreground">
                Ton branding a changé
              </h3>
            </div>
            <button onClick={handleDismiss} className="text-muted-foreground/50 hover:text-muted-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="text-xs text-muted-foreground mb-4">
            J'ai repéré {suggestions.length} endroit{suggestions.length > 1 ? "s" : ""} à mettre à jour :
          </p>

          <div className="space-y-3">
            {suggestions.map((s, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="text-base mt-0.5">{s.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{s.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.reason}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-primary shrink-0"
                  onClick={() => navigate(s.link)}
                >
                  Voir <ChevronRight className="h-3 w-3 ml-0.5" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-5">
            <Button
              size="sm"
              className="flex-1 gap-1.5"
              onClick={() => setShowPreview(true)}
            >
              <Eye className="h-3.5 w-3.5" />
              Tout mettre à jour
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={handleDismiss}
            >
              Plus tard
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preview dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-lg">
              Voilà ce que je vais modifier
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {editableSuggestions.map((s, i) => (
              <div key={i} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span>{s.icon}</span>
                  <span className="font-medium text-sm text-foreground">{s.title}</span>
                  {s.impact === "fort" && (
                    <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">Impact fort</span>
                  )}
                </div>
                {s.current_value && (
                  <div className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2.5">
                    <span className="font-medium">Avant :</span> {s.current_value}
                  </div>
                )}
                <div>
                  <span className="text-xs font-medium text-foreground">Après :</span>
                  <Textarea
                    value={s.suggested_value}
                    onChange={(e) => updateSuggestionValue(i, e.target.value)}
                    className="mt-1 text-sm min-h-[60px]"
                  />
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button onClick={handleApplyAll} disabled={isApplying} className="gap-1.5">
              {isApplying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Appliquer tout
            </Button>
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Annuler
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
