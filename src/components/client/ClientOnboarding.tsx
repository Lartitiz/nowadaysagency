import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import BrandingImportBlock from "@/components/branding/BrandingImportBlock";
import BrandingImportReview from "@/components/branding/BrandingImportReview";
import { supabase } from "@/integrations/supabase/client";
import type { BrandingExtraction } from "@/lib/branding-import-types";

interface PrefillLinks {
  website?: string;
  instagram?: string;
  linkedin?: string;
  extra?: { type: string; url: string }[];
}

interface Props {
  workspaceName: string;
  workspaceId: string;
  onComplete: () => void;
  onSkip: () => void;
}

export default function ClientOnboarding({ workspaceName, workspaceId, onComplete, onSkip }: Props) {
  const [extraction, setExtraction] = useState<BrandingExtraction | null>(null);
  const [phase, setPhase] = useState<"import" | "review">("import");
  const [prefillLinks, setPrefillLinks] = useState<PrefillLinks | undefined>(undefined);

  useEffect(() => {
    async function fetchLinks() {
      const { data } = await supabase
        .from("workspaces" as any)
        .select("website_url, instagram_url, linkedin_url, extra_links")
        .eq("id", workspaceId)
        .single();

      if (data) {
        const d = data as any;
        const links: PrefillLinks = {};
        if (d.website_url) links.website = d.website_url;
        if (d.instagram_url) links.instagram = d.instagram_url;
        if (d.linkedin_url) links.linkedin = d.linkedin_url;
        if (d.extra_links && Array.isArray(d.extra_links) && d.extra_links.length > 0) {
          links.extra = d.extra_links;
        }
        if (Object.keys(links).length > 0) setPrefillLinks(links);
      }
    }
    fetchLinks();
  }, [workspaceId]);

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
        prefillLinks={prefillLinks}
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
