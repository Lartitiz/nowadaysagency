import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import BrandingImportBlock from "@/components/branding/BrandingImportBlock";
import BrandingImportReview from "@/components/branding/BrandingImportReview";
import type { BrandingExtraction } from "@/lib/branding-import-types";

interface Props {
  workspaceName: string;
  workspaceId: string;
  onComplete: () => void;
  onSkip: () => void;
}

export default function ClientOnboarding({ workspaceName, workspaceId, onComplete, onSkip }: Props) {
  const [extraction, setExtraction] = useState<BrandingExtraction | null>(null);
  const [phase, setPhase] = useState<"import" | "review">("import");

  if (phase === "review" && extraction) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 animate-fade-in">
        <BrandingImportReview
          extraction={extraction}
          onDone={onComplete}
          onCancel={() => {
            setExtraction(null);
            setPhase("import");
          }}
          workspaceId={workspaceId}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 animate-fade-in">
      <div className="text-center mb-8">
        <h1 className="font-display text-2xl font-bold text-foreground mb-2">
          Bienvenue dans l'espace de {workspaceName} 🎯
        </h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Importe les documents de ton·ta client·e pour pré-remplir son branding automatiquement.
          Stratégie, brief, persona, charte… tout est bon à prendre.
        </p>
      </div>

      <BrandingImportBlock
        onResult={(ext) => {
          setExtraction(ext);
          setPhase("review");
        }}
      />

      <div className="text-center mt-6 space-y-2">
        <Button variant="ghost" onClick={onSkip} className="text-muted-foreground gap-1">
          Passer cette étape <ArrowRight className="h-3.5 w-3.5" />
        </Button>
        <p className="text-xs text-muted-foreground">
          Tu pourras importer des documents à tout moment depuis la section Branding.
        </p>
      </div>
    </div>
  );
}
