import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { type DiagnosticData, computeDiagnosticData, DEMO_DIAGNOSTIC } from "@/lib/diagnostic-data";
import { Progress } from "@/components/ui/progress";

interface Props {
  hasInstagram: boolean;
  hasWebsite: boolean;
  hasDocuments: boolean;
  isDemoMode: boolean;
  answers: { canaux: string[]; instagram: string; website: string; linkedin?: string; activite?: string; activity_type?: string; objectif?: string; blocage?: string; temps?: string; change_priority?: string; product_or_service?: string; uniqueness?: string };
  brandingAnswers: {
    positioning: string; mission: string; target_description: string;
    tone_keywords: string[]; offers: { name: string; price?: string; description?: string }[]; values: string[];
  };
  uploadedFileIds?: string[];
  activityType?: string;
  onReady: (data: DiagnosticData) => void;
}

// ─── Real-time message queue system ───
interface LiveMessage {
  text: string;
  type: "scanning" | "insight" | "done";
}

function buildInitialMessages(hasWebsite: boolean, hasDocuments: boolean): LiveMessage[] {
  const msgs: LiveMessage[] = [];
  if (hasWebsite) msgs.push({ text: "Je lis ton site web...", type: "scanning" });
  if (hasDocuments) msgs.push({ text: "J'analyse ton profil Instagram...", type: "scanning" });
  msgs.push({ text: "J'analyse les informations...", type: "scanning" });
  msgs.push({ text: "Je prépare quelque chose de personnalisé...", type: "scanning" });
  return msgs;
}

/** Extract personalized "reveal" messages from edge function response */
function buildRevealMessages(data: any, answers: Props["answers"]): LiveMessage[] {
  const msgs: LiveMessage[] = [];
  const analysis = data?.diagnostic || data?.analysis || data;

  if (analysis?.scores?.website != null) {
    msgs.push({ text: "Je lis ton site... ✓", type: "done" });
    if (analysis?.branding_prefill?.positioning) {
      const pos = analysis.branding_prefill.positioning;
      msgs.push({ text: `Tu proposes : "${pos.length > 80 ? pos.slice(0, 77) + '…' : pos}" C'est ça ?`, type: "insight" });
    }
  }

  if (analysis?.scores?.instagram != null) {
    msgs.push({ text: "J'analyse ta capture Instagram... ✓", type: "done" });
    if (analysis.scores.instagram >= 60) {
      msgs.push({ text: "Ton profil Instagram a de bonnes bases. Il y a des choses à optimiser, mais la direction est là.", type: "insight" });
    } else {
      msgs.push({ text: "Ton profil Instagram a du potentiel, mais il manque quelques éléments clés.", type: "insight" });
    }
  }

  if (analysis?.branding_prefill?.tone_keywords?.length >= 2) {
    const tones = analysis.branding_prefill.tone_keywords.slice(0, 3).join(", ");
    msgs.push({ text: `Ton ton est plutôt ${tones}. J'aime bien.`, type: "insight" });
  }

  if (analysis?.scores?.linkedin != null) {
    msgs.push({ text: "Je parcours ton LinkedIn... ✓", type: "done" });
  }

  const firstWeakness = (analysis?.weaknesses || [])[0];
  if (firstWeakness) {
    msgs.push({ text: `J'ai repéré un axe d'amélioration : ${firstWeakness.title.toLowerCase()}.`, type: "insight" });
  }

  if (analysis?.scores?.total != null) {
    const score = analysis.scores.total;
    let comment = "";
    if (score >= 70) comment = "C'est un bon score ! Tu as de solides bases.";
    else if (score >= 45) comment = "Tu as des bases, mais il y a des opportunités.";
    else comment = "On a du travail, mais c'est le début de quelque chose de bien.";
    msgs.push({ text: `Score global : ${score}/100. ${comment}`, type: "insight" });
  }

  msgs.push({ text: "Je prépare ton diagnostic personnalisé...", type: "scanning" });
  return msgs;
}

// ─── Loading tips by activity type ───
const LOADING_TIPS: Record<string, string[]> = {
  artisane: [
    "Le saviez-tu ? Les vidéos de processus de création génèrent 3x plus d'engagement.",
    "Astuce : photographier tes créations sur fond neutre + en situation = combo gagnant.",
  ],
  mode_textile: [
    "Le storytelling de marque est le premier levier de vente en mode éthique.",
    "Les lookbooks en situation convertissent 2x mieux que les photos produit seules.",
  ],
  art_design: [
    "Montrer ton processus créatif (pas juste le résultat) crée un lien fort avec ton audience.",
    "Les carrousels avant/après sont le format star pour les créatif·ves.",
  ],
  beaute_cosmetiques: [
    "Les tutoriels courts sont le format roi dans la beauté. 60 secondes, c'est l'idéal.",
    "Les avis client·es en vidéo convertissent 5x plus que les avis texte.",
  ],
  bien_etre: [
    "Les formats 'mythes vs réalités' fonctionnent incroyablement bien dans le bien-être.",
    "Ta personnalité est ton principal différenciant. Montre-toi.",
  ],
  coach: [
    "Un mini-coaching gratuit en stories peut générer plus de leads qu'une pub.",
    "Les témoignages transformations sont tes meilleurs arguments de vente.",
  ],
  _default: [
    "80% des solopreneuses sous-estiment la puissance de leur histoire personnelle.",
    "La régularité bat la perfection. 2 posts par semaine > 1 post parfait par mois.",
    "Ta bio est lue en moyenne 3 secondes. Chaque mot compte.",
  ],
};

export default function DiagnosticLoading({
  hasInstagram, hasWebsite, hasDocuments, isDemoMode,
  answers, brandingAnswers, uploadedFileIds, activityType, onReady,
}: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [checks, setChecks] = useState({ ig: false, web: false, docs: false });
  const [phase, setPhase] = useState<"loading" | "revealing" | "ready">("loading");
  const calledRef = useRef(false);
  const diagnosticDataRef = useRef<DiagnosticData | null>(null);
  const [progressPercent, setProgressPercent] = useState(5);

  // Tips
  const tips = LOADING_TIPS[activityType || ""] || LOADING_TIPS._default;
  const [currentTip, setCurrentTip] = useState(0);

  useEffect(() => {
    if (phase !== "loading") return;
    const interval = setInterval(() => {
      setCurrentTip(prev => (prev + 1) % tips.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [phase, tips.length]);

  // Initialize with loading messages
  useEffect(() => {
    setMessages(buildInitialMessages(hasWebsite, hasDocuments));
  }, [hasWebsite, hasDocuments]);

  // Cycle through messages
  useEffect(() => {
    if (phase === "ready") return;
    const interval = setInterval(() => {
      setCurrentIdx(prev => {
        const max = messages.length - 1;
        return prev < max ? prev + 1 : max;
      });
    }, phase === "revealing" ? 1200 : 2800);
    return () => clearInterval(interval);
  }, [messages.length, phase]);

  // Animate checkmarks during loading
  useEffect(() => {
    if (phase !== "loading") return;
    const timers = [
      setTimeout(() => hasDocuments && setChecks(c => ({ ...c, docs: true })), 1500),
      setTimeout(() => hasWebsite && setChecks(c => ({ ...c, web: true })), 3000),
      setTimeout(() => hasInstagram && setChecks(c => ({ ...c, ig: true })), 4500),
    ];
    return () => timers.forEach(clearTimeout);
  }, [phase, hasDocuments, hasWebsite, hasInstagram]);

  // Progress bar logic
  useEffect(() => {
    if (phase === "ready") {
      setProgressPercent(100);
      return;
    }
    if (phase === "revealing") {
      setProgressPercent(85 + (currentIdx / Math.max(messages.length - 1, 1)) * 15);
      return;
    }
    // Loading phase: time-based increment
    const timer = setInterval(() => {
      setProgressPercent(prev => {
        if (prev >= 75) return prev;
        return prev + 0.5;
      });
    }, 500);
    return () => clearInterval(timer);
  }, [phase, currentIdx, messages.length]);

  // Boost progress when checks complete
  useEffect(() => {
    const completed = [checks.docs, checks.web, checks.ig].filter(Boolean).length;
    if (completed > 0) {
      setProgressPercent(prev => Math.max(prev, 20 + completed * 15));
    }
  }, [checks]);

  // Handle reveal phase completion → call onReady
  useEffect(() => {
    if (phase === "revealing" && diagnosticDataRef.current) {
      if (currentIdx >= Math.min(2, messages.length - 1)) {
        const timer = setTimeout(() => {
          setPhase("ready");
          onReady(diagnosticDataRef.current!);
        }, 600);
        return () => clearTimeout(timer);
      }
    }
  }, [phase, currentIdx, messages.length, onReady]);

  // Main effect: call edge function
  useEffect(() => {
    if (isDemoMode) {
      const timers = [
        setTimeout(() => setChecks(c => ({ ...c, ig: true })), 500),
        setTimeout(() => setChecks(c => ({ ...c, web: true })), 1000),
        setTimeout(() => setChecks(c => ({ ...c, docs: true })), 1500),
        setTimeout(() => onReady(DEMO_DIAGNOSTIC), 3000),
      ];
      return () => timers.forEach(clearTimeout);
    }

    if (calledRef.current) return;
    calledRef.current = true;

    callDeepDiagnostic();

    async function callDeepDiagnostic() {
      let timeoutFired = false;
      let safetyTimeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const body = {
          userId: user?.id,
          websiteUrl: answers.website || null,
          instagramHandle: answers.instagram || null,
          linkedinUrl: (answers as any).linkedin || null,
          documentIds: uploadedFileIds || [],
          profile: {
            activity: answers.activite || "",
            activityType: answers.activity_type || "",
            objective: answers.objectif || "",
            blocker: answers.blocage || "",
            weeklyTime: answers.temps || "",
          },
          freeformAnswers: {
            positioning: brandingAnswers.positioning || "",
            mission: brandingAnswers.mission || "",
            target_description: brandingAnswers.target_description || "",
            change_priority: answers.change_priority || "",
            product_or_service: answers.product_or_service || "",
            uniqueness: answers.uniqueness || "",
            linkedin_summary: (answers as any).linkedin_summary || "",
          },
        };

        safetyTimeout = setTimeout(() => {
          timeoutFired = true;
          console.warn("Deep diagnostic timeout (35s), using fallback");
          useFallback();
        }, 35000);

        const { data, error } = await supabase.functions.invoke("deep-diagnostic", { body: { ...body, isOnboarding: true } });

        clearTimeout(safetyTimeout);
        if (timeoutFired) return;

        if (error || !data) {
          console.warn("Edge function failed, using fallback:", error);
          useFallback();
          return;
        }

        const result = mapEdgeResponseToDiagnostic(data);
        diagnosticDataRef.current = result;
        setChecks({ ig: true, web: true, docs: true });

        const reveals = buildRevealMessages(data, answers);
        if (reveals.length > 1) {
          setMessages(reveals.slice(0, 3));
          setCurrentIdx(0);
          setPhase("revealing");
        } else {
          setTimeout(() => onReady(result), 400);
        }
      } catch (err) {
        clearTimeout(safetyTimeout);
        if (timeoutFired) return;
        console.warn("Deep diagnostic error, using fallback:", err);
        useFallback();
      }
    }

    function useFallback() {
      const data = computeDiagnosticData(answers, brandingAnswers);
      diagnosticDataRef.current = data;
      setChecks({ ig: true, web: true, docs: true });
      setTimeout(() => onReady(data), 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getStatus = (key: "ig" | "web" | "docs", has: boolean) => {
    if (!has) return "—";
    return checks[key] ? "✅" : "en cours...";
  };

  const currentMessage = messages[currentIdx] || messages[0];

  const progressLabel = progressPercent < 30
    ? "Lecture de tes sources..."
    : progressPercent < 60
    ? "Analyse en cours..."
    : progressPercent < 85
    ? "Rédaction de ton diagnostic..."
    : "Dernières touches...";

  return (
    <div className="text-center space-y-8">
      <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
        J'analyse ta communication...
      </h1>

      {/* Progress bar */}
      <div className="max-w-xs mx-auto space-y-2">
        <Progress value={progressPercent} className="h-2" />
        <p className="text-xs text-muted-foreground">{progressLabel}</p>
      </div>

      {/* Check lines */}
      <div className="space-y-3 text-left max-w-xs mx-auto">
        {hasWebsite && <CheckLine emoji="🌐" label="Ton site web" status={getStatus("web", hasWebsite)} />}
        {hasDocuments && <CheckLine emoji="📱" label="Ton profil Instagram" status={getStatus("docs", hasDocuments)} />}
      </div>

      {/* Live message area */}
      <div className="min-h-[60px] flex items-center justify-center">
        <AnimatePresence mode="wait">
          {currentMessage && (
            <motion.p
              key={`${currentIdx}-${currentMessage.text.slice(0, 20)}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
              className={`text-sm max-w-sm mx-auto leading-relaxed ${
                currentMessage.type === "insight"
                  ? "text-foreground font-medium"
                  : currentMessage.type === "done"
                  ? "text-primary font-medium"
                  : "text-muted-foreground italic"
              }`}
              style={{ fontFamily: currentMessage.type === "insight" ? "'IBM Plex Mono', monospace" : undefined }}
            >
              {currentMessage.text}
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* Tip during loading */}
      {phase === "loading" && (
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTip}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="max-w-sm mx-auto"
          >
            <p className="text-xs text-muted-foreground/70 italic">
              💡 {tips[currentTip]}
            </p>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}

function mapEdgeResponseToDiagnostic(data: any): DiagnosticData {
  const analysis = data.diagnostic || data.analysis || data;

  const strengths = (analysis.strengths || []).map((s: any) => ({
    title: s.title || s,
    detail: s.detail || "",
    source: s.source || "profile",
  }));

  const weaknesses = (analysis.weaknesses || []).map((w: any) => ({
    title: w.title || "",
    why: w.detail || w.why || "",
    detail: w.detail || "",
    source: w.source || "profile",
    fix_hint: w.fix_hint || "",
  }));

  const scores = analysis.scores || {};
  const totalScore = scores.total ?? 50;

  const channelScores: DiagnosticData["channelScores"] = [
    { emoji: "🎨", label: "Identité", score: scores.branding ?? null },
  ];
  if (scores.instagram != null) channelScores.push({ emoji: "📱", label: "Instagram", score: scores.instagram });
  if (scores.website != null) channelScores.push({ emoji: "🌐", label: "Site web", score: scores.website });
  if (scores.linkedin != null) channelScores.push({ emoji: "💼", label: "LinkedIn", score: scores.linkedin });

  const priorities = (analysis.priorities || []).map((p: any) => ({
    title: p.title || "",
    channel: (p.route || "").includes("instagram") ? "instagram" : (p.route || "").includes("linkedin") ? "linkedin" : (p.route || "").includes("site") ? "website" : "branding",
    impact: p.impact || "medium",
    time: p.time || "",
    route: p.route || "/dashboard",
    why: p.why || "",
  }));

  return {
    totalScore,
    summary: analysis.summary || undefined,
    strengths,
    weaknesses,
    priorities: priorities.slice(0, 3),
    channelScores,
    scores,
    branding_prefill: analysis.branding_prefill || undefined,
    sources_used: data.sources_used || [],
    sources_failed: data.sources_failed || [],
  };
}

function CheckLine({ emoji, label, status }: { emoji: string; label: string; status: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span>{emoji}</span>
      <span className="text-foreground font-medium flex-1">{label}</span>
      <span className={status === "en cours..." ? "text-muted-foreground animate-pulse" : ""}>
        {status}
      </span>
    </div>
  );
}
