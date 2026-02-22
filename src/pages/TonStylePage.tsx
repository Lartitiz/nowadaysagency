import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import VoiceOnboarding from "@/components/VoiceOnboarding";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Check, Sparkles, ChevronDown, ChevronUp, Mic, Loader2, Copy, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";
import SaveButton from "@/components/SaveButton";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";

/* ─── Types ─── */
interface ToneProfile {
  id?: string;
  user_id: string;
  voice_description: string;
  combat_cause: string;
  combat_fights: string;
  combat_alternative: string;
  combat_refusals: string;
  tone_register: string;
  tone_level: string;
  tone_style: string;
  tone_humor: string;
  tone_engagement: string;
  key_expressions: string;
  things_to_avoid: string;
  target_verbatims: string;
  channels: string[];
}

const EMPTY: Omit<ToneProfile, "user_id"> = {
  voice_description: "",
  combat_cause: "", combat_fights: "", combat_alternative: "", combat_refusals: "",
  tone_register: "", tone_level: "", tone_style: "", tone_humor: "", tone_engagement: "",
  key_expressions: "", things_to_avoid: "", target_verbatims: "", channels: ["instagram"],
};

const TONE_OPTIONS = {
  register: [
    { value: "tu", label: "Tutoiement" },
    { value: "vous", label: "Vouvoiement" },
  ],
  level: [
    { value: "amie", label: "Comme une amie" },
    { value: "pro", label: "Pro accessible" },
    { value: "expert", label: "Expert·e" },
  ],
  style: [
    { value: "oral", label: "Oral assumé" },
    { value: "litteraire", label: "Littéraire" },
    { value: "mixte", label: "Mixte" },
  ],
  humor: [
    { value: "auto-derision", label: "Auto-dérision" },
    { value: "discret", label: "Humour discret" },
    { value: "aucun", label: "Pas d'humour" },
  ],
  engagement: [
    { value: "militante", label: "Militante" },
    { value: "nuancee", label: "Nuancée" },
    { value: "neutre", label: "Neutre" },
  ],
};

const CHANNEL_OPTIONS = ["Instagram", "LinkedIn", "Newsletter", "Pinterest", "Blog", "Podcast", "YouTube"];

const TOTAL_SECTIONS = 9;

function computeScore(p: Omit<ToneProfile, "user_id">): number {
  let score = 0;
  const filled = (v: string) => v && v.trim().length > 0;
  if (filled(p.voice_description)) score++;
  if (filled(p.combat_cause) || filled(p.combat_fights) || filled(p.combat_alternative)) score++;
  if (filled(p.combat_refusals)) score++;
  const chips = [p.tone_register, p.tone_level, p.tone_style, p.tone_humor, p.tone_engagement];
  if (chips.some((c) => filled(c))) score++;
  if (filled(p.key_expressions)) score++;
  if (filled(p.things_to_avoid)) score++;
  if (filled(p.target_verbatims)) score++;
  if (p.channels && p.channels.length > 0) score++;
  return score;
}

/* ─── Main ─── */
export default function TonStylePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Omit<ToneProfile, "user_id">>(EMPTY);
  const [savedProfile, setSavedProfile] = useState<Omit<ToneProfile, "user_id">>(EMPTY);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [aiCombats, setAiCombats] = useState<any>(null);
  const [aiLimits, setAiLimits] = useState<any>(null);
  const [helpOpen, setHelpOpen] = useState<Record<string, boolean>>({});
  const [activeField, setActiveField] = useState("voice_description");

  const hasChanges = JSON.stringify(profile) !== JSON.stringify(savedProfile);
  useUnsavedChanges(hasChanges);

  const { isListening, isSupported, toggle: toggleMic } = useSpeechRecognition((text) => {
    const cur = (profile as any)[activeField] || "";
    updateField(activeField, cur + (cur ? " " : "") + text);
  });

  useEffect(() => {
    if (!user) return;
    supabase.from("brand_profile").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data) {
        setExistingId(data.id);
        const { id, user_id, created_at, updated_at, mission, offer, target_description, target_problem, target_beliefs, recap_summary, ...rest } = data as any;
        const loaded = { ...EMPTY, ...rest };
        setProfile(loaded);
        setSavedProfile(loaded);
      }
      setLoading(false);
    });
  }, [user]);

  const updateField = (field: string, value: string | string[]) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      if (existingId) {
        const { error } = await supabase.from("brand_profile").update(profile as any).eq("id", existingId);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase.from("brand_profile").insert({ ...profile, user_id: user.id } as any).select("id").single();
        if (error) throw error;
        if (inserted) setExistingId(inserted.id);
      }
      setSavedProfile({ ...profile });
      toast({ title: "✅ Modifications enregistrées" });
    } catch (e: any) {
      toast({ title: "Erreur de sauvegarde", description: e.message, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleAiVoice = async () => {
    if (!user) return;
    setAiLoading("voice");
    try {
      const [stRes, profRes] = await Promise.all([
        supabase.from("storytelling").select("step_7_polished, imported_text").eq("user_id", user.id).maybeSingle(),
        supabase.from("profiles").select("activite").eq("user_id", user.id).single(),
      ]);
      const storyText = stRes.data?.step_7_polished || stRes.data?.imported_text || "";
      const activite = profRes.data?.activite || "";

      const promptParts = ["PROFIL :"];
      if (activite) promptParts.push(`- Activité : ${activite}`);
      if (storyText) promptParts.push(`- Storytelling : "${storyText.slice(0, 1500)}"`);
      if (profile.key_expressions) promptParts.push(`- Expressions clés : ${profile.key_expressions}`);
      if (profile.things_to_avoid) promptParts.push(`- Ce qu'elle évite : ${profile.things_to_avoid}`);

      if (!storyText && !profile.key_expressions) {
        toast({ title: "Remplis d'abord ton storytelling ou tes expressions", description: "L'IA a besoin d'éléments pour décrire ton ton.", variant: "destructive" });
        setAiLoading(null);
        return;
      }

      promptParts.push(`
En analysant ces éléments, décris le ton et la voix de cette personne en 3-4 phrases.
Comme si tu devais briefer un·e rédacteur·ice pour écrire à sa place.

Sois concrète et spécifique :
- Son énergie générale (solaire ? intense ? douce ? piquante ?)
- Son niveau de familiarité (copine ? grande sœur ? prof cool ?)
- Son rythme (phrases longues ou courtes ? ponctuation expressive ?)
- Sa signature (ce petit truc qui fait qu'on la reconnaît)

❌ Pas de jargon marketing ("ton authentique et bienveillant")
✅ Des descriptions concrètes ("elle parle comme à une pote, avec des phrases qui alternent entre le très concret et le un peu philosophique")

Réponds avec le texte seul, 3-4 phrases.`);

      const res = await supabase.functions.invoke("generate-content", {
        body: { type: "raw", prompt: promptParts.join("\n") },
      });
      if (res.data?.content) {
        updateField("voice_description", res.data.content.trim());
      }
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
    setAiLoading(null);
  };

  const handleAiCombats = async () => {
    if (!user) return;
    if (!profile.combat_cause && !profile.combat_fights && !profile.combat_alternative) {
      toast({ title: "Remplis au moins une des 3 sous-sections", variant: "destructive" });
      return;
    }
    setAiLoading("combats");
    try {
      const [profRes, propRes] = await Promise.all([
        supabase.from("profiles").select("activite, mission").eq("user_id", user.id).single(),
        supabase.from("brand_proposition").select("version_final").eq("user_id", user.id).maybeSingle(),
      ]);
      const res = await supabase.functions.invoke("niche-ai", {
        body: {
          type: "combats",
          step_1a: profile.combat_cause,
          step_1b: profile.combat_fights,
          step_1c: profile.combat_alternative,
          profile: profRes.data,
          proposition: propRes.data,
        },
      });
      if (res.data?.content) {
        const raw = res.data.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        setAiCombats(JSON.parse(raw));
      }
    } catch {
      toast({ title: "Erreur IA", variant: "destructive" });
    }
    setAiLoading(null);
  };

  const handleAiLimits = async () => {
    if (!user) return;
    if (!profile.combat_refusals) {
      toast({ title: "Remplis d'abord ce que tu ne veux plus", variant: "destructive" });
      return;
    }
    setAiLoading("limits");
    try {
      const profRes = await supabase.from("profiles").select("activite").eq("user_id", user.id).single();
      const res = await supabase.functions.invoke("niche-ai", {
        body: {
          type: "limits",
          step_2: profile.combat_refusals,
          profile: profRes.data,
        },
      });
      if (res.data?.content) {
        const raw = res.data.content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        setAiLimits(JSON.parse(raw));
      }
    } catch {
      toast({ title: "Erreur IA", variant: "destructive" });
    }
    setAiLoading(null);
  };

  const handleAiExpressions = async () => {
    if (!user) return;
    setAiLoading("expressions");
    try {
      const stRes = await supabase.from("storytelling").select("step_7_polished, step_1_raw").eq("user_id", user.id).maybeSingle();
      const text = stRes.data?.step_7_polished || stRes.data?.step_1_raw || "";
      if (!text) {
        toast({ title: "Remplis d'abord ton storytelling", description: "L'IA a besoin de ton histoire pour identifier tes expressions.", variant: "destructive" });
        setAiLoading(null);
        return;
      }
      const res = await supabase.functions.invoke("generate-content", {
        body: { type: "raw", prompt: `Analyse ce texte et extrais les expressions récurrentes, tics de langage et tournures caractéristiques. Liste-les séparés par des virgules, sans numérotation.\n\nTexte :\n"${text}"` },
      });
      if (res.data?.content) {
        updateField("key_expressions", (profile.key_expressions ? profile.key_expressions + ", " : "") + res.data.content);
      }
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
    setAiLoading(null);
  };

  const handleAiVerbatims = async () => {
    if (!user) return;
    setAiLoading("verbatims");
    try {
      const perRes = await supabase.from("persona").select("step_1_frustrations, step_2_transformation, step_3a_objections").eq("user_id", user.id).maybeSingle();
      const data = perRes.data;
      if (!data || (!data.step_1_frustrations && !data.step_3a_objections)) {
        toast({ title: "Remplis d'abord ton persona", variant: "destructive" });
        setAiLoading(null);
        return;
      }
      const res = await supabase.functions.invoke("generate-content", {
        body: { type: "raw", prompt: `À partir de ces textes sur la cliente idéale, extrais les mots et phrases clés qu'elle utiliserait. Liste-les entre guillemets, séparés par des retours à la ligne.\n\nFrustrations : "${data.step_1_frustrations || ""}"\nTransformation : "${data.step_2_transformation || ""}"\nObjections : "${data.step_3a_objections || ""}"` },
      });
      if (res.data?.content) {
        updateField("target_verbatims", (profile.target_verbatims ? profile.target_verbatims + "\n" : "") + res.data.content);
      }
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
    setAiLoading(null);
  };

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast({ title: "Copié !" });
  };

  const saveIdeaToBox = async (titre: string, angle: string, format: string) => {
    if (!user) return;
    await supabase.from("saved_ideas").insert({
      user_id: user.id, titre, angle, format, canal: "instagram",
      objectif: "visibilite", status: "to_explore",
    } as any);
    toast({ title: "💾 Idée sauvegardée !" });
  };

  const score = computeScore(profile);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex gap-1">
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
          <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
        </div>
      </div>
    );
  }

  const toggleHelp = (key: string) => setHelpOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  const MicButton = ({ field }: { field: string }) => (
    isSupported ? (
      <button
        onClick={() => { setActiveField(field); toggleMic(); }}
        className={`absolute right-3 top-3 p-2 rounded-full transition-all ${
          isListening && activeField === field ? "text-primary animate-pulse bg-primary/10" : "text-placeholder hover:text-primary"
        }`}
      >
        <Mic className="h-5 w-5" />
      </button>
    ) : null
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      
      <main className="mx-auto max-w-[640px] px-6 py-8 max-md:px-4 pb-28">
        <Link to="/branding" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Retour au Branding
        </Link>

        <h1 className="font-display text-[26px] font-bold text-foreground mb-2">Ton ton, ton style & tes combats</h1>
        <p className="text-[15px] text-muted-foreground italic mb-6">
          Comment tu parles, ce que tu défends, ce que tu refuses. C'est tout ça qui fait ta voix.
        </p>

        {/* Score */}
        <div className="rounded-2xl border border-border bg-card p-5 mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono-ui text-[12px] font-semibold text-muted-foreground">{score} / {TOTAL_SECTIONS} sections complétées</span>
          </div>
          <Progress value={(score / TOTAL_SECTIONS) * 100} className="h-2.5" />
        </div>

        {/* Section 1: Comment je parle */}
        <SectionTitle title="🗣️ Comment tu parles" />
        <p className="text-[14px] text-foreground leading-relaxed mb-3">
          Décris ta manière de communiquer comme tu le ferais à une amie.
        </p>
        <HelpBlock
          isOpen={helpOpen.voice}
          toggle={() => toggleHelp("voice")}
          text={`Pour t'aider :\n\n• Si ta com' était une personne, elle serait comment ? (douce ? cash ? solaire ? un peu piquante ?)\n• C'est quoi l'ambiance de tes messages ? (conversation entre potes ? grande sœur bienveillante ?)\n• Tu es plutôt : spontanée ou réfléchie ? longue ou concise ? drôle ou sérieuse ?\n\nExemples :\n\n« Je parle comme à une copine, direct, un peu cash mais toujours avec le cœur. J'utilise beaucoup l'humour et l'auto-dérision. »\n\n« Je suis plutôt douce et poétique, j'aime prendre le temps d'expliquer. »\n\n« Je suis engagée et un peu militante. Je n'ai pas peur de dire ce que je pense mais je reste accessible. »`}
        />
        <div className="relative mb-2">
          <Textarea
            value={profile.voice_description}
            onChange={(e) => updateField("voice_description", e.target.value)}
            onFocus={() => setActiveField("voice_description")}
            placeholder="Mon ton c'est... Quand je communique, je suis plutôt..."
            rows={6}
            className="pr-12"
          />
          <MicButton field="voice_description" />
        </div>
        <Button variant="outline" size="sm" className="rounded-pill gap-1.5 mb-8" onClick={handleAiVoice} disabled={aiLoading === "voice"}>
          <Sparkles className="h-3.5 w-3.5" />
          {aiLoading === "voice" ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyse en cours...</> : "✨ M'aider à décrire mon ton"}
        </Button>

        {/* Section 2: Combats & Limites */}
        <SectionTitle title="🔥 Mes combats & mes limites" />
        <p className="text-[14px] text-foreground leading-relaxed mb-4">
          Ce que tu défends et ce que tu refuses. C'est ce qui donne du caractère à ta communication.
        </p>

        {/* 2A: Cause */}
        <h3 className="font-display text-sm font-bold text-foreground mb-2">Ta cause et tes combats</h3>
        <p className="text-[13px] text-muted-foreground mb-2">
          Si tu devais résumer la cause que tu défends, ce serait quoi ? Ce que tu ne supportes plus dans ton secteur ?
        </p>
        <HelpBlock
          isOpen={helpOpen.combat}
          toggle={() => toggleHelp("combat")}
          text={`💥 4 types d'opposants :\n\n• Des groupes : les gourous du marketing agressif, les influenceurs désalignés...\n• Des systèmes : la pression de la perf, la course au "toujours plus"...\n• Des fausses solutions : le greenwashing, les hacks miracles...\n• Des idéologies : "il faut être partout", "écolo = triste"...`}
        />
        <div className="relative mb-4">
          <Textarea
            value={profile.combat_cause}
            onChange={(e) => updateField("combat_cause", e.target.value)}
            onFocus={() => setActiveField("combat_cause")}
            placeholder="Ce qui me révolte, c'est... Ma cause, c'est..."
            rows={4}
            className="pr-12"
          />
          <MicButton field="combat_cause" />
        </div>

        {/* 2B: Alternative */}
        <h3 className="font-display text-sm font-bold text-foreground mb-2">Ce que tu proposes à la place</h3>
        <p className="text-[13px] text-muted-foreground mb-2">Pour chaque combat, qu'est-ce que tu proposes ?</p>
        <div className="rounded-xl bg-rose-pale p-3 text-[12px] text-foreground mb-3">
          ❌ Le marketing de la manipulation → ✅ La communication comme outil d'émancipation<br/>
          ❌ La fast fashion floue → ✅ Une mode belle, claire et consciente<br/>
          ❌ Le système de perf à tout prix → ✅ Le slow, la profondeur, la qualité
        </div>
        <div className="relative mb-4">
          <Textarea
            value={profile.combat_alternative}
            onChange={(e) => updateField("combat_alternative", e.target.value)}
            onFocus={() => setActiveField("combat_alternative")}
            placeholder="À la place, je propose..."
            rows={3}
            className="pr-12"
          />
          <MicButton field="combat_alternative" />
        </div>

        {/* 2C: Refusals */}
        <h3 className="font-display text-sm font-bold text-foreground mb-2">Ce que tu ne veux plus</h3>
        <p className="text-[13px] text-muted-foreground mb-2">
          Avec qui tu ne veux plus bosser ? Quelles demandes t'épuisent ?
        </p>
        <HelpBlock
          isOpen={helpOpen.refusals}
          toggle={() => toggleHelp("refusals")}
          text={`Pense à :\n\n• Des profils qui te vident après une collaboration\n• Des demandes qui te mettent la boule au ventre\n• Des sujets ou formats qui t'éloignent de tes valeurs`}
        />
        <div className="relative mb-4">
          <Textarea
            value={profile.combat_refusals}
            onChange={(e) => updateField("combat_refusals", e.target.value)}
            onFocus={() => setActiveField("combat_refusals")}
            placeholder="Je ne veux plus travailler avec / sur / pour..."
            rows={4}
            className="pr-12"
          />
          <MicButton field="combat_refusals" />
        </div>

        <Button variant="outline" size="sm" className="rounded-pill gap-1.5 mb-3" onClick={handleAiCombats} disabled={aiLoading === "combats"}>
          <Sparkles className="h-3.5 w-3.5" />
          {aiLoading === "combats" ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Génération...</> : "✨ Formuler mes combats et mes limites"}
        </Button>

        {/* AI Combats results */}
        {aiCombats && Array.isArray(aiCombats) && (
          <div className="space-y-3 mb-4">
            {aiCombats.map((c: any, i: number) => (
              <div key={i} className="rounded-xl border-2 border-border bg-card p-4">
                <p className="text-[13px] text-muted-foreground mb-1">❌ {c.refuse}</p>
                <p className="text-[13px] text-foreground mb-1">✅ {c.propose}</p>
                <p className="text-[14px] text-foreground font-medium italic mb-2">"{c.manifeste}"</p>
                <div className="flex gap-3">
                  <button onClick={() => copyText(c.manifeste)} className="text-[11px] text-primary hover:underline flex items-center gap-1"><Copy className="h-3 w-3" /> Copier</button>
                  {c.idee_contenu && (
                    <button onClick={() => saveIdeaToBox(c.idee_contenu, c.manifeste, "Coup de gueule")} className="text-[11px] text-primary hover:underline flex items-center gap-1"><Save className="h-3 w-3" /> Sauvegarder l'idée</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {aiLimits && Array.isArray(aiLimits) && (
          <div className="space-y-3 mb-4">
            {aiLimits.map((l: any, i: number) => (
              <div key={i} className="rounded-xl border-2 border-border bg-card p-4 flex gap-4">
                <div className="flex-1">
                  <p className="font-mono-ui text-[10px] font-semibold text-muted-foreground mb-1">CE QUE JE REFUSE</p>
                  <p className="text-[13px] text-foreground">{l.refuse}</p>
                </div>
                <div className="flex-1">
                  <p className="font-mono-ui text-[10px] font-semibold text-muted-foreground mb-1">CE QUE ÇA DIT DE MON POSITIONNEMENT</p>
                  <p className="text-[13px] text-foreground">{l.eclaire}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mb-8" />

        {/* Section 3: Registre */}
        <SectionTitle title="🎚️ Mon registre" />
        <div className="space-y-5 mb-8">
          <ToneChipGroup label="Registre" options={TONE_OPTIONS.register} value={profile.tone_register} onChange={(v) => updateField("tone_register", v)} />
          <ToneChipGroup label="Niveau de familiarité" options={TONE_OPTIONS.level} value={profile.tone_level} onChange={(v) => updateField("tone_level", v)} />
          <ToneChipGroup label="Style d'écriture" options={TONE_OPTIONS.style} value={profile.tone_style} onChange={(v) => updateField("tone_style", v)} />
          <ToneChipGroup label="Humour" options={TONE_OPTIONS.humor} value={profile.tone_humor} onChange={(v) => updateField("tone_humor", v)} />
          <ToneChipGroup label="Engagement" options={TONE_OPTIONS.engagement} value={profile.tone_engagement} onChange={(v) => updateField("tone_engagement", v)} />
        </div>

        {/* Section 4: Expressions */}
        <SectionTitle title="💬 Mes expressions clés" />
        <HelpBlock isOpen={helpOpen.expr} toggle={() => toggleHelp("expr")} text="Pense à comment tu parlerais de ton projet à une amie. Les 'du coup', les 'bon', les 'sauf que'... C'est ta voix." />
        <Textarea
          value={profile.key_expressions}
          onChange={(e) => updateField("key_expressions", e.target.value)}
          placeholder="Franchement, le truc c'est que, en vrai, j'avoue..."
          rows={4}
          className="mb-2"
        />
        <Button variant="outline" size="sm" className="rounded-pill gap-1.5 mb-8" onClick={handleAiExpressions} disabled={aiLoading === "expressions"}>
          <Sparkles className="h-3.5 w-3.5" />
          {aiLoading === "expressions" ? "Analyse en cours..." : "✨ Identifier mes expressions"}
        </Button>

        {/* Section 5: Ce qu'on évite */}
        <SectionTitle title="🚫 Ce que j'évite" />
        <HelpBlock isOpen={helpOpen.avoid} toggle={() => toggleHelp("avoid")} text="Qu'est-ce qui te fait grincer des dents quand tu lis un post ? Qu'est-ce que tu ne veux JAMAIS qu'on dise de toi ?" />
        <Textarea
          value={profile.things_to_avoid}
          onChange={(e) => updateField("things_to_avoid", e.target.value)}
          placeholder="Jargon marketing, promesses chiffrées, ton corporate, emojis partout..."
          rows={3}
          className="mb-8"
        />

        {/* Section 6: Verbatims */}
        <SectionTitle title="🗨️ Les mots de mes clientes" />
        <HelpBlock isOpen={helpOpen.verb} toggle={() => toggleHelp("verb")} text="Si tu as fait le parcours persona, reprends les frustrations et les mots que tu as notés." />
        <Textarea
          value={profile.target_verbatims}
          onChange={(e) => updateField("target_verbatims", e.target.value)}
          placeholder="J'ai l'impression de parler dans le vide, je sais pas quoi poster, j'ai pas le temps..."
          rows={4}
          className="mb-2"
        />
        <Button variant="outline" size="sm" className="rounded-pill gap-1.5 mb-8" onClick={handleAiVerbatims} disabled={aiLoading === "verbatims"}>
          <Sparkles className="h-3.5 w-3.5" />
          {aiLoading === "verbatims" ? "Extraction en cours..." : "✨ Extraire les verbatims de mon persona"}
        </Button>

        {/* Section 7: Ma voix (profil opérationnel) */}
        <SectionTitle title="🎤 Ma voix" />
        <p className="text-[13px] text-muted-foreground mb-3">
          L'IA utilisera ces éléments pour que chaque contenu sonne comme toi.
        </p>

        <h3 className="font-display text-sm font-bold text-foreground mb-2">Mes expressions signature</h3>
        <p className="text-[12px] text-muted-foreground mb-1">L'IA les utilisera naturellement dans tes contenus.</p>
        <Textarea
          value={profile.key_expressions}
          onChange={(e) => updateField("key_expressions", e.target.value)}
          placeholder="en vrai, franchement, bon, le truc c'est que, j'avoue, du coup..."
          rows={3}
          className="mb-4"
        />

        <h3 className="font-display text-sm font-bold text-foreground mb-2">Mes expressions interdites</h3>
        <p className="text-[12px] text-muted-foreground mb-1">L'IA ne les utilisera JAMAIS.</p>
        <Textarea
          value={profile.things_to_avoid}
          onChange={(e) => updateField("things_to_avoid", e.target.value)}
          placeholder="n'hésitez pas, mindset, passer à l'action, game changer, leverage, scalable..."
          rows={3}
          className="mb-4"
        />

        <VoiceOnboarding />

        <div className="mb-8" />

        {/* Section 8: Canaux */}
        <SectionTitle title="📱 Mes canaux" />
        <div className="flex flex-wrap gap-2 mb-8">
          {CHANNEL_OPTIONS.map((ch) => {
            const val = ch.toLowerCase();
            const selected = profile.channels.includes(val);
            return (
              <button
                key={val}
                type="button"
                onClick={() => {
                  const next = selected ? profile.channels.filter((c: string) => c !== val) : [...profile.channels, val];
                  updateField("channels", next);
                }}
                className={`font-mono-ui text-[12px] font-medium px-3 py-1.5 rounded-pill border transition-all ${
                  selected ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:border-primary"
                }`}
              >
                {ch}
              </button>
            );
          })}
        </div>

        {/* Back */}
        <div className="pt-4 border-t border-border">
          <Link to="/branding" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline">
            Retour au Branding →
          </Link>
        </div>
      </main>

      {/* Sticky save button */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-sm border-t border-border p-4 z-40">
        <div className="mx-auto max-w-[640px]">
          <SaveButton hasChanges={hasChanges} saving={saving} onSave={handleSave} />
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function SectionTitle({ title }: { title: string }) {
  return <h2 className="font-display text-lg font-bold text-foreground mb-3 mt-2">{title}</h2>;
}

function HelpBlock({ isOpen, toggle, text }: { isOpen: boolean; toggle: () => void; text: string }) {
  return (
    <div className="mb-2">
      <button onClick={toggle} className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors">
        {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        {isOpen ? "Masquer l'aide" : "Besoin d'aide ?"}
      </button>
      {isOpen && <p className="text-[12px] text-muted-foreground italic mt-2 whitespace-pre-line leading-relaxed">{text}</p>}
    </div>
  );
}

function ToneChipGroup({ label, options, value, onChange }: { label: string; options: { value: string; label: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="text-sm font-medium text-foreground mb-2">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(value === opt.value ? "" : opt.value)}
            className={`font-mono-ui text-[12px] font-medium px-3 py-1.5 rounded-pill border transition-all ${
              value === opt.value ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:border-primary"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
