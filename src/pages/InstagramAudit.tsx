import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { Loader2, Sparkles, BarChart3, RotateCcw } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AuditVisualResult, { type AuditVisualData, type AuditEvolution } from "@/components/audit/AuditVisualResult";
import AuditBioBeforeAfter from "@/components/audit/AuditBioBeforeAfter";
import AuditInputForm, { type AuditFormData } from "@/components/audit/AuditInputForm";
import ContentAnalysisResults from "@/components/audit/ContentAnalysisResults";
import { calculateAuditScore, type ProfileForScore } from "@/lib/audit-score";

type ViewMode = "hub" | "form" | "results";

export default function InstagramAudit() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();

  const [analyzing, setAnalyzing] = useState(false);
  const [auditResult, setAuditResult] = useState<any>(null);
  const [auditId, setAuditId] = useState<string | null>(null);
  const [auditDate, setAuditDate] = useState<string | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(true);
  const [previousAudit, setPreviousAudit] = useState<any>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [liveScore, setLiveScore] = useState<number | null>(null);
  const [hasExistingAudit, setHasExistingAudit] = useState(false);

  // Determine initial view from search params
  const paramView = searchParams.get("view") as ViewMode | null;
  const [view, setView] = useState<ViewMode>(paramView || "hub");

  useEffect(() => {
    if (!user) return;
    Promise.all([
      (supabase.from("instagram_audit") as any).select("*").eq(column, value).order("created_at", { ascending: false }).limit(2),
      supabase.from("profiles").select("instagram_display_name, instagram_username, instagram_bio, instagram_bio_link, instagram_photo_description, instagram_photo_url, instagram_highlights, instagram_highlights_count, instagram_pinned_posts, instagram_feed_description, instagram_followers, instagram_posts_per_month, instagram_frequency, instagram_pillars").eq("user_id", user.id).maybeSingle(),
    ]).then(([{ data: rows }, { data: profile }]) => {
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
      if (profile) {
        setProfileData(profile);
        const pfs: ProfileForScore = {
          instagram_display_name: profile.instagram_display_name,
          instagram_bio: profile.instagram_bio,
          instagram_bio_link: profile.instagram_bio_link,
          instagram_photo_description: profile.instagram_photo_description,
          instagram_photo_url: profile.instagram_photo_url,
          instagram_highlights: profile.instagram_highlights as string[] | null,
          instagram_highlights_count: profile.instagram_highlights_count,
          instagram_pinned_posts: profile.instagram_pinned_posts as any,
          instagram_pillars: profile.instagram_pillars as string[] | null,
        };
        setLiveScore(calculateAuditScore(pfs));
      }

      // Auto-navigate based on params or state
      if (paramView === "form" || paramView === "results") {
        setView(paramView);
      } else if (!rows || rows.length === 0) {
        setView("form"); // No audit yet → go straight to form
      }

      setLoadingExisting(false);
    });
  }, [user?.id]);

  const sanitizeFileName = (fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase() || "png";
    return `upload-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${ext}`;
  };

  const uploadFile = async (file: File, bucket: string, prefix: string) => {
    const path = `${user!.id}/${prefix}-${sanitizeFileName(file.name)}`;
    const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    // For private buckets, create a signed URL (1 hour expiry)
    const { data: signedData } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    if (signedData?.signedUrl) return signedData.signedUrl;
    // Fallback to public URL for public buckets
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  };

  const handleSubmit = async (form: AuditFormData) => {
    if (!user) return;
    setAnalyzing(true);

    try {
      // 1. Save profile data
      const highlightsArray = form.highlights ? form.highlights.split(",").map((s) => s.trim()).filter(Boolean) : [];
      const pinnedPosts = [form.pinnedPost1, form.pinnedPost2, form.pinnedPost3].filter(Boolean).map((d) => ({ description: d }));
      const pillarsArray = form.pillars ? form.pillars.split(",").map((s) => s.trim()).filter(Boolean) : [];

      await supabase.from("profiles").update({
        instagram_display_name: form.displayName || null,
        instagram_username: form.username || null,
        instagram_bio: form.bio || null,
        instagram_bio_link: form.bioLink || null,
        instagram_photo_description: form.photoDescription || null,
        instagram_highlights: highlightsArray.length ? highlightsArray : null,
        instagram_highlights_count: form.highlightsCount ? parseInt(form.highlightsCount) : highlightsArray.length || null,
        instagram_pinned_posts: pinnedPosts.length ? pinnedPosts : null,
        instagram_feed_description: form.feedDescription || null,
        instagram_followers: form.followers ? parseInt(form.followers) : null,
        instagram_posts_per_month: form.postsPerMonth ? parseInt(form.postsPerMonth) : null,
        instagram_frequency: form.frequency || null,
        instagram_pillars: pillarsArray.length ? pillarsArray : null,
      } as any).eq("user_id", user.id);

      // 2. Upload screenshots
      const screenshotUrls: string[] = [];
      for (const f of form.profileScreenshots) {
        screenshotUrls.push(await uploadFile(f, "audit-screenshots", "profile"));
      }
      if (form.feedScreenshot) screenshotUrls.push(await uploadFile(form.feedScreenshot, "audit-screenshots", "feed"));
      if (form.highlightsScreenshot) screenshotUrls.push(await uploadFile(form.highlightsScreenshot, "audit-screenshots", "highlights"));

      // 3. Upload best/worst post files
      const bestPostUrls: string[] = [];
      for (const f of form.bestPostFiles) {
        bestPostUrls.push(await uploadFile(f, "audit-posts", "best"));
      }
      const worstPostUrls: string[] = [];
      for (const f of form.worstPostFiles) {
        worstPostUrls.push(await uploadFile(f, "audit-posts", "worst"));
      }

      // 4. Call AI audit
      const allScreenshots = [
        ...screenshotUrls,
        ...bestPostUrls.map(url => url),
        ...worstPostUrls.map(url => url),
      ];

      const res = await supabase.functions.invoke("generate-content", {
        body: {
          type: "instagram-audit",
          profile: {},
          screenshots: allScreenshots.length ? allScreenshots : undefined,
          auditTextData: {
            displayName: form.displayName,
            username: form.username,
            bio: form.bio,
            bioLink: form.bioLink,
            photoDescription: form.photoDescription,
            highlights: highlightsArray,
            highlightsCount: form.highlightsCount ? parseInt(form.highlightsCount) : highlightsArray.length,
            pinnedPosts,
            feedDescription: form.feedDescription,
            followers: form.followers ? parseInt(form.followers) : null,
            postsPerMonth: form.postsPerMonth ? parseInt(form.postsPerMonth) : null,
            frequency: form.frequency,
            pillars: pillarsArray,
            bestPostUrls,
            worstPostUrls,
            bestPostsComment: form.bestPostsComment || null,
            worstPostsComment: form.worstPostsComment || null,
          },
        },
      });

      if (res.error) throw new Error(res.error.message);

      let parsed: any;
      const content = res.data?.content || "";
      try {
        parsed = JSON.parse(content);
      } catch {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error("Format de réponse inattendu");
      }

      // 5. Save audit to DB
      const bestPostsJson = bestPostUrls.map((url, i) => ({ image_url: url, comment: i === 0 ? form.bestPostsComment : null }));
      const worstPostsJson = worstPostUrls.map((url, i) => ({ image_url: url, comment: i === 0 ? form.worstPostsComment : null }));

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
        best_posts: bestPostsJson.length ? bestPostsJson : null,
        worst_posts: worstPostsJson.length ? worstPostsJson : null,
        best_posts_comment: form.bestPostsComment || null,
        worst_posts_comment: form.worstPostsComment || null,
        posts_analysis: parsed.posts_analysis || null,
        profile_url: null,
      } as any).select("id").single();

      if (insertData) setAuditId(insertData.id);
      setAuditDate(new Date().toISOString());
      setAuditResult(parsed);
      setHasExistingAudit(true);
      setView("results");
      toast({ title: "Audit terminé !" });
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  const handleAdoptBio = async (bio: string) => {
    if (!user) return;
    try {
      await supabase.from("profiles").update({
        instagram_bio: bio,
        validated_bio: bio,
        validated_bio_at: new Date().toISOString(),
      } as any).eq("user_id", user.id);

      await supabase.from("audit_validations").upsert({
        user_id: user.id,
        section: "bio",
        status: "validated",
        validated_at: new Date().toISOString(),
        validated_content: { bio },
      }, { onConflict: "user_id,section" });

      toast({ title: "✅ Bio adoptée et sauvegardée !" });
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" });
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
      const { data: existing } = await (supabase.from("instagram_editorial_line") as any).select("id").eq(column, value).maybeSingle();
      if (existing) {
        await (supabase.from("instagram_editorial_line") as any).update({ content_insights: insights }).eq(column, value);
      } else {
        await supabase.from("instagram_editorial_line").insert({ user_id: user.id, content_insights: insights, workspace_id: workspaceId !== user.id ? workspaceId : undefined } as any);
      }
      toast({ title: "Insights sauvegardés dans ta ligne éditoriale !" });
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" });
    }
  };

  // ── Build visual data ──
  const buildVisualData = (): AuditVisualData | null => {
    if (!auditResult?.visual_audit) return null;
    const va = auditResult.visual_audit;
    const elements = (va.elements || []).map((el: any) => ({
      ...el,
      link_to: el.element === "highlights" ? "/instagram/profil/stories" : el.element === "posts_epingles" ? "/instagram/profil/epingles" : el.element === "bio" ? "/instagram/profil/bio" : el.element === "nom" ? "/instagram/profil/nom" : el.element === "feed" ? "/instagram/profil/feed" : undefined,
      link_label: el.element === "highlights" ? "📖 Module highlights" : el.element === "posts_epingles" ? "📌 Choisir mes posts" : el.element === "bio" ? "✏️ Créer ma bio" : el.element === "nom" ? "✏️ Optimiser mon nom" : el.element === "feed" ? "🎨 Recommandations" : undefined,
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
    return { previous_score: prevDetails?.score_global || previousAudit.score_global || 0, previous_date: previousAudit.created_at, improved, unchanged };
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
          <h1 className="font-display text-[26px] font-bold text-foreground mb-2">🔍 Audit de ton profil Instagram</h1>

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
              <div className="rounded-xl border border-green-200 bg-green-50/50 dark:bg-green-950/20 p-3 mb-4">
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
            <h1 className="font-display text-[26px] font-bold text-foreground">🔍 Résultat de ton audit</h1>
            {auditDate && (
              <span className="text-xs text-muted-foreground">
                {new Date(auditDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
              </span>
            )}
          </div>

          {liveScore !== null && auditResult.score_global && liveScore > auditResult.score_global && (
            <div className="rounded-2xl border border-border bg-green-50/50 dark:bg-green-950/20 p-4 mb-6">
              <p className="text-sm text-foreground">
                📈 Tu as amélioré des éléments depuis cet audit. Ton score estimé est passé de <strong>{auditResult.score_global}</strong> à <strong>{liveScore}</strong>.
              </p>
              <Button variant="outline" size="sm" className="rounded-pill mt-2 gap-1.5" onClick={() => setView("form")}>
                🔍 Relancer l'audit complet
              </Button>
            </div>
          )}

          {visualData && (
            <AuditVisualResult data={visualData} evolution={evolution} onRegenerate={() => setView("form")} />
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

          {/* Posts analysis section */}
          {auditResult.posts_analysis && (
            <div className="mt-8 space-y-4">
              <h2 className="font-display text-lg font-bold text-foreground">📊 Analyse de tes posts</h2>

              {auditResult.posts_analysis.best_posts_analysis && (
                <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                  <h3 className="text-sm font-bold text-foreground">🟢 Ce qui marche</h3>
                  {(auditResult.posts_analysis.best_posts_analysis as any[]).map((p: any, i: number) => (
                    <div key={i} className="flex gap-3 items-start">
                      {p.image_url && <img src={p.image_url} alt="Aperçu du post Instagram" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />}
                      <div>
                        <p className="text-sm font-medium text-foreground">{p.title || `Post ${i + 1}`}</p>
                        {p.metrics && <p className="text-xs text-muted-foreground">{p.metrics}</p>}
                        <p className="text-sm text-foreground/80 mt-1">✅ {p.analysis}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {auditResult.posts_analysis.worst_posts_analysis && (
                <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                  <h3 className="text-sm font-bold text-foreground">🔴 Ce qui marche moins</h3>
                  {(auditResult.posts_analysis.worst_posts_analysis as any[]).map((p: any, i: number) => (
                    <div key={i} className="flex gap-3 items-start">
                      {p.image_url && <img src={p.image_url} alt="Aperçu du post Instagram" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />}
                      <div>
                        <p className="text-sm font-medium text-foreground">{p.title || `Post ${i + 1}`}</p>
                        {p.metrics && <p className="text-xs text-muted-foreground">{p.metrics}</p>}
                        <p className="text-sm text-foreground/80 mt-1">⚠️ {p.analysis}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {auditResult.posts_analysis.patterns && (
                <div className="rounded-2xl border border-border bg-card p-5 space-y-2">
                  <h3 className="text-sm font-bold text-foreground">🎯 Patterns identifiés</h3>
                  {(auditResult.posts_analysis.patterns as string[]).map((p: string, i: number) => (
                    <p key={i} className="text-sm text-foreground">{i + 1}. {p}</p>
                  ))}
                </div>
              )}

              {auditResult.posts_analysis.recommendation && (
                <div className="rounded-2xl border border-primary/30 bg-rose-pale p-5 space-y-2">
                  <h3 className="text-sm font-bold text-foreground">💡 Recommandation contenu</h3>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{auditResult.posts_analysis.recommendation}</p>
                </div>
              )}
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
  // FORM VIEW — input form (pre-filled if redo)
  // ══════════════════════════════════════════════
  const initialForm: Partial<AuditFormData> = profileData ? {
    displayName: profileData.instagram_display_name || "",
    username: profileData.instagram_username || "",
    bio: profileData.instagram_bio || "",
    bioLink: profileData.instagram_bio_link || "",
    photoDescription: profileData.instagram_photo_description || "",
    highlights: (profileData.instagram_highlights as string[] || []).join(", "),
    highlightsCount: profileData.instagram_highlights_count?.toString() || "",
    hasPinned: profileData.instagram_pinned_posts ? true : null,
    pinnedPost1: (profileData.instagram_pinned_posts as any)?.[0]?.description || "",
    pinnedPost2: (profileData.instagram_pinned_posts as any)?.[1]?.description || "",
    pinnedPost3: (profileData.instagram_pinned_posts as any)?.[2]?.description || "",
    feedDescription: profileData.instagram_feed_description || "",
    followers: profileData.instagram_followers?.toString() || "",
    postsPerMonth: profileData.instagram_posts_per_month?.toString() || "",
    frequency: profileData.instagram_frequency || "",
    pillars: (profileData.instagram_pillars as string[] || []).join(", "),
  } : undefined;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Mon profil" parentTo="/instagram/profil" currentLabel={hasExistingAudit ? "Refaire l'audit" : "Audit"} useFromParam />
        <h1 className="font-display text-[26px] font-bold text-foreground">
          {hasExistingAudit ? "🔄 Refaire l'audit" : "🔍 Audit de ton profil Instagram"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground italic mb-8">
          {hasExistingAudit
            ? "Mets à jour tes infos et relance l'analyse IA."
            : "Remplis les infos de ton profil. L'IA analyse tout et te donne un score avec des recommandations concrètes."}
        </p>
        <AuditInputForm initial={initialForm} onSubmit={handleSubmit} loading={analyzing} isRedo={hasExistingAudit} />
      </main>
    </div>
  );
}
