import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { Checkbox } from "@/components/ui/checkbox";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import BaseReminder from "@/components/BaseReminder";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import { Mic, MicOff, Sparkles, Loader2, Copy, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const FORMATS = [
  { id: "carrousel", label: "📑 Carrousel Instagram (8 slides)", checked: true },
  { id: "reel", label: "🎬 Script Reel (30-60 sec)", checked: true },
  { id: "stories", label: "📱 Séquence Stories (5 stories)", checked: true },
  { id: "linkedin", label: "💼 Post LinkedIn", checked: false },
  { id: "newsletter", label: "📧 Email / Newsletter", checked: false },
];

export default function ContentRecycling() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [source, setSource] = useState("");
  const [selectedFormats, setSelectedFormats] = useState<Record<string, boolean>>(
    Object.fromEntries(FORMATS.map(f => [f.id, f.checked]))
  );
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<string>("");

  const { isListening, isSupported, toggle } = useSpeechRecognition((text) => {
    setSource(prev => prev + (prev ? " " : "") + text);
  });

  const formats = Object.entries(selectedFormats).filter(([, v]) => v).map(([k]) => k);

  const handleRecycle = async () => {
    if (!source.trim() || formats.length === 0) return;
    setLoading(true);
    setResults({});
    try {
      const { data, error } = await supabase.functions.invoke("creative-flow", {
        body: {
          step: "recycle",
          contentType: "recycle",
          context: `Recyclage de contenu en ${formats.length} formats`,
          profile: {},
          sourceText: source,
          formats,
        },
      });
      if (error) throw error;
      const r = data?.results || {};
      setResults(r);
      setActiveTab(formats[0] || "");

      // Save to DB
      if (user) {
        await supabase.from("content_recycling").insert({
          user_id: user.id,
          source_text: source,
          formats_requested: formats,
          results: r,
        });
      }
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const copyContent = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copié !" });
  };

  const formatLabel = (id: string) => FORMATS.find(f => f.id === id)?.label || id;

  return (
    <div className="space-y-6 animate-fade-in">
      {Object.keys(results).length === 0 ? (
        <>
          <div>
            <p className="text-sm text-muted-foreground mb-3">
              Colle un contenu existant : newsletter, post, article, transcript de podcast, n'importe quoi.
            </p>
            <div className="relative">
              <Textarea
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder="Colle ton contenu ici..."
                className="min-h-[160px] pr-12"
              />
              {isSupported && (
                <button
                  onClick={toggle}
                  className={`absolute right-3 top-3 p-1.5 rounded-lg transition-colors ${
                    isListening ? "bg-primary text-primary-foreground animate-pulse" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              )}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-foreground mb-2">Transforme-le en :</p>
            <div className="space-y-2">
              {FORMATS.map(f => (
                <label key={f.id} className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={!!selectedFormats[f.id]}
                    onCheckedChange={(v) => setSelectedFormats(prev => ({ ...prev, [f.id]: !!v }))}
                  />
                  <span className="text-sm text-foreground">{f.label}</span>
                </label>
              ))}
            </div>
          </div>

          <Button onClick={handleRecycle} disabled={loading || !source.trim() || formats.length === 0} className="rounded-pill gap-1.5">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {loading ? "Recyclage en cours..." : "Recycler"}
          </Button>
        </>
      ) : (
        <>
          {/* Tabs */}
          <div className="flex flex-wrap gap-1.5 border-b border-border pb-2">
            {formats.map(f => (
              <button
                key={f}
                onClick={() => setActiveTab(f)}
                className={`px-3 py-1.5 text-sm font-medium rounded-t-lg transition-colors ${
                  activeTab === f
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {formatLabel(f)}
              </button>
            ))}
          </div>

          {/* Active content */}
          {activeTab && results[activeTab] && (
            <div className="space-y-3">
              <div className="rounded-xl bg-muted/30 p-4">
                <pre className="text-sm text-foreground whitespace-pre-wrap font-body">
                  {results[activeTab]}
                </pre>
              </div>

              <RedFlagsChecker
                content={results[activeTab]}
                onFix={(fixed) => setResults(prev => ({ ...prev, [activeTab]: fixed }))}
              />

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => copyContent(results[activeTab])} className="rounded-pill gap-1.5">
                  <Copy className="h-3.5 w-3.5" /> Copier
                </Button>
                <Button variant="ghost" size="sm" onClick={() => { setResults({}); setActiveTab(""); }} className="rounded-pill gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5" /> Nouveau recyclage
                </Button>
              </div>

              <BaseReminder variant="atelier" />
            </div>
          )}
        </>
      )}
    </div>
  );
}
