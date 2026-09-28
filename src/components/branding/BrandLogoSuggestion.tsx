/**
 * BrandLogoSuggestion — « J'ai trouvé ton logo sur ton site ».
 *
 * Après l'onboarding (carte charte de la relecture, /welcome), si la charte
 * n'a PAS encore de logo, on cherche celui du site (edge site-photos-scan
 * mode "logo" : JSON-LD, <img> « logo », apple-touch-icon — jamais d'SVG ni
 * d'og:image) et on le PROPOSE. L'IA propose, l'utilisatrice décide :
 * rien n'est écrit sans son clic sur « Utiliser ce logo ».
 *
 * Écriture : même emplacement que l'upload de la page charte
 * (brand-assets/{userId}/logo/logo, URL publique + ?v= cache-buster) et
 * brand_charter.logo_url. Un logo déjà présent n'est JAMAIS écrasé (re-vérifié
 * au clic). Carte masquée si : logo existant, pas de site, rien trouvé, edge
 * pas encore déployée, image illisible, mode démo.
 */

import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { posthog } from "@/lib/posthog";
import { base64ToFile } from "@/components/photos/SitePhotoImportDialog";

type Status = "loading" | "ready" | "hidden" | "saving" | "done";

interface BrandLogoSuggestionProps {
  /** Où la carte est affichée (analytics). */
  placement: "welcome" | "brand_review";
  className?: string;
}

/** Plus petit que ça, c'est un favicon, pas un logo exploitable. */
const MIN_LOGO_WIDTH = 48;

function looksLikeUrl(value: string): boolean {
  const v = value.trim();
  return !!v && !/\s/.test(v) && v.includes(".");
}

export function BrandLogoSuggestion({ placement, className }: BrandLogoSuggestionProps) {
  const { user } = useAuth();
  const { isDemoMode } = useDemoContext();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<Status>("loading");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (isDemoMode || !user?.id) {
      setStatus("hidden");
      return;
    }
    if (!value || started.current) return;
    started.current = true;

    void (async () => {
      const [{ data: charter }, { data: profile }] = await Promise.all([
        (supabase.from("brand_charter") as any)
          .select("logo_url")
          .eq(column, value)
          .maybeSingle(),
        supabase.from("profiles").select("website_url").eq("user_id", user.id).maybeSingle(),
      ]);
      if (charter?.logo_url) {
        setStatus("hidden");
        return;
      }
      const websiteUrl = (profile?.website_url ?? "").trim();
      if (!looksLikeUrl(websiteUrl)) {
        setStatus("hidden");
        return;
      }
      const { data } = await invokeWithTimeout(
        "site-photos-scan",
        { body: { mode: "logo", websiteUrl } },
        45_000,
      );
      // data.error couvre aussi une edge pas encore redéployée (« mode invalide »).
      if (data?.error || typeof data?.logo !== "string") {
        setStatus("hidden");
        return;
      }
      setLogoUrl(data.logo);
      setStatus("ready");
    })().catch((e) => {
      console.error("[BrandLogoSuggestion] detection failed:", e);
      setStatus("hidden");
    });
  }, [isDemoMode, user?.id, column, value]);

  if (status === "hidden" || status === "loading" || !logoUrl) return null;

  async function handleUse() {
    if (!user?.id || !logoUrl) return;
    setStatus("saving");
    try {
      const { data: fetched, error: fetchError } = await invokeWithTimeout(
        "site-photos-scan",
        { body: { mode: "fetch", imageUrl: logoUrl } },
        45_000,
      );
      if (fetchError || fetched?.error || !fetched?.base64) {
        throw new Error("Impossible de récupérer ce logo. Tu peux l'ajouter depuis ta charte graphique.");
      }
      const contentType: string = fetched.contentType || "image/png";

      // Re-vérifié au clic : un logo a pu être ajouté entre-temps (autre onglet).
      const { data: existing, error: readError } = await (supabase.from("brand_charter") as any)
        .select("id, logo_url")
        .eq(column, value)
        .maybeSingle();
      if (readError) throw readError;
      if (existing?.logo_url) {
        toast.info("Ta charte a déjà un logo : je n'y touche pas.");
        setStatus("hidden");
        return;
      }

      // Même chemin que l'upload de BrandCharterPage : upsert sur un blob unique.
      const path = `${user.id}/logo/logo`;
      const file = base64ToFile(fetched.base64, contentType, "logo");
      const { error: uploadError } = await supabase.storage
        .from("brand-assets")
        .upload(path, file, { upsert: true, contentType });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("brand-assets").getPublicUrl(path);
      const publicUrl = `${urlData.publicUrl}?v=${Date.now()}`;

      if (existing?.id) {
        const { error } = await (supabase.from("brand_charter") as any)
          .update({ logo_url: publicUrl })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("brand_charter") as any).insert({
          user_id: user.id,
          workspace_id: workspaceId && workspaceId !== user.id ? workspaceId : null,
          logo_url: publicUrl,
        });
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ["brand-charter"] });
      posthog.capture("brand_logo_suggestion_accepted", { placement });
      setStatus("done");
    } catch (e) {
      console.error("[BrandLogoSuggestion] save failed:", e);
      toast.error(e instanceof Error && e.message ? e.message : "L'ajout du logo a échoué. Réessaie.");
      setStatus("ready");
    }
  }

  function handleDismiss() {
    posthog.capture("brand_logo_suggestion_dismissed", { placement });
    setStatus("hidden");
  }

  return (
    <div className={cn("rounded-2xl bg-card border border-border p-5 text-left", className)}>
      <div className="flex items-center gap-4">
        <div className="h-16 w-24 shrink-0 rounded-xl border border-border bg-white flex items-center justify-center p-2">
          <img
            src={logoUrl}
            alt="Logo trouvé sur ton site"
            className="max-h-full max-w-full object-contain"
            onError={() => setStatus("hidden")}
            onLoad={(e) => {
              if (e.currentTarget.naturalWidth < MIN_LOGO_WIDTH) setStatus("hidden");
            }}
          />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {status === "done" ? "Ton logo est dans ta charte" : "Ton logo"}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {status === "done"
              ? "Tu pourras le détourer ou en tirer tes couleurs depuis ta charte graphique."
              : "Je l'ai trouvé sur ton site. C'est bien lui ? Je l'ajoute à ta charte graphique."}
          </p>
        </div>
      </div>

      {status !== "done" ? (
        <div className="flex flex-wrap justify-end gap-2 mt-4">
          <Button variant="ghost" size="sm" onClick={handleDismiss} disabled={status === "saving"}>
            Ce n'est pas mon logo
          </Button>
          <Button size="sm" className="rounded-pill" onClick={handleUse} disabled={status === "saving"}>
            {status === "saving" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> Ajout en cours…
              </>
            ) : (
              "Utiliser ce logo"
            )}
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-xs font-medium text-primary inline-flex items-center gap-1.5">
          <Check className="h-3.5 w-3.5" /> Ajouté à ta charte graphique
        </p>
      )}
    </div>
  );
}
