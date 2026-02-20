import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Copy, Check } from "lucide-react";

const PERSON_TYPES = [
  { value: "client", label: "Client·e" },
  { value: "partner", label: "Partenaire" },
  { value: "colleague", label: "Collègue" },
  { value: "other", label: "Autre" },
];

interface Reco {
  id?: string;
  person_name: string;
  person_type: string;
  request_sent: boolean;
  reco_received: boolean;
}

export default function LinkedInRecommandations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [prenom, setPrenom] = useState("");
  const [recos, setRecos] = useState<Reco[]>(
    Array.from({ length: 5 }, () => ({ person_name: "", person_type: "client", request_sent: false, reco_received: false }))
  );
  const [copied, setCopied] = useState(false);
  const [messageVariants, setMessageVariants] = useState<string[]>([]);
  const [generatingMsg, setGeneratingMsg] = useState(false);

  // Draft recommendation
  const [draftName, setDraftName] = useState("");
  const [draftType, setDraftType] = useState("");
  const [draftHighlights, setDraftHighlights] = useState("");
  const [draftResult, setDraftResult] = useState("");
  const [generatingDraft, setGeneratingDraft] = useState(false);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const [profRes, recoRes] = await Promise.all([
        supabase.from("profiles").select("prenom").eq("user_id", user.id).maybeSingle(),
        supabase.from("linkedin_recommendations").select("*").eq("user_id", user.id).order("created_at"),
      ]);
      if (profRes.data?.prenom) setPrenom(profRes.data.prenom);
      if (recoRes.data && recoRes.data.length > 0) {
        const loaded: Reco[] = recoRes.data.map((r: any) => ({ id: r.id, person_name: r.person_name || "", person_type: r.person_type || "client", request_sent: r.request_sent || false, reco_received: r.reco_received || false }));
        while (loaded.length < 5) loaded.push({ person_name: "", person_type: "client", request_sent: false, reco_received: false });
        setRecos(loaded);
      }
    };
    load();
  }, [user]);

  const updateReco = (idx: number, field: keyof Reco, value: any) => {
    setRecos(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  const saveRecos = async () => {
    if (!user) return;
    await supabase.from("linkedin_recommendations").delete().eq("user_id", user.id);
    const toInsert = recos.filter(r => r.person_name.trim()).map(r => ({
      user_id: user.id, person_name: r.person_name, person_type: r.person_type, request_sent: r.request_sent, reco_received: r.reco_received,
    }));
    if (toInsert.length > 0) await supabase.from("linkedin_recommendations").insert(toInsert);
    toast({ title: "✅ Recommandations sauvegardées !" });
  };

  const messageTemplate = `Hello [Prénom],

Je voulais te demander un petit coup de pouce : pourrais-tu me laisser une reco sur LinkedIn ?

Pour te faciliter la tâche, je t'ai préparé un brouillon à adapter librement. C'est juste pour te faire gagner du temps 😅.

Merci beaucoup, ça me toucherait beaucoup d'avoir ton retour !

${prenom || "[Ton prénom]"}`;

  const copyMessage = () => {
    navigator.clipboard.writeText(messageTemplate);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "📋 Copié !" });
  };

  const personalizeMessage = async () => {
    setGeneratingMsg(true);
    try {
      const res = await supabase.functions.invoke("linkedin-ai", { body: { action: "personalize-message" } });
      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";
      let parsed: string[];
      try { parsed = JSON.parse(content); } catch { const m = content.match(/\[[\s\S]*\]/); parsed = m ? JSON.parse(m[0]) : []; }
      setMessageVariants(parsed);
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setGeneratingMsg(false);
    }
  };

  const generateDraft = async () => {
    setGeneratingDraft(true);
    try {
      const res = await supabase.functions.invoke("linkedin-ai", {
        body: { action: "draft-recommendation", person_name: draftName, collab_type: draftType, highlights: draftHighlights },
      });
      if (res.error) throw new Error(res.error.message);
      setDraftResult(res.data?.content || "");
    } catch (e: any) {
      toast({ title: "Erreur", description: e.message, variant: "destructive" });
    } finally {
      setGeneratingDraft(false);
    }
  };

  const requestedCount = recos.filter(r => r.request_sent).length;
  const receivedCount = recos.filter(r => r.reco_received).length;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentTo="/linkedin" parentLabel="LinkedIn" currentLabel="Mes recommandations" />

        <h1 className="font-display text-[22px] font-bold text-foreground mb-1">Tes recommandations</h1>
        <p className="text-sm text-muted-foreground italic mb-6">Les recommandations LinkedIn sont de vraies preuves sociales. Elles rassurent et renforcent ta crédibilité.</p>

        {/* Exercise */}
        <section className="space-y-4 mb-10">
          <p className="text-sm text-muted-foreground">Identifie 5 personnes à qui demander une recommandation.</p>

          <div className="flex items-center gap-3 mb-4">
            <Progress value={(requestedCount / 5) * 100} className="flex-1 h-2" />
            <span className="text-sm font-mono font-bold text-primary">{requestedCount}/5 demandées</span>
          </div>

          <div className="space-y-3">
            {recos.map((r, idx) => (
              <div key={idx} className="flex items-center gap-3 flex-wrap">
                <span className="text-xs font-mono text-muted-foreground w-4">{idx + 1}.</span>
                <Input value={r.person_name} onChange={e => updateReco(idx, "person_name", e.target.value)} placeholder="Nom de la personne" className="flex-1 min-w-[140px]" />
                <Select value={r.person_type} onValueChange={v => updateReco(idx, "person_type", v)}>
                  <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                  <SelectContent>{PERSON_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Checkbox checked={r.request_sent} onCheckedChange={v => updateReco(idx, "request_sent", !!v)} />
                  <span className="text-xs">Envoyée</span>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox checked={r.reco_received} onCheckedChange={v => updateReco(idx, "reco_received", !!v)} />
                  <span className="text-xs">Reçue</span>
                </div>
              </div>
            ))}
          </div>

          <Button onClick={saveRecos} variant="outline" className="rounded-pill gap-2">💾 Enregistrer</Button>
        </section>

        {/* Message template */}
        <section className="space-y-4 mb-10">
          <h2 className="font-display text-lg font-bold">Modèle de message</h2>
          <div className="rounded-xl bg-rose-pale p-5 relative">
            <button onClick={copyMessage} className="absolute top-3 right-3 text-xs flex items-center gap-1 text-primary hover:underline">
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              {copied ? "Copié !" : "📋 Copier"}
            </button>
            <p className="text-sm whitespace-pre-line font-mono leading-relaxed">{messageTemplate}</p>
          </div>
          <Button variant="outline" onClick={personalizeMessage} disabled={generatingMsg} className="rounded-pill gap-2">
            <Sparkles className="h-4 w-4" />
            {generatingMsg ? "Personnalisation..." : "✨ Personnaliser mon message"}
          </Button>
          {messageVariants.length > 0 && (
            <div className="space-y-2">
              {messageVariants.map((v, i) => (
                <div key={i} className="rounded-lg bg-muted/50 p-3">
                  <p className="text-sm whitespace-pre-line">{v}</p>
                  <button onClick={() => { navigator.clipboard.writeText(v); toast({ title: "📋 Copié !" }); }} className="text-xs text-primary mt-2 hover:underline">📋 Copier</button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Draft recommendation */}
        <section className="space-y-4 mb-10">
          <h2 className="font-display text-lg font-bold">Rédiger un brouillon de recommandation</h2>
          <p className="text-sm text-muted-foreground">Facilite la tâche à la personne en lui envoyant un brouillon.</p>
          <Input value={draftName} onChange={e => setDraftName(e.target.value)} placeholder="Pour qui ?" />
          <Input value={draftType} onChange={e => setDraftType(e.target.value)} placeholder="Quel type de collaboration ?" />
          <Textarea value={draftHighlights} onChange={e => setDraftHighlights(e.target.value)} placeholder="Ce que tu veux mettre en avant..." className="min-h-[80px]" />
          <Button onClick={generateDraft} disabled={generatingDraft} variant="outline" className="rounded-pill gap-2">
            <Sparkles className="h-4 w-4" />
            {generatingDraft ? "Rédaction..." : "✨ Rédiger un brouillon"}
          </Button>
          {draftResult && (
            <div className="space-y-2">
              <Textarea value={draftResult} onChange={e => setDraftResult(e.target.value)} className="min-h-[150px]" />
              <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard.writeText(draftResult); toast({ title: "📋 Copié !" }); }} className="gap-1">
                <Copy className="h-3 w-3" /> Copier
              </Button>
            </div>
          )}
        </section>

        {/* Tip */}
        <div className="rounded-xl bg-rose-pale p-5 text-sm">
          💡 Pour augmenter tes chances d'en recevoir, commence par en écrire une spontanément pour quelqu'un d'autre. Souvent, la personne te renverra la pareille !
        </div>
      </main>
    </div>
  );
}
