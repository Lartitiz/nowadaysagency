import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Copy, Check, Loader2 } from "lucide-react";
import AuditInsight from "@/components/AuditInsight";
export default function InstagramProfileNom() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [currentName, setCurrentName] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const [checklist, setChecklist] = useState({ keyword: false, under30: false, searchable: false });

  const handleGenerate = async () => {
    if (!user) return;
    setGenerating(true);
    try {
      const res = await supabase.functions.invoke("generate-content", {
        body: { type: "instagram-nom", profile: {} },
      });
      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";
      let parsed: string[];
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = content.split("\n").filter((l: string) => l.trim());
      }
      setSuggestions(parsed.slice(0, 3));
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const copyText = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopied(idx);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Mon profil" parentTo="/instagram/profil" currentLabel="Mon nom" />

        <h1 className="font-display text-[26px] font-bold text-foreground">📝 Mon nom Instagram</h1>
        <p className="mt-2 text-sm text-muted-foreground mb-6">
          Ton nom de profil est ta première chance d'être trouvée en recherche. Ajoute un mot-clé lié à ton activité.
        </p>

        <AuditInsight section="nom" />

        <div className="space-y-6">
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">Ton nom actuel</label>
            <Input
              value={currentName}
              onChange={e => setCurrentName(e.target.value)}
              placeholder="Ex: Marie Dupont"
            />
          </div>

          <Button onClick={handleGenerate} disabled={generating} className="rounded-pill gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Suggérer un nom optimisé
          </Button>

          {suggestions.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">Suggestions :</p>
              {suggestions.map((s, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
                  <p className="text-sm font-medium text-foreground">{s}</p>
                  <Button variant="outline" size="sm" onClick={() => copyText(s, i)} className="rounded-pill gap-1.5 shrink-0">
                    {copied === i ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied === i ? "Copié" : "Copier"}
                  </Button>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <p className="text-sm font-bold text-foreground">Checklist</p>
            {[
              { key: "keyword" as const, label: "Mon nom contient un mot-clé de mon activité" },
              { key: "under30" as const, label: "Mon nom fait moins de 30 caractères" },
              { key: "searchable" as const, label: "Mon nom est facile à chercher" },
            ].map(item => (
              <label key={item.key} className="flex items-center gap-3 cursor-pointer">
                <Checkbox
                  checked={checklist[item.key]}
                  onCheckedChange={v => setChecklist(prev => ({ ...prev, [item.key]: !!v }))}
                />
                <span className="text-sm text-foreground">{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
