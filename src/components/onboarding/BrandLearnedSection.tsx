import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useDemoContext } from "@/contexts/DemoContext";
import { fetchBrandingDataWithStatus, calculateBrandingCompletion } from "@/lib/branding-completion";
import type { AnalysisResult } from "@/components/branding/BrandingReview";

/* ── « Ce que j'ai appris de ta marque » (diagnostic) ─────────────────────
   Rend visible le travail invisible de diagnostic-enrichment : couleurs,
   ton et piliers déjà pré-remplis pendant que la personne lit son diagnostic.
   L'enrichissement est asynchrone (Opus, 30-90 s) → on poll les vraies tables
   (pas de framer-motion sur le contenu qui arrive en retard, cf piège
   AnimatePresence + vue async).

   Depuis #633 (valider sa marque avant le 1er contenu), le mode onboarding
   n'écrit PLUS brand_profile/brand_charter directement : l'enrichissement pose
   une fiche `branding_autofill` en `pending_review`. On poll donc AUSSI cette
   fiche — sinon la carte attend un signal qui ne vient jamais et finit sur un
   faux constat d'échec alors que le travail est fait. ── */

type LearnedData = {
  colors: string[];
  fonts: string | null;
  toneKeywords: string[];
  pillars: string[];
  completionTotal: number;
  /** true si les données viennent de la fiche à valider (pas encore appliquées à l'espace). */
  pendingReview: boolean;
  /**
   * Provenance des couleurs, telle que déclarée par l'enrichissement :
   * high = lues dans le CSS du site, medium = estimées, low = PROPOSÉES par l'IA.
   * `null` = couleurs déjà appliquées à l'espace (donc validées par la personne).
   */
  charterConfidence: string | null;
};

/* Honnêteté sur la provenance — même règle que BrandingReview/CharterSection.
   Sans ça, une palette d'ambiance inventée (cas 2 du prompt d'enrichissement)
   s'affichait sous « Tes couleurs », donc comme une lecture du site. Une
   invention présentée comme une détection est un bug invisible. */
export const colorsLabel = (conf: string | null): string => {
  if (!conf) return "Tes couleurs";
  if (conf === "high") return "Tes couleurs, détectées sur ton site";
  if (conf === "medium") return "Tes couleurs, estimées depuis ton logo";
  return "Palette proposée d'après ton univers";
};

const MAX_POLLS = 30; // ~2min30 à 5 s d'intervalle

const hasContent = (d: LearnedData | null | undefined): d is LearnedData =>
  !!d && (d.toneKeywords.length > 0 || d.pillars.length > 0 || d.colors.length > 0);

export default function BrandLearnedSection() {
  const { column, value } = useWorkspaceFilter();
  const { isDemoMode } = useDemoContext();
  const pollCount = useRef(0);
  // Fin de la fenêtre de polling : on remplace l'attente infinie (« Je remplis
  // ton espace… » qui pulse pour toujours si l'enrichissement a échoué) par un
  // message honnête et une porte de sortie.
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), MAX_POLLS * 5000 + 10000);
    return () => clearTimeout(t);
  }, []);

  const { data } = useQuery<LearnedData | null>({
    queryKey: ["diagnostic-brand-learned", column, value],
    queryFn: async () => {
      pollCount.current += 1;
      const [brandingRes, profileRes, autofillRes] = await Promise.all([
        fetchBrandingDataWithStatus({ column, value }),
        (supabase.from("brand_profile") as any)
          .select("tone_keywords, content_pillars")
          .eq(column, value)
          .maybeSingle(),
        (supabase.from("branding_autofill") as any)
          .select("analysis_result")
          .eq(column, value)
          .eq("autofill_status", "pending_review")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (brandingRes.error) return null;

      const charter = brandingRes.data.charter;
      const colors = [charter?.color_primary, charter?.color_secondary, charter?.color_accent]
        .filter((c: unknown): c is string => typeof c === "string" && c.trim().length > 0);
      const fonts = charter?.font_title
        ? charter.font_body ? `${charter.font_title} / ${charter.font_body}` : charter.font_title
        : null;
      const toneKeywords: string[] = Array.isArray(profileRes.data?.tone_keywords) ? profileRes.data.tone_keywords : [];
      const pillars: string[] = Array.isArray(profileRes.data?.content_pillars) ? profileRes.data.content_pillars : [];
      const completionTotal = calculateBrandingCompletion(brandingRes.data).total;

      const direct: LearnedData = { colors, fonts, toneKeywords, pillars, completionTotal, pendingReview: false, charterConfidence: null };
      if (hasContent(direct)) return direct;

      // Rien dans les tables directes → la fiche à valider (chemin onboarding #633)
      const fiche = autofillRes.data?.analysis_result as AnalysisResult | null | undefined;
      if (fiche) {
        const fCharter = fiche.charter;
        const fColors = [fCharter?.color_primary, fCharter?.color_secondary, fCharter?.color_accent]
          .filter((c: unknown): c is string => typeof c === "string" && c.trim().length > 0);
        const fFonts = fCharter?.font_title
          ? fCharter.font_body ? `${fCharter.font_title} / ${fCharter.font_body}` : fCharter.font_title
          : null;
        const fromFiche: LearnedData = {
          colors: fColors,
          fonts: fFonts,
          toneKeywords: fiche.tone_style?.tone_keywords || [],
          pillars: fiche.content_strategy?.pillars || [],
          completionTotal: 0,
          pendingReview: true,
          charterConfidence: fCharter?.confidence || "low",
        };
        if (hasContent(fromFiche)) return fromFiche;
      }

      return direct;
    },
    enabled: !!value && !isDemoMode,
    refetchInterval: (query) => {
      if (hasContent(query.state.data) || pollCount.current >= MAX_POLLS) return false;
      return 5000;
    },
    retry: 1,
  });

  if (isDemoMode) return null;

  const arrived = hasContent(data);

  return (
    <div className="rounded-2xl border border-primary/20 bg-card p-6 sm:p-7">
      <p className="font-mono-ui text-2xs uppercase tracking-[0.14em] text-bordeaux/80 font-semibold mb-1">
        Ce que j'ai appris de ta marque
      </p>

      {!arrived ? (
        timedOut ? (
          <p className="text-sm text-muted-foreground mt-2">
            Je n'ai pas réussi à pré-remplir ton espace cette fois. Pas grave :
            ton Branding t'attend, tu pourras tout compléter là-bas (et c'est
            souvent mieux avec tes mots à toi).
          </p>
        ) : (
          <p className="text-sm text-muted-foreground animate-pulse mt-2">
            ✨ Je remplis ton espace en arrière-plan pendant que tu lis ton diagnostic…
          </p>
        )
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-5">
            {data.pendingReview
              ? "Ta fiche de marque est prête — rien n'est appliqué sans toi, tu la valideras dans ton espace."
              : "Ton espace est déjà pré-rempli avec tout ça — tu pourras tout ajuster."}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {(data.colors.length > 0 || data.fonts) && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">{colorsLabel(data.charterConfidence)}</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {data.colors.map((c) => (
                    <span
                      key={c}
                      title={c}
                      className="inline-block w-6 h-6 rounded-full border border-border/60"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  {data.fonts && (
                    <span className="text-xs text-muted-foreground ml-1.5">+ {data.fonts}</span>
                  )}
                </div>
              </div>
            )}

            {data.toneKeywords.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Ton ton</p>
                <div className="flex flex-wrap gap-1.5">
                  {data.toneKeywords.slice(0, 4).map((k) => (
                    <span key={k} className="text-xs px-2.5 py-1 rounded-full bg-rose-pale text-bordeaux">
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {data.pillars.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground mb-1.5">Tes piliers de contenu</p>
              <p className="text-sm text-foreground">{data.pillars.slice(0, 4).join(" · ")}</p>
            </div>
          )}

          {data.pendingReview ? (
            <p className="text-sm text-primary font-medium mt-5">
              ✓ Ta fiche est prête — pendant que tu lisais.
            </p>
          ) : (
            data.completionTotal > 0 && (
              <p className="text-sm text-primary font-medium mt-5">
                ✓ Ton branding est déjà rempli à {data.completionTotal} % — pendant que tu lisais.
              </p>
            )
          )}
        </>
      )}
    </div>
  );
}
