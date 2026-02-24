import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, Copy, Check, RefreshCw, CalendarDays, Loader2 } from "lucide-react";
import BaseReminder from "@/components/BaseReminder";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import { LINKEDIN_TIPS } from "@/lib/linkedin-data";

const TEMPLATES = [
  { id: "storytelling", emoji: "📖", label: "Storytelling pro", desc: "Parcours, échec, leçon" },
  { id: "etude_de_cas", emoji: "📊", label: "Étude de cas", desc: "Résultat client, avant/après" },
  { id: "prise_de_position", emoji: "😤", label: "Prise de position", desc: "Opinion tranchée" },
  { id: "educatif", emoji: "📚", label: "Éducatif", desc: "Framework, méthode, tuto" },
  { id: "decryptage", emoji: "📰", label: "Décryptage actu", desc: "Tendance + angle expert" },
  { id: "permission", emoji: "🤝", label: "Permission", desc: "Donner le droit de..." },
];

const AUDIENCES = [
  { id: "solopreneuses", emoji: "🎨", label: "Solopreneuses / Créatrices", desc: 'Ton "tu", intime-expert' },
  { id: "structures", emoji: "🏛️", label: "Structures (coops, assos)", desc: 'Ton "vous", expert-crédible' },
  { id: "mixte", emoji: "🌐", label: "Les deux", desc: "Ton mixte" },
];

interface PostResult {
  hook: string;
  body: string;
  cta: string;
  full_text: string;
  character_count: number;
  hashtags: string[];
  template_used: string;
  checklist: { item: string; ok: boolean }[];
}

export default function LinkedInPostGenerator() {
  const { user } = useAuth();
  const { toast } = useToast();
  const workspaceId = useWorkspaceId();
  const [template, setTemplate] = useState<string | null>(null);
  const [audience, setAudience] = useState("solopreneuses");
  const [sujet, setSujet] = useState("");
  const [anecdote, setAnecdote] = useState("");
  const [emotion, setEmotion] = useState("");
  const [conviction, setConviction] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<PostResult | null>(null);
  const [copied, setCopied] = useState(false);

  // Random tip
  const [tipIdx] = useState(() => Math.floor(Math.random() * LINKEDIN_TIPS.length));
  const tip = LINKEDIN_TIPS[tipIdx];

  const generate = async () => {
    if (!template || !sujet.trim()) {
      toast({ title: "Choisis un template et un sujet", variant: "destructive" });
      return;
    }
    setGenerating(true);
    setResult(null);
    try {
      const res = await supabase.functions.invoke("linkedin-ai", {
        body: { action: "generate-post", template, audience, sujet, anecdote, emotion, conviction },
      });
      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";
      let parsed: PostResult;
      try {
        parsed = JSON.parse(content);
      } catch {
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

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.full_text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCalendar = async () => {
    if (!user || !result) return;
    const dateStr = new Date().toISOString().split("T")[0];
    await supabase.from("calendar_posts").insert({
      user_id: user.id,
      workspace_id: workspaceId !== user.id ? workspaceId : undefined,
      date: dateStr,
      theme: sujet,
      angle: template,
      canal: "linkedin",
      status: "idea",
      content_draft: result.full_text,
    });
    toast({ title: "Ajouté au calendrier LinkedIn !" });
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentTo="/linkedin" parentLabel="LinkedIn" currentLabel="Rédiger un post" useFromParam />

        <h1 className="font-display text-[22px] font-bold text-foreground mb-1">✍️ Rédige ton post LinkedIn</h1>
        <p className="text-sm text-muted-foreground italic mb-6">L'IA structure. Toi, tu incarnes.</p>

        {/* Tip */}
        <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-2.5 text-sm text-foreground mb-6">
          💡 {tip.text} <span className="text-xs text-muted-foreground">— {tip.source}</span>
        </div>

        {/* Audience */}
        <div className="mb-5">
          <p className="text-sm font-medium text-foreground mb-2">Tu t'adresses à qui sur LinkedIn ?</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {AUDIENCES.map((a) => (
              <button
                key={a.id}
                onClick={() => setAudience(a.id)}
                className={`rounded-xl border-2 p-3 text-left transition-all ${
                  audience === a.id ? "border-primary bg-secondary" : "border-border hover:border-primary/40"
                }`}
              >
                <span className="text-sm font-semibold block">{a.emoji} {a.label}</span>
                <span className="text-xs text-muted-foreground">{a.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Template */}
        <div className="mb-5">
          <p className="text-sm font-medium text-foreground mb-2">Quel type de post ?</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTemplate(template === t.id ? null : t.id)}
                className={`rounded-xl border-2 p-3 text-left transition-all ${
                  template === t.id ? "border-primary bg-secondary" : "border-border hover:border-primary/40"
                }`}
              >
                <span className="text-sm font-semibold block">{t.emoji} {t.label}</span>
                <span className="text-xs text-muted-foreground">{t.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Subject */}
        <div className="mb-4">
          <Input
            value={sujet}
            onChange={(e) => setSujet(e.target.value)}
            placeholder="De quoi tu veux parler ?"
            className="h-12"
            onKeyDown={(e) => e.key === "Enter" && generate()}
          />
        </div>

        {/* Pre-gen questions (collapsed) */}
        <details className="mb-4">
          <summary className="text-sm text-primary font-medium cursor-pointer">
            💬 Ajouter ta touche perso (optionnel)
          </summary>
          <div className="mt-3 space-y-3 pl-1">
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Une anecdote perso liée au sujet ?</label>
              <Textarea value={anecdote} onChange={(e) => setAnecdote(e.target.value)} placeholder="Un truc qui t'est arrivé..." className="min-h-[60px]" />
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Quelle émotion tu veux provoquer ?</label>
              <div className="flex flex-wrap gap-1.5">
                {["💡 Déclic", "😮‍💨 Soulagement", "💪 Motivation", "🪞 Identification", "🤔 Curiosité", "😤 Colère douce"].map((e) => (
                  <button
                    key={e}
                    onClick={() => setEmotion(emotion === e ? "" : e)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${emotion === e ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1 block">Un truc que tu veux absolument dire ?</label>
              <Input value={conviction} onChange={(e) => setConviction(e.target.value)} placeholder="Une phrase, une conviction..." />
            </div>
          </div>
        </details>

        {/* Generate button */}
        <Button onClick={generate} disabled={generating || !template} className="rounded-full gap-2 mb-6">
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {generating ? "Rédaction en cours..." : "✨ Rédiger mon post LinkedIn"}
        </Button>

        {/* Result */}
        {result && !generating && (
          <div className="space-y-4 animate-fade-in">
            <div className="rounded-2xl border border-border bg-card p-6">
              <p className="whitespace-pre-line text-sm text-foreground leading-relaxed">{result.full_text}</p>
              <div className="flex items-center gap-3 mt-4 text-xs text-muted-foreground">
                <span>📊 {result.character_count} / 2 000 caractères</span>
                {result.character_count <= 210 && <span>✅ Accroche dans les 210 car.</span>}
                <span>🏷️ {result.hashtags?.length || 0} hashtag{(result.hashtags?.length || 0) > 1 ? "s" : ""}</span>
              </div>
            </div>

            {/* Checklist */}
            {result.checklist && (
              <div className="rounded-xl bg-muted/50 p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Checklist LinkedIn</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {result.checklist.map((c, i) => (
                    <p key={i} className="text-xs text-foreground">
                      {c.ok ? "✅" : "⚠️"} {c.item}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Red flags */}
            <RedFlagsChecker content={result.full_text} onFix={(fixed) => setResult({ ...result, full_text: fixed })} />

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={handleCopy} className="rounded-full gap-1.5">
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copié !" : "Copier"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleCalendar} className="rounded-full gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" /> Calendrier
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setResult(null); generate(); }} className="rounded-full gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> Regénérer
              </Button>
            </div>

            {/* Base reminder */}
            <BaseReminder variant="atelier" />
          </div>
        )}
      </main>
    </div>
  );
}
