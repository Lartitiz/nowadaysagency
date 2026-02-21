import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Upload, X, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

const RHYTHM_OPTIONS = ["Tous les jours", "3-4x/semaine", "1-2x/semaine", "Moins d'1x/semaine", "Irrégulier"];
const OBJECTIVE_OPTIONS = ["Vendre", "Me faire connaître", "Créer une communauté", "Rediriger vers mon site", "Trouver des partenaires"];

export default function InstagramAudit() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [bestContent, setBestContent] = useState("");
  const [worstContent, setWorstContent] = useState("");
  const [rhythm, setRhythm] = useState("");
  const [objective, setObjective] = useState("");
  const [analyzing, setAnalyzing] = useState(false);

  const handleFiles = (newFiles: FileList | null) => {
    if (!newFiles) return;
    const arr = Array.from(newFiles).slice(0, 10 - files.length);
    const updated = [...files, ...arr];
    setFiles(updated);
    arr.forEach(f => {
      const reader = new FileReader();
      reader.onload = e => setPreviews(prev => [...prev, e.target?.result as string]);
      reader.readAsDataURL(f);
    });
  };

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx));
    setPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handleAnalyze = async () => {
    if (!user) return;
    if (files.length === 0) {
      toast({ title: "Ajoute au moins un screenshot", variant: "destructive" });
      return;
    }
    setAnalyzing(true);

    try {
      // Upload screenshots to storage
      const uploadedUrls: string[] = [];
      for (const file of files) {
        const path = `${user.id}/${Date.now()}-${file.name}`;
        const { error: uploadErr } = await supabase.storage.from("audit-screenshots").upload(path, file);
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("audit-screenshots").getPublicUrl(path);
        uploadedUrls.push(urlData.publicUrl);
      }

      // Call AI
      const res = await supabase.functions.invoke("generate-content", {
        body: {
          type: "instagram-audit",
          profile: {},
          screenshots: uploadedUrls,
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

      // Save audit
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

        {/* Upload zone */}
        <div className="space-y-6">
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">📸 Screenshots de ton profil</label>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
              onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
              className="rounded-2xl border-2 border-dashed border-border bg-muted/30 p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            >
              <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">Glisse tes screenshots ici ou clique pour les sélectionner</p>
              <p className="text-xs text-muted-foreground mt-1">Max 10 images</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => handleFiles(e.target.files)}
            />

            {previews.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {previews.map((p, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border">
                    <img src={p} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeFile(i)}
                      className="absolute top-0.5 right-0.5 bg-background/80 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-3 rounded-xl bg-rose-pale p-3">
              <p className="text-xs text-muted-foreground">
                💡 Pour un audit complet, envoie :
                <br />• 1 screenshot du haut de ton profil (bio, photo, nom, stories à la une)
                <br />• 1 screenshot de ton feed (les 9-12 premiers posts)
                <br />• Les screenshots de tes posts épinglés (si tu en as)
              </p>
            </div>
          </div>

          {/* Questions */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">
              Quels sont tes 3 contenus qui ont le mieux marché récemment ?
            </label>
            <Textarea
              value={bestContent}
              onChange={e => setBestContent(e.target.value)}
              placeholder="Le post sur..., le reel où je montrais..., la story quand j'ai parlé de..."
              className="min-h-[80px]"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">
              Quels contenus ne marchent jamais ?
            </label>
            <Textarea
              value={worstContent}
              onChange={e => setWorstContent(e.target.value)}
              placeholder="Les photos produit seules, les citations, les posts trop longs..."
              className="min-h-[80px]"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">
              Tu postes à quel rythme actuellement ?
            </label>
            <div className="flex flex-wrap gap-2">
              {RHYTHM_OPTIONS.map(r => (
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
              {OBJECTIVE_OPTIONS.map(o => (
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
            disabled={analyzing || files.length === 0}
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
