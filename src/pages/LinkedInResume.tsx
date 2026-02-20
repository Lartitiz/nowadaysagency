import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Copy, Check } from "lucide-react";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";

export default function LinkedInResume() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [mode, setMode] = useState<"manual" | "ai" | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [manualSummary, setManualSummary] = useState("");
  const [passion, setPassion] = useState("");
  const [parcours, setParcours] = useState("");
  const [offre, setOffre] = useState("");
  const [cta, setCta] = useState("");
  const [summaryStory, setSummaryStory] = useState("");
  const [summaryPro, setSummaryPro] = useState("");
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [propValue, setPropValue] = useState<string | null>(null);

  const micPassion = useSpeechRecognition((t) => setPassion(p => p + " " + t));
  const micParcours = useSpeechRecognition((t) => setParcours(p => p + " " + t));
  const micOffre = useSpeechRecognition((t) => setOffre(p => p + " " + t));

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [lpRes, propRes] = await Promise.all([
        supabase.from("linkedin_profile").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("brand_proposition").select("version_final").eq("user_id", user.id).maybeSingle(),
      ]);
      if (lpRes.data) {
        setProfileId(lpRes.data.id);
        setSummaryStory(lpRes.data.summary_storytelling || "");
        setSummaryPro(lpRes.data.summary_pro || "");
        setManualSummary(lpRes.data.summary_final || "");
        if (lpRes.data.summary_final || lpRes.data.summary_storytelling) setMode("ai");
      }
      if (propRes.data?.version_final) setPropValue(propRes.data.version_final);
    };
    load();
  }, [user]);

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
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const save = async (text: string) => {
    if (!user) return;
    const payload = { user_id: user.id, summary_storytelling: summaryStory, summary_pro: summaryPro, summary_final: text, updated_at: new Date().toISOString() };
    if (profileId) {
      await supabase.from("linkedin_profile").update(payload).eq("id", profileId);
    } else {
      const { data } = await supabase.from("linkedin_profile").insert(payload).select("id").single();
      if (data) setProfileId(data.id);
    }
    toast({ title: "✅ Résumé enregistré !" });
  };

  const copyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
    toast({ title: "📋 Copié !" });
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentTo="/linkedin" parentLabel="LinkedIn" currentLabel="Mon résumé (À propos)" />

        <h1 className="font-display text-[22px] font-bold text-foreground mb-1">Ton résumé LinkedIn (À propos)</h1>
        <p className="text-sm text-muted-foreground italic mb-6">Ton titre attire. Ton résumé donne envie de te contacter. Pas besoin de lister ton CV : raconte.</p>

        {/* Structure guide */}
        <div className="rounded-xl bg-rose-pale p-5 text-sm mb-6 space-y-1">
          <p className="font-semibold">Un bon résumé LinkedIn, c'est 5 éléments :</p>
          <p>1. <strong>Hook</strong> : une phrase d'accroche qui intrigue</p>
          <p>2. <strong>Ta passion</strong> : pourquoi tu fais ce métier</p>
          <p>3. <strong>Ton parcours</strong> : d'où tu viens en 2-3 phrases</p>
          <p>4. <strong>Ce que tu proposes</strong> : ta valeur + ta cible</p>
          <p>5. <strong>Appel à l'action</strong> : "Contacte-moi pour..."</p>
        </div>

        {/* Mode selector */}
        {!mode && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            <button onClick={() => setMode("manual")} className="rounded-xl border border-border bg-card p-6 text-left hover:border-primary transition-all">
              <h3 className="font-display text-base font-bold mb-1">✍️ Je le rédige moi-même</h3>
              <p className="text-sm text-muted-foreground">Textarea libre avec la structure en guide.</p>
            </button>
            <button onClick={() => setMode("ai")} className="rounded-xl border border-border bg-card p-6 text-left hover:border-primary transition-all">
              <h3 className="font-display text-base font-bold mb-1">✨ L'IA m'aide à le rédiger</h3>
              <p className="text-sm text-muted-foreground">Formulaire guidé + génération IA.</p>
            </button>
          </div>
        )}

        {mode === "manual" && (
          <div className="space-y-4">
            <Textarea value={manualSummary} onChange={e => setManualSummary(e.target.value)} placeholder="Mon résumé LinkedIn..." className="min-h-[300px]" />
            <div className="flex gap-2">
              <Button onClick={() => save(manualSummary)} className="rounded-pill gap-2">💾 Enregistrer</Button>
              <Button variant="outline" onClick={() => copyText(manualSummary, "manual")} className="rounded-pill gap-2">
                {copied === "manual" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                Copier
              </Button>
            </div>
          </div>
        )}

        {mode === "ai" && (
          <div className="space-y-6">
            {/* Form fields */}
            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-foreground mb-1 block">Qu'est-ce qui te passionne dans ton métier ?</label>
                <div className="relative">
                  <Textarea value={passion} onChange={e => setPassion(e.target.value)} placeholder="Pourquoi tu fais ça..." className="min-h-[100px] pr-10" />
                  <button onClick={micPassion.toggle} className={`absolute top-2 right-2 text-lg ${micPassion.isListening ? "animate-pulse text-primary" : ""}`}>🎙️</button>
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold text-foreground mb-1 block">Ton parcours en quelques phrases</label>
                <div className="relative">
                  <Textarea value={parcours} onChange={e => setParcours(e.target.value)} placeholder="D'où tu viens, ton chemin..." className="min-h-[100px] pr-10" />
                  <button onClick={micParcours.toggle} className={`absolute top-2 right-2 text-lg ${micParcours.isListening ? "animate-pulse text-primary" : ""}`}>🎙️</button>
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold text-foreground mb-1 block">Ce que tu proposes aujourd'hui et pour qui</label>
                <div className="relative">
                  <Textarea value={offre} onChange={e => setOffre(e.target.value)} placeholder="Mon offre et ma cible..." className="min-h-[100px] pr-10" />
                  <button onClick={micOffre.toggle} className={`absolute top-2 right-2 text-lg ${micOffre.isListening ? "animate-pulse text-primary" : ""}`}>🎙️</button>
                </div>
                {propValue && (
                  <Button variant="ghost" size="sm" className="mt-1 text-xs" onClick={() => setOffre(propValue)}>
                    📥 Importer ma proposition de valeur
                  </Button>
                )}
              </div>
              <div>
                <label className="text-sm font-semibold text-foreground mb-1 block">Ton appel à l'action</label>
                <Input value={cta} onChange={e => setCta(e.target.value)} placeholder="Contacte-moi pour... / Découvre mes créations sur [lien]" />
              </div>
            </div>

            <Button onClick={generate} disabled={generating} className="rounded-pill gap-2">
              <Sparkles className="h-4 w-4" />
              {generating ? "Génération..." : "✨ Générer mon résumé"}
            </Button>

            {/* Results */}
            {(summaryStory || summaryPro) && (
              <Tabs defaultValue="storytelling" className="mt-6">
                <TabsList>
                  <TabsTrigger value="storytelling">Version storytelling</TabsTrigger>
                  <TabsTrigger value="pro">Version pro</TabsTrigger>
                </TabsList>
                <TabsContent value="storytelling" className="space-y-3">
                  <Textarea value={summaryStory} onChange={e => setSummaryStory(e.target.value)} className="min-h-[250px]" />
                  <div className="flex gap-2">
                    <Button onClick={() => save(summaryStory)} className="rounded-pill gap-2">💾 Enregistrer</Button>
                    <Button variant="outline" onClick={() => copyText(summaryStory, "story")} className="rounded-pill gap-2">
                      {copied === "story" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      Copier
                    </Button>
                  </div>
                </TabsContent>
                <TabsContent value="pro" className="space-y-3">
                  <Textarea value={summaryPro} onChange={e => setSummaryPro(e.target.value)} className="min-h-[250px]" />
                  <div className="flex gap-2">
                    <Button onClick={() => save(summaryPro)} className="rounded-pill gap-2">💾 Enregistrer</Button>
                    <Button variant="outline" onClick={() => copyText(summaryPro, "pro")} className="rounded-pill gap-2">
                      {copied === "pro" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      Copier
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            )}

            {/* Example */}
            <div className="rounded-xl bg-rose-pale p-5 text-sm mt-6">
              <p className="font-semibold mb-2">👀 Exemple pour une marque de maroquinerie :</p>
              <p className="italic whitespace-pre-line">Peut-on créer des sacs beaux, durables... et porteurs de sens ? Moi, j'en suis convaincue.

Depuis toujours, j'aime l'odeur du cuir, le travail des mains, et les objets qui racontent une histoire. Ce qui me motive ? Créer des pièces qui durent dans le temps et respectent le vivant.

Aujourd'hui, je conçois des sacs et accessoires en cuir, faits main dans mon atelier en Bourgogne. Chaque pièce est unique.

👉 Contactez-moi pour une commande personnalisée.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
