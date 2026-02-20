import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Check, Sparkles, ChevronDown, ChevronUp, Mic, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSpeechRecognition } from "@/hooks/use-speech-recognition";

/* ─── Types ─── */
interface ToneProfile {
  id?: string;
  user_id: string;
  voice_description: string;
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
  voice_description: "", tone_register: "", tone_level: "", tone_style: "", tone_humor: "", tone_engagement: "",
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

const TOTAL_FIELDS = 10; // voice_description + 5 chips + 3 texts + channels

function computeScore(p: Omit<ToneProfile, "user_id">): number {
  const chips = [p.tone_register, p.tone_level, p.tone_style, p.tone_humor, p.tone_engagement];
  const texts = [p.voice_description, p.key_expressions, p.things_to_avoid, p.target_verbatims];
  const chipsCount = chips.filter((v) => v && v.trim().length > 0).length;
  const textsCount = texts.filter((v) => v && v.trim().length > 0).length;
  const channelsCount = p.channels && p.channels.length > 0 ? 1 : 0;
  return chipsCount + textsCount + channelsCount;
}

/* ─── Main ─── */
export default function TonStylePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Omit<ToneProfile, "user_id">>(EMPTY);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState<Record<string, boolean>>({});
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { isListening, isSupported, toggle: toggleMic } = useSpeechRecognition((text) => {
    const cur = profile.voice_description || "";
    updateField("voice_description", cur + (cur ? " " : "") + text);
  });

  useEffect(() => {
    if (!user) return;
    supabase.from("brand_profile").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data) {
        setExistingId(data.id);
        const { id, user_id, created_at, updated_at, mission, offer, target_description, target_problem, target_beliefs, ...rest } = data as any;
        setProfile({ ...EMPTY, ...rest });
      }
      setLoading(false);
    });
  }, [user]);

  const debouncedSave = useCallback(
    (data: Omit<ToneProfile, "user_id">) => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(async () => {
        if (!user) return;
        setSaving(true);
        try {
          if (existingId) {
            await supabase.from("brand_profile").update(data as any).eq("id", existingId);
          } else {
            const { data: inserted } = await supabase.from("brand_profile").insert({ ...data, user_id: user.id } as any).select("id").single();
            if (inserted) setExistingId(inserted.id);
          }
          setLastSaved(new Date());
        } catch {
          toast({ title: "Erreur de sauvegarde", variant: "destructive" });
        }
        setSaving(false);
      }, 2000);
    },
    [user, existingId, toast]
  );

  const updateField = (field: string, value: string | string[]) => {
    const updated = { ...profile, [field]: value };
    setProfile(updated);
    debouncedSave(updated);
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
        body: {
          type: "raw",
          prompt: `Analyse ce texte et extrais les expressions récurrentes, tics de langage et tournures caractéristiques. Liste-les séparés par des virgules, sans numérotation.\n\nTexte :\n"${text}"`,
        },
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
        toast({ title: "Remplis d'abord ton persona", description: "L'IA a besoin du parcours client·e idéal·e.", variant: "destructive" });
        setAiLoading(null);
        return;
      }
      const res = await supabase.functions.invoke("generate-content", {
        body: {
          type: "raw",
          prompt: `À partir de ces textes sur la cliente idéale, extrais les mots et phrases clés qu'elle utiliserait. Liste-les entre guillemets, séparés par des retours à la ligne.\n\nFrustrations : "${data.step_1_frustrations || ""}"\nTransformation : "${data.step_2_transformation || ""}"\nObjections : "${data.step_3a_objections || ""}"`,
        },
      });
      if (res.data?.content) {
        updateField("target_verbatims", (profile.target_verbatims ? profile.target_verbatims + "\n" : "") + res.data.content);
      }
    } catch {
      toast({ title: "Erreur", variant: "destructive" });
    }
    setAiLoading(null);
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

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[640px] px-6 py-8 max-md:px-4">
        <Link to="/branding" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground mb-6 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Retour au Branding
        </Link>

        <h1 className="font-display text-[26px] font-bold text-foreground mb-2">Mon ton & style</h1>
        <p className="text-[15px] text-muted-foreground italic mb-6">
          Comment tu parles, tes expressions, ton énergie. C'est ce qui fait que tes contenus sonnent comme toi et pas comme un robot.
        </p>

        {/* Score */}
        <div className="rounded-2xl border border-border bg-card p-5 mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono-ui text-[12px] font-semibold text-muted-foreground">{score} / {TOTAL_FIELDS} champs complétés</span>
            <span className="text-[12px] text-muted-foreground flex items-center gap-1">
              {saving ? "Sauvegarde..." : lastSaved ? <><Check className="h-3 w-3 text-green-600" />Sauvegardé</> : null}
            </span>
          </div>
          <Progress value={(score / TOTAL_FIELDS) * 100} className="h-2.5" />
        </div>

        {/* Section: Comment je parle — NEW */}
        <SectionTitle title="🗣️ Comment tu parles" />
        <p className="text-[14px] text-foreground leading-relaxed mb-3">
          Décris ta manière de communiquer comme tu le ferais à une amie. Comment tu parles à tes clientes, dans tes stories, dans tes emails ? C'est quoi ton énergie quand tu communiques ?
        </p>
        <HelpBlock
          isOpen={helpOpen.voice}
          toggle={() => toggleHelp("voice")}
          text={`Pour t'aider, pense à :\n\n• Si ta com' était une personne, elle serait comment ? (douce ? cash ? solaire ? un peu piquante ?)\n• C'est quoi l'ambiance de tes messages ? (conversation entre potes ? prof cool ? grande sœur bienveillante ?)\n• Quand tu écris un post, tu es plutôt : spontanée ou réfléchie ? longue ou concise ? drôle ou sérieuse ?\n• Comment tes clientes décriraient ta façon de parler ?\n\nExemples :\n\n« Je parle comme à une copine, direct, un peu cash mais toujours avec le cœur. J'utilise beaucoup l'humour et l'auto-dérision. Je tutoie toujours. »\n\n« Je suis plutôt douce et poétique, j'aime prendre le temps d'expliquer. Mon ton est rassurant, comme un cocon. »\n\n« Je suis engagée et un peu militante dans ma com'. Je n'ai pas peur de dire ce que je pense mais je reste accessible et jamais condescendante. »`}
        />
        <div className="relative mb-2">
          <Textarea
            value={profile.voice_description}
            onChange={(e) => updateField("voice_description", e.target.value)}
            placeholder="Mon ton c'est... Quand je communique, je suis plutôt..."
            rows={6}
            className="pr-12"
          />
          {isSupported && (
            <button
              onClick={toggleMic}
              className={`absolute right-3 top-3 p-2 rounded-full transition-all ${
                isListening ? "text-primary animate-pulse bg-primary/10" : "text-placeholder hover:text-primary"
              }`}
            >
              <Mic className="h-5 w-5" />
            </button>
          )}
        </div>
        <Button variant="outline" size="sm" className="rounded-pill gap-1.5 mb-8" onClick={handleAiVoice} disabled={aiLoading === "voice"}>
          <Sparkles className="h-3.5 w-3.5" />
          {aiLoading === "voice" ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyse en cours...</> : "✨ M'aider à décrire mon ton"}
        </Button>

        {/* Section A: Registre */}
        <SectionTitle title="Mon registre" />
        <div className="space-y-5 mb-8">
          <ToneChipGroup label="Registre" options={TONE_OPTIONS.register} value={profile.tone_register} onChange={(v) => updateField("tone_register", v)} />
          <ToneChipGroup label="Niveau de familiarité" options={TONE_OPTIONS.level} value={profile.tone_level} onChange={(v) => updateField("tone_level", v)} />
          <ToneChipGroup label="Style d'écriture" options={TONE_OPTIONS.style} value={profile.tone_style} onChange={(v) => updateField("tone_style", v)} />
          <ToneChipGroup label="Humour" options={TONE_OPTIONS.humor} value={profile.tone_humor} onChange={(v) => updateField("tone_humor", v)} />
          <ToneChipGroup label="Engagement" options={TONE_OPTIONS.engagement} value={profile.tone_engagement} onChange={(v) => updateField("tone_engagement", v)} />
        </div>

        {/* Section B: Expressions */}
        <SectionTitle title="Mes expressions clés" />
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
          {aiLoading === "expressions" ? "Analyse en cours..." : "✨ M'aider à identifier mes expressions"}
        </Button>

        {/* Section C: Ce qu'on évite */}
        <SectionTitle title="Ce que j'évite" />
        <HelpBlock isOpen={helpOpen.avoid} toggle={() => toggleHelp("avoid")} text="Qu'est-ce qui te fait grincer des dents quand tu lis un post ? Qu'est-ce que tu ne veux JAMAIS qu'on dise de toi ?" />
        <Textarea
          value={profile.things_to_avoid}
          onChange={(e) => updateField("things_to_avoid", e.target.value)}
          placeholder="Jargon marketing, promesses chiffrées, ton corporate, emojis partout..."
          rows={3}
          className="mb-8"
        />

        {/* Section D: Verbatims */}
        <SectionTitle title="Les mots de mes clientes" />
        <HelpBlock isOpen={helpOpen.verb} toggle={() => toggleHelp("verb")} text="Si tu as fait le parcours persona, reprends les frustrations et les mots que tu as notés. Ce sont les mêmes mots que tu vas utiliser dans tes contenus." />
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

        {/* Section E: Canaux */}
        <SectionTitle title="Mes canaux" />
        <div className="flex flex-wrap gap-2 mb-8">
          {CHANNEL_OPTIONS.map((ch) => {
            const val = ch.toLowerCase();
            const selected = profile.channels.includes(val);
            return (
              <button
                key={val}
                type="button"
                onClick={() => {
                  const next = selected ? profile.channels.filter((c) => c !== val) : [...profile.channels, val];
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
