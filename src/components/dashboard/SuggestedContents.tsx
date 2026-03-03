import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ArrowRight, RefreshCw, Zap, Pencil, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId, useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format, startOfWeek } from "date-fns";
import { cn } from "@/lib/utils";

/* ── Types ── */
interface IdeaSpark {
  idea: string;
  hook?: string;
  format: string;
  objective: string;
  angle?: string;
  pillar?: string | null;
}

const FORMAT_ROUTE: Record<string, string> = {
  post: "/creer",
  carousel: "/creer?format=carousel",
  reel: "/creer?format=reel",
  story: "/creer?format=story",
};

const FORMAT_EMOJI: Record<string, string> = {
  post: "📝",
  post_photo: "📝",
  post_texte: "📝",
  carousel: "🎠",
  post_carrousel: "🎠",
  carrousel: "🎠",
  reel: "🎬",
  reels: "🎬",
  story: "📱",
  stories: "📱",
  newsletter: "📩",
  article: "📰",
  linkedin: "💼",
};

const FORMAT_LABEL: Record<string, string> = {
  post: "Post",
  post_photo: "Post photo",
  post_texte: "Post texte",
  carousel: "Carrousel",
  post_carrousel: "Carrousel",
  carrousel: "Carrousel",
  reel: "Reel",
  reels: "Reel",
  story: "Story",
  stories: "Story",
  newsletter: "Newsletter",
  article: "Article",
  linkedin: "LinkedIn",
};

const OBJECTIVE_COLORS: Record<string, string> = {
  inspirer: "bg-purple-100/80 text-purple-700",
  eduquer: "bg-blue-100/80 text-blue-700",
  vendre: "bg-amber-100/80 text-amber-700",
  engager: "bg-emerald-100/80 text-emerald-700",
};

const OBJECTIVE_LABELS: Record<string, string> = {
  inspirer: "Inspirer",
  eduquer: "Éduquer",
  vendre: "Vendre",
  engager: "Engager",
};

const ANGLE_LABELS: Record<string, string> = {
  coup_de_gueule: "Coup de gueule",
  mythe_a_deconstruire: "Mythe à déconstruire",
  storytelling_lecon: "Storytelling + leçon",
  histoire_cliente: "Histoire cliente",
  conseil_contre_intuitif: "Conseil contre-intuitif",
  regard_philosophique: "Regard philosophique",
  before_after: "Before/After",
  identification: "Identification",
  analyse_decryptage: "Analyse & décryptage",
  build_in_public: "Build in public",
  surf_actu: "Surf sur l'actu",
};

/** Fallback ideas from branding data (no AI call) */
function buildFallbackIdeas(brandProfile: any): IdeaSpark[] {
  const ideas: IdeaSpark[] = [];
  const positioning = brandProfile?.positioning || "";
  const mission = brandProfile?.mission || "";
  const pillarsRaw = brandProfile?.content_pillars;
  const pillars = Array.isArray(pillarsRaw) ? pillarsRaw : [];

  if (positioning) {
    ideas.push({
      idea: "Pourquoi tu as choisi cette approche plutôt qu'une autre (et ce que ça change pour tes client·es)",
      hook: "Tout le monde me demandait pourquoi je faisais pas comme les autres.",
      format: "carousel",
      objective: "inspirer",
      angle: "storytelling_lecon",
      pillar: pillars[0] || null,
    });
  }
  if (mission) {
    ideas.push({
      idea: "La croyance n°1 de ta cible qui l'empêche d'avancer (et comment tu la déconstruis au quotidien)",
      hook: "Si ton produit est bon, il se vendra tout seul. Ah oui ?",
      format: "carousel",
      objective: "eduquer",
      angle: "mythe_a_deconstruire",
      pillar: pillars[1] || null,
    });
  }
  ideas.push({
    idea: "Une situation du quotidien dans laquelle ta cliente idéale se reconnaîtra immédiatement",
    hook: "2h sur un post. 12 likes. Tu fermes l'appli.",
    format: "reel",
    objective: "engager",
    angle: "identification",
    pillar: pillars[2] || null,
  });

  return ideas.slice(0, 3);
}

/* ── Component ── */
export default function SuggestedContents() {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const { column, value } = useWorkspaceFilter();
  const navigate = useNavigate();
  const [isGenerating, setIsGenerating] = useState(false);
  const regenCountKey = `lac_regen_${format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd")}`;
  const [regenCount, setRegenCount] = useState(() => {
    try { return parseInt(localStorage.getItem(regenCountKey) || "0", 10); } catch { return 0; }
  });

  const weekStart = useMemo(() => {
    return format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  }, []);

  // Fetch cached suggestions for this week
  const { data: cachedContents, refetch, isLoading: isCacheLoading } = useQuery({
    queryKey: ["suggested-contents", user?.id, weekStart],
    queryFn: async () => {
      const { data } = await (supabase.from("suggested_contents") as any)
        .select("*")
        .eq("user_id", user!.id)
        .eq("week_start", weekStart)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch brand profile for fallback
  const { data: brandProfile } = useQuery({
    queryKey: ["brand-profile-suggested", column, value],
    queryFn: async () => {
      const { data } = await (supabase.from("brand_profile") as any)
        .select("mission, positioning, values, story_origin, content_pillars")
        .eq(column, value)
        .maybeSingle();
      return data;
    },
    enabled: !!user && !cachedContents,
    staleTime: 10 * 60 * 1000,
  });

  // Generate AI idea sparks
  useEffect(() => {
    if (!user || cachedContents || isGenerating) return;
    if (!brandProfile) return;

    let cancelled = false;
    setIsGenerating(true);

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("generate-content", {
          body: {
            type: "weekly-suggestions",
            canal: "instagram",
            workspace_id: workspaceId || undefined,
          },
        });

        if (cancelled) return;

        if (error || !data?.suggestions || data.suggestions.length === 0) {
          console.warn("AI ideas failed, using fallback:", error);
          await saveIdeas(buildFallbackIdeas(brandProfile));
          return;
        }

        const ideas: IdeaSpark[] = data.suggestions.map((s: any) => ({
          idea: s.idea || s.theme || "Idée de contenu",
          hook: s.hook || null,
          format: s.format || "post",
          objective: s.objective || "inspirer",
          angle: s.angle || null,
          pillar: s.pillar || null,
        }));

        await saveIdeas(ideas);
      } catch (err) {
        console.warn("Weekly ideas error:", err);
        if (!cancelled) {
          await saveIdeas(buildFallbackIdeas(brandProfile));
        }
      } finally {
        if (!cancelled) setIsGenerating(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user, cachedContents, brandProfile, weekStart, workspaceId]);

  async function saveIdeas(ideas: IdeaSpark[]) {
    if (!user || ideas.length === 0) return;
    await (supabase.from("suggested_contents") as any).insert({
      user_id: user.id,
      workspace_id: workspaceId || null,
      contents: JSON.stringify(ideas),
      week_start: weekStart,
    });
    refetch();
  }

  const ideas: IdeaSpark[] = useMemo(() => {
    if (!cachedContents?.contents) return [];
    try {
      const parsed = typeof cachedContents.contents === "string"
        ? JSON.parse(cachedContents.contents)
        : cachedContents.contents;
      if (!Array.isArray(parsed)) return [];
      return parsed.map((s: any) => ({
        idea: s.idea || s.theme || s.titre || "Idée de contenu",
        hook: s.hook || null,
        format: s.format || "post",
        objective: s.objective || "inspirer",
        angle: s.angle || null,
        pillar: s.pillar || null,
      }));
    } catch {
      return [];
    }
  }, [cachedContents]);

  const handleRegenerate = async () => {
    if (!user || isGenerating) return;
    if (regenCount >= 3) {
      toast("Tu as déjà régénéré 3 fois cette semaine 😊");
      return;
    }

    await (supabase.from("suggested_contents") as any)
      .delete()
      .eq("user_id", user.id)
      .eq("week_start", weekStart);

    const newCount = regenCount + 1;
    setRegenCount(newCount);
    localStorage.setItem(regenCountKey, String(newCount));
    refetch();
  };

  const [activePopover, setActivePopover] = useState<number | null>(null);
  const [expressingIdx, setExpressingIdx] = useState<number | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (activePopover === null) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setActivePopover(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [activePopover]);

  const handleCreateFromIdea = (idea: IdeaSpark) => {
    setActivePopover(null);
    const route = FORMAT_ROUTE[idea.format] || "/creer";
    const params = new URLSearchParams();
    params.set("sujet", idea.idea);
    if (idea.objective) params.set("objectif", idea.objective);
    navigate(`${route}?${params.toString()}`);
  };

  const handleExpressGenerate = async (idea: IdeaSpark, idx: number) => {
    setActivePopover(null);
    setExpressingIdx(idx);
    try {
      const { data, error } = await supabase.functions.invoke("generate-content", {
        body: {
          type: "express-draft",
          sujet: idea.idea,
          objectif: idea.objective === "inspirer" ? "visibilite" : idea.objective === "eduquer" ? "credibilite" : idea.objective === "vendre" ? "vente" : idea.objective === "engager" ? "confiance" : "visibilite",
          format: idea.format,
          canal: "instagram",
          workspace_id: workspaceId || undefined,
        },
      });

      if (error) throw new Error(error.message);

      let result = data?.content || data;
      if (typeof result === "string") {
        try {
          const cleaned = result.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
          result = JSON.parse(cleaned);
        } catch {
          result = { content: result, accroche: "", hashtags: [] };
        }
      }

      const params = new URLSearchParams();
      params.set("canal", "instagram");
      params.set("theme", idea.idea);
      if (idea.format) params.set("format", idea.format);
      if (idea.objective) params.set("objectif", idea.objective === "inspirer" ? "visibilite" : idea.objective === "eduquer" ? "credibilite" : idea.objective === "vendre" ? "vente" : "confiance");

      navigate(`/creer?${params.toString()}`, {
        state: {
          expressDraft: true,
          content_draft: result.content || result,
          accroche: result.accroche || "",
          hashtags: result.hashtags || [],
        },
      });
    } catch (err: any) {
      console.error("Express generation error:", err);
      toast.error("Erreur lors de la génération express. Réessaie !");
    } finally {
      setExpressingIdx(null);
    }
  };

  const waitingForBranding = !isCacheLoading && !cachedContents && !brandProfile && !isGenerating;

  if (waitingForBranding) return null;

  if (isGenerating || isCacheLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-primary animate-pulse" />
          <span className="text-sm font-medium text-foreground">Idées de la semaine</span>
        </div>
        <div className="space-y-2.5">
          {[0, 1, 2].map(i => (
            <div key={i} className="h-10 bg-muted/50 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (ideas.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
      className="rounded-2xl border border-border bg-card p-5"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <span className="text-sm font-bold text-foreground">Idées de la semaine</span>
        {regenCount < 3 && (
          <button
            onClick={handleRegenerate}
            disabled={isGenerating}
            className="ml-auto text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
            title="Régénérer"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isGenerating && "animate-spin")} />
          </button>
        )}
      </div>

      {/* Ideas list */}
      <div className="space-y-2">
        {ideas.map((idea, i) => (
          <div key={i} className="relative">
            <motion.button
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2, delay: 0.05 * i }}
              onClick={() => setActivePopover(activePopover === i ? null : i)}
              disabled={expressingIdx !== null}
              className={cn(
                "w-full text-left rounded-xl border border-border/60 hover:border-primary/40 bg-card hover:bg-primary/5 p-3 flex items-center gap-3 transition-all group",
                expressingIdx === i && "opacity-70 pointer-events-none",
                activePopover === i && "border-primary/50 bg-primary/5"
              )}
            >
              <span className="text-base shrink-0" aria-hidden="true">
                {expressingIdx === i ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : (FORMAT_EMOJI[idea.format] || "📝")}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                  {expressingIdx === i ? "Génération express en cours…" : idea.idea}
                </p>
                {idea.hook && expressingIdx !== i && (
                  <p className="text-xs text-muted-foreground italic mt-0.5 line-clamp-1">
                    « {idea.hook} »
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className={cn(
                    "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                    OBJECTIVE_COLORS[idea.objective] || "bg-muted text-muted-foreground"
                  )}>
                    {OBJECTIVE_LABELS[idea.objective] || idea.objective}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {FORMAT_LABEL[idea.format] || idea.format}
                  </span>
                  {idea.angle && ANGLE_LABELS[idea.angle] && (
                    <span className="text-[10px] text-muted-foreground/70">
                      · {ANGLE_LABELS[idea.angle]}
                    </span>
                  )}
                </div>
              </div>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            </motion.button>

            {/* Choice popover */}
            <AnimatePresence>
              {activePopover === i && (
                <motion.div
                  ref={popoverRef}
                  initial={{ opacity: 0, y: -4, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-border bg-card shadow-lg overflow-hidden"
                >
                  <button
                    onClick={() => handleExpressGenerate(idea, i)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-primary/5 transition-colors border-b border-border/50"
                  >
                    <Zap className="h-4 w-4 text-amber-500 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">⚡ Générer express</p>
                      <p className="text-[11px] text-muted-foreground">L'IA rédige tout, tu reçois le texte prêt à poster</p>
                    </div>
                  </button>
                  <button
                    onClick={() => handleCreateFromIdea(idea)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-primary/5 transition-colors"
                  >
                    <Pencil className="h-4 w-4 text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">✏️ Rédiger pas à pas</p>
                      <p className="text-[11px] text-muted-foreground">Tu choisis l'angle, la structure, l'accroche…</p>
                    </div>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground mt-3 italic">
        💡 Basées sur tes piliers de contenu. Clique pour choisir ton mode.
      </p>
    </motion.div>
  );
}
