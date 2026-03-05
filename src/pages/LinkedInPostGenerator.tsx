import { useState, useEffect, useCallback, useRef } from "react";
import { parseAIResponse } from "@/lib/parse-ai-response";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceId, useProfileUserId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Button } from "@/components/ui/button";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { TextareaWithVoice as Textarea } from "@/components/ui/textarea-with-voice";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/error-messages";
import { Sparkles, Copy, Check, RefreshCw, CalendarDays, Loader2, Search, Lightbulb } from "lucide-react";
import { SaveToIdeasDialog } from "@/components/SaveToIdeasDialog";
import BaseReminder from "@/components/BaseReminder";
import AiGeneratedMention from "@/components/AiGeneratedMention";
import RedFlagsChecker from "@/components/RedFlagsChecker";
import { useUserPlan } from "@/hooks/use-user-plan";
import CreditWarning from "@/components/CreditWarning";
import LinkedInPreview from "@/components/linkedin/LinkedInPreview";
import CharacterCounter from "@/components/linkedin/CharacterCounter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LINKEDIN_TIPS, LINKEDIN_TEMPLATES_UI, LINKEDIN_HOOK_TYPES, OBJECTIF_COLORS } from "@/lib/linkedin-data";
import { useFormPersist } from "@/hooks/use-form-persist";

const AUDIENCES = [
  { id: "tu", emoji: "🙋", label: 'Tutoiement ("tu")', desc: "Direct, intime, chaleureux" },
  { id: "vous", emoji: "🤝", label: 'Vouvoiement ("vous")', desc: "Pro, crédible, respectueux" },
  { id: "mixte", emoji: "🌐", label: "Ton mixte", desc: "Adapté selon le contexte" },
];

interface PostResult {
  hook: string;
  body: string;
  cta: string;
  full_text: string;
  character_count: number;
  hashtags: string[];
  template_used: string;
  hook_type_used?: string;
  hook_alternatives?: string[];
  checklist: { item: string; ok: boolean }[];
}

interface ImproveResult {
  score: number;
  points_forts: string[];
  points_faibles: string[];
  accroche_analysis: string;
  improved_version: string;
  hook_alternatives: string[];
  character_count: number;
  checklist: { item: string; ok: boolean }[];
}

export default function LinkedInPostGenerator() {
  const { user } = useAuth();
  const { toast } = useToast();
  const workspaceId = useWorkspaceId();
  const profileUserId = useProfileUserId();
  const navigate = useNavigate();
  const location = useLocation();
  const calendarState = location.state as {
    fromCalendar?: boolean;
    calendarPostId?: string;
    theme?: string;
    sujet?: string;
    objectif?: string;
    angle?: string;
    notes?: string;
  } | null;

  // Mode
  const [mode, setMode] = useState<"create" | "improve">("create");

  // Create mode state
  const [template, setTemplate] = useState<string | null>(null);
  const [audience, setAudience] = useState("tu");
  const [sujet, setSujet] = useState(calendarState?.sujet || calendarState?.theme || "");
  const [anecdote, setAnecdote] = useState(calendarState?.notes || "");
  const [emotion, setEmotion] = useState("");
  const [conviction, setConviction] = useState("");
  const [hookType, setHookType] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const { canGenerate, remainingTotal } = useUserPlan();
  const quotaBlocked = !canGenerate("content");
  const [result, setResult] = useState<PostResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [suggestedTemplate, setSuggestedTemplate] = useState<{ id: string; reason: string } | null>(null);
  const [suggestingTemplate, setSuggestingTemplate] = useState(false);

  // Improve mode state
  const [existingPost, setExistingPost] = useState("");
  const [improving, setImproving] = useState(false);
  const [improveResult, setImproveResult] = useState<ImproveResult | null>(null);
  const [copiedImprove, setCopiedImprove] = useState<string | null>(null);
  const [showIdeasDialog, setShowIdeasDialog] = useState(false);
  const [ideasContent, setIdeasContent] = useState("");

  const { restored: draftRestored, clearDraft } = useFormPersist(
    "linkedin-post-form",
    { mode, template, audience, sujet, anecdote, emotion, conviction, hookType },
    (saved) => {
      if (calendarState) return;
      if (saved.mode) setMode(saved.mode);
      if (saved.template) setTemplate(saved.template);
      if (saved.audience) setAudience(saved.audience);
      if (saved.sujet) setSujet(saved.sujet);
      if (saved.anecdote) setAnecdote(saved.anecdote);
      if (saved.emotion) setEmotion(saved.emotion);
      if (saved.conviction) setConviction(saved.conviction);
      if (saved.hookType) setHookType(saved.hookType);
    }
  );

  // ── Persist generated result ──
  const LINKEDIN_RESULT_KEY = "linkedin_post_result";
  const resultRestoredRef = useRef(false);

  useEffect(() => {
    if (resultRestoredRef.current) return;
    if (calendarState) return;
    resultRestoredRef.current = true;
    try {
      const raw = sessionStorage.getItem(LINKEDIN_RESULT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.result) setResult(saved.result);
      if (saved.improveResult) setImproveResult(saved.improveResult);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!result && !improveResult) return;
    try {
      sessionStorage.setItem(LINKEDIN_RESULT_KEY, JSON.stringify({ result, improveResult }));
    } catch { /* ignore */ }
  }, [result, improveResult]);

  // Random tip
  // Auto-suggest template when subject is pre-filled
  const suggestTemplate = useCallback(async (text: string) => {
    if (!text.trim() || suggestingTemplate) return;
    setSuggestingTemplate(true);
    setSuggestedTemplate(null);
    try {
      const res = await supabase.functions.invoke("linkedin-ai", {
        body: { action: "suggest-template", sujet: text, workspace_id: workspaceId !== user?.id ? workspaceId : undefined },
      });
      if (res.error) throw res.error;
      const raw = res.data?.content || "{}";
      const parsed = typeof raw === "string" ? JSON.parse(raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim()) : raw;
      if (parsed?.template_id) {
        setSuggestedTemplate({ id: parsed.template_id, reason: parsed.reason || "" });
        if (!template) setTemplate(parsed.template_id);
      }
    } catch (e) {
      console.warn("Template suggestion failed:", e);
    } finally {
      setSuggestingTemplate(false);
    }
  }, [suggestingTemplate, template, workspaceId, user?.id]);

  // Auto-trigger suggestion when subject is pre-filled from navigation
  useEffect(() => {
    if (sujet.trim() && (calendarState?.fromCalendar || calendarState?.sujet || calendarState?.theme)) {
      suggestTemplate(sujet);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        body: { action: "generate-post", template, audience, sujet, anecdote, emotion, conviction, hook_type: hookType, workspace_id: workspaceId !== user?.id ? workspaceId : undefined },
      });
      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";
      let parsed: PostResult = parseAIResponse(content);
      setResult(parsed);
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const improvePost = async () => {
    if (!existingPost.trim()) return;
    setImproving(true);
    setImproveResult(null);
    try {
      const res = await supabase.functions.invoke("linkedin-ai", {
        body: { action: "improve-post", postContent: existingPost, workspace_id: workspaceId !== user?.id ? workspaceId : undefined },
      });
      if (res.error) throw new Error(res.error.message);
      const content = res.data?.content || "";
      let parsed: ImproveResult = parseAIResponse(content);
      setImproveResult(parsed);
    } catch (e: any) {
      console.error("Erreur technique:", e);
      toast({ title: "Erreur", description: friendlyError(e), variant: "destructive" });
    } finally {
      setImproving(false);
    }
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.full_text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: "Post copié ✅",
      description: "Reste 15-30 min après publication pour répondre aux premiers commentaires. C'est pendant la Golden Hour que la visibilité se joue.",
      duration: 8000,
    });
  };

  const copyImproveText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedImprove(key);
    setTimeout(() => setCopiedImprove(null), 2000);
    toast({ title: "📋 Copié !" });
  };

  const useHookAlternative = (hook: string) => {
    if (!improveResult) return;
    const lines = improveResult.improved_version.split("\n");
    // Replace first non-empty line(s) up to ~210 chars with the alternative hook
    let charCount = 0;
    let cutIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      charCount += lines[i].length + 1;
      if (charCount >= 210 || (i > 0 && charCount > 100)) {
        cutIdx = i + 1;
        break;
      }
    }
    if (cutIdx === 0) cutIdx = 1;
    const rest = lines.slice(cutIdx).join("\n");
    const newVersion = hook + "\n\n" + rest;
    setImproveResult({ ...improveResult, improved_version: newVersion, character_count: newVersion.length });
  };

  const getNextOptimalDate = () => {
    const now = new Date();
    const day = now.getDay(); // 0=Sun
    // Find next Tue(2), Wed(3), or Thu(4)
    let daysAhead = 0;
    for (let i = 1; i <= 7; i++) {
      const d = (day + i) % 7;
      if (d >= 2 && d <= 4) { daysAhead = i; break; }
    }
    const target = new Date(now);
    target.setDate(target.getDate() + daysAhead);
    target.setHours(8, 30, 0, 0);
    return target.toISOString().split("T")[0];
  };

  const handleCalendar = async (text: string) => {
    if (!user) return;

    if (calendarState?.fromCalendar && calendarState?.calendarPostId) {
      await supabase.from("calendar_posts").update({
        content_draft: text,
        accroche: text.split(/[.\n]/)[0]?.trim()?.slice(0, 200) || "",
        status: "drafting",
        format: "post_texte",
      }).eq("id", calendarState.calendarPostId);
      toast({ title: "✅ Post LinkedIn mis à jour dans ton calendrier !" });
      navigate("/calendrier");
      return;
    }

    const dateStr = getNextOptimalDate();
    const formattedDate = new Date(dateStr + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" });
    const { error } = await supabase.from("calendar_posts").insert({
      user_id: profileUserId,
      workspace_id: workspaceId !== profileUserId ? workspaceId : undefined,
      date: dateStr,
      theme: sujet || "Post LinkedIn",
      angle: template || "improve",
      canal: "linkedin",
      status: "drafting",
      content_draft: text,
      accroche: text.split(/[.\n]/)[0]?.trim()?.slice(0, 200) || "",
      format: "post_texte",
    });
    if (error) {
      console.error("calendar_posts insert error:", error);
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `📅 Post enregistré dans ton calendrier au ${formattedDate}` });
    }
  };

  const scoreColor = (score: number) => score >= 70 ? "text-green-600 bg-green-50" : score >= 40 ? "text-amber-600 bg-amber-50" : "text-red-600 bg-red-50";
  const scoreBarColor = (score: number) => score >= 70 ? "hsl(142, 71%, 45%)" : score >= 40 ? "hsl(38, 92%, 50%)" : "hsl(0, 84%, 60%)";

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-6 py-8 max-md:px-4">
        <SubPageHeader parentTo="/linkedin" parentLabel="LinkedIn" currentLabel="Rédiger un post" useFromParam />

        <h1 className="font-display text-[22px] font-bold text-foreground mb-1">✍️ Rédige ton post LinkedIn</h1>
        <p className="text-sm text-muted-foreground italic mb-6">L'IA structure. Toi, tu incarnes.</p>

        {/* Mode tabs */}
        <Tabs value={mode} onValueChange={(v) => setMode(v as "create" | "improve")} className="mb-6">
          <TabsList className="grid grid-cols-2 w-full max-w-md">
            <TabsTrigger value="create">✨ Créer un post</TabsTrigger>
            <TabsTrigger value="improve">🔧 Améliorer un post</TabsTrigger>
          </TabsList>

          {/* ─── CREATE TAB ─── */}
          <TabsContent value="create" className="space-y-5 mt-4">
            {/* Tip */}
            <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-2.5 text-sm text-foreground">
              💡 {tip.text} <span className="text-xs text-muted-foreground">— {tip.source}</span>
            </div>

            {/* Audience */}
            <div>
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
            <div>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-sm font-medium text-foreground">Quel type de post ?</p>
                {!suggestedTemplate && !suggestingTemplate && sujet.trim() && (
                  <button
                    onClick={() => suggestTemplate(sujet)}
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <Lightbulb className="h-3 w-3" /> L'IA recommande
                  </button>
                )}
                {suggestingTemplate && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Analyse en cours…
                  </span>
                )}
              </div>
              {suggestedTemplate && (
                <div className="mb-3 rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-foreground flex items-start gap-2">
                  <Lightbulb className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                  <span>
                    <span className="font-medium">Recommandé :</span>{" "}
                    {LINKEDIN_TEMPLATES_UI.find(t => t.id === suggestedTemplate.id)?.emoji}{" "}
                    {LINKEDIN_TEMPLATES_UI.find(t => t.id === suggestedTemplate.id)?.label}
                    {suggestedTemplate.reason && <span className="text-muted-foreground"> — {suggestedTemplate.reason}</span>}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {LINKEDIN_TEMPLATES_UI.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTemplate(template === t.id ? null : t.id)}
                    className={`rounded-xl border-2 p-3 text-left transition-all ${
                      template === t.id ? "border-primary bg-secondary" : "border-border hover:border-primary/40"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-sm font-semibold block">{t.emoji} {t.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border whitespace-nowrap ${OBJECTIF_COLORS[t.objectif] || "bg-muted"}`}>
                        {t.objectif}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Hook type */}
            <div>
              <p className="text-sm font-medium text-foreground mb-1">Type d'accroche (optionnel)</p>
              <p className="text-xs text-muted-foreground mb-2">L'accroche = les 210 premiers caractères. C'est ce qui décide si ton post sera lu ou non.</p>
              <div className="flex flex-wrap gap-1.5">
                {LINKEDIN_HOOK_TYPES.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => setHookType(hookType === h.id ? null : h.id)}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                      hookType === h.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary/40"
                    }`}
                    title={h.example}
                  >
                    {h.emoji} {h.label}
                  </button>
                ))}
              </div>
              {hookType && (
                <p className="text-xs text-muted-foreground mt-1.5 italic">
                  Ex : "{LINKEDIN_HOOK_TYPES.find(h => h.id === hookType)?.example}"
                </p>
              )}
            </div>

            {/* Subject */}
            <Input
              value={sujet}
              onChange={(e) => setSujet(e.target.value)}
              placeholder="De quoi tu veux parler ?"
              className="h-12"
              onKeyDown={(e) => e.key === "Enter" && generate()}
            />

            {/* Pre-gen questions */}
            <details>
              <summary className="text-sm text-primary-text font-medium cursor-pointer">
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
            <CreditWarning remaining={remainingTotal()} className="mb-3" />
            <Button onClick={generate} disabled={generating || !template || !sujet.trim() || quotaBlocked} className="rounded-full gap-2">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? "Rédaction en cours..." : "✨ Rédiger mon post LinkedIn"}
            </Button>
            {(!template || !sujet.trim()) && !generating && (
              <p className="text-xs text-muted-foreground mt-2">
                {!template ? "👆 Choisis un type de post au-dessus" : "✏️ Indique ton sujet pour continuer"}
              </p>
            )}

            {/* Create Result */}
            {result && !generating && (
              <div className="space-y-4 animate-fade-in">
                <div className="rounded-2xl border border-border bg-card p-6">
                  <p className="whitespace-pre-line text-sm text-foreground leading-relaxed">{result.full_text}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-4 text-xs text-muted-foreground">
                    <span>📊 <CharacterCounter count={result.character_count} max={3000} sweetSpot={{ min: 1300, max: 1900 }} /></span>
                    <span>🏷️ {result.hashtags?.length || 0} hashtag{(result.hashtags?.length || 0) > 1 ? "s" : ""}</span>
                    {result.template_used && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${OBJECTIF_COLORS[LINKEDIN_TEMPLATES_UI.find(t => t.id === result.template_used)?.objectif || ""] || "bg-muted"}`}>
                        {LINKEDIN_TEMPLATES_UI.find(t => t.id === result.template_used)?.label || result.template_used}
                      </span>
                    )}
                    {result.hook_type_used && result.hook_type_used !== "auto" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border bg-muted">
                        {LINKEDIN_HOOK_TYPES.find(h => h.id === result.hook_type_used)?.emoji} {LINKEDIN_HOOK_TYPES.find(h => h.id === result.hook_type_used)?.label || result.hook_type_used}
                      </span>
                    )}
                  </div>
                </div>

                {/* Hook alternatives */}
                {result.hook_alternatives && result.hook_alternatives.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">🔄 Autres accroches possibles</h4>
                    {result.hook_alternatives.map((hook, i) => (
                      <div key={i} className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
                        <p className="flex-1 text-sm text-foreground italic">"{hook}"</p>
                        <Button variant="ghost" size="sm" className="text-xs shrink-0" onClick={() => {
                          const currentHook = result.hook;
                          const newFullText = hook + result.full_text.slice(currentHook.length);
                          setResult({ ...result, full_text: newFullText, hook: hook, character_count: newFullText.length });
                        }}>
                          Utiliser
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <LinkedInPreview text={result.full_text} cutoff={210} label="Post" />

                {/* Timing suggestion */}
                <div className="rounded-lg bg-primary/5 border border-primary/20 px-4 py-2.5 text-sm text-foreground">
                  📅 <strong>Meilleur moment pour publier ce post :</strong> mardi à jeudi, entre 8h-9h ou 14h-15h.
                </div>

                {result.checklist && (
                  <div className="rounded-xl bg-muted/50 p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Checklist LinkedIn</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {result.checklist.map((c, i) => (
                        <p key={i} className="text-xs text-foreground">{c.ok ? "✅" : "⚠️"} {c.item}</p>
                      ))}
                    </div>
                  </div>
                )}

                <RedFlagsChecker content={result.full_text} onFix={(fixed) => setResult({ ...result, full_text: fixed })} />

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={handleCopy} className="rounded-full gap-1.5">
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copié !" : "Copier"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleCalendar(result.full_text)} className="rounded-full gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" /> Calendrier
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setResult(null); generate(); }} className="rounded-full gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5" /> Regénérer
                   </Button>
                   <Button variant="outline" size="sm" onClick={() => { setIdeasContent(result.full_text); setShowIdeasDialog(true); }} className="rounded-full gap-1.5">
                     <Lightbulb className="h-3.5 w-3.5" /> Sauvegarder en idée
                   </Button>
                </div>

                <AiGeneratedMention />
                <BaseReminder variant="atelier" />
              </div>
            )}
          </TabsContent>

          {/* ─── IMPROVE TAB ─── */}
          <TabsContent value="improve" className="space-y-5 mt-4">
            {!improveResult && (
              <>
                <div>
                  <label className="text-sm font-semibold text-foreground mb-2 block">📝 Colle ton post LinkedIn ici</label>
                  <Textarea
                    value={existingPost}
                    onChange={(e) => setExistingPost(e.target.value)}
                    placeholder="Copie-colle ton post LinkedIn existant..."
                    className="min-h-[200px]"
                  />
                  <div className="mt-1">
                    <CharacterCounter count={existingPost.length} max={3000} sweetSpot={{ min: 1300, max: 1900 }} />
                  </div>
                </div>

                {existingPost.trim() && (
                  <LinkedInPreview text={existingPost} cutoff={210} label="Post actuel" />
                )}

                <div className="flex gap-3">
                  <Button onClick={improvePost} disabled={improving || !existingPost.trim()} className="rounded-full gap-2">
                    {improving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    {improving ? "Analyse en cours..." : "🔍 Analyser et améliorer"}
                  </Button>
                </div>
              </>
            )}

            {improveResult && (
              <div className="space-y-6 animate-fade-in">
                <Button variant="ghost" onClick={() => setImproveResult(null)} className="rounded-full">← Modifier le post</Button>

                {/* Score + summary */}
                <div className="bg-secondary border-l-[3px] border-primary rounded-r-xl p-5">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="text-base font-semibold text-foreground">🔍 Analyse de ton post</h3>
                    <span className={`text-sm font-bold px-2.5 py-1 rounded-full ${scoreColor(improveResult.score)}`}>{improveResult.score}/100</span>
                  </div>
                  <div className="w-full h-2 bg-muted rounded-full mb-4">
                    <div className="h-2 rounded-full transition-all duration-500" style={{ width: `${improveResult.score}%`, backgroundColor: scoreBarColor(improveResult.score) }} />
                  </div>
                  <div className="space-y-1.5">
                    {improveResult.points_forts.map((p, i) => (
                      <p key={`f-${i}`} className="text-sm text-foreground">✅ {p}</p>
                    ))}
                    {improveResult.points_faibles.map((p, i) => (
                      <p key={`w-${i}`} className="text-sm text-muted-foreground">⚠️ {p}</p>
                    ))}
                  </div>
                </div>

                {/* Accroche analysis */}
                <div className="rounded-xl border border-border bg-card p-5">
                  <h4 className="text-sm font-semibold text-foreground mb-2">👁️ Analyse de l'accroche (210 premiers car.)</h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">{improveResult.accroche_analysis}</p>
                </div>

                {/* Hook alternatives */}
                {improveResult.hook_alternatives?.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">🔄 Accroches alternatives</h4>
                    {improveResult.hook_alternatives.map((hook, i) => (
                      <div key={i} className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
                        <p className="flex-1 text-sm text-foreground italic">"{hook}"</p>
                        <Button variant="ghost" size="sm" className="text-xs shrink-0" onClick={() => useHookAlternative(hook)}>
                          Utiliser
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Improved version */}
                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-foreground">✨ Version améliorée</h3>
                  <div className="border-2 border-primary rounded-2xl p-6 bg-card shadow-sm">
                    <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{improveResult.improved_version}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CharacterCounter count={improveResult.character_count} max={3000} sweetSpot={{ min: 1300, max: 1900 }} />
                  </div>
                </div>

                <LinkedInPreview text={improveResult.improved_version} cutoff={210} label="Post amélioré" />

                {/* Checklist */}
                {improveResult.checklist && (
                  <div className="rounded-xl bg-muted/50 p-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Checklist LinkedIn</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {improveResult.checklist.map((c, i) => (
                        <p key={i} className="text-xs text-foreground">{c.ok ? "✅" : "⚠️"} {c.item}</p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => copyImproveText(improveResult.improved_version, "improved")} className="rounded-full gap-1.5">
                    {copiedImprove === "improved" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copiedImprove === "improved" ? "Copié !" : "Copier"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleCalendar(improveResult.improved_version)} className="rounded-full gap-1.5">
                    <CalendarDays className="h-3.5 w-3.5" /> Calendrier
                   </Button>
                   <Button variant="outline" size="sm" onClick={() => { setIdeasContent(improveResult.improved_version); setShowIdeasDialog(true); }} className="rounded-full gap-1.5">
                     <Lightbulb className="h-3.5 w-3.5" /> Sauvegarder en idée
                   </Button>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
        <SaveToIdeasDialog
          open={showIdeasDialog}
          onOpenChange={setShowIdeasDialog}
          contentType="post_linkedin"
          subject={sujet || "Post LinkedIn"}
          contentData={{
            type: "linkedin_post",
            text: ideasContent,
            template: template || "improve",
          }}
          sourceModule="linkedin-post"
          format="post_texte"
        />
      </main>
    </div>
  );
}
