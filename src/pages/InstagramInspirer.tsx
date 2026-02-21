import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Sparkles, Copy, Save, RefreshCw, ChevronDown, Eye, Trash2, Link2 } from "lucide-react";

interface Analysis {
  accroche: string;
  structure: string;
  ton: string;
  engagement: string;
}

interface InspirationResult {
  analysis: Analysis;
  adapted_content: string;
  format: string;
  objective: string;
  pillar: string;
}

interface HistoryItem {
  id: string;
  source_text: string | null;
  source_url: string | null;
  analysis: Analysis | null;
  adapted_content: string | null;
  recommended_format: string | null;
  objective: string | null;
  pillar: string | null;
  saved_to_ideas: boolean;
  created_at: string;
}

export default function InstagramInspirer() {
  const { user } = useAuth();
  const [tab, setTab] = useState("text");
  const [sourceText, setSourceText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingLink, setFetchingLink] = useState(false);
  const [result, setResult] = useState<InspirationResult | null>(null);
  const [editedContent, setEditedContent] = useState("");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [viewingHistory, setViewingHistory] = useState<HistoryItem | null>(null);

  // Load history
  useEffect(() => {
    if (!user) return;
    supabase
      .from("instagram_inspirations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setHistory(data as unknown as HistoryItem[]);
      });
  }, [user]);

  const fetchFromLink = async () => {
    if (!sourceUrl.trim()) return;
    setFetchingLink(true);
    try {
      const { data, error } = await supabase.functions.invoke("fetch-instagram-post", {
        body: { url: sourceUrl.trim() },
      });
      if (error || data?.error) {
        toast.error(data?.error || "Impossible de récupérer le contenu. Colle le texte directement.");
        setTab("text");
      } else if (data?.caption) {
        setSourceText(data.caption);
        setTab("text");
        toast.success("Contenu récupéré ! Tu peux le modifier avant d'analyser.");
      }
    } catch {
      toast.error("Erreur réseau. Colle le texte directement.");
      setTab("text");
    } finally {
      setFetchingLink(false);
    }
  };

  const analyze = useCallback(async () => {
    if (!user || !sourceText.trim() || sourceText.trim().length < 20) {
      toast.error("Colle au moins 20 caractères de contenu.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("inspire-ai", {
        body: { source_text: sourceText.trim() },
      });
      if (error || data?.error) {
        toast.error(data?.error || "Erreur lors de l'analyse");
        return;
      }
      const r = data as InspirationResult;
      setResult(r);
      setEditedContent(r.adapted_content);

      // Save to history
      const { data: saved } = await supabase
        .from("instagram_inspirations")
        .insert({
          user_id: user.id,
          source_text: sourceText.trim(),
          source_url: sourceUrl.trim() || null,
          analysis: r.analysis as any,
          adapted_content: r.adapted_content,
          recommended_format: r.format,
          objective: r.objective,
          pillar: r.pillar,
        })
        .select()
        .single();

      if (saved) {
        setHistory((prev) => [saved as unknown as HistoryItem, ...prev]);
      }
    } catch {
      toast.error("Erreur lors de l'analyse");
    } finally {
      setLoading(false);
    }
  }, [user, sourceText, sourceUrl]);

  const copyContent = () => {
    navigator.clipboard.writeText(editedContent);
    toast.success("Copié !");
  };

  const saveToIdeas = async () => {
    if (!user || !editedContent.trim()) return;
    try {
      await supabase.from("saved_ideas").insert({
        user_id: user.id,
        type: "draft",
        status: "ready",
        canal: "instagram",
        titre: editedContent.slice(0, 60) + (editedContent.length > 60 ? "..." : ""),
        angle: "Adapté de : " + (sourceUrl.trim() || "contenu externe"),
        format: result?.format || "Post",
        content_draft: editedContent,
        format_technique: result?.format || null,
        objectif: result?.objective || null,
      });
      toast.success("Sauvegardé dans tes idées !");
    } catch {
      toast.error("Erreur lors de la sauvegarde");
    }
  };

  const deleteHistoryItem = async (id: string) => {
    await supabase.from("instagram_inspirations").delete().eq("id", id);
    setHistory((prev) => prev.filter((h) => h.id !== id));
    if (viewingHistory?.id === id) setViewingHistory(null);
    toast.success("Supprimé");
  };

  const viewHistoryItem = (item: HistoryItem) => {
    setViewingHistory(item);
    if (item.analysis && item.adapted_content) {
      setResult({
        analysis: item.analysis,
        adapted_content: item.adapted_content,
        format: item.recommended_format || "",
        objective: item.objective || "",
        pillar: item.pillar || "",
      });
      setEditedContent(item.adapted_content);
      setSourceText(item.source_text || "");
      setSourceUrl(item.source_url || "");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-4xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Instagram" parentTo="/instagram" currentLabel="M'inspirer" />

        <h1 className="font-display text-[26px] font-bold text-foreground">M'inspirer</h1>
        <p className="mt-1 text-sm italic text-muted-foreground">
          Colle un contenu qui t'a plu. L'IA décrypte pourquoi ça marche et t'en crée une version à toi.
        </p>

        {/* Input zone */}
        <Card className="mt-6">
          <CardContent className="p-5">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="text">📝 Coller un texte</TabsTrigger>
                <TabsTrigger value="link">🔗 Coller un lien</TabsTrigger>
              </TabsList>

              <TabsContent value="text">
                <Textarea
                  className="min-h-[200px]"
                  placeholder="Colle ici la caption, le texte du post, le script du reel..."
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                />
              </TabsContent>

              <TabsContent value="link">
                <Input
                  placeholder="https://www.instagram.com/p/..."
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  L'IA va tenter de récupérer le contenu du post automatiquement.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={fetchFromLink}
                  disabled={fetchingLink || !sourceUrl.trim()}
                >
                  <Link2 className="h-4 w-4 mr-1" />
                  {fetchingLink ? "Récupération..." : "Récupérer le contenu"}
                </Button>
              </TabsContent>
            </Tabs>

            <Button
              className="mt-4 w-full"
              size="lg"
              onClick={analyze}
              disabled={loading || sourceText.trim().length < 20}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              {loading ? "Analyse en cours..." : "Analyser et adapter à mon univers"}
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <div className="mt-8 space-y-6">
            {/* Analysis block */}
            <Card className="bg-accent/30 border-accent">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">🧠 Pourquoi ça marche</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <AnalysisPoint label="L'accroche" text={result.analysis.accroche} />
                <AnalysisPoint label="La structure" text={result.analysis.structure} />
                <AnalysisPoint label="Le ton" text={result.analysis.ton} />
                <AnalysisPoint label="Le déclencheur d'engagement" text={result.analysis.engagement} />
              </CardContent>
            </Card>

            {/* Adapted content block */}
            <Card className="border-l-[3px] border-l-primary">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">✨ Ta version</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Textarea
                  className="min-h-[200px]"
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                />
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {result.format && (
                    <Badge variant="secondary">Format : {result.format}</Badge>
                  )}
                  {result.objective && (
                    <Badge variant="secondary">Objectif : {result.objective}</Badge>
                  )}
                  {result.pillar && (
                    <Badge variant="secondary">Pilier : {result.pillar}</Badge>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={copyContent}>
                    <Copy className="h-4 w-4 mr-1" /> Copier
                  </Button>
                  <Button variant="outline" size="sm" onClick={saveToIdeas}>
                    <Save className="h-4 w-4 mr-1" /> Sauvegarder dans mes idées
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={analyze}
                    disabled={loading}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" /> Regénérer
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <Collapsible open={historyOpen} onOpenChange={setHistoryOpen} className="mt-8">
            <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors">
              <ChevronDown className={`h-4 w-4 transition-transform ${historyOpen ? "rotate-180" : ""}`} />
              📚 Mes inspirations précédentes ({history.length})
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-2">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString("fr-FR")}
                    </p>
                    <p className="text-sm text-foreground truncate">
                      {item.source_text?.slice(0, 80) || item.source_url || "..."}
                    </p>
                  </div>
                  <div className="flex gap-1 ml-3 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => viewHistoryItem(item)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (item.adapted_content) {
                          navigator.clipboard.writeText(item.adapted_content);
                          toast.success("Copié !");
                        }
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteHistoryItem(item.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        <div className="h-12" />
      </main>
    </div>
  );
}

function AnalysisPoint({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <span className="text-sm font-semibold text-foreground">{label} : </span>
      <span className="text-sm text-muted-foreground">{text}</span>
    </div>
  );
}
