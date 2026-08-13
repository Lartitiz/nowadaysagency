import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { invokeWithTimeout } from "@/lib/invoke-with-timeout";
import { useProfile } from "@/hooks/use-profile";
import { useEditorialLine } from "@/hooks/use-branding";
import { useQueryClient } from "@tanstack/react-query";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";
import { Loader2, Sparkles, BarChart3, RotateCcw } from "lucide-react";
import AiLoadingIndicator from "@/components/AiLoadingIndicator";
import { useDiagnosticCache } from "@/hooks/use-diagnostic-cache";
import DiagnosticCacheBanner from "@/components/audit/DiagnosticCacheBanner";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import { useNavigate, useSearchParams } from "react-router-dom";
import AuditVisualResult, { type AuditVisualData, type AuditEvolution } from "@/components/audit/AuditVisualResult";
import AuditBioBeforeAfter from "@/components/audit/AuditBioBeforeAfter";
import AuditInputForm, { type AuditFormData } from "@/components/audit/AuditInputForm";
import ContentAnalysisResults from "@/components/audit/ContentAnalysisResults";
import { calculateAuditScore, type ProfileForScore } from "@/lib/audit-score";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import { useUserPlan } from "@/hooks/use-user-plan";
import QuotaExhaustedCard from "@/components/QuotaExhaustedCard";

const AUDIT_LOADING_MESSAGES = [
  { time: 0, text: "📱 Lecture de ton profil..." },
  { time: 4000, text: "📝 Analyse de ta bio et de ton nom..." },
  { time: 8000, text: "🎯 Évaluation de tes highlights et posts épinglés..." },
  { time: 14000, text: "📊 Analyse de ton contenu et de tes performances..." },
  { time: 22000, text: "🧠 Rédaction des recommandations personnalisées..." },
  { time: 30000, text: "⏳ Dernières touches..." },
];
type ViewMode = "hub" | "form" | "results";

export default function InstagramAudit() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const { diagnosticData: diagCache, isRecent: diagIsRecent } = useDiagnosticCache();
  const { canAudit, remainingAudits, plan, isPaid } = useUserPlan();

  const [analyzing, setAnalyzing] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [auditResult, setAuditResult] = useState<any>(null);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [auditDate, setAuditDate] = useState<string | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [previousAudit, setPreviousAudit] = useState<any>(null);
  const { data: profileData } = useProfile();
  const queryClient = useQueryClient();
  const { data: editorialLineData } = useEditorialLine();
  const [liveScore, setLiveScore] = useState<number | null>(null);
  const [hasExistingAudit, setHasExistingAudit] = useState(false);
  const [lastSubmitData, setLastSubmitData] = useState<AuditFormData | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [quotaExhausted, setQuotaExhausted] = useState<{ message?: string } | null>(null);
  // Reprise après un rechargement survenu pendant un audit : "done" = il a abouti
  // côté serveur entre-temps, "interrupted" = il a été coupé, on réinvite à relancer.
  const [resumeNotice, setResumeNotice] = useState<null | "done" | "interrupted">(null);
  // Connexion Instagram : null = statut pas encore connu (l'écran affiche un loader
  // sur la porte « compte connecté » tant qu'on ne sait pas).
  const [igConnected, setIgConnected] = useState<boolean | null>(null);

  // Sait si un compte Instagram est connecté (porte 1 de l'écran d'audit).
  useEffect(() => {
    if (!user) return;
    supabase.functions.invoke("social-status", {
      body: { workspace_id: workspaceId !== user.id ? workspaceId : undefined },
    }).then(({ data }) => {
      const conns = (data as any)?.connections || [];
      setIgConnected(conns.some((c: any) => c.platform === "instagram" && c.connected));
    }).catch(() => setIgConnected(false));
  }, [user?.id, workspaceId]);

  // Récupère profil + statistiques réelles du compte connecté (bio, abonnés,
  // fréquence, top/flop posts). Renvoie l'objet metrics brut, ou null si échec.
  const fetchLiveMetrics = async (): Promise<any | null> => {
    if (!user) return null;
    const { data, error } = await supabase.functions.invoke("instagram-insights-fetch", {
      body: { workspace_id: workspaceId !== user.id ? workspaceId : undefined },
    });
    if (error || !(data as any)?.metrics) {
      const ctxBody = (error as any)?.context?.body;
      const msg = ctxBody?.error || (data as any)?.error || "";
      if (msg.includes("Reconnecte")) {
        toast.error("Reconnexion requise", { description: "Reconnecte ton compte Instagram pour autoriser la lecture de tes statistiques." });
      } else {
        toast.error("Stats indisponibles", { description: msg || "Impossible de récupérer tes statistiques Instagram pour le moment." });
      }
      return null;
    }
    const m = (data as any).metrics;
    if (m.partial) {
      toast("Stats partiellement récupérées", { description: "Certaines métriques manquaient, mais l'essentiel est là." });
    }
    return m;
  };

  // Progressive loading messages during audit
  useEffect(() => {
    if (!analyzing) { setLoadingMsg(""); return; }
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      let msg = AUDIT_LOADING_MESSAGES[0].text;
      for (const lm of AUDIT_LOADING_MESSAGES) {
        if (elapsed >= lm.time) msg = lm.text;
      }
      setLoadingMsg(msg);
    }, 500);
    return () => clearInterval(interval);
  }, [analyzing]);

  // Determine initial view from search params
  const paramView = searchParams.get("view") as ViewMode | null;
  const [view, setView] = useState<ViewMode>(paramView || "hub");

  // Compute live score from profile hook data
  useEffect(() => {
    if (!profileData) return;
    const pfs: ProfileForScore = {
      instagram_display_name: (profileData as any).instagram_display_name,
      instagram_bio: (profileData as any).instagram_bio,
      instagram_bio_link: (profileData as any).instagram_bio_link,
      instagram_photo_description: (profileData as any).instagram_photo_description,
      instagram_photo_url: (profileData as any).instagram_photo_url,
      instagram_highlights: (profileData as any).instagram_highlights as string[] | null,
      instagram_highlights_count: (profileData as any).instagram_highlights_count,
      instagram_pinned_posts: (profileData as any).instagram_pinned_posts as any,
      instagram_pillars: (profileData as any).instagram_pillars as string[] | null,
    };
    setLiveScore(calculateAuditScore(pfs));
  }, [profileData]);

  useEffect(() => {
    if (!user) return;
    (supabase.from("instagram_audit") as any).select("*").eq(column, value).order("created_at", { ascending: false }).limit(2).then(({ data: rows }) => {
      if (rows && rows.length > 0) {
        const latest = rows[0];
        setHasExistingAudit(true);
        if (latest.details || latest.content_analysis) {
          setAuditResult(latest.details || latest);
          setAuditId(latest.id);
          setAuditDate(latest.created_at);
        }
        if (rows.length > 1) setPreviousAudit(rows[1]);
      }

      // Reprise après un rechargement survenu pendant un audit (marqueur posé dans
      // handleSubmit). Si un audit plus récent que le départ existe → il a abouti côté
      // serveur entre-temps, on va aux résultats. Sinon → il a été coupé, on réaffiche
      // le formulaire (déjà pré-rempli depuis le profil) avec une invite à relancer.
      let inProg: { startedAt?: string; userId?: string } | null = null;
      try { const raw = sessionStorage.getItem("ig_audit_in_progress"); if (raw) inProg = JSON.parse(raw); } catch { /* noop */ }
      if (inProg && inProg.userId === user.id) {
        try { sessionStorage.removeItem("ig_audit_in_progress"); } catch { /* noop */ }
        const latestDate = rows?.[0]?.created_at;
        const completedDuringReload = !!(latestDate && inProg.startedAt && new Date(latestDate) > new Date(inProg.startedAt));
        if (completedDuringReload) {
          setResumeNotice("done");
          if (paramView !== "form") setView("results");
        } else {
          setResumeNotice("interrupted");
          if (paramView !== "results") setView("form");
        }
        setLoadingExisting(false);
        return;
      }

      // Auto-navigate based on params or state
      if (paramView === "form" || paramView === "results") {
        setView(paramView);
      } else if (!rows || rows.length === 0) {
        setView("form"); // No audit yet → go straight to form
      }

      setLoadingExisting(false);
    });
  }, [user?.id, column, value]);

  const sanitizeFileName = (fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase() || "png";
    return `upload-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
  };

  const uploadFile = async (file: File, bucket: string, prefix: string) => {
    if (!user) throw new Error("Session expirée");
    const path = `${user.id}/${prefix}-${sanitizeFileName(file.name)}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    // Buckets privés : URL signée (fetchable par l'IA dans son TTL). 1h suffit largement pour l'audit.
    const { data: signed, error: signErr } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    if (signErr || !signed?.signedUrl) throw signErr ?? new Error("Échec de la génération de l'URL signée");
    return signed.signedUrl;
  };

  // liveOverride : stats déjà récupérées lors d'une première tentative — les retries
  // les réutilisent au lieu de re-taper l'API Meta.
  const handleSubmit = async (form: AuditFormData, retryCount = 0, liveOverride?: any) => {
    if (!user) return;

    // Pre-check: block if no audit credits left
    if (!canAudit()) {
      setQuotaExhausted({ message: "" });
      return;
    }

    let live: any = liveOverride ?? null;

    setLastSubmitData(form);
    setLastError(null);
    setQuotaExhausted(null);
    setResumeNotice(null);
    setAnalyzing(true);
    // Marqueur « audit en cours » : permet, après un rechargement pendant les ~3 min
    // d'analyse, de savoir qu'un audit tournait (cf. détection au remontage). Le texte
    // du formulaire n'a pas besoin d'être stocké ici : il est déjà sauvé dans `profiles`
    // plus bas, donc rechargé tel quel par `initialForm`.
    try {
      sessionStorage.setItem("ig_audit_in_progress", JSON.stringify({ startedAt: new Date().toISOString(), userId: user.id }));
    } catch { /* sessionStorage indisponible : non bloquant */ }

    try {
      // Refresh session preemptively to avoid JWT expiry during long audit
      await supabase.auth.refreshSession();

      // 1. Compte connecté : bio, abonnés, stats et top/flop posts viennent de l'API.
      // Un échec ici arrête l'audit (le toast d'explication est déjà affiché) plutôt
      // que de produire un audit vide.
      if (form.mode === "connected" && !live) {
        live = await fetchLiveMetrics();
        if (!live) return;
      }

      // 2. Données du profil pour l'audit : issues de l'API (compte connecté), sinon
      // du @ public — complétées par ce qu'on connaît déjà en base.
      const handle = form.username || undefined;
      const atd: Record<string, any> = form.mode === "connected" ? {
        displayName: live.displayName || profileData?.instagram_display_name || undefined,
        username: live.username || handle || profileData?.instagram_username || undefined,
        bio: live.biography || profileData?.instagram_bio || undefined,
        bioLink: live.website || profileData?.instagram_bio_link || undefined,
        followers: typeof live.followers === "number" ? live.followers : null,
        postsPerMonth: typeof live.postsLast30d === "number" ? live.postsLast30d : null,
        frequency: live.frequencyLabel || profileData?.instagram_frequency || undefined,
        pillars: (profileData?.instagram_pillars as string[] | null) || undefined,
      } : {
        username: handle || profileData?.instagram_username || undefined,
        displayName: profileData?.instagram_display_name || undefined,
        bio: profileData?.instagram_bio || undefined,
        bioLink: profileData?.instagram_bio_link || undefined,
        followers: profileData?.instagram_followers ?? null,
        frequency: profileData?.instagram_frequency || undefined,
        pillars: (profileData?.instagram_pillars as string[] | null) || undefined,
      };

      // 3. Sauvegarde dans le profil : uniquement ce qu'on SAIT — jamais de null qui
      // écraserait une info existante (highlights, piliers… restent intacts).
      const profileUpdate: Record<string, any> = {};
      if (atd.username) profileUpdate.instagram_username = atd.username;
      if (atd.displayName) profileUpdate.instagram_display_name = atd.displayName;
      if (atd.bio) profileUpdate.instagram_bio = atd.bio;
      if (atd.bioLink) profileUpdate.instagram_bio_link = atd.bioLink;
      if (typeof atd.followers === "number") profileUpdate.instagram_followers = atd.followers;
      if (typeof atd.postsPerMonth === "number") profileUpdate.instagram_posts_per_month = atd.postsPerMonth;
      if (atd.frequency) profileUpdate.instagram_frequency = atd.frequency;
      if (form.mode === "connected" && live?.profilePictureUrl) profileUpdate.instagram_photo_url = live.profilePictureUrl;
      if (Object.keys(profileUpdate).length) {
        await (supabase.from("profiles") as any).update(profileUpdate as any).eq(column, value);
        queryClient.invalidateQueries({ queryKey: ["profile"] });
      }

      // 4. Upload des captures facultatives (non bloquant : l'audit tourne sans)
      const screenshotUrls: string[] = [];
      try {
        for (const f of form.profileScreenshots) {
          screenshotUrls.push(await uploadFile(f, "audit-screenshots", "profile"));
        }
      } catch (uploadErr) {
        console.warn("[Audit] Screenshot upload failed, continuing with text data:", uploadErr);
      }

      // 5. Call AI audit (send URLs instead of base64 to avoid memory issues)
      const res = await invokeWithTimeout("audit-instagram-ai", {
        body: {
          screenshotUrls: screenshotUrls.length ? screenshotUrls : undefined,
          auditTextData: atd,
          // Mode « juste le @ » : le serveur va chercher ce que la page publique expose.
          fetchPublicProfile: form.mode === "handle" || undefined,
          // Statistiques réelles (compte connecté) : alimentent le bloc factuel du prompt
          // + les top/flop posts mesurés deviennent les données structurées de l'audit.
          liveMetrics: live || undefined,
          successPostsData: live?.topPosts?.length
            ? live.topPosts.map((p: any) => ({ format: p.format, subject: p.subject, reach: p.reach, likes: p.likes, comments: p.comments, saves: p.saves, shares: p.shares }))
            : undefined,
          failPostsData: live?.flopPosts?.length
            ? live.flopPosts.map((p: any) => ({ format: p.format, subject: p.subject, reach: p.reach, likes: p.likes, comments: p.comments, saves: p.saves, shares: p.shares }))
            : undefined,
          workspace_id: workspaceId !== user.id ? workspaceId : undefined,
        },
      }, 180000);

      // Check for quota limit (403 responses go into res.error with supabase-js)
      if (res.error) {
        const errorMsg = res.error.message || "";
        if (errorMsg.includes("limit_reached") || (res.error as any).context?.body?.error === "limit_reached") {
          setQuotaExhausted({ message: (res.error as any).context?.body?.message || errorMsg });
          setAnalyzing(false);
          return;
        }
        throw new Error(errorMsg);
      }

      // Fallback check in case data contains error
      if (res.data?.error === "limit_reached") {
        setQuotaExhausted({ message: res.data.message || "" });
        setAnalyzing(false);
        return;
      }

      // Check for retryable errors from backend
      if (res.data?.error && res.data?.retryable && retryCount < 1) {
        console.log("[Audit] Retryable error, auto-retrying in 3s...", res.data.error);
        setLoadingMsg("⏳ L'IA met un peu plus de temps que prévu, on réessaie...");
        await new Promise(r => setTimeout(r, 3000));
        return handleSubmit(form, retryCount + 1, live);
      }

      if (res.data?.error && !res.data?.retryable) {
        throw new Error(res.data.error);
      }

      let parsed: any;

      const rawData = res.data;

      if (rawData?.content && typeof rawData.content === "object" && rawData.content.score_global !== undefined) {

        parsed = rawData.content;

      } else if (rawData && typeof rawData === "object" && rawData.score_global !== undefined) {

        parsed = rawData;

      } else {

        const rawContent = typeof rawData?.content === "string" ? rawData.content : (typeof rawData === "string" ? rawData : "");

        const cleaned = rawContent.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();

        

        try {

          parsed = JSON.parse(cleaned);

        } catch {

          const startIdx = cleaned.indexOf("{");

          if (startIdx !== -1) {

            let depth = 0;

            let endIdx = -1;

            for (let i = startIdx; i < cleaned.length; i++) {

              if (cleaned[i] === "{") depth++;

              else if (cleaned[i] === "}") { depth--; if (depth === 0) { endIdx = i; break; } }

            }

            if (endIdx !== -1) {

              try {

                parsed = JSON.parse(cleaned.substring(startIdx, endIdx + 1));

              } catch (innerErr) {

                console.error("JSON extraction failed:", cleaned.substring(0, 500));

                throw new Error("Format de réponse inattendu");

              }

            } else {

              console.error("Unbalanced JSON. Content preview:", cleaned.substring(0, 500));

              throw new Error("Format de réponse inattendu");

            }

          } else {

            console.error("No JSON found. Raw content:", cleaned.substring(0, 500));

            throw new Error("Format de réponse inattendu");

          }

        }

      }

      if (!parsed || typeof parsed !== "object" || parsed.score_global === undefined) {

        console.error("Invalid audit object:", JSON.stringify(parsed).substring(0, 500));

        throw new Error("Format de réponse inattendu");

      }

      // 5. Sauvegarde de l'audit.
      // Chemin principal : l'edge function l'a déjà inséré côté serveur et nous a
      // renvoyé son id (survit à un rechargement pendant l'analyse). On ne refait
      // l'insert côté client QUE si la sauvegarde serveur a échoué (fallback).
      let newAuditId: string | null = res.data?.auditId ?? null;
      let newAuditDate: string | null = res.data?.auditDate ?? null;

      if (!newAuditId) {
        const { data: insertData } = await supabase.from("instagram_audit").insert({
          user_id: user.id, workspace_id: workspaceId !== user.id ? workspaceId : undefined,
          score_global: parsed.score_global,
          score_nom: parsed.sections?.nom?.score ?? parsed.visual_audit?.elements?.find((e: any) => e.element === "nom")?.score ?? 0,
          score_bio: parsed.sections?.bio?.score ?? parsed.visual_audit?.elements?.find((e: any) => e.element === "bio")?.score ?? 0,
          score_stories: parsed.sections?.stories?.score ?? parsed.visual_audit?.elements?.find((e: any) => e.element === "highlights")?.score ?? 0,
          score_epingles: parsed.sections?.epingles?.score ?? parsed.visual_audit?.elements?.find((e: any) => e.element === "posts_epingles")?.score ?? 0,
          score_feed: parsed.sections?.feed?.score ?? parsed.visual_audit?.elements?.find((e: any) => e.element === "feed")?.score ?? 0,
          score_edito: parsed.sections?.edito?.score ?? 0,
          resume: parsed.resume,
          details: parsed,
          posts_analysis: parsed.posts_analysis || null,
          profile_url: null,
        } as any).select("id, created_at").single();
        newAuditId = insertData?.id ?? null;
        newAuditDate = (insertData as any)?.created_at ?? null;
      }

      if (newAuditId) setAuditId(newAuditId);
      setAuditDate(newAuditDate || new Date().toISOString());
      setAuditResult(parsed);
      setHasExistingAudit(true);
      setView("results");
      toast.success("Audit terminé !");
    } catch (e: any) {
      console.error("Erreur technique:", e);
      const errStr = e?.message || String(e);

      // Quota errors (ne PAS matcher "timeout limit" → on exige "limite"/"limit_reached", pas le bare "limit")
      if (/quota|crédit|limit_reached|limite/i.test(errStr)) {
        setQuotaExhausted({ message: "" });
        setAnalyzing(false);
        return;
      }

      // Auto-retry on transient errors (timeout, overload)
      const isTransient = /surchargée|trop de temps|timeout|abort|504|503|529|429/i.test(errStr);
      if (isTransient && retryCount < 1) {
        console.log("[Audit] Transient error, auto-retrying in 3s...", errStr);
        setLoadingMsg("⏳ L'IA met un peu plus de temps que prévu, on réessaie...");
        await new Promise(r => setTimeout(r, 3000));
        return handleSubmit(form, retryCount + 1, live);
      }

      // Contextual error messages
      let msg: string;
      if (/surchargée|429|529|overload/i.test(errStr)) {
        msg = "L'IA est surchargée, réessaie dans 2 minutes.";
      } else if (/timeout|abort|trop de temps|504/i.test(errStr)) {
        msg = "Le traitement a pris trop de temps, réessaie.";
      } else if (/auth|session|401|expir/i.test(errStr)) {
        msg = "Ta session a expiré, reconnecte-toi.";
      } else {
        msg = friendlyError(e);
      }
      setLastError(msg);
      toast.error("Erreur", { description: msg });
    } finally {
      setAnalyzing(false);
      // L'audit est retombé (succès, erreur ou quota) : on retire le marqueur. S'il
      // restait posé, c'est qu'un rechargement a coupé l'await → détecté au remontage.
      try { sessionStorage.removeItem("ig_audit_in_progress"); } catch { /* noop */ }
    }
  };

  const handleAdoptBio = async (bio: string) => {
    if (!user) return;
    try {
      await (supabase.from("profiles") as any).update({
        instagram_bio: bio,
        validated_bio: bio,
        validated_bio_at: new Date().toISOString(),
      } as any).eq(column, value);
      queryClient.invalidateQueries({ queryKey: ["profile"] });

      await supabase.from("audit_validations").upsert({
        user_id: user.id,
        section: "bio",
        status: "validated",
        validated_at: new Date().toISOString(),
        validated_content: { bio },
      }, { onConflict: "user_id,section" });

      toast.success("✅ Bio adoptée et sauvegardée !");
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast.error("Erreur", { description: friendlyError(e) });
    }
  };

  const handleSaveToEditorial = async () => {
    if (!user || !auditResult?.editorial_recommendations) return;
    try {
      const insights = {
        best_format: auditResult.editorial_recommendations.best_format,
        best_angle: auditResult.editorial_recommendations.best_angle,
        best_content_types: auditResult.editorial_recommendations.best_content_types,
        worst_content_types: auditResult.editorial_recommendations.worst_content_types,
        recommended_mix: auditResult.editorial_recommendations.recommended_mix,
        combo_gagnant: auditResult.combo_gagnant,
        analyzed_at: new Date().toISOString(),
      };
      const existing = editorialLineData;
      if (existing) {
        await (supabase.from("instagram_editorial_line") as any).update({ content_insights: insights }).eq("id", existing.id);
      } else {
        await supabase.from("instagram_editorial_line").insert({ user_id: user.id, content_insights: insights, workspace_id: workspaceId !== user.id ? workspaceId : undefined } as any);
      }
      queryClient.invalidateQueries({ queryKey: ["editorial-line"] });
      toast.success("Insights sauvegardés dans ta ligne éditoriale !");
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast.error("Erreur", { description: friendlyError(e) });
    }
  };

  // ── Build visual data ──
  const buildVisualData = (): AuditVisualData | null => {
    if (!auditResult?.visual_audit) return null;
    const va = auditResult.visual_audit;
    const elements = (va.elements || []).map((el: any) => ({
      ...el,
      link_to: el.element === "highlights" ? "/instagram/profil/stories" : el.element === "posts_epingles" ? "/instagram/profil/epingles" : el.element === "bio" ? "/instagram/profil/bio" : el.element === "nom" ? "/instagram/profil/nom" : el.element === "feed" ? "/instagram/profil/feed" : undefined,
      link_label: el.element === "highlights" ? "📖 Module highlights" : el.element === "posts_epingles" ? "📌 Choisir mes posts" : el.element === "bio" ? "✏️ Générer ma bio" : el.element === "nom" ? "✏️ Optimiser mon nom" : el.element === "feed" ? "🎨 Recommandations" : undefined,
    }));
    return {
      score_global: auditResult.score_global || va.score_global || 0,
      elements,
      priorite_1: va.priorite_1,
      resume: va.resume || { ok_count: 0, improve_count: 0, critical_count: 0 },
    };
  };

  const buildEvolution = (): AuditEvolution | null => {
    if (!previousAudit || !auditResult) return null;
    const prevDetails = previousAudit.details as any;
    const prevVisual = prevDetails?.visual_audit;
    if (!prevVisual?.elements) return null;
    const currentElements = auditResult.visual_audit?.elements || [];
    const prevElements = prevVisual.elements || [];
    const statusLabel = (s: string) => s === "ok" ? "🟢" : s === "improve" ? "🟡" : "🔴";
    const improved: AuditEvolution["improved"] = [];
    const unchanged: AuditEvolution["unchanged"] = [];
    for (const cur of currentElements) {
      const prev = prevElements.find((p: any) => p.element === cur.element);
      if (!prev) continue;
      if (prev.status !== cur.status) {
        const order = { critical: 0, improve: 1, ok: 2 };
        if ((order[cur.status as keyof typeof order] || 0) > (order[prev.status as keyof typeof order] || 0)) {
          improved.push({ label: cur.label, from: statusLabel(prev.status), to: statusLabel(cur.status) });
        }
      } else {
        unchanged.push({ label: cur.label, status: statusLabel(cur.status) });
      }
    }
    return { previous_score: prevDetails?.score_global || previousAudit.score_global || 0, current_score: auditResult.score_global || 0, previous_date: previousAudit.created_at, improved, unchanged };
  };

  // ── Loading ──
  if (loadingExisting) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // HUB VIEW — shows score + 2 buttons
  // ══════════════════════════════════════════════
  if (view === "hub" && hasExistingAudit) {
    const score = auditResult?.score_global ?? null;
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
          <SubPageHeader parentLabel="Mon profil" parentTo="/instagram/profil" currentLabel="Audit" useFromParam />
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-2">🔍 Audit de ton profil Instagram</h1>

          <div className="rounded-2xl border border-border bg-card p-6 mt-6">
            {score !== null && (
              <div className="text-center mb-4">
                <p className="text-5xl font-display font-bold text-foreground">{score}<span className="text-2xl text-muted-foreground">/100</span></p>
              </div>
            )}
            {auditDate && (
              <p className="text-center text-xs text-muted-foreground mb-6">
                Dernier audit : {new Date(auditDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            )}

            {liveScore !== null && score !== null && liveScore > score && (
              <div className="rounded-xl border border-success/30 bg-success-bg/50 p-3 mb-4">
                <p className="text-sm text-foreground">
                  📈 Tu as amélioré des éléments. Score estimé : <strong>{score}</strong> → <strong>{liveScore}</strong>
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-3 justify-center">
              <Button onClick={() => setView("results")} className="rounded-pill gap-2">
                <BarChart3 className="h-4 w-4" />
                📊 Voir mes résultats
              </Button>
              <Button variant="outline" onClick={() => setView("form")} className="rounded-pill gap-2">
                <RotateCcw className="h-4 w-4" />
                🔄 Refaire l'audit
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // RESULTS VIEW
  // ══════════════════════════════════════════════
  if (view === "results" && auditResult) {
    const visualData = buildVisualData();
    const evolution = buildEvolution();
    const bioElement = auditResult.visual_audit?.elements?.find((e: any) => e.element === "bio");

    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
          <SubPageHeader parentLabel="Mon profil" parentTo="/instagram/profil" currentLabel="Résultats audit" useFromParam />
          <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
            <h1 className="font-display text-3xl font-bold text-foreground">🔍 Résultat de ton audit</h1>
            {auditDate && (
              <span className="text-xs text-muted-foreground">
                {new Date(auditDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            )}
          </div>

          {resumeNotice === "done" && (
            <div className="rounded-2xl border border-success/40 bg-success-bg/60 p-4 mb-6">
              <p className="text-sm text-foreground">
                ✅ Ton audit a bien abouti pendant le rechargement de la page — le voici.
              </p>
            </div>
          )}

          {liveScore !== null && auditResult.score_global && liveScore > auditResult.score_global && (
            <div className="rounded-2xl border border-border bg-success-bg/50 p-4 mb-6">
              <p className="text-sm text-foreground">
                📈 Tu as amélioré des éléments depuis cet audit. Ton score estimé est passé de <strong>{auditResult.score_global}</strong> à <strong>{liveScore}</strong>.
              </p>
              <Button variant="outline" size="sm" className="rounded-pill mt-2 gap-1.5" onClick={() => setView("form")}>
                🔍 Relancer l'audit complet
              </Button>
            </div>
          )}

          {visualData && (
            <>
              <AuditVisualResult data={visualData} evolution={evolution} onRegenerate={() => setView("form")} />
              <AiGeneratedMention />
            </>
          )}

          {bioElement && bioElement.lignes && (
            <div className="mt-6 rounded-2xl border border-border bg-card p-5 space-y-4">
              <h3 className="font-display text-base font-bold text-foreground">📝 Détail de ta bio</h3>
              <AuditBioBeforeAfter
                currentBio={bioElement.current || profileData?.instagram_bio || ""}
                lignes={bioElement.lignes}
                proposedBio={bioElement.proposition || ""}
                onAdoptBio={handleAdoptBio}
              />
            </div>
          )}



          {(auditResult.content_analysis || auditResult.content_dna) && (
            <div className="mt-8">
              <ContentAnalysisResults
                contentAnalysis={auditResult.content_analysis}
                contentDna={auditResult.content_dna}
                comboGagnant={auditResult.combo_gagnant}
                editorialRecommendations={auditResult.editorial_recommendations}
                onSaveToEditorial={handleSaveToEditorial}
              />
            </div>
          )}


          {/* Red flags checker */}
          <div className="mt-6">
            <RedFlagsChecker
              content={[
                auditResult.visual_audit?.elements?.map((e: any) => e.proposition || e.feedback || "").join("\n"),
                auditResult.posts_analysis?.recommendation,
              ].filter(Boolean).join("\n\n")}
              onFix={() => {}}
            />
          </div>

          <div className="flex flex-wrap gap-3 mt-8">
            <Button variant="outline" onClick={() => setView("form")} className="rounded-pill gap-2">
              🔄 Refaire l'audit
            </Button>
            <Button onClick={() => navigate("/instagram/profil")} className="rounded-pill gap-2">
              👤 Voir mon profil
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // ══════════════════════════════════════════════
  // FORM VIEW — écran « deux portes » (connexion ou @)
  // ══════════════════════════════════════════════
  const showDiagBanner = !hasExistingAudit && diagIsRecent && diagCache && diagCache.scores?.instagram != null;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Mon profil" parentTo="/instagram/profil" currentLabel={hasExistingAudit ? "Refaire l'audit" : "Audit"} useFromParam />
        <h1 className="font-display text-3xl font-bold text-foreground">
          {hasExistingAudit ? "🔄 Refaire l'audit" : "🔍 Audit de ton profil Instagram"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground italic mb-8">
          {hasExistingAudit
            ? "Relance l'analyse : tout est récupéré automatiquement."
            : "Rien à recopier : connecte ton compte ou donne ton @, on analyse tout et on te donne un score avec des recommandations concrètes."}
        </p>
        {(quotaExhausted || !canAudit()) && !analyzing && (
          <QuotaExhaustedCard
            category="audits"
            renewalMessage={quotaExhausted?.message || undefined}
            plan={plan}
          />
        )}
        {showDiagBanner && (
          <div className="mb-6">
            <DiagnosticCacheBanner diagnosticData={diagCache} domain="instagram" onRelaunch={() => {}} />
          </div>
        )}
        {resumeNotice === "interrupted" && !analyzing && (
          <div className="rounded-2xl border border-warning/40 bg-warning-bg/60 p-4 mb-6">
            <p className="text-sm text-foreground">
              ⏸️ Ton audit a été interrompu par un rechargement de la page. Relance l'analyse —
              s'il a malgré tout abouti, il apparaîtra dans tes résultats.
            </p>
          </div>
        )}
        {lastError && !analyzing && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 mb-6">
            <p className="text-sm text-foreground mb-3">😕 {lastError}</p>
            {lastSubmitData && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-full gap-2"
                onClick={() => handleSubmit(lastSubmitData)}
              >
                🔄 Réessayer avec les mêmes données
              </Button>
            )}
          </div>
        )}
{analyzing && (
          <div className="space-y-4">
            <AiLoadingIndicator context="audit" isLoading={analyzing} />
            {loadingMsg && (
              <p className="text-sm text-muted-foreground text-center animate-pulse">{loadingMsg}</p>
            )}
          </div>
        )}
        <div className={analyzing ? "hidden" : ""}>
          <AuditInputForm
            initialUsername={profileData?.instagram_username || ""}
            onSubmit={handleSubmit}
            loading={analyzing}
            isRedo={hasExistingAudit}
            instagramConnected={igConnected}
          />
        </div>
      </main>
    </div>
  );
}
