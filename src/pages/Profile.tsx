import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspaceFilter, useProfileFilter } from "@/hooks/use-workspace-query";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/use-profile";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import { PageLoader } from "@/components/ui/spinner";
import { InputWithVoice as Input } from "@/components/ui/input-with-voice";
import { toast } from "sonner";
import { friendlyError } from "@/lib/error-messages";
import { ArrowRight, Info, Target, Palette, Clock, BarChart3, TrendingUp, Link2, Smartphone, Sprout, Gift, FolderOpen, Egg, Bird, Rocket, Hourglass, Check, type LucideIcon } from "lucide-react";
import SaveButton from "@/components/SaveButton";
import { Button } from "@/components/ui/button";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useActiveChannels, ALL_CHANNELS, type ChannelId } from "@/hooks/use-active-channels";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const ACTIVITY_TYPES = [
  { id: "creatrice", label: "Créatrice / Artisane" },
  { id: "freelance", label: "Freelance" },
  { id: "prestataire", label: "Prestataire / Consultante" },
  { id: "accompagnante", label: "Coach / Formatrice" },
  { id: "autre", label: "Autre" },
];

// L'onboarding écrit des types fins (artisane, coach, consultante…) ; cette page
// n'affiche que 5 familles. Sans ce pont, le type choisi à l'onboarding paraît
// perdu (aucune carte sélectionnée). On ne réécrit type_activite en famille QUE
// si l'utilisatrice clique — jamais silencieusement au chargement.
const ONBOARDING_TYPE_TO_FAMILY: Record<string, string> = {
  artisane: "creatrice", mode_textile: "creatrice", art_design: "creatrice",
  deco_interieur: "creatrice", beaute_cosmetiques: "creatrice", boutique: "creatrice",
  bien_etre: "accompagnante", coach: "accompagnante", coach_sportive: "accompagnante", formatrice: "accompagnante",
  consultante: "prestataire",
};
const activityFamily = (t: string) => ONBOARDING_TYPE_TO_FAMILY[t] || t;

const GOAL_OPTIONS = [
  { key: "start", icon: Sprout, label: "Poser les bases" },
  { key: "visibility", icon: Smartphone, label: "Être visible" },
  { key: "launch", icon: Gift, label: "Lancer une offre" },
  { key: "clients", icon: Target, label: "Trouver des client·es" },
  { key: "structure", icon: FolderOpen, label: "Structurer" },
];

const LEVEL_OPTIONS = [
  { key: "beginner", icon: Egg, label: "Je démarre" },
  { key: "intermediate", icon: Bird, label: "Je poste au feeling" },
  { key: "advanced", icon: Rocket, label: "J'ai déjà une stratégie" },
];

const TIME_OPTIONS = [
  { key: "less_2h", label: "Moins de 2h" },
  { key: "2_5h", label: "2-5h" },
  { key: "5_10h", label: "5-10h" },
  { key: "more_10h", label: "Plus de 10h" },
];

// Page découpée en 4 onglets (plan simplicité du 15/10/2026) : elle faisait
// près de 3 écrans de haut. L'onglet ouvert est dans l'adresse (?onglet=…) pour
// qu'un lien puisse mener directement à « Mes canaux » par exemple.
const PROFILE_TABS = [
  { id: "moi", label: "Moi" },
  { id: "canaux", label: "Mes canaux" },
  { id: "rythme", label: "Mon rythme" },
  { id: "liens", label: "Mes liens" },
] as const;
type ProfileTab = typeof PROFILE_TABS[number]["id"];

// L'onboarding range dans profiles des valeurs à lui (« 1h », « sell »…) qui ne
// correspondent à aucun bouton ici : on ne garde qu'une valeur que la page sait
// afficher, en préférant user_plan_config qui est déjà au bon format.
const firstKnown = (keys: { key: string }[], ...values: (string | null | undefined)[]) =>
  values.find(v => !!v && keys.some(k => k.key === v)) || "";

interface ProfileData {
  prenom: string;
  activite: string;
  typeActivite: string;
  cible: string;
  probleme: string;
  piliers: string[];
  tons: string[];
  mainGoal: string;
  level: string;
  weeklyTime: string;
  postsPerWeek: number | null;
  storiesPerWeek: number | null;
  linkedinPostsPerWeek: number | null;
  websiteUrl: string;
  instagramUrl: string;
  linkedinUrl: string;
}

function ChipSelector({ options, value, onChange, multi = false }: {
  options: { key: string; icon?: LucideIcon; label: string }[];
  value: string | string[];
  onChange: (v: any) => void;
  multi?: boolean;
}) {
  const selected = multi ? (value as string[]) : [value as string];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const isActive = selected.includes(opt.key);
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => {
              if (multi) {
                const arr = value as string[];
                onChange(isActive ? arr.filter(v => v !== opt.key) : [...arr, opt.key]);
              } else {
                onChange(opt.key);
              }
            }}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium border transition-all ${
              isActive
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border hover:border-primary/40"
            }`}
          >
            {opt.icon && <opt.icon className="h-4 w-4" strokeWidth={1.75} />}{opt.label}
          </button>
        );
      })}
    </div>
  );
}

function FrequencySelector({ label, value, options, onChange }: {
  label: string;
  value: number | null;
  options: number[];
  onChange: (v: number) => void;
}) {
  return (
    <div className="sm:flex sm:items-center sm:gap-4">
      <label className="text-xs font-medium text-foreground mb-1.5 block sm:mb-0 sm:w-48 sm:shrink-0">{label}</label>
      <div className="flex gap-2">
        {options.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`w-10 h-10 rounded-lg text-sm font-medium border transition-all ${
              value === n
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground border-border hover:border-primary/40"
            }`}
          >
            {n === options[options.length - 1] ? `${n}+` : n}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const { column, value } = useWorkspaceFilter();
  // profiles n'a pas de workspace_id rempli : on le vise par user_id (celui de
  // la propriétaire de l'espace). Avant le 15/10/2026, l'enregistrement visait
  // workspace_id, ne touchait aucune ligne et affichait quand même « enregistré ».
  const profileFilter = useProfileFilter();
  const {
    data: hookProfileData,
    isLoading: profileQueryLoading,
    isError: profileQueryError,
    refetch: refetchProfile,
  } = useProfile();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  const emptyProfile: ProfileData = {
    prenom: "", activite: "", typeActivite: "", cible: "", probleme: "", piliers: [], tons: [],
    mainGoal: "", level: "", weeklyTime: "",
    postsPerWeek: null, storiesPerWeek: null, linkedinPostsPerWeek: null,
    websiteUrl: "", instagramUrl: "", linkedinUrl: "",
  };

  const [current, setCurrent] = useState<ProfileData>(emptyProfile);
  const [saved, setSaved] = useState<ProfileData>(emptyProfile);

  const hasChanges = JSON.stringify(current) !== JSON.stringify(saved);
  useUnsavedChanges(hasChanges);

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("onglet");
  const tab: ProfileTab = PROFILE_TABS.some(t => t.id === tabParam) ? (tabParam as ProfileTab) : "moi";
  const setTab = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next === "moi") params.delete("onglet"); else params.set("onglet", next);
    setSearchParams(params, { replace: true });
  };
  // Un point signale l'onglet qui a une modification pas encore enregistrée.
  const changed = (...fields: (keyof ProfileData)[]) => fields.some(f => JSON.stringify(current[f]) !== JSON.stringify(saved[f]));
  const tabHasChanges: Record<ProfileTab, boolean> = {
    moi: changed("prenom", "activite", "typeActivite"),
    canaux: false,
    rythme: changed("mainGoal", "level", "weeklyTime", "postsPerWeek", "storiesPerWeek", "linkedinPostsPerWeek"),
    liens: changed("websiteUrl", "instagramUrl", "linkedinUrl"),
  };

  useEffect(() => {
    if (!user) return;
    // On attend que la requête profil react-query soit retombée (succès ou erreur).
    if (profileQueryLoading) return;
    // Échec de chargement : on affiche un état d'erreur explicite au lieu de
    // retomber en silence sur un formulaire vide (qui ferait croire à une perte
    // de données et écraserait le vrai profil au prochain « Sauvegarder »).
    if (profileQueryError) {
      console.error("Profile load error");
      setLoadError(true);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setLoadError(false);
      const data = hookProfileData as any;
      let { data: config, error: configError } = await (supabase.from("user_plan_config") as any).select("main_goal, level, weekly_time").eq(column, value).maybeSingle();
      // Anciennes lignes sans workspace_id : on les retrouve par la propriétaire.
      if (!configError && !config && column === "workspace_id" && profileFilter.value) {
        ({ data: config, error: configError } = await (supabase.from("user_plan_config") as any).select("main_goal, level, weekly_time").eq("user_id", profileFilter.value).maybeSingle());
      }
      if (cancelled) return;
      if (configError) {
        console.error("Profile config load error:", configError);
        setLoadError(true);
        setLoading(false);
        return;
      }
      if (data) {
        const loaded: ProfileData = {
          prenom: data.prenom || "",
          activite: data.activite || "",
          typeActivite: data.type_activite || "",
          cible: data.cible || "",
          probleme: data.probleme_principal || "",
          piliers: data.piliers || [],
          tons: data.tons || [],
          mainGoal: firstKnown(GOAL_OPTIONS, config?.main_goal, (data as any).main_goal),
          level: firstKnown(LEVEL_OPTIONS, config?.level, (data as any).level),
          weeklyTime: firstKnown(TIME_OPTIONS, config?.weekly_time, (data as any).weekly_time),
          postsPerWeek: (data as any).posts_per_week ?? null,
          storiesPerWeek: (data as any).stories_per_week ?? null,
          linkedinPostsPerWeek: (data as any).linkedin_posts_per_week ?? null,
          websiteUrl: (data as any).website_url || "",
          instagramUrl: (data as any).instagram_url || "",
          linkedinUrl: (data as any).linkedin_url || "",
        };
        setCurrent(loaded);
        setSaved(loaded);
      }
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [user?.id, hookProfileData, profileQueryLoading, profileQueryError, column, value, profileFilter.value]);

  const handleRetry = async () => {
    setLoading(true);
    setLoadError(false);
    await refetchProfile();
  };

  const update = (field: keyof ProfileData, value: any) => {
    setCurrent((prev) => ({ ...prev, [field]: value }));
  };


  const handleSave = async () => {
    if (!user || !profileFilter.value) return;
    setSaving(true);
    try {
      const { data: updated, error } = await (supabase
        .from("profiles") as any)
        .update({
          prenom: current.prenom,
          activite: current.activite,
          type_activite: current.typeActivite,
          main_goal: current.mainGoal,
          level: current.level,
          weekly_time: current.weeklyTime,
          posts_per_week: current.postsPerWeek,
          stories_per_week: current.storiesPerWeek,
          linkedin_posts_per_week: current.linkedinPostsPerWeek,
          website_url: current.websiteUrl,
          instagram_url: current.instagramUrl,
          linkedin_url: current.linkedinUrl,
        })
        .eq(profileFilter.column, profileFilter.value)
        .select("user_id");
      if (error) throw error;
      // Aucune ligne touchée = rien d'enregistré : on le dit au lieu d'afficher un faux succès.
      if (!updated?.length) throw new Error("Profil introuvable : rien n'a été enregistré.");
      queryClient.invalidateQueries({ queryKey: ["profile"] });

      // Sync to user_plan_config
      if (current.mainGoal || current.level || current.weeklyTime) {
        const configUpdate: any = {};
        if (current.mainGoal) configUpdate.main_goal = current.mainGoal;
        if (current.level) configUpdate.level = current.level;
        if (current.weeklyTime) configUpdate.weekly_time = current.weeklyTime;
        let { data: configRows, error: configError } = await (supabase.from("user_plan_config") as any)
          .update(configUpdate)
          .eq(column, value)
          .select("user_id");
        if (!configError && !configRows?.length && column === "workspace_id") {
          ({ data: configRows, error: configError } = await (supabase.from("user_plan_config") as any)
            .update(configUpdate)
            .eq("user_id", profileFilter.value)
            .select("user_id"));
        }
        if (configError) throw configError;
      }

      setSaved({ ...current });
      toast.success("✅ Modifications enregistrées");
    } catch (error: any) {
      console.error("Erreur technique:", error);
      toast.error("Erreur", { description: friendlyError(error) });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <PageLoader label="Chargement…" />
    </div>
  );

  // Erreur de chargement : on N'AFFICHE PAS le formulaire (champs vides = fausse
  // perte de données + risque d'écrasement du vrai profil au « Sauvegarder »).
  if (loadError) return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-4 mt-8">
          <h2 className="text-xl font-semibold">Impossible de charger ton profil</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Une erreur réseau est survenue. Tes données n'ont pas été perdues — elles sont bien enregistrées. Réessaie dans un instant.
          </p>
          <Button onClick={handleRetry}>Réessayer</Button>
        </div>
      </main>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      
      <main className="mx-auto max-w-2xl px-4 py-8 pb-28 md:pb-12 animate-fade-in">
        <h1 className="font-display text-3xl font-bold text-bordeaux mb-2">Mon profil</h1>
        <p className="text-sm text-muted-foreground mb-4">Tes infos pratiques : prénom, canaux, rythme et liens.</p>

        {/* Une seule entrée vers Mon identité (chantier F du 15/10/2026) : la
            carte « Module Branding » et l'encadré « ont déménagé » menaient au
            même endroit. */}
        <div className="rounded-2xl bg-rose-pale border border-border p-4 mb-5">
          <Link to="/branding" className="flex items-center justify-between group">
            <div>
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5"><Palette className="h-4 w-4 text-primary" strokeWidth={1.75} />Mon identité</p>
              <p className="text-xs text-muted-foreground mt-0.5">Ce que tu fais, ta cliente idéale, tes thématiques, ton ton. C'est ce que lit l'IA.</p>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
          </Link>
          <div className="flex flex-wrap gap-2 pt-3">
            <Link to="/branding/section?section=persona" className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 hover:text-primary transition-colors">
              Ma cliente idéale →
            </Link>
            <Link to="/branding/section?section=content_strategy" className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 hover:text-primary transition-colors">
              Mes thématiques →
            </Link>
            <Link to="/branding/section?section=tone_style" className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 hover:text-primary transition-colors">
              Mon ton →
            </Link>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-4 h-auto rounded-xl p-1 mb-4">
            {PROFILE_TABS.map(t => (
              <TabsTrigger key={t.id} value={t.id} className="relative rounded-lg px-1 py-2 text-xs sm:text-sm whitespace-normal leading-tight">
                {t.label}
                {tabHasChanges[t.id] && (
                  <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-primary" aria-label="modifié, pas encore enregistré" />
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="moi" className="mt-0 space-y-4">
            <div className="rounded-2xl bg-card p-5 sm:p-6 border border-border space-y-5">
              {/* Prénom */}
              <div>
                <label htmlFor="profile-prenom" className="text-sm font-medium mb-1.5 block">Prénom</label>
                <Input id="profile-prenom" value={current.prenom} onChange={(e) => update("prenom", e.target.value)} className="rounded-[10px] h-12" />
              </div>

              {/* Activité */}
              <div>
                <label htmlFor="profile-activite" className="text-sm font-medium mb-1.5 block">Mon métier en quelques mots</label>
                <Input id="profile-activite" value={current.activite} onChange={(e) => update("activite", e.target.value)} className="rounded-[10px] h-12" placeholder="Ex : Photographe, coach, graphiste..." />
                <p className="text-xs text-muted-foreground mt-1">Ta présentation complète (ce que tu fais, pour qui) est dans Mon identité.</p>
              </div>

              {/* Type d'activité */}
              <div>
                <label className="text-sm font-medium mb-1.5 block">Type d'activité</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {ACTIVITY_TYPES.map((t) => (
                    <button key={t.id} onClick={() => update("typeActivite", t.id)}
                      className={`rounded-lg border-2 px-3 py-2.5 text-left text-sm font-medium transition-all ${activityFamily(current.typeActivite) === t.id ? "border-primary bg-secondary" : "border-border hover:border-primary/40"}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <ProfileSaveBar hasChanges={hasChanges} saving={saving} onSave={handleSave} />
          </TabsContent>

          <TabsContent value="canaux" className="mt-0 space-y-4">
            <div className="rounded-2xl bg-card p-5 sm:p-6 border border-border">
              <ChannelSelector />
            </div>
            {/* Les canaux s'enregistrent au clic ; le bouton n'apparaît ici que
                pour une modification laissée dans un autre onglet. */}
            {hasChanges && (
              <ProfileSaveBar hasChanges={hasChanges} saving={saving} onSave={handleSave} />
            )}
          </TabsContent>

          <TabsContent value="rythme" className="mt-0 space-y-4">
            <div className="rounded-2xl bg-card p-5 sm:p-6 border border-border space-y-5">
              <div>
                <label className="text-sm font-medium mb-2 flex items-center gap-1.5"><Target className="h-4 w-4 text-primary" strokeWidth={1.75} />Mon objectif principal</label>
                <ChipSelector options={GOAL_OPTIONS} value={current.mainGoal} onChange={(v: string) => update("mainGoal", v)} />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-primary" strokeWidth={1.75} />Mon niveau en com'</label>
                <ChipSelector options={LEVEL_OPTIONS} value={current.level} onChange={(v: string) => update("level", v)} />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 flex items-center gap-1.5"><Clock className="h-4 w-4 text-primary" strokeWidth={1.75} />Mon temps dispo par semaine</label>
                <ChipSelector options={TIME_OPTIONS} value={current.weeklyTime} onChange={(v: string) => update("weeklyTime", v)} />
              </div>
            </div>
            <div className="rounded-2xl bg-card p-5 sm:p-6 border border-border space-y-4">
              <label className="text-sm font-medium mb-1 flex items-center gap-1.5"><BarChart3 className="h-4 w-4 text-primary" strokeWidth={1.75} />Ma fréquence souhaitée</label>
              <FrequencySelector
                label="Posts Instagram par semaine"
                value={current.postsPerWeek}
                options={[1, 2, 3, 4, 5]}
                onChange={(v) => update("postsPerWeek", v)}
              />
              <FrequencySelector
                label="Stories par semaine"
                value={current.storiesPerWeek}
                options={[0, 3, 5, 7, 10]}
                onChange={(v) => update("storiesPerWeek", v)}
              />
              <FrequencySelector
                label="Posts LinkedIn par semaine"
                value={current.linkedinPostsPerWeek}
                options={[0, 1, 2, 3]}
                onChange={(v) => update("linkedinPostsPerWeek", v)}
              />
            </div>
            <ProfileSaveBar hasChanges={hasChanges} saving={saving} onSave={handleSave} />
          </TabsContent>

          <TabsContent value="liens" className="mt-0 space-y-4">
            <div className="rounded-2xl bg-card p-5 sm:p-6 border border-border space-y-4">
              <div>
                <label className="text-sm font-medium flex items-center gap-1.5"><Link2 className="h-4 w-4 text-primary" strokeWidth={1.75} />Mes liens</label>
                <p className="text-xs text-muted-foreground mt-1">Rangés ici une seule fois : ils sont proposés d'office pour remplir Mon identité.</p>
              </div>
              <div>
                <label htmlFor="profile-website" className="text-xs text-muted-foreground mb-1 block">Site web</label>
                <Input id="profile-website" value={current.websiteUrl} onChange={(e) => update("websiteUrl", e.target.value)} className="rounded-[10px] h-11" placeholder="https://monsite.com" />
              </div>
              <div>
                <label htmlFor="profile-instagram" className="text-xs text-muted-foreground mb-1 block">Instagram</label>
                <Input id="profile-instagram" value={current.instagramUrl} onChange={(e) => update("instagramUrl", e.target.value)} className="rounded-[10px] h-11" placeholder="https://instagram.com/moncompte" />
              </div>
              <div>
                <label htmlFor="profile-linkedin" className="text-xs text-muted-foreground mb-1 block">LinkedIn</label>
                <Input id="profile-linkedin" value={current.linkedinUrl} onChange={(e) => update("linkedinUrl", e.target.value)} className="rounded-[10px] h-11" placeholder="https://linkedin.com/in/monprofil" />
              </div>
            </div>
            <ProfileSaveBar hasChanges={hasChanges} saving={saving} onSave={handleSave} />
          </TabsContent>
        </Tabs>

        {/* Welcome page link */}
        <div className="mt-5 text-center">
          <Link to="/welcome" className="text-xs text-muted-foreground hover:text-primary transition-colors underline">
            Revoir la page de bienvenue
          </Link>
        </div>
      </main>

    </div>
  );
}

// Bouton posé sous le contenu de l'onglet (il ne flotte plus par-dessus la
// page). Seulement quand une modification attend, il reste collé en bas de
// l'écran pour qu'on n'ait pas à le chercher.
function ProfileSaveBar({ hasChanges, saving, onSave }: { hasChanges: boolean; saving: boolean; onSave: () => Promise<void> }) {
  return (
    <div className={hasChanges || saving ? "sticky bottom-16 md:bottom-4 z-30 rounded-pill bg-background" : undefined}>
      <SaveButton hasChanges={hasChanges} saving={saving} onSave={onSave} label="Enregistrer mes infos" />
    </div>
  );
}

function ChannelSelector() {
  const { channels, setChannels, loading, error, saving, canEdit, reload } = useActiveChannels();
  const [showComingSoon, setShowComingSoon] = useState<string | null>(null);

  if (loading) return <p>Chargement des canaux…</p>;
  if (error) return <div role="alert">{error} <button onClick={reload}>Réessayer</button></div>;

  const toggle = async (id: ChannelId) => {
    const isActive = channels.includes(id);
    if (isActive && channels.length <= 1) {
      toast.error("Au moins 1 canal requis");
      return;
    }
    const next = isActive ? channels.filter(c => c !== id) : [...channels, id];
    const ch = ALL_CHANNELS.find(c => c.id === id);
    if (ch?.comingSoon && !isActive) {
      setShowComingSoon(id);
      setTimeout(() => setShowComingSoon(null), 3000);
    }
    if (!await setChannels(next as ChannelId[])) return;
    toast(isActive ? `${ch?.label} retiré` : `${ch?.label} ajouté ✅`);
  };

  return (
    <div>
      <label className="text-sm font-medium mb-2 flex items-center gap-1.5"><Smartphone className="h-4 w-4 text-primary" strokeWidth={1.75} />Mes canaux de communication</label>
      <p className="text-xs text-muted-foreground mb-3">
        Sélectionne les canaux que tu utilises ou que tu veux développer. L'outil s'adapte. Chaque clic est enregistré tout de suite.
      </p>
      <div className="space-y-2">
        {ALL_CHANNELS.map((ch) => {
          const active = channels.includes(ch.id);
          return (
            <button
              key={ch.id}
              onClick={() => toggle(ch.id)}
              disabled={saving || !canEdit}
              className={`w-full flex items-center gap-3 rounded-xl border-2 px-4 py-2.5 text-left text-sm font-medium transition-all ${
                active
                  ? "border-primary bg-secondary"
                  : "border-border hover:border-primary/40"
              }`}
            >
              <span className="text-lg">{ch.emoji}</span>
              <span className="flex-1">{ch.label}</span>
              {ch.comingSoon && (
                <span className="text-2xs font-bold text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full"><Hourglass className="h-3 w-3" strokeWidth={1.75} /></span>
              )}
              <span className={`text-xs font-semibold ${active ? "text-primary" : "text-muted-foreground"}`}>
                {active ? <Check className="h-4 w-4" strokeWidth={1.75} /> : ""}
              </span>
            </button>
          );
        })}
      </div>
      {showComingSoon && (
        <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1 animate-fade-in">
          <Info className="h-3 w-3" /> Ce canal sera disponible prochainement. On te préviendra !
        </p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        💡 Tu pourras modifier tes canaux à tout moment.
      </p>
    </div>
  );
}
