import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { type DiagnosticData, computeDiagnosticData, DEMO_DIAGNOSTIC } from "@/lib/diagnostic-data";

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
  onReady: (data: DiagnosticData) => void;
}

// ─── Real-time message queue system ───
interface LiveMessage {
  text: string;
  type: "scanning" | "insight" | "done";
}

function buildInitialMessages(hasInstagram: boolean, hasWebsite: boolean, hasDocuments: boolean): LiveMessage[] {
  const msgs: LiveMessage[] = [];
  if (hasWebsite) msgs.push({ text: "Je lis ton site web...", type: "scanning" });
  if (hasInstagram) msgs.push({ text: "Je regarde ton Instagram...", type: "scanning" });
  if (hasDocuments) msgs.push({ text: "Je parcours tes documents...", type: "scanning" });
  msgs.push({ text: "J'analyse les informations...", type: "scanning" });
  msgs.push({ text: "Je prépare quelque chose de personnalisé...", type: "scanning" });
  return msgs;
}

/** Extract personalized "reveal" messages from edge function response */
function buildRevealMessages(data: any, answers: Props["answers"]): LiveMessage[] {
  const msgs: LiveMessage[] = [];
  const analysis = data?.diagnostic || data?.analysis || data;

  // Website insights
  if (analysis?.scores?.website != null) {
    msgs.push({ text: "Je lis ton site... ✓", type: "done" });
    if (analysis?.branding_prefill?.positioning) {
      const pos = analysis.branding_prefill.positioning;
      msgs.push({ text: `Tu proposes : "${pos.length > 80 ? pos.slice(0, 77) + '…' : pos}" C'est ça ?`, type: "insight" });
    }
  }

  // Instagram insights
  if (analysis?.scores?.instagram != null) {
    msgs.push({ text: "Je regarde ton Instagram... ✓", type: "done" });
    // Extract tone from strengths/weaknesses mentioning instagram
    const igStrength = (analysis?.strengths || []).find((s: any) => s.source === "instagram");
    if (igStrength) {
      msgs.push({ text: `${igStrength.title}. J'ai bien noté.`, type: "insight" });
    }

    // Tone keywords
    if (analysis?.branding_prefill?.tone_keywords?.length >= 2) {
      const tones = analysis.branding_prefill.tone_keywords.slice(0, 3).join(", ");
      msgs.push({ text: `Ton ton est plutôt ${tones}. J'aime bien.`, type: "insight" });
    }
  }

  // LinkedIn insights  
  if (analysis?.scores?.linkedin != null) {
    msgs.push({ text: "Je parcours ton LinkedIn... ✓", type: "done" });
  }

  // General insights from weaknesses
  const firstWeakness = (analysis?.weaknesses || [])[0];
  if (firstWeakness) {
    msgs.push({ text: `J'ai repéré un axe d'amélioration : ${firstWeakness.title.toLowerCase()}.`, type: "insight" });
  }

  // Score reveal
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

export default function DiagnosticLoading({
  hasInstagram, hasWebsite, hasDocuments, isDemoMode,
  answers, brandingAnswers, uploadedFileIds, onReady,
}: Props) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [checks, setChecks] = useState({ ig: false, web: false, docs: false });
  const [phase, setPhase] = useState<"loading" | "revealing" | "ready">("loading");
  const calledRef = useRef(false);
  const diagnosticDataRef = useRef<DiagnosticData | null>(null);

  // Initialize with loading messages
  useEffect(() => {
    setMessages(buildInitialMessages(hasInstagram, hasWebsite, hasDocuments));
  }, [hasInstagram, hasWebsite, hasDocuments]);

  // Cycle through messages every 2.5s during loading phase
  useEffect(() => {
    if (phase === "ready") return;
    const interval = setInterval(() => {
      setCurrentIdx(prev => {
        const max = messages.length - 1;
        return prev < max ? prev + 1 : max;
      });
    }, phase === "revealing" ? 2000 : 3000);
    return () => clearInterval(interval);
  }, [messages.length, phase]);

  // Animate checkmarks during loading
  useEffect(() => {
    if (phase !== "loading") return;
    const timers = [
      setTimeout(() => hasDocuments && setChecks(c => ({ ...c, docs: true })), 3000),
      setTimeout(() => hasWebsite && setChecks(c => ({ ...c, web: true })), 6000),
      setTimeout(() => hasInstagram && setChecks(c => ({ ...c, ig: true })), 9000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [phase, hasDocuments, hasWebsite, hasInstagram]);

  // Handle reveal phase completion → call onReady
  useEffect(() => {
    if (phase === "revealing" && currentIdx >= messages.length - 1 && diagnosticDataRef.current) {
      const timer = setTimeout(() => {
        setPhase("ready");
        onReady(diagnosticDataRef.current!);
      }, 1500);
      return () => clearTimeout(timer);
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
          },
        };

        const { data, error } = await supabase.functions.invoke("deep-diagnostic", { body });

        if (error || !data) {
          console.warn("Edge function failed, using fallback:", error);
          useFallback();
          return;
        }

        const result = mapEdgeResponseToDiagnostic(data);
        diagnosticDataRef.current = result;
        setChecks({ ig: true, web: true, docs: true });

        // Build reveal messages from real data
        const reveals = buildRevealMessages(data, answers);
        if (reveals.length > 2) {
          // Switch to reveal phase with personalized messages
          setMessages(reveals);
          setCurrentIdx(0);
          setPhase("revealing");
        } else {
          // Not enough data for reveals, just finish
          setTimeout(() => onReady(result), 800);
        }
      } catch (err) {
        console.warn("Deep diagnostic error, using fallback:", err);
        useFallback();
      }
    }

    function useFallback() {
      const data = computeDiagnosticData(answers, brandingAnswers);
      diagnosticDataRef.current = data;
      setChecks({ ig: true, web: true, docs: true });
      setTimeout(() => onReady(data), 1000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getStatus = (key: "ig" | "web" | "docs", has: boolean) => {
    if (!has) return "—";
    return checks[key] ? "✅" : "en cours...";
  };

  const currentMessage = messages[currentIdx] || messages[0];

  return (
    <div className="text-center space-y-10">
      <h1 className="text-2xl md:text-3xl font-display font-bold text-foreground">
        J'analyse ta communication...
      </h1>

      <div className="space-y-3 text-left max-w-xs mx-auto">
        <CheckLine emoji="📱" label="Ton Instagram" status={getStatus("ig", hasInstagram)} />
        <CheckLine emoji="🌐" label="Ton site web" status={getStatus("web", hasWebsite)} />
        <CheckLine emoji="📄" label="Tes documents" status={getStatus("docs", hasDocuments)} />
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

      <div className="flex justify-center gap-1.5">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className="h-2 w-2 rounded-full bg-primary animate-bounce"
            style={{ animationDelay: `${i * 0.16}s` }}
          />
        ))}
      </div>
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
