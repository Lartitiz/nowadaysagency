import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/* ─── Storytelling Card ─── */
function StorytellingCard({ userId }: { userId?: string }) {
  const [completedSteps, setCompletedSteps] = useState(0);

  useEffect(() => {
    if (!userId) return;
    supabase.from("storytelling").select("step_1_raw, step_2_location, step_3_action, step_4_thoughts, step_5_emotions, step_6_full_story, step_7_polished, pitch_short").eq("user_id", userId).maybeSingle().then(({ data }) => {
      if (!data) return;
      const fields = [data.step_1_raw, data.step_2_location, data.step_3_action, data.step_4_thoughts, data.step_5_emotions, data.step_6_full_story, data.step_7_polished, data.pitch_short];
      setCompletedSteps(fields.filter((f) => f && String(f).trim().length > 0).length);
    });
  }, [userId]);

  return (
    <Link to="/branding/storytelling" className="block rounded-2xl border-2 border-primary/30 bg-card p-5 mb-8 group hover:border-primary hover:shadow-card-hover transition-all">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">👑</span>
          <div>
            <h3 className="font-display text-lg font-bold text-foreground">Mon storytelling</h3>
            <p className="text-[13px] text-muted-foreground mt-0.5">Écris ton histoire en 8 étapes guidées. On te prend par la main.</p>
          </div>
        </div>
        <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="font-mono-ui text-[11px] font-semibold text-primary">{completedSteps} / 8 étapes complétées</span>
        <Progress value={(completedSteps / 8) * 100} className="h-1.5 flex-1" />
      </div>
    </Link>
  );
}

/* ─── Persona Card ─── */
function PersonaCard({ userId }: { userId?: string }) {
  const [completedSteps, setCompletedSteps] = useState(0);

  useEffect(() => {
    if (!userId) return;
    supabase.from("persona").select("step_1_frustrations, step_2_transformation, step_3a_objections, step_4_beautiful, step_5_actions").eq("user_id", userId).maybeSingle().then(({ data }) => {
      if (!data) return;
      const fields = [data.step_1_frustrations, data.step_2_transformation, data.step_3a_objections, data.step_4_beautiful, data.step_5_actions];
      setCompletedSteps(fields.filter((f) => f && String(f).trim().length > 0).length);
    });
  }, [userId]);

  return (
    <Link to="/branding/persona" className="block rounded-2xl border-2 border-primary/30 bg-card p-5 mb-8 group hover:border-primary hover:shadow-card-hover transition-all">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">👩‍💻</span>
          <div>
            <h3 className="font-display text-lg font-bold text-foreground">Mon client·e idéal·e</h3>
            <p className="text-[13px] text-muted-foreground mt-0.5">Comprends qui tu veux toucher, ce qui la bloque, ce qu'elle désire. En 5 étapes.</p>
          </div>
        </div>
        <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="font-mono-ui text-[11px] font-semibold text-primary">{completedSteps} / 5 étapes complétées</span>
        <Progress value={(completedSteps / 5) * 100} className="h-1.5 flex-1" />
      </div>
    </Link>
  );
}

/* ─── Types ─── */
interface BrandProfile {
  id?: string;
  user_id: string;
  mission: string;
  offer: string;
  target_description: string;
  target_problem: string;
  target_beliefs: string;
  target_verbatims: string;
  tone_register: string;
  tone_level: string;
  tone_style: string;
  tone_humor: string;
  tone_engagement: string;
  key_expressions: string;
  things_to_avoid: string;
  channels: string[];
}

const EMPTY_PROFILE: Omit<BrandProfile, "user_id"> = {
  mission: "",
  offer: "",
  target_description: "",
  target_problem: "",
  target_beliefs: "",
  target_verbatims: "",
  tone_register: "",
  tone_level: "",
  tone_style: "",
  tone_humor: "",
  tone_engagement: "",
  key_expressions: "",
  things_to_avoid: "",
  channels: ["instagram"],
};

/* ─── Tone options ─── */
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

const CHANNEL_OPTIONS = ["Instagram", "LinkedIn", "Newsletter", "Pinterest", "Blog"];

/* ─── Score calculation ─── */
function computeScore(bp: Omit<BrandProfile, "user_id">): number {
  const fields = [
    bp.mission,
    bp.offer,
    bp.target_description,
    bp.target_problem,
    bp.target_beliefs,
    bp.tone_register, // counts as "ton" filled
    bp.key_expressions,
    bp.things_to_avoid,
    bp.target_verbatims,
  ];
  return fields.filter((f) => f && f.trim().length > 0).length;
}

/* ─── Main ─── */
export default function BrandingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Omit<BrandProfile, "user_id">>(EMPTY_PROFILE);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [activite, setActivite] = useState("");
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch
  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const [bpRes, profRes] = await Promise.all([
        supabase.from("brand_profile").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("profiles").select("activite").eq("user_id", user.id).single(),
      ]);
      if (profRes.data) setActivite(profRes.data.activite || "");
      if (bpRes.data) {
        setExistingId(bpRes.data.id);
        const { id, user_id, created_at, updated_at, ...rest } = bpRes.data;
        setProfile({ ...EMPTY_PROFILE, ...rest });
      }
      setLoading(false);
    };
    fetch();
  }, [user]);

  // Auto-save with debounce
  const debouncedSave = useCallback(
    (data: Omit<BrandProfile, "user_id">) => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(async () => {
        if (!user) return;
        setSaving(true);
        try {
          if (existingId) {
            await supabase.from("brand_profile").update(data).eq("id", existingId);
          } else {
            const { data: inserted } = await supabase
              .from("brand_profile")
              .insert({ ...data, user_id: user.id })
              .select("id")
              .single();
            if (inserted) setExistingId(inserted.id);
          }
          setLastSaved(new Date());
        } catch {
          toast({ title: "Erreur de sauvegarde", variant: "destructive" });
        }
        setSaving(false);
      }, 1500);
    },
    [user, existingId, toast]
  );

  const updateField = (field: string, value: string | string[]) => {
    const updated = { ...profile, [field]: value };
    setProfile(updated);
    debouncedSave(updated);
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

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[800px] px-6 py-8 max-md:px-4">
        {/* Back */}
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour au hub
        </Link>

        {/* Header */}
        <h1 className="font-display text-[26px] font-bold text-foreground mb-2">Mon Branding</h1>
        <p className="text-[15px] text-muted-foreground mb-6">
          Plus tu remplis cette section, plus L'Assistant Com' te connaît et plus il te propose des idées qui te ressemblent. C'est la base de tout.
        </p>

        {/* Storytelling card */}
        <StorytellingCard userId={user?.id} />

        {/* Persona card */}
        <PersonaCard userId={user?.id} />

        {/* Score */}
        <div className="rounded-2xl border border-border bg-card p-5 mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono-ui text-[12px] font-semibold text-muted-foreground">
              {score} / 9 champs complétés
            </span>
            <span className="text-[12px] text-muted-foreground flex items-center gap-1">
              {saving ? (
                "Sauvegarde..."
              ) : lastSaved ? (
                <>
                  <Check className="h-3 w-3 text-green-600" />
                  Sauvegardé
                </>
              ) : null}
            </span>
          </div>
          <Progress value={(score / 9) * 100} className="h-2.5" />
          {score < 9 && (
            <p className="text-[12px] text-muted-foreground mt-2">
              Complète ton branding pour débloquer tout le potentiel de l'outil.
            </p>
          )}
        </div>

        {/* Section 1: Identité */}
        <SectionTitle number={1} title="Ton identité" />

        <FieldBlock
          label="Ta mission"
          help="En une phrase : pourquoi tu fais ce que tu fais ? Ex : 'Rendre la céramique artisanale désirable et accessible.'"
          value={profile.mission}
          onChange={(v) => updateField("mission", v)}
          maxLength={300}
        />
        <FieldBlock
          label="Ton activité"
          help="Pré-rempli depuis ton inscription."
          value={activite}
          onChange={() => {}}
          disabled
        />
        <FieldBlock
          label="Ton offre"
          help="Qu'est-ce que tu vends concrètement ? Produits, services, ateliers, cours... Ex : 'Pièces uniques en céramique, ateliers découverte, cours en ligne.'"
          value={profile.offer}
          onChange={(v) => updateField("offer", v)}
        />

        {/* Section 2: Cible */}
        <SectionTitle number={2} title="Ta cible" />

        <FieldBlock
          label="Qui est ta cliente idéale ?"
          help="Décris-la comme si c'était une amie. Âge, situation, centres d'intérêt, valeurs. Ex : 'Femme 30-45 ans, sensible à l'artisanat local, cherche des pièces qui ont du sens.'"
          value={profile.target_description}
          onChange={(v) => updateField("target_description", v)}
        />
        <FieldBlock
          label="Son problème principal"
          help="C'est quoi le truc qui la bloque ? Ex : 'Elle veut consommer mieux mais ne sait pas où trouver de l'artisanat de qualité accessible.'"
          value={profile.target_problem}
          onChange={(v) => updateField("target_problem", v)}
        />
        <FieldBlock
          label="Ses croyances limitantes"
          help="Qu'est-ce qu'elle se dit qui l'empêche d'avancer ? Une croyance par ligne. Ex : 'L'artisanat c'est trop cher' / 'Je n'ai pas le temps de chercher des alternatives.'"
          value={profile.target_beliefs}
          onChange={(v) => updateField("target_beliefs", v)}
          rows={4}
        />

        {/* Section 3: Style de communication */}
        <SectionTitle number={3} title="Ton style de communication" />

        <div className="space-y-5 mb-6">
          <ToneChipGroup
            label="Registre"
            options={TONE_OPTIONS.register}
            value={profile.tone_register}
            onChange={(v) => updateField("tone_register", v)}
          />
          <ToneChipGroup
            label="Niveau"
            options={TONE_OPTIONS.level}
            value={profile.tone_level}
            onChange={(v) => updateField("tone_level", v)}
          />
          <ToneChipGroup
            label="Style"
            options={TONE_OPTIONS.style}
            value={profile.tone_style}
            onChange={(v) => updateField("tone_style", v)}
          />
          <ToneChipGroup
            label="Humour"
            options={TONE_OPTIONS.humor}
            value={profile.tone_humor}
            onChange={(v) => updateField("tone_humor", v)}
          />
          <ToneChipGroup
            label="Engagement"
            options={TONE_OPTIONS.engagement}
            value={profile.tone_engagement}
            onChange={(v) => updateField("tone_engagement", v)}
          />
        </div>

        <FieldBlock
          label="Tes expressions clés"
          help="Les mots et expressions qui reviennent souvent quand tu parles de ton projet. Ex : 'Franchement', 'Le truc c'est que', 'En vrai', 'J'avoue'."
          value={profile.key_expressions}
          onChange={(v) => updateField("key_expressions", v)}
        />
        <FieldBlock
          label="Ce que tu veux éviter"
          help="Les mots, tons ou approches que tu détestes. Ex : 'Jargon marketing, promesses chiffrées, ton corporate, emojis partout.'"
          value={profile.things_to_avoid}
          onChange={(v) => updateField("things_to_avoid", v)}
        />

        {/* Section bonus */}
        <div className="mt-8 mb-4">
          <p className="font-mono-ui text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            Bonus (optionnel)
          </p>
        </div>

        <FieldBlock
          label="Les verbatims de tes clientes"
          help="Les phrases exactes que tes clientes utilisent quand elles parlent de leur problème. Ex : 'J'ai l'impression de parler dans le vide', 'Je sais pas quoi poster'."
          value={profile.target_verbatims}
          onChange={(v) => updateField("target_verbatims", v)}
          rows={4}
        />

        {/* Channels */}
        <div className="mb-8">
          <label className="block text-sm font-semibold text-foreground mb-1">Canaux utilisés</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {CHANNEL_OPTIONS.map((ch) => {
              const val = ch.toLowerCase();
              const selected = profile.channels.includes(val);
              return (
                <button
                  key={val}
                  type="button"
                  onClick={() => {
                    const next = selected
                      ? profile.channels.filter((c) => c !== val)
                      : [...profile.channels, val];
                    updateField("channels", next);
                  }}
                  className={`font-mono-ui text-[12px] font-medium px-3 py-1.5 rounded-pill border transition-all ${
                    selected
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:border-primary"
                  }`}
                >
                  {ch}
                </button>
              );
            })}
          </div>
        </div>

        {/* Back to hub */}
        <div className="pt-4 border-t border-border">
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            Retour au hub →
          </Link>
        </div>
      </main>
    </div>
  );
}

/* ─── Sub-components ─── */

function SectionTitle({ number, title }: { number: number; title: string }) {
  return (
    <div className="flex items-center gap-3 mt-8 mb-4">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground font-mono-ui text-[12px] font-bold">
        {number}
      </span>
      <h2 className="font-display text-lg font-bold text-foreground">{title}</h2>
    </div>
  );
}

function FieldBlock({
  label,
  help,
  value,
  onChange,
  maxLength,
  rows = 3,
  disabled = false,
}: {
  label: string;
  help: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  rows?: number;
  disabled?: boolean;
}) {
  return (
    <div className="mb-5">
      <label className="block text-sm font-semibold text-foreground mb-1">{label}</label>
      <p className="text-[12px] text-muted-foreground mb-2 italic">{help}</p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={maxLength}
        rows={rows}
        disabled={disabled}
        className="w-full rounded-[10px] border-2 border-input bg-card px-4 py-3 text-[15px] font-body placeholder:text-placeholder placeholder:italic focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors resize-none"
      />
      {maxLength && (
        <p className="text-[11px] text-muted-foreground text-right mt-0.5">
          {value.length} / {maxLength}
        </p>
      )}
    </div>
  );
}

function ToneChipGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
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
              value === opt.value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:border-primary"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
