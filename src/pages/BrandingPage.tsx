import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Eye, Pencil, Sparkles, ClipboardList, RefreshCw, Loader2 } from "lucide-react";
import { fetchBrandingData, calculateBrandingCompletion, type BrandingCompletion } from "@/lib/branding-completion";
import { supabase } from "@/integrations/supabase/client";
import BrandingSynthesisSheet from "@/components/branding/BrandingSynthesisSheet";
import AuditRecommendationBanner from "@/components/AuditRecommendationBanner";
import BrandingImportBlock from "@/components/branding/BrandingImportBlock";
import BrandingImportReview from "@/components/branding/BrandingImportReview";
import CoachingFlow from "@/components/CoachingFlow";
import type { BrandingExtraction } from "@/lib/branding-import-types";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { useDemoContext } from "@/contexts/DemoContext";
import { DEMO_DATA } from "@/lib/demo-data";
import { toast } from "sonner";

interface BrandingCard {
  emoji: string;
  title: string;
  description: string;
  stepperRoute: string;
  recapRoute: string;
  scoreKey: keyof Omit<BrandingCompletion, "total">;
}

const CARDS: BrandingCard[] = [
  {
    emoji: "📖",
    title: "Mon histoire",
    description: "Raconte ton histoire. L'IA te guide question par question.",
    stepperRoute: "/branding/section?section=story",
    recapRoute: "/branding/section?section=story",
    scoreKey: "storytelling",
  },
  {
    emoji: "👩‍💻",
    title: "Mon client·e idéal·e",
    description: "Comprends qui tu veux toucher, ce qui la bloque, ce qu'elle désire.",
    stepperRoute: "/branding/section?section=persona",
    recapRoute: "/branding/section?section=persona",
    scoreKey: "persona",
  },
  {
    emoji: "❤️",
    title: "Ma proposition de valeur",
    description: "Ce qui te rend unique. Les phrases que tu vas utiliser partout.",
    stepperRoute: "/branding/section?section=value_proposition",
    recapRoute: "/branding/section?section=value_proposition",
    scoreKey: "proposition",
  },
  {
    emoji: "🎨",
    title: "Ma voix & mes combats",
    description: "Ton ADN verbal : comment tu parles, ce que tu défends, ce que tu refuses.",
    stepperRoute: "/branding/section?section=tone_style",
    recapRoute: "/branding/section?section=tone_style",
    scoreKey: "tone",
  },
  {
    emoji: "🍒",
    title: "Ma ligne éditoriale",
    description: "De quoi tu parles : tes piliers de contenu, tes thèmes, ton angle créatif.",
    stepperRoute: "/branding/section?section=content_strategy",
    recapRoute: "/branding/section?section=content_strategy",
    scoreKey: "strategy",
  },
];

export default function BrandingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isDemoMode } = useDemoContext();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const [completion, setCompletion] = useState<BrandingCompletion>({ storytelling: 0, persona: 0, proposition: 0, tone: 0, strategy: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [primaryStoryId, setPrimaryStoryId] = useState<string | null>(null);
  const [showSynthesis, setShowSynthesis] = useState(false);
  const [importPhase, setImportPhase] = useState<'idle' | 'reviewing'>('idle');
  const [importExtraction, setImportExtraction] = useState<BrandingExtraction | null>(null);
  const [showImportBlock, setShowImportBlock] = useState(false);
  const [lastAudit, setLastAudit] = useState<any>(null);
  const [hasEnoughData, setHasEnoughData] = useState(false);
  const [hasProposition, setHasProposition] = useState(false);
  const [generatingProp, setGeneratingProp] = useState(false);

  // Coaching mode from audit
  const fromAudit = searchParams.get("from") === "audit";
  const coachingModule = searchParams.get("module");
  const coachingRecId = searchParams.get("rec_id") || undefined;
  const [coachingActive, setCoachingActive] = useState(fromAudit && !!coachingModule);

  useEffect(() => {
    if (isDemoMode) {
      setCompletion({
        storytelling: 100,
        persona: 100,
        proposition: 100,
        tone: 80,
        strategy: 70,
        total: DEMO_DATA.branding.completion,
      });
      setPrimaryStoryId("demo-story");
      setHasEnoughData(true);
      setHasProposition(true);
      setLastAudit({
        id: "demo-audit",
        created_at: new Date().toISOString(),
        score_global: DEMO_DATA.audit.score,
        points_forts: DEMO_DATA.audit.points_forts,
        points_faibles: DEMO_DATA.audit.points_faibles,
      });
      setLoading(false);
      return;
    }
    if (!user) return;
    const load = async () => {
      const data = await fetchBrandingData(user.id);
      setCompletion(calculateBrandingCompletion(data));

      // Determine proposition card state
      const enough = !!(data.persona?.step_1_frustrations && data.storytellingList && data.storytellingList.length > 0);
      setHasEnoughData(enough);
      setHasProposition(!!(data.proposition?.version_pitch_naturel));

      if (data.storytellingList && data.storytellingList.length > 0) {
        const primary = data.storytellingList.find((s: any) => s.is_primary);
        setPrimaryStoryId(primary?.id || data.storytellingList[0].id);
      }

      // Fetch last branding audit
      const { data: auditData } = await (supabase.from("branding_audits") as any)
        .select("id, created_at, score_global, points_forts, points_faibles")
        .eq(column, value)
        .order("created_at", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1);
      if (auditData && auditData.length > 0) {
        setLastAudit(auditData[0]);
      }

      setLoading(false);
    };
    load();
  }, [user?.id, isDemoMode]);

  const generateProposition = async () => {
    if (!user) return;
    setGeneratingProp(true);
    try {
      const [storyRes, personaRes, profileRes] = await Promise.all([
        (supabase.from("storytelling") as any).select("*").eq(column, value).eq("is_primary", true).maybeSingle(),
        (supabase.from("persona") as any).select("*").eq(column, value).maybeSingle(),
        (supabase.from("brand_profile") as any).select("*").eq(column, value).maybeSingle(),
      ]);
      const profiles = await supabase.from("profiles").select("activite, prenom, mission").eq("user_id", user.id).single();

      const syntheticData = {
        step_1_what: profiles.data?.activite || "",
        step_2a_process: storyRes.data?.step_3_action || "",
        step_2b_values: profileRes.data?.combat_cause || "",
        step_2c_feedback: personaRes.data?.step_2_transformation || "",
        step_2d_refuse: profileRes.data?.combat_refusals || "",
        step_3_for_whom: personaRes.data?.step_1_frustrations || "",
      };

      const { data: fn, error } = await supabase.functions.invoke("proposition-ai", {
        body: {
          type: "generate-versions",
          proposition_data: syntheticData,
          persona: personaRes.data,
          storytelling: storyRes.data,
          tone: profileRes.data,
          profile: profiles.data,
        },
      });

      if (error) throw error;

      const raw = fn?.content || fn?.response || (typeof fn === "string" ? fn : JSON.stringify(fn));
      const cleaned = typeof raw === "string" ? raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim() : raw;
      const parsed = typeof cleaned === "string" ? JSON.parse(cleaned) : cleaned;

      const payload = {
        ...syntheticData,
        version_pitch_naturel: parsed.pitch_naturel || "",
        version_bio: parsed.bio || "",
        version_networking: parsed.networking || "",
        version_site_web: parsed.site_web || "",
        version_engagee: parsed.engagee || "",
        version_one_liner: parsed.one_liner || "",
        completed: true,
        current_step: 4,
        user_id: user.id,
        workspace_id: workspaceId !== user.id ? workspaceId : undefined,
      };

      const { data: existing } = await (supabase.from("brand_proposition") as any)
        .select("id").eq(column, value).maybeSingle();
      if (existing) {
        await supabase.from("brand_proposition").update(payload as any).eq("id", existing.id);
      } else {
        await supabase.from("brand_proposition").insert(payload as any);
      }

      toast.success("✨ Tes 6 propositions de valeur sont prêtes !");
      navigate("/branding/proposition/recap");
    } catch (e: any) {
      console.error("[BrandingPage] Proposition generation error:", e);
      const { friendlyError } = await import("@/lib/error-messages");
      toast.error(friendlyError(e));
    } finally {
      setGeneratingProp(false);
    }
  };

  const reloadCompletion = async () => {
    if (!user) return;
    const data = await fetchBrandingData(user.id);
    setCompletion(calculateBrandingCompletion(data));
    if (data.storytellingList && data.storytellingList.length > 0) {
      const primary = data.storytellingList.find((s: any) => s.is_primary);
      setPrimaryStoryId(primary?.id || data.storytellingList[0].id);
    }
  };

  const handleImportResult = (extraction: BrandingExtraction) => {
    setImportExtraction(extraction);
    setImportPhase('reviewing');
  };

  const handleImportDone = async () => {
    setImportPhase('idle');
    setImportExtraction(null);
    await reloadCompletion();
  };

  const globalMessage =
    completion.total > 80
      ? "Ton branding est solide. L'IA te connaît bien."
      : completion.total >= 50
        ? "Tu avances bien ! Quelques sections à compléter."
        : "Continue à remplir pour débloquer tout le potentiel de l'outil.";

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex gap-1">
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
        </div>
      </div>
    );
  }

  const getRecapRoute = (card: BrandingCard) => {
    if (card.scoreKey === "storytelling" && primaryStoryId) {
      return card.recapRoute.replace("__PRIMARY__", primaryStoryId);
    }
    return card.recapRoute;
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main id="main-content" className="mx-auto max-w-[900px] px-6 py-8 max-md:px-4">
        <Link to="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Retour au hub
        </Link>

        {!coachingActive && <AuditRecommendationBanner />}

        {/* Coaching flow from audit */}
        {coachingActive && coachingModule && (
          <div className="mb-6">
            <CoachingFlow
              module={coachingModule}
              recId={coachingRecId}
              onComplete={async () => {
                setCoachingActive(false);
                setSearchParams({});
                await reloadCompletion();
              }}
              onSkip={() => {
                setCoachingActive(false);
                setSearchParams({});
              }}
            />
          </div>
        )}

        <h1 className="font-display text-[26px] font-bold text-foreground mb-2">Mon Branding</h1>
        <p className="text-[15px] text-muted-foreground mb-6">
          C'est ici que tout commence. Plus tu remplis, plus L'Assistant Com' te connaît et te propose des idées qui te ressemblent.
        </p>

        {showSynthesis ? (
          <BrandingSynthesisSheet onClose={() => setShowSynthesis(false)} />
        ) : importPhase === 'reviewing' && importExtraction ? (
          <BrandingImportReview
            extraction={importExtraction}
            onDone={handleImportDone}
            onCancel={() => { setImportPhase('idle'); setImportExtraction(null); }}
          />
        ) : (
          <>
            {/* Audit & Import links moved here, audit summary moved to bottom */}
            {/* Audit & Import links */}
            <div className="space-y-2 mb-4">
              {!lastAudit && (
                <button
                  onClick={() => navigate("/branding/audit")}
                  className="w-full rounded-xl border border-border bg-card hover:bg-muted/50 transition-colors p-4 text-left"
                >
                  <p className="text-sm font-medium text-foreground flex items-center gap-2">
                    🔍 Tu veux d'abord faire un diagnostic de ce que t'as déjà ?
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Analyse ton site, tes réseaux et tes documents en un clic.</p>
                </button>
              )}

              {showImportBlock ? (
                <BrandingImportBlock onResult={handleImportResult} />
              ) : (
                <button
                  onClick={() => setShowImportBlock(true)}
                  className="w-full rounded-xl border border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors p-4 text-left"
                >
                  <p className="text-sm font-medium text-foreground flex items-center gap-2">
                    📄 Tu as un document stratégique ? Importe-le pour pré-remplir ton branding.
                  </p>
                </button>
              )}
            </div>

            {/* Synthesis button */}
            <div className="mb-8">
              {completion.total >= 10 ? (
                <Button
                  variant="outline"
                  className="w-full gap-2 text-sm"
                  onClick={() => setShowSynthesis(true)}
                >
                  <ClipboardList className="h-4 w-4" />
                  📋 Générer ma fiche de synthèse
                </Button>
              ) : (
                <div className="text-center py-3 px-4 rounded-xl bg-muted/40 border border-border">
                  <p className="text-xs text-muted-foreground">
                    Remplis au moins ton positionnement ou ta cible pour générer ta fiche de synthèse.
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {CARDS.map((card) => {
                const pValue = completion[card.scoreKey];
                const isCompleted = pValue === 100;
                const pLabel = isCompleted ? "✅ Complet" : `${pValue}%`;

                // Special 3-state rendering for proposition card
                if (card.scoreKey === "proposition") {
                  return (
                    <div
                      key={card.stepperRoute}
                      className="rounded-2xl border-2 bg-card p-5 transition-all border-border hover:border-primary/30 hover:shadow-md"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <span className="text-2xl">{card.emoji}</span>
                      </div>
                      <h3 className="font-display text-base font-bold text-foreground mb-1">{card.title}</h3>

                      {hasProposition ? (
                        /* État C : déjà généré */
                        <>
                          <p className="text-[13px] text-muted-foreground mb-3 leading-relaxed">{card.description}</p>
                          <div className="flex items-center gap-2 mb-4">
                            <Progress value={100} className="h-1.5 flex-1" />
                            <span className="font-mono-ui text-[10px] font-semibold shrink-0 text-[#2E7D32]">✅ Complet</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button size="sm" className="rounded-pill text-xs flex-1" onClick={() => navigate("/branding/proposition/recap")}>
                              <Eye className="h-3.5 w-3.5 mr-1" /> Voir ma fiche
                            </Button>
                            <Button variant="outline" size="sm" className="rounded-pill text-xs" onClick={() => navigate("/branding/section?section=value_proposition")}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </>
                      ) : hasEnoughData ? (
                        /* État B : données suffisantes, pas encore généré */
                        <>
                          <p className="text-[13px] text-muted-foreground mb-3 leading-relaxed">
                            L'IA peut maintenant synthétiser tes autres sections pour créer tes 6 versions.
                          </p>
                          <div className="flex items-center gap-2 mb-4">
                            <Progress value={pValue} className="h-1.5 flex-1" />
                            <span className="font-mono-ui text-[10px] font-semibold shrink-0 text-muted-foreground">{pLabel}</span>
                          </div>
                          <Button
                            size="sm"
                            className="rounded-pill text-xs w-full mb-2"
                            onClick={generateProposition}
                            disabled={generatingProp}
                          >
                            {generatingProp ? (
                              <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Génération en cours...</>
                            ) : (
                              <><Sparkles className="h-3.5 w-3.5 mr-1" /> Générer ma proposition de valeur</>
                            )}
                          </Button>
                          {generatingProp && (
                            <p className="text-[11px] text-muted-foreground text-center">L'IA synthétise ton histoire, ton persona et ton ton pour créer 6 versions...</p>
                          )}
                          <Link to="/branding/proposition" className="block text-[11px] text-muted-foreground hover:text-primary text-center mt-1">
                            Ou remplir manuellement →
                          </Link>
                        </>
                      ) : (
                        /* État A : pas assez de données */
                        <>
                          <p className="text-[13px] text-muted-foreground mb-3 leading-relaxed">
                            Complète d'abord ton histoire et ton persona pour générer automatiquement.
                          </p>
                          <div className="flex items-center gap-2 mb-4">
                            <Progress value={pValue} className="h-1.5 flex-1" />
                            <span className="font-mono-ui text-[10px] font-semibold shrink-0 text-muted-foreground">{pLabel}</span>
                          </div>
                          <Button size="sm" className="rounded-pill text-xs w-full mb-2" disabled>
                            <Sparkles className="h-3.5 w-3.5 mr-1" /> Générer ma proposition de valeur
                          </Button>
                          <Link to="/branding/proposition" className="block text-[11px] text-muted-foreground hover:text-primary text-center mt-1">
                            Ou remplir manuellement →
                          </Link>
                        </>
                      )}
                    </div>
                  );
                }

                return (
                  <div
                    key={card.stepperRoute}
                    className="rounded-2xl border-2 bg-card p-5 transition-all border-border hover:border-primary/30 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <span className="text-2xl">{card.emoji}</span>
                    </div>
                    <h3 className="font-display text-base font-bold text-foreground mb-1">{card.title}</h3>
                    <p className="text-[13px] text-muted-foreground mb-3 leading-relaxed">{card.description}</p>
                    <div className="flex items-center gap-2 mb-4">
                      <Progress value={pValue} className="h-1.5 flex-1" />
                      <span className={`font-mono-ui text-[10px] font-semibold shrink-0 ${isCompleted ? "text-[#2E7D32]" : "text-muted-foreground"}`}>{pLabel}</span>
                    </div>

                    {isCompleted ? (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          className="rounded-pill text-xs flex-1"
                          onClick={() => navigate(getRecapRoute(card))}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          Voir ma fiche
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-pill text-xs"
                          onClick={() => navigate(card.stepperRoute)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : pValue > 0 ? (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          className="rounded-pill text-xs flex-1"
                          onClick={() => navigate(card.stepperRoute)}
                        >
                          Continuer →
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        className="rounded-pill text-xs w-full"
                        onClick={() => navigate(card.stepperRoute)}
                      >
                        <Sparkles className="h-3.5 w-3.5 mr-1" />
                        Commencer
                      </Button>
                    )}
                  </div>
                );
              })}

              {/* Mes offres card */}
              <div
                className="rounded-2xl border-2 bg-card p-5 transition-all border-primary/30 hover:border-primary hover:shadow-md cursor-pointer"
                onClick={() => navigate("/branding/offres")}
              >
                <div className="flex items-start justify-between mb-3">
                  <span className="text-2xl">🎁</span>
                </div>
                <h3 className="font-display text-base font-bold text-foreground mb-1">Mes offres</h3>
                <p className="text-[13px] text-muted-foreground mb-3 leading-relaxed">
                  Formule tes offres de manière désirable. L'IA te coache à chaque étape.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="rounded-pill text-xs flex-1"
                    onClick={(e) => { e.stopPropagation(); navigate("/branding/offres"); }}
                  >
                    <Eye className="h-3.5 w-3.5 mr-1" />
                    Voir mes offres
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-pill text-xs flex-1"
                    onClick={(e) => { e.stopPropagation(); navigate("/branding/coaching?section=offers"); }}
                  >
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    Coaching
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 mt-8">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono-ui text-[12px] font-semibold text-foreground">
                  Mon branding est complet à {completion.total}%
                </span>
              </div>
              <Progress value={completion.total} className="h-2.5 mb-2" />
              <p className="text-[12px] text-muted-foreground">{globalMessage}</p>
            </div>

            {lastAudit && (() => {
              const forts = Array.isArray(lastAudit.points_forts) ? lastAudit.points_forts.slice(0, 2) : [];
              const faibles = Array.isArray(lastAudit.points_faibles)
                ? [...lastAudit.points_faibles].sort((a: any, b: any) => {
                    const pri: Record<string, number> = { haute: 0, moyenne: 1, basse: 2 };
                    return (pri[a?.priorite] ?? 2) - (pri[b?.priorite] ?? 2);
                  }).slice(0, 3)
                : [];
              const score = lastAudit.score_global ?? 0;
              const color = score >= 75 ? "bg-green-500" : score >= 50 ? "bg-yellow-500" : "bg-red-500";
              const dateStr = lastAudit.created_at
                ? format(new Date(lastAudit.created_at), "d MMMM yyyy", { locale: fr })
                : "";

              return (
                <div className="rounded-2xl border border-border bg-card p-5 mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-foreground">🔍 Mon dernier audit · {dateStr}</h3>
                  </div>

                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Score global</span>
                      <span className="font-mono-ui text-xs font-semibold text-foreground">{score}/100</span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${score}%` }} />
                    </div>
                  </div>

                  {forts.length > 0 && (
                    <div className="mb-2">
                      <p className="text-xs font-semibold text-foreground mb-1">✅ Points forts</p>
                      {forts.map((p: any, i: number) => (
                        <p key={i} className="text-xs text-muted-foreground leading-relaxed">· {typeof p === "string" ? p : p?.titre || ""}</p>
                      ))}
                    </div>
                  )}

                  {faibles.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-semibold text-foreground mb-1">⚠️ À améliorer</p>
                      {faibles.map((p: any, i: number) => (
                        <p key={i} className="text-xs text-muted-foreground leading-relaxed">· {typeof p === "string" ? p : p?.titre || ""}</p>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="text-xs flex-1" onClick={() => navigate(`/branding/audit/${lastAudit.id}`)}>
                      Voir l'audit complet →
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs gap-1" onClick={() => navigate("/branding/audit")}>
                      <RefreshCw className="h-3 w-3" /> Refaire
                    </Button>
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </main>
    </div>
  );
}
