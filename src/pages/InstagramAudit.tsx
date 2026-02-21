import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Upload, X, Loader2, Mic, MicOff, Save } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import ContentAnalysisResults from "@/components/audit/ContentAnalysisResults";

const RHYTHM_OPTIONS = ["Tous les jours", "3-4x/semaine", "1-2x/semaine", "Moins d'1x/semaine", "Irrégulier"];
const OBJECTIVE_OPTIONS = ["Vendre", "Me faire connaître", "Créer une communauté", "Rediriger vers mon site", "Trouver des partenaires"];
const FORMAT_OPTIONS = ["Carrousel", "Reel", "Post photo", "Story", "Vidéo", "Autre"];
const CONTENT_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

// ── Per-post metadata ──
interface PostMeta {
  format: string;
  subject: string;
  likes: string;
  saves: string;
  shares: string;
  comments: string;
  reach: string;
}

function defaultPostMeta(): PostMeta {
  return { format: "", subject: "", likes: "", saves: "", shares: "", comments: "", reach: "" };
}

// ── Upload zone with per-file mini-forms ──
function ContentUploadZone({
  label,
  hint,
  suggestion,
  files,
  previews,
  postMetas,
  onFiles,
  onRemove,
  onMetaChange,
  globalNoteLabel,
  globalNote,
  onGlobalNoteChange,
  speech,
}: {
  label: string;
  hint: string;
  suggestion: string;
  files: File[];
  previews: string[];
  postMetas: PostMeta[];
  onFiles: (f: FileList | null) => void;
  onRemove: (i: number) => void;
  onMetaChange: (i: number, field: keyof PostMeta, value: string) => void;
  globalNoteLabel: string;
  globalNote: string;
  onGlobalNoteChange: (v: string) => void;
  speech: { isSupported: boolean; isListening: boolean; toggle: () => void };
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-3">
      <label className="text-sm font-medium text-foreground mb-2 block">{label}</label>
      <div
        onClick={() => ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}
        className="rounded-2xl border-2 border-dashed border-border bg-muted/30 p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
      >
        <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-1" />
        <p className="text-sm text-muted-foreground">{hint}</p>
        <p className="text-xs text-muted-foreground mt-1">Max 10 fichiers · 10 Mo/fichier</p>
      </div>
      <input ref={ref} type="file" accept={CONTENT_ACCEPT} multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />

      {/* Per-post mini-forms */}
      {files.length > 0 && (
        <div className="space-y-4">
          {files.map((file, i) => (
            <div key={i} className="flex gap-4 rounded-xl border border-border bg-card p-4">
              {/* Thumbnail */}
              <div className="relative w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border border-border">
                {file.type === "application/pdf" ? (
                  <div className="w-full h-full flex items-center justify-center bg-muted text-xs font-medium">PDF</div>
                ) : (
                  <img src={previews[i]} alt="" className="w-full h-full object-cover" />
                )}
                <button onClick={(e) => { e.stopPropagation(); onRemove(i); }} className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-0.5">
                  <X className="h-3 w-3" />
                </button>
              </div>

              {/* Meta fields */}
              <div className="flex-1 space-y-2">
                <p className="text-xs font-semibold text-foreground">Post {i + 1}</p>
                <div className="flex flex-wrap gap-2">
                  {FORMAT_OPTIONS.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => onMetaChange(i, "format", f)}
                      className={`text-xs px-2.5 py-1 rounded-pill border transition-all ${
                        postMetas[i]?.format === f
                          ? "border-primary bg-rose-pale text-primary font-medium"
                          : "border-border bg-background text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <Input
                  value={postMetas[i]?.subject || ""}
                  onChange={(e) => onMetaChange(i, "subject", e.target.value)}
                  placeholder="Sujet en 1 phrase..."
                  className="h-8 text-xs"
                />
                <div className="flex flex-wrap gap-2">
                  {(["likes", "saves", "shares", "comments", "reach"] as const).map((stat) => (
                    <div key={stat} className="flex items-center gap-1">
                      <label className="text-[10px] text-muted-foreground capitalize">{stat === "shares" ? "Partages" : stat === "comments" ? "Com." : stat === "likes" ? "Likes" : stat === "saves" ? "Saves" : "Reach"}</label>
                      <input
                        type="number"
                        value={postMetas[i]?.[stat] || ""}
                        onChange={(e) => onMetaChange(i, stat, e.target.value)}
                        className="w-16 h-6 text-xs border border-border rounded-md px-1.5 bg-background text-foreground"
                        placeholder="—"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground italic">💡 Laisse vide si tu ne les as pas, l'IA essaiera de les lire sur le screenshot.</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-2 rounded-xl bg-rose-pale p-3">
        <p className="text-xs text-muted-foreground">{suggestion}</p>
      </div>

      {/* Global note */}
      <div>
        <label className="text-sm font-medium text-foreground mb-1 block">{globalNoteLabel}</label>
        <div className="relative">
          <Textarea
            value={globalNote}
            onChange={(e) => onGlobalNoteChange(e.target.value)}
            placeholder="Le sujet était perso, j'ai montré mon visage, c'était polémique..."
            className="min-h-[80px] pr-10"
          />
          {speech.isSupported && (
            <button onClick={speech.toggle} className="absolute right-2 top-2 p-1 rounded-full hover:bg-muted transition-colors">
              {speech.isListening ? <MicOff className="h-4 w-4 text-destructive" /> : <Mic className="h-4 w-4 text-muted-foreground" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Profile upload (simple, no per-post forms) ──
function ProfileUploadZone({
  files, previews, onFiles, onRemove,
}: { files: File[]; previews: string[]; onFiles: (f: FileList | null) => void; onRemove: (i: number) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <label className="text-sm font-medium text-foreground mb-2 block">📸 Screenshots de ton profil</label>
      <div
        onClick={() => ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onDrop={(e) => { e.preventDefault(); onFiles(e.dataTransfer.files); }}
        className="rounded-2xl border-2 border-dashed border-border bg-muted/30 p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
      >
        <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-1" />
        <p className="text-sm text-muted-foreground">Glisse tes screenshots ici ou clique pour les sélectionner</p>
        <p className="text-xs text-muted-foreground mt-1">Max 10 fichiers · 10 Mo/fichier</p>
      </div>
      <input ref={ref} type="file" accept={CONTENT_ACCEPT} multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
      {previews.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {previews.map((p, i) => (
            <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border">
              {files[i]?.type === "application/pdf" ? (
                <div className="w-full h-full flex items-center justify-center bg-muted text-xs font-medium">PDF</div>
              ) : (
                <img src={p} alt="" className="w-full h-full object-cover" />
              )}
              <button onClick={(e) => { e.stopPropagation(); onRemove(i); }} className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-0.5">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 rounded-xl bg-rose-pale p-3">
        <p className="text-xs text-muted-foreground">
          💡 Pour un audit complet, envoie :
          {"\n"}• 1 screenshot du haut de ton profil (bio, photo, nom, stories à la une)
          {"\n"}• 1 screenshot de ton feed (les 9-12 premiers posts)
          {"\n"}• Les screenshots de tes posts épinglés (si tu en as)
        </p>
      </div>
    </div>
  );
}

function useFileUpload(max = 10) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const arr = Array.from(newFiles).filter((f) => f.size <= 10 * 1024 * 1024).slice(0, max - files.length);
    setFiles((prev) => [...prev, ...arr]);
    arr.forEach((f) => {
      if (f.type === "application/pdf") {
        setPreviews((prev) => [...prev, "pdf"]);
      } else {
        const reader = new FileReader();
        reader.onload = (e) => setPreviews((prev) => [...prev, e.target?.result as string]);
        reader.readAsDataURL(f);
      }
    });
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
    setPreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  return { files, previews, handleFiles, removeFile };
}

export default function InstagramAudit() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Profile screenshots
  const profileUpload = useFileUpload(10);

  // Successful content
  const successUpload = useFileUpload(10);
  const [successMetas, setSuccessMetas] = useState<PostMeta[]>([]);
  const [successNotes, setSuccessNotes] = useState("");

  // Unsuccessful content
  const failUpload = useFileUpload(10);
  const [failMetas, setFailMetas] = useState<PostMeta[]>([]);
  const [failNotes, setFailNotes] = useState("");

  // URL
  const [profileUrl, setProfileUrl] = useState("");

  // Questions
  const [bestContent, setBestContent] = useState("");
  const [worstContent, setWorstContent] = useState("");
  const [rhythm, setRhythm] = useState("");
  const [objective, setObjective] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  // Results
  const [auditResult, setAuditResult] = useState<any>(null);
  const [auditId, setAuditId] = useState<string | null>(null);

  // Speech recognition
  const successSpeech = useSpeechRecognition((t) => setSuccessNotes((prev) => prev + " " + t));
  const failSpeech = useSpeechRecognition((t) => setFailNotes((prev) => prev + " " + t));
  const bestSpeech = useSpeechRecognition((t) => setBestContent((prev) => prev + " " + t));
  const worstSpeech = useSpeechRecognition((t) => setWorstContent((prev) => prev + " " + t));

  // Keep metas in sync with file count
  const handleSuccessFiles = (fl: FileList | null) => {
    if (!fl) return;
    const count = Array.from(fl).filter((f) => f.size <= 10 * 1024 * 1024).length;
    setSuccessMetas((prev) => [...prev, ...Array.from({ length: count }, defaultPostMeta)]);
    successUpload.handleFiles(fl);
  };
  const handleFailFiles = (fl: FileList | null) => {
    if (!fl) return;
    const count = Array.from(fl).filter((f) => f.size <= 10 * 1024 * 1024).length;
    setFailMetas((prev) => [...prev, ...Array.from({ length: count }, defaultPostMeta)]);
    failUpload.handleFiles(fl);
  };
  const removeSuccess = (i: number) => {
    successUpload.removeFile(i);
    setSuccessMetas((prev) => prev.filter((_, idx) => idx !== i));
  };
  const removeFail = (i: number) => {
    failUpload.removeFile(i);
    setFailMetas((prev) => prev.filter((_, idx) => idx !== i));
  };
  const updateMeta = (setFn: React.Dispatch<React.SetStateAction<PostMeta[]>>) =>
    (i: number, field: keyof PostMeta, value: string) =>
      setFn((prev) => prev.map((m, idx) => (idx === i ? { ...m, [field]: value } : m)));

  const sanitizeFileName = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase() || 'png';
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    return `upload-${timestamp}-${randomId}.${ext}`;
  };

  const uploadFiles = async (files: File[], prefix: string) => {
    const urls: string[] = [];
    for (const file of files) {
      const safeName = sanitizeFileName(file.name);
      const path = `${user!.id}/${prefix}-${safeName}`;
      const { error } = await supabase.storage.from("audit-screenshots").upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("audit-screenshots").getPublicUrl(path);
      urls.push(data.publicUrl);
    }
    return urls;
  };

  const handleAnalyze = async () => {
    if (!user) return;
    if (profileUpload.files.length === 0) {
      toast({ title: "Ajoute au moins un screenshot de ton profil", variant: "destructive" });
      return;
    }
    setAnalyzing(true);
    setAuditResult(null);

    try {
      const [profileUrls, successUrls, failUrls] = await Promise.all([
        uploadFiles(profileUpload.files, "profile"),
        uploadFiles(successUpload.files, "success"),
        uploadFiles(failUpload.files, "fail"),
      ]);

      // Build structured post data for AI
      const successPostsData = successMetas.map((m, i) => ({
        screenshot_url: successUrls[i] || null,
        format: m.format || null,
        subject: m.subject || null,
        likes: m.likes ? parseInt(m.likes) : null,
        saves: m.saves ? parseInt(m.saves) : null,
        shares: m.shares ? parseInt(m.shares) : null,
        comments: m.comments ? parseInt(m.comments) : null,
        reach: m.reach ? parseInt(m.reach) : null,
      }));
      const failPostsData = failMetas.map((m, i) => ({
        screenshot_url: failUrls[i] || null,
        format: m.format || null,
        subject: m.subject || null,
        likes: m.likes ? parseInt(m.likes) : null,
        saves: m.saves ? parseInt(m.saves) : null,
        shares: m.shares ? parseInt(m.shares) : null,
        comments: m.comments ? parseInt(m.comments) : null,
        reach: m.reach ? parseInt(m.reach) : null,
      }));

      const res = await supabase.functions.invoke("generate-content", {
        body: {
          type: "instagram-audit",
          profile: {},
          screenshots: profileUrls,
          successScreenshots: successUrls,
          failScreenshots: failUrls,
          successNotes,
          failNotes,
          profileUrl,
          bestContent,
          worstContent,
          rhythm,
          objective,
          successPostsData,
          failPostsData,
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

      const { data: insertData, error: insertErr } = await supabase.from("instagram_audit").insert({
        user_id: user.id,
        score_global: parsed.score_global,
        score_nom: parsed.sections?.nom?.score ?? 0,
        score_bio: parsed.sections?.bio?.score ?? 0,
        score_stories: parsed.sections?.stories?.score ?? 0,
        score_epingles: parsed.sections?.epingles?.score ?? 0,
        score_feed: parsed.sections?.feed?.score ?? 0,
        score_edito: parsed.sections?.edito?.score ?? 0,
        resume: parsed.resume,
        details: parsed,
        best_content: bestContent,
        worst_content: worstContent,
        current_rhythm: rhythm,
        main_objective: objective,
        profile_url: profileUrl || null,
        successful_content_notes: successNotes || null,
        unsuccessful_content_notes: failNotes || null,
        content_analysis: parsed.content_analysis || null,
        content_dna: parsed.content_dna || null,
        combo_gagnant: parsed.combo_gagnant || null,
        editorial_recommendations: parsed.editorial_recommendations || null,
      }).select("id").single();

      if (insertErr) throw insertErr;

      const newAuditId = insertData?.id;
      if (newAuditId) {
        setAuditId(newAuditId);
        // Save individual posts
        const allPosts = [
          ...successPostsData.map((p) => ({ ...p, performance: "top" as const })),
          ...failPostsData.map((p) => ({ ...p, performance: "flop" as const })),
        ].filter((p) => p.screenshot_url);

        if (allPosts.length > 0) {
          await supabase.from("instagram_audit_posts").insert(
            allPosts.map((p) => ({
              audit_id: newAuditId,
              user_id: user.id,
              screenshot_url: p.screenshot_url,
              format: p.format,
              subject: p.subject,
              performance: p.performance,
              likes: p.likes,
              saves: p.saves,
              shares: p.shares,
              comments: p.comments,
              reach: p.reach,
            }))
          );
        }
      }

      setAuditResult(parsed);
      toast({ title: "Audit terminé !" });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
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
        reel_advice: auditResult.editorial_recommendations.reel_advice,
        general_advice: auditResult.editorial_recommendations.general_advice,
        analyzed_at: new Date().toISOString(),
      };

      const { data: existing } = await supabase
        .from("instagram_editorial_line")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        await supabase.from("instagram_editorial_line").update({ content_insights: insights }).eq("user_id", user.id);
      } else {
        await supabase.from("instagram_editorial_line").insert({ user_id: user.id, content_insights: insights });
      }

      toast({ title: "Insights sauvegardés dans ta ligne éditoriale !" });
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
  };

  // If we have results, show them
  if (auditResult) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
          <SubPageHeader parentLabel="Mon profil" parentTo="/instagram/profil" currentLabel="Audit" />
          <h1 className="font-display text-[26px] font-bold text-foreground mb-6">🔍 Résultat de ton audit</h1>

          {/* Content analysis section */}
          {(auditResult.content_analysis || auditResult.content_dna) && (
            <ContentAnalysisResults
              contentAnalysis={auditResult.content_analysis}
              contentDna={auditResult.content_dna}
              comboGagnant={auditResult.combo_gagnant}
              editorialRecommendations={auditResult.editorial_recommendations}
              onSaveToEditorial={handleSaveToEditorial}
            />
          )}

          <div className="flex flex-wrap gap-3 mt-8">
            <Button variant="outline" onClick={() => { setAuditResult(null); setAuditId(null); }} className="rounded-pill gap-2">
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

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Mon profil" parentTo="/instagram/profil" currentLabel="Audit" />

        <h1 className="font-display text-[26px] font-bold text-foreground">🔍 Audit de ton profil</h1>
        <p className="mt-2 text-sm text-muted-foreground italic mb-8">
          L'IA analyse tes screenshots et compare avec ton branding pour te donner un score et des recommandations concrètes.
        </p>

        <div className="space-y-8">
          {/* Zone 1: Profile screenshots */}
          <ProfileUploadZone
            files={profileUpload.files}
            previews={profileUpload.previews}
            onFiles={profileUpload.handleFiles}
            onRemove={profileUpload.removeFile}
          />

          {/* URL Instagram */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">🔗 Ton profil Instagram (optionnel)</label>
            <Input
              value={profileUrl}
              onChange={(e) => setProfileUrl(e.target.value)}
              placeholder="https://www.instagram.com/toncompte"
            />
            <p className="text-xs text-muted-foreground mt-1">
              L'IA ira analyser ton profil si possible. Si ça ne fonctionne pas, les screenshots suffisent.
            </p>
          </div>

          {/* Zone 2: Successful content with per-post forms */}
          <ContentUploadZone
            label="🔥 Tes contenus qui ont bien marché"
            hint="Glisse tes screenshots, carrousels en PDF, ou captures de posts ici"
            suggestion="💡 Screenshots de posts avec leurs stats, carrousels en PDF, captures de reels avec les vues..."
            files={successUpload.files}
            previews={successUpload.previews}
            postMetas={successMetas}
            onFiles={handleSuccessFiles}
            onRemove={removeSuccess}
            onMetaChange={updateMeta(setSuccessMetas)}
            globalNoteLabel="Pourquoi tu penses que ça a marché ?"
            globalNote={successNotes}
            onGlobalNoteChange={setSuccessNotes}
            speech={successSpeech}
          />

          {/* Zone 3: Unsuccessful content with per-post forms */}
          <ContentUploadZone
            label="😐 Tes contenus qui n'ont pas marché"
            hint="Glisse tes screenshots ou PDF de contenus qui ont floppé"
            suggestion="💡 Posts sans engagement, carrousels ignorés, reels avec peu de vues..."
            files={failUpload.files}
            previews={failUpload.previews}
            postMetas={failMetas}
            onFiles={handleFailFiles}
            onRemove={removeFail}
            onMetaChange={updateMeta(setFailMetas)}
            globalNoteLabel="Tu as une idée de pourquoi ça n'a pas marché ?"
            globalNote={failNotes}
            onGlobalNoteChange={setFailNotes}
            speech={failSpeech}
          />

          {/* Questions */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">
              Quels sont tes 3 contenus qui ont le mieux marché récemment ?
            </label>
            <div className="relative">
              <Textarea
                value={bestContent}
                onChange={(e) => setBestContent(e.target.value)}
                placeholder="Le post sur..., le reel où je montrais..., la story quand j'ai parlé de..."
                className="min-h-[80px] pr-10"
              />
              {bestSpeech.isSupported && (
                <button onClick={bestSpeech.toggle} className="absolute right-2 top-2 p-1 rounded-full hover:bg-muted transition-colors">
                  {bestSpeech.isListening ? <MicOff className="h-4 w-4 text-destructive" /> : <Mic className="h-4 w-4 text-muted-foreground" />}
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">
              Quels contenus ne marchent jamais ?
            </label>
            <div className="relative">
              <Textarea
                value={worstContent}
                onChange={(e) => setWorstContent(e.target.value)}
                placeholder="Les photos produit seules, les citations, les posts trop longs..."
                className="min-h-[80px] pr-10"
              />
              {worstSpeech.isSupported && (
                <button onClick={worstSpeech.toggle} className="absolute right-2 top-2 p-1 rounded-full hover:bg-muted transition-colors">
                  {worstSpeech.isListening ? <MicOff className="h-4 w-4 text-destructive" /> : <Mic className="h-4 w-4 text-muted-foreground" />}
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Tu postes à quel rythme actuellement ?
            </label>
            <div className="flex flex-wrap gap-2">
              {RHYTHM_OPTIONS.map((r) => (
                <button
                  key={r}
                  onClick={() => setRhythm(r)}
                  className={`rounded-pill px-4 py-2 text-sm font-medium border transition-all ${
                    rhythm === r ? "border-primary bg-rose-pale text-primary" : "border-border bg-card text-foreground hover:border-primary/40"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              C'est quoi ton objectif principal sur Instagram ?
            </label>
            <div className="flex flex-wrap gap-2">
              {OBJECTIVE_OPTIONS.map((o) => (
                <button
                  key={o}
                  onClick={() => setObjective(o)}
                  className={`rounded-pill px-4 py-2 text-sm font-medium border transition-all ${
                    objective === o ? "border-primary bg-rose-pale text-primary" : "border-border bg-card text-foreground hover:border-primary/40"
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={handleAnalyze}
            disabled={analyzing || profileUpload.files.length === 0}
            className="w-full rounded-pill gap-2 h-12 text-base"
          >
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {analyzing ? "Analyse en cours..." : "✨ Analyser mon profil"}
          </Button>
        </div>
      </main>
    </div>
  );
}
