import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Upload, X, Loader2, Mic, MicOff } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";

const RHYTHM_OPTIONS = ["Tous les jours", "3-4x/semaine", "1-2x/semaine", "Moins d'1x/semaine", "Irrégulier"];
const OBJECTIVE_OPTIONS = ["Vendre", "Me faire connaître", "Créer une communauté", "Rediriger vers mon site", "Trouver des partenaires"];
const CONTENT_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";

function FileUploadZone({
  label,
  hint,
  suggestion,
  files,
  previews,
  onFiles,
  onRemove,
}: {
  label: string;
  hint: string;
  suggestion: string;
  files: File[];
  previews: string[];
  onFiles: (f: FileList | null) => void;
  onRemove: (i: number) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
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
        <p className="text-xs text-muted-foreground">{suggestion}</p>
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
  const profileFileInputRef = useRef<HTMLInputElement>(null);

  // Successful content
  const successUpload = useFileUpload(10);
  const [successNotes, setSuccessNotes] = useState("");

  // Unsuccessful content
  const failUpload = useFileUpload(10);
  const [failNotes, setFailNotes] = useState("");

  // URL
  const [profileUrl, setProfileUrl] = useState("");

  // Questions
  const [bestContent, setBestContent] = useState("");
  const [worstContent, setWorstContent] = useState("");
  const [rhythm, setRhythm] = useState("");
  const [objective, setObjective] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  // Speech recognition
  const successSpeech = useSpeechRecognition((t) => setSuccessNotes((prev) => prev + " " + t));
  const failSpeech = useSpeechRecognition((t) => setFailNotes((prev) => prev + " " + t));
  const bestSpeech = useSpeechRecognition((t) => setBestContent((prev) => prev + " " + t));
  const worstSpeech = useSpeechRecognition((t) => setWorstContent((prev) => prev + " " + t));

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

    try {
      const [profileUrls, successUrls, failUrls] = await Promise.all([
        uploadFiles(profileUpload.files, "profile"),
        uploadFiles(successUpload.files, "success"),
        uploadFiles(failUpload.files, "fail"),
      ]);

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

      const { error: insertErr } = await supabase.from("instagram_audit").insert({
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
      });

      if (insertErr) throw insertErr;

      toast({ title: "Audit terminé !" });
      navigate("/instagram/profil");
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

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
          <FileUploadZone
            label="📸 Screenshots de ton profil"
            hint="Glisse tes screenshots ici ou clique pour les sélectionner"
            suggestion="💡 Pour un audit complet, envoie :
• 1 screenshot du haut de ton profil (bio, photo, nom, stories à la une)
• 1 screenshot de ton feed (les 9-12 premiers posts)
• Les screenshots de tes posts épinglés (si tu en as)"
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

          {/* Zone 2: Successful content */}
          <div className="space-y-3">
            <FileUploadZone
              label="🔥 Tes contenus qui ont bien marché"
              hint="Glisse tes screenshots, carrousels en PDF, ou captures de posts ici"
              suggestion="💡 Screenshots de posts avec leurs stats, carrousels en PDF, captures de reels avec les vues..."
              files={successUpload.files}
              previews={successUpload.previews}
              onFiles={successUpload.handleFiles}
              onRemove={successUpload.removeFile}
            />
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Pourquoi tu penses que ça a marché ?</label>
              <div className="relative">
                <Textarea
                  value={successNotes}
                  onChange={(e) => setSuccessNotes(e.target.value)}
                  placeholder="Le sujet était perso, j'ai montré mon visage, c'était polémique..."
                  className="min-h-[80px] pr-10"
                />
                {successSpeech.isSupported && (
                  <button onClick={successSpeech.toggle} className="absolute right-2 top-2 p-1 rounded-full hover:bg-muted transition-colors">
                    {successSpeech.isListening ? <MicOff className="h-4 w-4 text-destructive" /> : <Mic className="h-4 w-4 text-muted-foreground" />}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Zone 3: Unsuccessful content */}
          <div className="space-y-3">
            <FileUploadZone
              label="😐 Tes contenus qui n'ont pas marché"
              hint="Glisse tes screenshots ou PDF de contenus qui ont floppé"
              suggestion="💡 Posts sans engagement, carrousels ignorés, reels avec peu de vues..."
              files={failUpload.files}
              previews={failUpload.previews}
              onFiles={failUpload.handleFiles}
              onRemove={failUpload.removeFile}
            />
            <div>
              <label className="text-sm font-medium text-foreground mb-1 block">Tu as une idée de pourquoi ça n'a pas marché ?</label>
              <div className="relative">
                <Textarea
                  value={failNotes}
                  onChange={(e) => setFailNotes(e.target.value)}
                  placeholder="Sujet trop niche, mauvaise accroche, mauvais timing..."
                  className="min-h-[80px] pr-10"
                />
                {failSpeech.isSupported && (
                  <button onClick={failSpeech.toggle} className="absolute right-2 top-2 p-1 rounded-full hover:bg-muted transition-colors">
                    {failSpeech.isListening ? <MicOff className="h-4 w-4 text-destructive" /> : <Mic className="h-4 w-4 text-muted-foreground" />}
                  </button>
                )}
              </div>
            </div>
          </div>

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
