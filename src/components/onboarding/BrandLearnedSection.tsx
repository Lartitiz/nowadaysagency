import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useDemoContext } from "@/contexts/DemoContext";
import { fetchBrandingDataWithStatus, calculateBrandingCompletion } from "@/lib/branding-completion";

/* ── « Ce que j'ai appris de ta marque » (diagnostic) ─────────────────────
   Rend visible le travail invisible de diagnostic-enrichment : couleurs,
   ton et piliers déjà pré-remplis pendant que la personne lit son diagnostic.
   L'enrichissement est asynchrone (Opus, 30-90 s) → on poll les vraies tables
   (pas de framer-motion sur le contenu qui arrive en retard, cf piège
   AnimatePresence + vue async). Si rien n'arrive, l'état d'attente reste
   affiché — jamais d'erreur bloquante sur cet écran de fin d'onboarding. ── */

type LearnedData = {
  colors: string[];
  fonts: string | null;
  toneKeywords: string[];
  pillars: string[];
  completionTotal: number;
};

const MAX_POLLS = 30; // ~2min30 à 5 s d'intervalle

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
      const [brandingRes, profileRes] = await Promise.all([
        fetchBrandingDataWithStatus({ column, value }),
        (supabase.from("brand_profile") as any)
          .select("tone_keywords, content_pillars")
          .eq(column, value)
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

      return { colors, fonts, toneKeywords, pillars, completionTotal };
    },
    enabled: !!value && !isDemoMode,
    refetchInterval: (query) => {
      const d = query.state.data;
      const arrived = !!d && (d.toneKeywords.length > 0 || d.pillars.length > 0 || d.colors.length > 0);
      if (arrived || pollCount.current >= MAX_POLLS) return false;
      return 5000;
    },
    retry: 1,
  });

  if (isDemoMode) return null;

  const arrived = !!data && (data.toneKeywords.length > 0 || data.pillars.length > 0 || data.colors.length > 0);

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
            Ton espace est déjà pré-rempli avec tout ça — tu pourras tout ajuster.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {(data.colors.length > 0 || data.fonts) && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Tes couleurs</p>
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

          {data.completionTotal > 0 && (
            <p className="text-sm text-primary font-medium mt-5">
              ✓ Ton branding est déjà rempli à {data.completionTotal} % — pendant que tu lisais.
            </p>
          )}
        </>
      )}
    </div>
  );
}
