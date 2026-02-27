import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { type DiagnosticData, computeDiagnosticData, DEMO_DIAGNOSTIC } from "@/lib/diagnostic-data";

interface Props {
  hasInstagram: boolean;
  hasWebsite: boolean;
  hasDocuments: boolean;
  isDemoMode: boolean;
  answers: { canaux: string[]; instagram: string; website: string; activite?: string; activity_type?: string; objectif?: string; blocage?: string; temps?: string };
  brandingAnswers: {
    positioning: string; mission: string; target_description: string;
    tone_keywords: string[]; offers: { name: string; price?: string; description?: string }[]; values: string[];
  };
  uploadedFileIds?: string[];
  onReady: (data: DiagnosticData) => void;
}

interface ProgressMessage {
  text: string;
  delay: number;
}

function buildProgressMessages(hasInstagram: boolean, hasWebsite: boolean, hasDocuments: boolean): ProgressMessage[] {
  const msgs: ProgressMessage[] = [];
  if (hasInstagram) msgs.push({ text: "J'analyse ton profil Instagram...", delay: 2000 });
  if (hasWebsite) msgs.push({ text: "Je lis les pages de ton site...", delay: 5000 });
  if (hasDocuments) msgs.push({ text: "Je parcours tes documents...", delay: 8000 });
  msgs.push({ text: "Je prépare ton diagnostic personnalisé...", delay: 12000 });
  msgs.push({ text: "Encore un instant, j'affine mes recommandations...", delay: 20000 });
  return msgs;
}

export default function DiagnosticLoading({
  hasInstagram, hasWebsite, hasDocuments, isDemoMode,
  answers, brandingAnswers, uploadedFileIds, onReady,
}: Props) {
  const { user } = useAuth();
  const [currentMessage, setCurrentMessage] = useState("J'analyse ta communication...");
  const [checks, setChecks] = useState({ ig: false, web: false, docs: false });
  const calledRef = useRef(false);

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

    // Smart progress messages
    const progressMsgs = buildProgressMessages(hasInstagram, hasWebsite, hasDocuments);
    const msgTimers = progressMsgs.map(m =>
      setTimeout(() => setCurrentMessage(m.text), m.delay)
    );

    // Check animations
    const checkTimers = [
      setTimeout(() => setChecks(c => ({ ...c, docs: true })), 3000),
      setTimeout(() => setChecks(c => ({ ...c, web: true })), 6000),
      setTimeout(() => setChecks(c => ({ ...c, ig: true })), 9000),
    ];

    // Call edge function
    callDeepDiagnostic();

    async function callDeepDiagnostic() {
      try {
        const body = {
          userId: user?.id,
          websiteUrl: answers.website || null,
          instagramHandle: answers.instagram || null,
          linkedinUrl: null, // Will be added in batch 3
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
          },
        };

        const { data, error } = await supabase.functions.invoke("deep-diagnostic", { body });

        if (error || !data) {
          console.warn("Edge function failed, using fallback:", error);
          useFallback();
          return;
        }

        // Map edge function response to DiagnosticData
        const result = mapEdgeResponseToDiagnostic(data);

        // Mark all checks as done
        setChecks({ ig: true, web: true, docs: true });
        // Small delay for animation
        setTimeout(() => onReady(result), 500);
      } catch (err) {
        console.warn("Deep diagnostic error, using fallback:", err);
        useFallback();
      }
    }

    function useFallback() {
      const data = computeDiagnosticData(answers, brandingAnswers);
      setChecks({ ig: true, web: true, docs: true });
      setTimeout(() => onReady(data), 1000);
    }

    return () => {
      msgTimers.forEach(clearTimeout);
      checkTimers.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getStatus = (key: "ig" | "web" | "docs", has: boolean) => {
    if (!has) return "—";
    return checks[key] ? "✅" : "en cours...";
  };

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

      <AnimatePresence mode="wait">
        <motion.p
          key={currentMessage}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          className="text-sm text-muted-foreground italic"
        >
          {currentMessage}
        </motion.p>
      </AnimatePresence>

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
  const analysis = data.analysis || data;

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
    { emoji: "🎨", label: "Branding", score: scores.branding ?? null },
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
