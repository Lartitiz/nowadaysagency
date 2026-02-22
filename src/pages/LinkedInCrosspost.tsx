import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Copy, Check, CalendarDays, Sparkles, Loader2 } from "lucide-react";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import BaseReminder from "@/components/BaseReminder";

const SOURCE_TYPES = [
  { id: "newsletter", label: "📧 Ma newsletter" },
  { id: "instagram", label: "📸 Mon post Instagram" },
  { id: "linkedin", label: "💼 Mon post LinkedIn" },
  { id: "libre", label: "📝 Texte libre" },
];

const TARGET_CHANNELS = [
  { id: "linkedin", label: "💼 Post LinkedIn", desc: "Version expert·e, données" },
  { id: "instagram", label: "📸 Carrousel Instagram", desc: "Version visuelle, pédago" },
  { id: "reel", label: "🎬 Script Reel", desc: "Version punchy, 30-60 sec" },
  { id: "stories", label: "📱 Séquence Stories", desc: "Version intime, 5 stories" },
];

interface CrosspostResult {
  versions: Record<string, { full_text?: string; script?: string; sequence?: any[]; character_count?: number; angle_choisi: string; duration?: string }>;
}

export default function LinkedInCrosspost() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sourceType, setSourceType] = useState("libre");
  const [sourceContent, setSourceContent] = useState("");
  const [targets, setTargets] = useState<Set<string>>(new Set(["linkedin", "instagram"]));
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<CrosspostResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const toggleTarget = (id: string) => {
    const next = new Set(targets);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTargets(next);
  };

  const generate = async () => {
    if (!sourceContent.trim() || targets.size === 0) return;
    setGenerating(true);
    setResult(null);
    try {
      const res = await supabase.functions.invoke("linkedin-ai", {
        body: {
          action: "crosspost",
          sourceContent,
          sourceType,
          targetChannels: Array.from(targets),
        },
      });
      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";
      let parsed: CrosspostResult;
      try { parsed = JSON.parse(content); } catch {
        const match = content.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
        else throw new Error("Format de réponse inattendu");
      }
      setResult(parsed);
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentTo="/linkedin" parentLabel="LinkedIn" currentLabel="Crossposting" />

        <h1 className="font-display text-[22px] font-bold text-foreground mb-1">🔄 Crossposting intelligent</h1>
        <p className="text-sm text-muted-foreground mb-6">Un contenu source → adapté pour chaque canal. Pas du copier-coller : chaque version apporte un angle spécifique.</p>

        {/* Source type */}
        <div className="mb-4">
          <p className="text-sm font-medium text-foreground mb-2">Contenu source :</p>
          <div className="flex flex-wrap gap-2">
            {SOURCE_TYPES.map((s) => (
              <button key={s.id} onClick={() => setSourceType(s.id)} className={`text-sm px-4 py-2 rounded-full border transition-all ${sourceType === s.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"}`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Source content */}
        <Textarea
          value={sourceContent}
          onChange={(e) => setSourceContent(e.target.value)}
          placeholder="Colle ton contenu ici..."
          className="min-h-[150px] mb-4"
        />

        {/* Target channels */}
        <div className="mb-5">
          <p className="text-sm font-medium text-foreground mb-2">Transformer en :</p>
          <div className="grid grid-cols-2 gap-2">
            {TARGET_CHANNELS.map((ch) => (
              <button
                key={ch.id}
                onClick={() => toggleTarget(ch.id)}
                className={`rounded-xl border-2 p-3 text-left transition-all ${targets.has(ch.id) ? "border-primary bg-secondary" : "border-border hover:border-primary/40"}`}
              >
                <span className="text-sm font-semibold block">{ch.label}</span>
                <span className="text-xs text-muted-foreground">{ch.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <Button onClick={generate} disabled={generating || !sourceContent.trim() || targets.size === 0} className="rounded-full gap-2 mb-6">
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {generating ? "Adaptation en cours..." : "✨ Adapter pour chaque canal"}
        </Button>

        {/* Results */}
        {result && result.versions && !generating && (
          <div className="space-y-4 animate-fade-in">
            <Tabs defaultValue={Object.keys(result.versions)[0]}>
              <TabsList>
                {Object.keys(result.versions).map((key) => {
                  const label = TARGET_CHANNELS.find((c) => c.id === key)?.label || key;
                  return <TabsTrigger key={key} value={key}>{label}</TabsTrigger>;
                })}
              </TabsList>
              {Object.entries(result.versions).map(([key, version]) => {
                const text = version.full_text || version.script || JSON.stringify(version.sequence, null, 2) || "";
                return (
                  <TabsContent key={key} value={key} className="space-y-3">
                    <div className="rounded-xl border border-border bg-card p-5">
                      <p className="whitespace-pre-line text-sm text-foreground leading-relaxed">{text}</p>
                      {version.character_count && (
                        <p className="text-xs text-muted-foreground mt-3">📊 {version.character_count} caractères</p>
                      )}
                      <p className="text-xs text-primary mt-1">💡 Angle choisi : {version.angle_choisi}</p>
                    </div>
                    <RedFlagsChecker content={text} onFix={() => {}} />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleCopy(text, key)} className="rounded-full gap-1.5">
                        {copied === key ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied === key ? "Copié !" : "Copier"}
                      </Button>
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
            <BaseReminder variant="atelier" />
          </div>
        )}
      </main>
    </div>
  );
}
