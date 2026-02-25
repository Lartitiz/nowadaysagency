import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { Sparkles, Copy, Check, Loader2, RotateCcw, Search } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import LinkedInPreview from "@/components/linkedin/LinkedInPreview";
import CharacterCounter from "@/components/linkedin/CharacterCounter";
import BioHistoryDrawer from "@/components/bio/BioHistoryDrawer";

/* ─── Types ─── */
interface AnalysisReco {
  number: number;
  title: string;
  status: "good" | "partial" | "missing";
  explanation: string;
  example?: string;
}

interface ResumeAnalysis {
  score: number;
  summary: { positives: string[]; improvements: string[] };
  recommendations: AnalysisReco[];
  proposed_version?: string;
}

/* ─── Helpers ─── */
function parseAnalysis(raw: string): ResumeAnalysis | null {
  try {
    let cleaned = raw.trim();
    if (cleaned.startsWith("```json")) cleaned = cleaned.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    if (cleaned.startsWith("```")) cleaned = cleaned.replace(/^```\n?/, "").replace(/\n?```$/, "");
    const match = cleaned.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : JSON.parse(cleaned);
    if (typeof parsed.score !== "number") return null;
    return parsed as ResumeAnalysis;
  } catch {
    return null;
  }
}

const statusIcon = (s: string) => s === "good" ? "✅" : s === "partial" ? "⚠️" : "❌";

/* ─── Score Badge ─── */
function ScoreBadge({ score }: { score: number }) {
  const color = score >= 70 ? "text-green-600 bg-green-50" : score >= 40 ? "text-amber-600 bg-amber-50" : "text-red-600 bg-red-50";
  return <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${color}`}>{score}/100</span>;
}

/* ─── Main ─── */
export default function LinkedInResume() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { column, value } = useWorkspaceFilter();
  const workspaceId = useWorkspaceId();

  type FlowMode = null | "existing" | "scratch" | "saved";
  const [mode, setMode] = useState<FlowMode>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loadingInit, setLoadingInit] = useState(true);

  // Existing resume flow
  const [existingText, setExistingText] = useState("");
  const [analysis, setAnalysis] = useState<ResumeAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  // Scratch flow
  const [passion, setPassion] = useState("");
  const [parcours, setParcours] = useState("");
  const [offre, setOffre] = useState("");
  const [cta, setCta] = useState("");
  const [summaryStory, setSummaryStory] = useState("");
  const [summaryPro, setSummaryPro] = useState("");
  const [generating, setGenerating] = useState(false);

  // Saved state
  const [savedResume, setSavedResume] = useState("");
  const [savedDate, setSavedDate] = useState<string | null>(null);
  const [propValue, setPropValue] = useState<string | null>(null);

  const [copied, setCopied] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const micPassion = useSpeechRecognition((t) => setPassion((p) => p + " " + t));
  const micParcours = useSpeechRecognition((t) => setParcours((p) => p + " " + t));
  const micOffre = useSpeechRecognition((t) => setOffre((p) => p + " " + t));

  // Load existing data
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [lpRes, propRes] = await Promise.all([
        (supabase.from("linkedin_profile") as any).select("*").eq(column, value).maybeSingle(),
        (supabase.from("brand_proposition") as any).select("version_final").eq(column, value).maybeSingle(),
      ]);
      if (lpRes.data) {
        setProfileId(lpRes.data.id);
        const final = lpRes.data.summary_final || "";
        const story = lpRes.data.summary_storytelling || "";
        const pro = lpRes.data.summary_pro || "";
        setSummaryStory(story);
        setSummaryPro(pro);
        if (final) {
          setSavedResume(final);
          setSavedDate(lpRes.data.updated_at || lpRes.data.created_at || null);
          setMode("saved");
        }
        // Load analysis if exists
        const rawAnalysis = (lpRes.data as any).resume_analysis;
        if (rawAnalysis) {
          setAnalysis(typeof rawAnalysis === "string" ? parseAnalysis(rawAnalysis) : rawAnalysis);
        }
      }
      if (propRes.data?.version_final) setPropValue(propRes.data.version_final);
      setLoadingInit(false);
    };
    load();
  }, [user?.id]);

  // Analyze existing resume
  const analyzeResume = async () => {
    if (!existingText.trim() && !savedResume.trim()) return;
    setAnalyzing(true);
    try {
      const textToAnalyze = existingText.trim() || savedResume.trim();
      const res = await supabase.functions.invoke("linkedin-ai", {
        body: { action: "analyze-resume", existing_resume: textToAnalyze },
      });
      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";
      const parsed = parseAnalysis(content);
      if (!parsed) throw new Error("Format de réponse invalide");
      setAnalysis(parsed);

      // Save to DB
      const dbPayload = {
        user_id: user!.id,
        workspace_id: workspaceId !== user!.id ? workspaceId : undefined,
        summary_final: textToAnalyze,
        updated_at: new Date().toISOString(),
      };

      if (profileId) {
        await supabase.from("linkedin_profile").update(dbPayload).eq("id", profileId);
      } else {
        const { data } = await supabase.from("linkedin_profile").insert(dbPayload).select("id").single();
        if (data) setProfileId(data.id);
      }
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  };

  // Generate from scratch
  const generate = async () => {
    setGenerating(true);
    try {
      const res = await supabase.functions.invoke("linkedin-ai", {
        body: { action: "summary", passion, parcours, offre, cta },
      });
      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";
      let parsed: any;
      try { parsed = JSON.parse(content); } catch { const m = content.match(/\{[\s\S]*\}/); parsed = m ? JSON.parse(m[0]) : {}; }
      if (parsed.storytelling) setSummaryStory(parsed.storytelling);
      if (parsed.pro) setSummaryPro(parsed.pro);
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  // Save a resume
  const save = async (text: string) => {
    if (!user) return;
    const payload = {
      user_id: user.id,
      workspace_id: workspaceId !== user.id ? workspaceId : undefined,
      summary_storytelling: summaryStory,
      summary_pro: summaryPro,
      summary_final: text,
      updated_at: new Date().toISOString(),
    };
    if (profileId) {
      await supabase.from("linkedin_profile").update(payload).eq("id", profileId);
    } else {
      const { data } = await supabase.from("linkedin_profile").insert(payload).select("id").single();
      if (data) setProfileId(data.id);
    }
    // Save to bio history
    await (supabase.from("bio_versions") as any).insert({
      user_id: user.id,
      workspace_id: workspaceId !== user.id ? workspaceId : null,
      platform: "linkedin",
      bio_text: text,
      source: "generated",
    });

    setSavedResume(text);
    setSavedDate(new Date().toISOString());
    setMode("saved");
    toast({ title: "✅ Résumé enregistré !" });
  };

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
    toast({ title: "📋 Copié !" });
  };

  if (loadingInit) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-6 py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentTo="/linkedin" parentLabel="LinkedIn" currentLabel="Mon résumé (À propos)" />

        <h1 className="font-display text-[22px] font-bold text-foreground mb-1">Ton résumé LinkedIn (À propos)</h1>
        <p className="text-sm text-muted-foreground italic mb-6">Ton titre attire. Ton résumé donne envie de te contacter. Pas besoin de lister ton CV : raconte.</p>

        {/* ─── STATE: Saved resume exists ─── */}
        {mode === "saved" && savedResume && (
          <div className="space-y-6">
            <div className="rounded-xl border-2 border-primary/30 bg-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-foreground flex items-center gap-2">✅ Ton résumé actuel</h3>
                {savedDate && (
                  <span className="text-xs text-muted-foreground">
                    Sauvegardé le {format(new Date(savedDate), "d MMM yyyy", { locale: fr })}
                  </span>
                )}
              </div>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{savedResume}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={() => copyText(savedResume, "saved")} className="rounded-pill gap-2">
                {copied === "saved" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copier
              </Button>
              <Button variant="outline" onClick={() => { setExistingText(savedResume); setAnalysis(null); setMode("existing"); }} className="rounded-pill gap-2">
                <Search className="h-4 w-4" /> Ré-analyser
              </Button>
              <Button variant="outline" onClick={() => { setMode(null); setSavedResume(""); }} className="rounded-pill gap-2">
                <RotateCcw className="h-4 w-4" /> Regénérer de zéro
              </Button>
            </div>

            {/* Show last analysis if exists */}
            {analysis && <AnalysisCards analysis={analysis} onSaveVersion={(v) => save(v)} copyText={copyText} copied={copied} />}
          </div>
        )}

        {/* ─── STATE: No resume – mode selector ─── */}
        {mode === null && (
          <>
            {/* Structure guide */}
            <div className="rounded-xl bg-rose-pale p-5 text-sm mb-6 space-y-1">
              <p className="font-semibold">💡 Un bon résumé LinkedIn, c'est 5 éléments :</p>
              <p>1. <strong>Hook</strong> : une phrase d'accroche qui intrigue</p>
              <p>2. <strong>Ta passion</strong> : pourquoi tu fais ce métier</p>
              <p>3. <strong>Ton parcours</strong> : d'où tu viens en 2-3 phrases</p>
              <p>4. <strong>Ce que tu proposes</strong> : ta valeur + ta cible</p>
              <p>5. <strong>Appel à l'action</strong> : "Contacte-moi pour..."</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
              <button onClick={() => setMode("existing")} className="rounded-xl border border-border bg-card p-6 text-left hover:border-primary transition-all">
                <h3 className="font-display text-base font-bold mb-1">📝 J'ai déjà un résumé</h3>
                <p className="text-sm text-muted-foreground">Colle ton résumé actuel et on l'améliore.</p>
              </button>
              <button onClick={() => setMode("scratch")} className="rounded-xl border border-border bg-card p-6 text-left hover:border-primary transition-all">
                <h3 className="font-display text-base font-bold mb-1">✨ Je pars de zéro</h3>
                <p className="text-sm text-muted-foreground">Génère-moi un résumé à partir de mon branding.</p>
              </button>
            </div>
          </>
        )}

        {/* ─── STATE: Existing resume flow ─── */}
        {mode === "existing" && (
          <div className="space-y-6">
            {!analysis && (
              <>
                <div>
                  <label className="text-sm font-semibold text-foreground mb-2 block">📝 Colle ton résumé actuel</label>
                  <Textarea
                    value={existingText}
                    onChange={(e) => setExistingText(e.target.value)}
                    placeholder="Copie-colle ton résumé LinkedIn ici..."
                    className="min-h-[200px]"
                  />
                  {existingText.trim() && <CharacterCounter count={existingText.length} max={2600} />}
                </div>
                <div className="flex gap-3">
                  <Button onClick={analyzeResume} disabled={analyzing || !existingText.trim()} className="rounded-pill gap-2">
                    {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    {analyzing ? "Analyse en cours..." : "🔍 Analyser et améliorer"}
                  </Button>
                  <Button variant="ghost" onClick={() => { setMode(null); setExistingText(""); }} className="rounded-pill">
                    ← Retour
                  </Button>
                </div>
              </>
            )}

            {analysis && (
              <AnalysisCards
                analysis={analysis}
                onSaveVersion={(v) => save(v)}
                copyText={copyText}
                copied={copied}
                onBack={() => { setAnalysis(null); }}
              />
            )}
          </div>
        )}

        {/* ─── STATE: Scratch flow ─── */}
        {mode === "scratch" && (
          <div className="space-y-6">
            <Button variant="ghost" onClick={() => setMode(null)} className="rounded-pill mb-2">← Retour</Button>

            <div className="space-y-4">
              <FieldWithMic label="Qu'est-ce qui te passionne dans ton métier ?" value={passion} onChange={setPassion} mic={micPassion} placeholder="Pourquoi tu fais ça..." />
              <FieldWithMic label="Ton parcours en quelques phrases" value={parcours} onChange={setParcours} mic={micParcours} placeholder="D'où tu viens, ton chemin..." />
              <div>
                <FieldWithMic label="Ce que tu proposes aujourd'hui et pour qui" value={offre} onChange={setOffre} mic={micOffre} placeholder="Mon offre et ma cible..." />
                {propValue && (
                  <Button variant="ghost" size="sm" className="mt-1 text-xs" onClick={() => setOffre(propValue)}>
                    📥 Importer ma proposition de valeur
                  </Button>
                )}
              </div>
              <div>
                <label className="text-sm font-semibold text-foreground mb-1 block">Ton appel à l'action</label>
                <Input value={cta} onChange={(e) => setCta(e.target.value)} placeholder="Contacte-moi pour... / Découvre mes créations sur [lien]" />
              </div>
            </div>

            <Button onClick={generate} disabled={generating} className="rounded-pill gap-2">
              <Sparkles className="h-4 w-4" />
              {generating ? "Génération..." : "✨ Générer mon résumé"}
            </Button>

            {(summaryStory || summaryPro) && (
              <Tabs defaultValue="storytelling" className="mt-6">
                <TabsList>
                  <TabsTrigger value="storytelling">Version storytelling</TabsTrigger>
                  <TabsTrigger value="pro">Version pro</TabsTrigger>
                </TabsList>
                <TabsContent value="storytelling" className="space-y-3">
                  <Textarea value={summaryStory} onChange={(e) => setSummaryStory(e.target.value)} className="min-h-[250px]" />
                  <CharacterCounter count={summaryStory.length} max={2600} />
                  <LinkedInPreview text={summaryStory} cutoff={265} label="Résumé" />
                  <div className="flex gap-2">
                    <Button onClick={() => save(summaryStory)} className="rounded-pill gap-2">💾 Enregistrer</Button>
                    <Button variant="outline" onClick={() => copyText(summaryStory, "story")} className="rounded-pill gap-2">
                      {copied === "story" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copier
                    </Button>
                  </div>
                </TabsContent>
                <TabsContent value="pro" className="space-y-3">
                  <Textarea value={summaryPro} onChange={(e) => setSummaryPro(e.target.value)} className="min-h-[250px]" />
                  <CharacterCounter count={summaryPro.length} max={2600} />
                  <LinkedInPreview text={summaryPro} cutoff={265} label="Résumé" />
                  <div className="flex gap-2">
                    <Button onClick={() => save(summaryPro)} className="rounded-pill gap-2">💾 Enregistrer</Button>
                    <Button variant="outline" onClick={() => copyText(summaryPro, "pro")} className="rounded-pill gap-2">
                      {copied === "pro" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copier
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            )}

            {/* Example */}
            <div className="rounded-xl bg-rose-pale p-5 text-sm mt-6">
              <p className="font-semibold mb-2">👀 Exemple pour une marque de maroquinerie :</p>
              <p className="italic whitespace-pre-line">{"Peut-on créer des sacs beaux, durables... et porteurs de sens ? Moi, j'en suis convaincue.\n\nDepuis toujours, j'aime l'odeur du cuir, le travail des mains, et les objets qui racontent une histoire. Ce qui me motive ? Créer des pièces qui durent dans le temps et respectent le vivant.\n\nAujourd'hui, je conçois des sacs et accessoires en cuir, faits main dans mon atelier en Bourgogne. Chaque pièce est unique.\n\n👉 Contactez-moi pour une commande personnalisée."}</p>
            </div>
          </div>
        )}
      <Button variant="ghost" size="sm" className="text-xs text-muted-foreground mt-4" onClick={() => setHistoryOpen(true)}>
        📜 Voir l'historique de mes résumés
      </Button>
      <BioHistoryDrawer
        platform="linkedin"
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onReuse={(text) => { setExistingText(text); setMode("existing"); }}
      />
      </main>
    </div>
  );
}

/* ─── Sub-components ─── */

function FieldWithMic({ label, value, onChange, mic, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  mic: { toggle: () => void; isListening: boolean }; placeholder: string;
}) {
  return (
    <div>
      <label className="text-sm font-semibold text-foreground mb-1 block">{label}</label>
      <div className="relative">
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-h-[100px] pr-10" />
        <button onClick={mic.toggle} className={`absolute top-2 right-2 text-lg ${mic.isListening ? "animate-pulse text-primary" : ""}`}>🎙️</button>
      </div>
    </div>
  );
}

function AnalysisCards({ analysis, onSaveVersion, copyText, copied, onBack }: {
  analysis: ResumeAnalysis;
  onSaveVersion: (v: string) => void;
  copyText: (t: string, k: string) => void;
  copied: string | null;
  onBack?: () => void;
}) {
  const scoreColor = analysis.score >= 70 ? "hsl(142, 71%, 45%)" : analysis.score >= 40 ? "hsl(38, 92%, 50%)" : "hsl(0, 84%, 60%)";

  return (
    <div className="space-y-6">
      {onBack && (
        <Button variant="ghost" onClick={onBack} className="rounded-pill">← Modifier le texte</Button>
      )}

      {/* Score + Summary */}
      <div className="bg-rose-pale border-l-[3px] border-primary rounded-r-xl p-5">
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-base font-semibold text-foreground">🔍 Analyse de ton résumé actuel</h3>
          <ScoreBadge score={analysis.score} />
        </div>
        <div className="w-full h-2 bg-muted rounded-full mb-4">
          <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${analysis.score}%`, backgroundColor: scoreColor }} />
        </div>
        <div className="space-y-1.5">
          {analysis.summary.positives.map((p, i) => (
            <p key={`p-${i}`} className="text-sm text-foreground">✅ {p}</p>
          ))}
          {analysis.summary.improvements.map((p, i) => (
            <p key={`i-${i}`} className="text-sm text-muted-foreground">⚠️ {p}</p>
          ))}
        </div>
      </div>

      {/* Recommendations */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">📋 Analyse par élément</h3>
        {analysis.recommendations.map((reco) => (
          <div key={reco.number} className="bg-card border border-border rounded-xl p-5 space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center">
                {reco.number}
              </span>
              <h4 className="text-[15px] font-semibold text-foreground leading-tight">
                {statusIcon(reco.status)} {reco.title}
              </h4>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed pl-10">{reco.explanation}</p>
            {reco.example && (
              <div className="ml-10 bg-accent/30 border-l-[3px] border-accent rounded-r-lg px-4 py-3">
                <p className="text-sm text-foreground italic">💡 {reco.example}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Proposed version */}
      {analysis.proposed_version && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-foreground">✨ Version améliorée proposée</h3>
          <div className="border-2 border-primary rounded-2xl p-6 bg-card shadow-sm">
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{analysis.proposed_version}</p>
          </div>
          <CharacterCounter count={analysis.proposed_version.length} max={2600} />
          <LinkedInPreview text={analysis.proposed_version} cutoff={265} label="Résumé" />
          <div className="flex gap-3">
            <Button onClick={() => onSaveVersion(analysis.proposed_version!)} className="rounded-pill gap-2">
              💾 Enregistrer cette version
            </Button>
            <Button variant="outline" onClick={() => copyText(analysis.proposed_version!, "proposed")} className="rounded-pill gap-2">
              {copied === "proposed" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Copier
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
