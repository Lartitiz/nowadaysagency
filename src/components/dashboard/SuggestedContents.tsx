import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarDays, Eye, ArrowRight, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceId, useWorkspaceFilter } from "@/hooks/use-workspace-query";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { format, startOfWeek, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";

/* ── Types ── */
interface SuggestedContent {
  id: string;
  theme: string;
  accroche: string;
  contentPreview: string;
  fullContent: string;
  format: string;
  canal: string;
  objective: string;
  suggestedDate: string;
}

const FORMAT_EMOJI: Record<string, string> = {
  post_carrousel: "📑",
  reel: "🎬",
  post_photo: "🖼️",
  story_serie: "📱",
};

const OBJECTIVE_COLORS: Record<string, string> = {
  inspirer: "bg-purple-100 text-purple-700",
  eduquer: "bg-blue-100 text-blue-700",
  vendre: "bg-amber-100 text-amber-700",
  engager: "bg-emerald-100 text-emerald-700",
};

const OBJECTIVE_LABELS: Record<string, string> = {
  inspirer: "Inspirer",
  eduquer: "Éduquer",
  vendre: "Vendre",
  engager: "Engager",
};

function getDayLabel(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return `Idéal pour ${format(d, "EEEE", { locale: fr })}`;
  } catch {
    return "";
  }
}

/** Generate fallback suggestions from branding data (no AI call) */
function buildFallbackContents(brandProfile: any): SuggestedContent[] {
  const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
  const contents: SuggestedContent[] = [];

  const positioning = brandProfile?.positioning || brandProfile?.mission || "";
  const mission = brandProfile?.mission || "";
  const valuesRaw = brandProfile?.values;
  const values = Array.isArray(valuesRaw) ? valuesRaw : [];
  const storyOrigin = brandProfile?.story_origin || "";

  // Suggestion 1: Storytelling post
  if (positioning || storyOrigin) {
    const hook = storyOrigin
      ? `Le jour où j'ai décidé de tout changer…`
      : `Pourquoi j'ai choisi cette voie.`;
    const body = positioning
      ? `${positioning}\n\nC'est ce qui me guide chaque jour dans mon travail. Et toi, qu'est-ce qui t'a amené·e là où tu es aujourd'hui ?`
      : `Mon parcours n'a rien de linéaire. Mais c'est justement ce qui fait ma force.\n\nEt toi, quel a été ton déclic ?`;
    contents.push({
      id: "fallback-1",
      theme: "Mon histoire",
      accroche: hook,
      contentPreview: body.slice(0, 120) + "…",
      fullContent: `${hook}\n\n${body}\n\n#storytelling #parcours #authenticité`,
      format: "post_photo",
      canal: "instagram",
      objective: "inspirer",
      suggestedDate: format(addDays(monday, 1), "yyyy-MM-dd"),
    });
  }

  // Suggestion 2: Educational carousel from values
  if (values.length > 0 || mission) {
    const topic = values.length > 0 ? values[0] : "mon approche";
    const hook = `${typeof topic === "string" ? topic.charAt(0).toUpperCase() + topic.slice(1) : "Ce que"} : ce que ça change vraiment`;
    const body = `Slide 1 : ${hook}\nSlide 2 : Le problème que je vois souvent\nSlide 3 : Ma façon d'y répondre\nSlide 4 : Un exemple concret\nSlide 5 : Le résultat pour mes client·es`;
    contents.push({
      id: "fallback-2",
      theme: `Carrousel : ${typeof topic === "string" ? topic : "mes valeurs"}`,
      accroche: hook,
      contentPreview: body.slice(0, 120) + "…",
      fullContent: `${body}\n\nCaption :\n${hook}\n\nJe t'explique en 5 slides pourquoi c'est important.\n\n#carrousel #tips #${typeof topic === "string" ? topic.replace(/\s+/g, "") : "valeurs"}`,
      format: "post_carrousel",
      canal: "instagram",
      objective: "eduquer",
      suggestedDate: format(addDays(monday, 3), "yyyy-MM-dd"),
    });
  }

  // Suggestion 3: Engaging post from mission
  if (mission) {
    const hook = `Si tu devais résumer ta mission en une phrase, ce serait quoi ?`;
    const body = `La mienne : ${mission.slice(0, 150)}\n\nDis-moi la tienne en commentaire 👇`;
    contents.push({
      id: "fallback-3",
      theme: "Question engageante",
      accroche: hook,
      contentPreview: body.slice(0, 120) + "…",
      fullContent: `${hook}\n\n${body}\n\n#engagement #mission #communauté`,
      format: "post_photo",
      canal: "instagram",
      objective: "engager",
      suggestedDate: format(addDays(monday, 5), "yyyy-MM-dd"),
    });
  }

  // Ensure at least 2 suggestions
  if (contents.length < 2) {
    contents.push({
      id: "fallback-generic",
      theme: "Coulisses de mon activité",
      accroche: "Ce que tu ne vois pas derrière mon écran…",
      contentPreview: "Un aperçu de mon quotidien, de mes outils, de ma façon de travailler…",
      fullContent: "Ce que tu ne vois pas derrière mon écran…\n\nAujourd'hui je t'emmène dans les coulisses de mon activité.\n\nCe que j'aime, ce qui me challenge, et pourquoi je fais ce métier.\n\n#coulisses #behindthescenes #entrepreneuriat",
      format: "post_photo",
      canal: "instagram",
      objective: "inspirer",
      suggestedDate: format(addDays(monday, 2), "yyyy-MM-dd"),
    });
  }

  return contents.slice(0, 3);
}

/* ── Component ── */
export default function SuggestedContents() {
  const { user } = useAuth();
  const workspaceId = useWorkspaceId();
  const { column, value } = useWorkspaceFilter();
  const navigate = useNavigate();
  const [selectedContent, setSelectedContent] = useState<SuggestedContent | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const weekStart = useMemo(() => {
    return format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  }, []);

  // Fetch cached suggestions for this week
  const { data: cachedContents, refetch } = useQuery({
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

  // Fetch brand profile for fallback generation
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

  // Generate AI-powered weekly suggestions
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
          console.warn("AI suggestions failed, using fallback:", error);
          const fallback = buildFallbackContents(brandProfile);
          await saveSuggestions(fallback);
          return;
        }

        const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
        const dayMap: Record<string, number> = {
          "Lundi": 0, "Mardi": 1, "Mercredi": 2, "Jeudi": 3,
          "Vendredi": 4, "Samedi": 5, "Dimanche": 6,
        };

        const enrichedSuggestions: SuggestedContent[] = data.suggestions.map(
          (s: any, i: number) => ({
            id: `ai-${weekStart}-${i}`,
            theme: s.theme || "Mon contenu",
            accroche: s.accroche || "",
            contentPreview: s.contentPreview || "",
            fullContent: s.fullContent || "",
            format: s.format || "post_photo",
            canal: s.canal || "instagram",
            objective: s.objective || "inspirer",
            suggestedDate: format(
              addDays(monday, dayMap[s.suggestedDay] ?? i * 2 + 1),
              "yyyy-MM-dd"
            ),
          })
        );

        await saveSuggestions(enrichedSuggestions);
      } catch (err) {
        console.warn("Weekly suggestions error:", err);
        if (!cancelled) {
          const fallback = buildFallbackContents(brandProfile);
          await saveSuggestions(fallback);
        }
      } finally {
        if (!cancelled) setIsGenerating(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user, cachedContents, brandProfile, weekStart, workspaceId]);

  async function saveSuggestions(contents: SuggestedContent[]) {
    if (!user || contents.length === 0) return;
    await (supabase.from("suggested_contents") as any).insert({
      user_id: user.id,
      workspace_id: workspaceId || null,
      contents: JSON.stringify(contents),
      week_start: weekStart,
    });
    refetch();
  }

  const contents: SuggestedContent[] = useMemo(() => {
    if (!cachedContents?.contents) return [];
    try {
      const parsed = typeof cachedContents.contents === "string"
        ? JSON.parse(cachedContents.contents)
        : cachedContents.contents;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [cachedContents]);

  const handleSchedule = async (content: SuggestedContent) => {
    if (!user) return;
    try {
      const { error } = await (supabase.from("calendar_posts") as any).insert({
        user_id: user.id,
        workspace_id: workspaceId || null,
        theme: content.theme,
        accroche: content.accroche,
        content_draft: content.fullContent,
        format: content.format,
        canal: content.canal,
        objective: content.objective,
        date: content.suggestedDate,
        status: "ready",
      });
      if (error) throw error;
      toast.success("Post ajouté au calendrier !");
    } catch {
      toast.error("Erreur lors de l'ajout au calendrier");
    }
  };

  const openDrawer = (content: SuggestedContent) => {
    setSelectedContent(content);
    setDrawerOpen(true);
  };

  if (isGenerating) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="px-4 py-4 space-y-3"
      >
        <h3
          className="text-base text-foreground"
          style={{ fontFamily: "'Libre Baskerville', serif" }}
        >
          Tes contenus de la semaine
        </h3>
        <p
          className="text-xs text-muted-foreground italic"
          style={{ fontFamily: "'IBM Plex Mono', monospace" }}
        >
          Je prépare des contenus personnalisés pour toi...
        </p>
        <div className="flex gap-3 sm:grid sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="flex-shrink-0 w-[280px] sm:w-auto h-48 bg-muted/50 rounded-2xl animate-pulse" />
          ))}
        </div>
      </motion.div>
    );
  }

  if (contents.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="px-4 py-4"
    >
      {/* Header */}
      <h3
        className="text-base text-foreground mb-0.5"
        style={{ fontFamily: "'Libre Baskerville', serif" }}
      >
        Tes contenus de la semaine
      </h3>
      <p
        className="text-[13px] text-muted-foreground mb-4"
        style={{ fontFamily: "'IBM Plex Mono', monospace" }}
      >
        Générés à partir de ton branding. Tu valides, tu publies.
      </p>

      {/* Cards */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:overflow-visible">
        {contents.map((content, i) => (
          <motion.div
            key={content.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 * i }}
            className="flex-shrink-0 w-[280px] sm:w-auto bg-card rounded-2xl border border-border/40 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-4 flex flex-col gap-3"
          >
            {/* Format + objective */}
            <div className="flex items-center gap-2">
              <span className="text-lg" aria-hidden="true">
                {FORMAT_EMOJI[content.format] || "📝"}
              </span>
              <span
                className={cn(
                  "text-[11px] font-medium px-2 py-0.5 rounded-full",
                  OBJECTIVE_COLORS[content.objective] || "bg-muted text-muted-foreground"
                )}
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
              >
                {OBJECTIVE_LABELS[content.objective] || content.objective}
              </span>
              <span
                className="ml-auto text-[11px] text-muted-foreground"
                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
              >
                {content.canal}
              </span>
            </div>

            {/* Accroche */}
            <p
              className="text-sm text-foreground line-clamp-2 leading-snug"
              style={{ fontFamily: "'Libre Baskerville', serif" }}
            >
              {content.accroche}
            </p>

            {/* Preview */}
            <p
              className="text-xs text-muted-foreground line-clamp-3 leading-relaxed"
              style={{ fontFamily: "'IBM Plex Mono', monospace" }}
            >
              {content.contentPreview}
            </p>

            {/* Date */}
            <p
              className="text-[11px] text-muted-foreground"
              style={{ fontFamily: "'IBM Plex Mono', monospace" }}
            >
              {getDayLabel(content.suggestedDate)}
            </p>

            {/* Actions */}
            <div className="flex gap-2 mt-auto pt-1">
              <button
                onClick={() => openDrawer(content)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-border/60 text-foreground hover:bg-muted/40 transition-colors"
                style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
              >
                <Eye className="h-3.5 w-3.5" />
                Voir
              </button>
              <button
                onClick={() => handleSchedule(content)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-white transition-colors hover:opacity-90"
                style={{ backgroundColor: "#fb3d80", fontFamily: "'IBM Plex Sans', sans-serif" }}
              >
                Planifier
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Detail drawer */}
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DrawerContent className="max-h-[85vh]">
          <DrawerHeader className="pb-2">
            <DrawerTitle
              className="text-base"
              style={{ fontFamily: "'Libre Baskerville', serif" }}
            >
              {selectedContent?.theme}
            </DrawerTitle>
          </DrawerHeader>
          {selectedContent && (
            <div className="px-4 pb-6 space-y-4 overflow-y-auto">
              <div className="flex items-center gap-2">
                <span className="text-lg">{FORMAT_EMOJI[selectedContent.format] || "📝"}</span>
                <span
                  className={cn(
                    "text-[11px] font-medium px-2 py-0.5 rounded-full",
                    OBJECTIVE_COLORS[selectedContent.objective] || "bg-muted text-muted-foreground"
                  )}
                  style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                >
                  {OBJECTIVE_LABELS[selectedContent.objective] || selectedContent.objective}
                </span>
                <span className="text-[11px] text-muted-foreground" style={{ fontFamily: "'IBM Plex Mono', monospace" }}>
                  {selectedContent.canal} · {getDayLabel(selectedContent.suggestedDate)}
                </span>
              </div>

              <div
                className="whitespace-pre-wrap text-sm text-foreground leading-relaxed bg-muted/30 rounded-xl p-4"
                style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
              >
                {selectedContent.fullContent}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setDrawerOpen(false);
                    navigate("/creer");
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border border-border/60 text-foreground hover:bg-muted/40 transition-colors"
                  style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}
                >
                  Modifier dans l'atelier
                </button>
                <button
                  onClick={() => {
                    handleSchedule(selectedContent);
                    setDrawerOpen(false);
                  }}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-colors hover:opacity-90"
                  style={{ backgroundColor: "#fb3d80", fontFamily: "'IBM Plex Sans', sans-serif" }}
                >
                  <CalendarDays className="h-4 w-4" />
                  Ajouter au calendrier
                </button>
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>
    </motion.div>
  );
}
