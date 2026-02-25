import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import { Button } from "@/components/ui/button";
import { Loader2, X, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface InspirationAnalysis {
  image_index: number;
  hook_type: string;
  hook_text_visible: string;
  format: string;
  tone: string;
  structure: string;
  visual_elements: string;
}

interface AnalysisResult {
  inspiration_analysis: InspirationAnalysis[];
  patterns_communs: string;
  recommandation: string;
}

interface SavedInspiration {
  id: string;
  image_url: string;
  analysis: any;
  created_at: string;
}

interface Props {
  onAnalysisComplete: (analysis: AnalysisResult | null) => void;
}

export default function ReelInspirationUpload({ onAnalysisComplete }: Props) {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedImages, setUploadedImages] = useState<{ url: string; file?: File }[]>([]);
  const [savedInspirations, setSavedInspirations] = useState<SavedInspiration[]>([]);
  const [selectedSaved, setSelectedSaved] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [tab, setTab] = useState("upload");

  useEffect(() => {
    if (user) fetchSavedInspirations();
  }, [user?.id]);

  const fetchSavedInspirations = async () => {
    if (!user) return;
    const { data } = await (supabase.from("reel_inspirations") as any)
      .select("*")
      .eq(column, value)
      .order("created_at", { ascending: false });
    if (data) setSavedInspirations(data as SavedInspiration[]);
  };

  const sanitizeFileName = (name: string) => {
    return name.replace(/[^a-zA-Z0-9._-]/g, "_");
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (uploadedImages.length + files.length > 5) {
      toast.error("Maximum 5 images");
      return;
    }

    if (!user) return;

    for (const file of files) {
      const safeName = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${sanitizeFileName(file.name)}`;
      const { error } = await supabase.storage
        .from("inspiration-screenshots")
        .upload(safeName, file);

      if (error) {
        toast.error("Erreur upload");
        console.error(error);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from("inspiration-screenshots")
        .getPublicUrl(safeName);

      setUploadedImages((prev) => [...prev, { url: urlData.publicUrl }]);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemoveImage = (index: number) => {
    setUploadedImages((prev) => prev.filter((_, i) => i !== index));
    setAnalysisResult(null);
    onAnalysisComplete(null);
  };

  const toggleSavedSelection = (id: string) => {
    setSelectedSaved((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleAnalyze = async () => {
    if (!user) return;

    const imageUrls =
      tab === "upload"
        ? uploadedImages.map((img) => img.url)
        : savedInspirations.filter((s) => selectedSaved.includes(s.id)).map((s) => s.image_url);

    if (imageUrls.length === 0) {
      toast.error("Ajoute au moins une image");
      return;
    }

    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("reels-ai", {
        body: {
          type: "analyze_inspiration",
          image_urls: imageUrls,
          workspace_id: workspaceId,
        },
      });

      if (error) throw error;

      const raw = data?.content || "";
      const jsonStr = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed: AnalysisResult = JSON.parse(jsonStr);
      setAnalysisResult(parsed);
      onAnalysisComplete(parsed);

      // Save new uploads to reel_inspirations
      if (tab === "upload") {
        for (const img of uploadedImages) {
          await supabase.from("reel_inspirations").insert({
            user_id: user.id,
            image_url: img.url,
            analysis: parsed.inspiration_analysis,
          } as any);
        }
        fetchSavedInspirations();
      }
    } catch (e) {
      console.error(e);
      toast.error("Erreur lors de l'analyse");
    }
    setAnalyzing(false);
  };

  const allImages = tab === "upload" ? uploadedImages : [];

  return (
    <div className="rounded-2xl border border-dashed border-primary/30 bg-rose-pale p-5 mb-8">
      <h3 className="font-display text-base font-bold text-foreground mb-1">
        🔥 T'as des Reels qui t'inspirent ? (optionnel)
      </h3>
      <p className="text-xs text-muted-foreground mb-4">
        Upload des screenshots de Reels qui ont bien marché : les tiens ou ceux d'autres comptes.
        L'IA va s'en inspirer pour le ton, le format, et le style d'accroche.
      </p>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="upload">📱 Uploader</TabsTrigger>
          <TabsTrigger value="saved">📚 Mes inspirations ({savedInspirations.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <div className="flex flex-wrap gap-3 mb-3">
            {uploadedImages.map((img, i) => (
              <div key={i} className="relative w-20 h-28 rounded-xl overflow-hidden border border-border">
                <img src={img.url} alt={`Inspiration ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  onClick={() => handleRemoveImage(i)}
                  className="absolute top-1 right-1 bg-background/80 rounded-full p-0.5"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {uploadedImages.length < 5 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-20 h-28 rounded-xl border-2 border-dashed border-border bg-background flex flex-col items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
              >
                <ImageIcon className="h-5 w-5 mb-1" />
                <span className="text-[10px]">Ajouter</span>
              </button>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mb-3">Max 5 images · JPG, PNG</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
        </TabsContent>

        <TabsContent value="saved">
          {savedInspirations.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">Aucune inspiration sauvegardée. Upload des screenshots pour commencer.</p>
          ) : (
            <div className="flex flex-wrap gap-3 mb-3 max-h-48 overflow-y-auto">
              {savedInspirations.map((insp) => (
                <button
                  key={insp.id}
                  onClick={() => toggleSavedSelection(insp.id)}
                  className={`relative w-20 h-28 rounded-xl overflow-hidden border-2 transition-all ${
                    selectedSaved.includes(insp.id) ? "border-primary ring-2 ring-primary/20" : "border-border"
                  }`}
                >
                  <img src={insp.image_url} alt="Inspiration" className="w-full h-full object-cover" />
                  {selectedSaved.includes(insp.id) && (
                    <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                      <span className="text-lg">✓</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Analyze button */}
      {(uploadedImages.length > 0 || selectedSaved.length > 0) && !analysisResult && (
        <Button
          onClick={handleAnalyze}
          disabled={analyzing}
          className="mt-3 rounded-pill"
          size="sm"
        >
          {analyzing ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Analyse en cours...</>
          ) : (
            "🔍 Analyser mes inspirations"
          )}
        </Button>
      )}

      {/* Analysis result */}
      {analysisResult && (
        <div className="mt-4 rounded-xl border border-primary/20 bg-card p-4 space-y-2">
          <h4 className="font-display text-sm font-bold text-foreground">🔥 Ce que je retiens de tes inspirations</h4>
          <p className="text-sm text-foreground">📱 {analysisResult.patterns_communs}</p>
          <p className="text-sm text-primary font-medium">→ {analysisResult.recommandation}</p>
          <button
            onClick={() => { setAnalysisResult(null); onAnalysisComplete(null); }}
            className="text-xs text-muted-foreground hover:text-primary"
          >
            ✕ Retirer l'inspiration
          </button>
        </div>
      )}
    </div>
  );
}
