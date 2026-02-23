import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { supabase } from "@/integrations/supabase/client";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClipboardList, MessageSquare, Sparkles, History } from "lucide-react";
import EditableField from "@/components/branding/EditableField";
import BrandingCoachingFlow from "@/components/branding/BrandingCoachingFlow";
import BrandingCoachingHistory from "@/components/branding/BrandingCoachingHistory";
import { DEMO_DATA } from "@/lib/demo-data";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

type Section = "story" | "persona" | "value_proposition" | "tone_style" | "content_strategy";

interface SectionConfig {
  emoji: string;
  title: string;
  parentLabel: string;
  fields: FieldDef[];
  table: string;
  idField?: string;
}

interface FieldDef {
  key: string;
  label: string;
  table?: string;
  multiline?: boolean;
}

const SECTION_CONFIGS: Record<Section, SectionConfig> = {
  story: {
    emoji: "📖",
    title: "Mon histoire",
    parentLabel: "Branding",
    table: "brand_profile",
    fields: [
      { key: "story_origin", label: "Comment tout a commencé" },
      { key: "story_turning_point", label: "Le déclic" },
      { key: "story_struggles", label: "Les galères" },
      { key: "story_unique", label: "Ce qui me rend unique" },
      { key: "story_vision", label: "Ma vision" },
      { key: "story_full", label: "Mon histoire complète" },
    ],
  },
  persona: {
    emoji: "👩‍💻",
    title: "Mon client·e idéal·e",
    parentLabel: "Branding",
    table: "brand_profile",
    fields: [
      { key: "target_description", label: "Portrait" },
      { key: "target_problem", label: "Ce qui la bloque" },
      { key: "target_beliefs", label: "Ce qu'elle croit (à tort)" },
      { key: "target_verbatims", label: "Ses mots, ses expressions" },
    ],
  },
  value_proposition: {
    emoji: "❤️",
    title: "Ma proposition de valeur",
    parentLabel: "Branding",
    table: "brand_proposition",
    fields: [
      { key: "step_1_what", label: "Mon métier, en simple", multiline: false },
      { key: "step_2a_process", label: "Mon process unique" },
      { key: "step_2b_values", label: "Ce qui est important pour moi" },
      { key: "step_2c_feedback", label: "Ce que mes client·es me disent" },
      { key: "step_2d_refuse", label: "Ce que je refuse de faire" },
      { key: "step_3_for_whom", label: "Pour qui je suis la bonne personne" },
      { key: "version_pitch_naturel", label: "Pitch naturel" },
      { key: "version_bio", label: "Version bio" },
      { key: "version_networking", label: "Pitch networking" },
      { key: "version_site_web", label: "Version site web" },
      { key: "version_engagee", label: "Version engagée" },
      { key: "version_one_liner", label: "One-liner" },
      { key: "version_final", label: "Version favorite" },
    ],
  },
  tone_style: {
    emoji: "🎨",
    title: "Mon ton, mon style & mes combats",
    parentLabel: "Branding",
    table: "brand_profile",
    fields: [
      { key: "voice_description", label: "Comment je parle" },
      { key: "combat_cause", label: "Ma cause" },
      { key: "combat_fights", label: "Mes combats" },
      { key: "combat_alternative", label: "Mon alternative" },
      { key: "combat_refusals", label: "Ce que je refuse" },
      { key: "tone_register", label: "Registre (tu/vous)", multiline: false },
      { key: "tone_level", label: "Niveau de familiarité", multiline: false },
      { key: "tone_style", label: "Style d'écriture", multiline: false },
      { key: "tone_humor", label: "Humour", multiline: false },
      { key: "tone_engagement", label: "Engagement", multiline: false },
      { key: "key_expressions", label: "Mes expressions clés" },
      { key: "things_to_avoid", label: "Ce que j'évite" },
      { key: "target_verbatims", label: "Les mots de ma cible" },
    ],
  },
  content_strategy: {
    emoji: "🍒",
    title: "Ma stratégie de contenu",
    parentLabel: "Branding",
    table: "brand_strategy",
    fields: [
      { key: "step_1_hidden_facets", label: "Mes facettes cachées" },
      { key: "facet_1", label: "Facette 1", multiline: false },
      { key: "facet_2", label: "Facette 2", multiline: false },
      { key: "facet_3", label: "Facette 3", multiline: false },
      { key: "pillar_major", label: "Pilier majeur", multiline: false },
      { key: "pillar_minor_1", label: "Pilier mineur 1", multiline: false },
      { key: "pillar_minor_2", label: "Pilier mineur 2", multiline: false },
      { key: "pillar_minor_3", label: "Pilier mineur 3", multiline: false },
      { key: "creative_concept", label: "Mon concept créatif" },
    ],
  },
};

const DEMO_FICHE_DATA: Record<Section, Record<string, string>> = {
  story: {
    story_origin: "J'ai commencé la photo à 22 ans, un peu par hasard. Je faisais des portraits de mes amies et un jour, une d'entre elles m'a demandé de shooter sa marque.",
    story_turning_point: "Le jour où une cliente m'a dit 'c'est la première fois que je me trouve belle en photo', j'ai compris que mon métier allait au-delà de la technique.",
    story_struggles: "2 ans à galérer avec les réseaux, à poster dans le vide sans retour. Le syndrome de l'imposteur, les comparaisons avec d'autres photographes plus expérimentées.",
    story_unique: "Je coache la posture avant de shooter. Mes clientes repartent confiantes, pas juste avec de belles photos.",
    story_vision: "Un monde où chaque femme ose se montrer telle qu'elle est, sans filtre, sans excuses.",
    story_full: "",
  },
  persona: {
    target_description: "Femme entrepreneure, 30-45 ans, créatrice ou coach, qui lance ou fait évoluer son activité. Elle veut une image qui la représente vraiment.",
    target_problem: "Manque de confiance en son image. Peur de ne pas être à la hauteur. Ne sait pas quelle image véhiculer pour attirer ses clientes idéales.",
    target_beliefs: "Elle croit que les photos professionnelles, c'est pour les grandes marques. Elle pense qu'il faut être photogénique pour avoir de belles photos.",
    target_verbatims: "\"Je ne suis pas photogénique\", \"C'est trop cher pour moi en ce moment\", \"Je ne sais pas quoi faire de mes mains\"",
  },
  value_proposition: {
    step_1_what: "Je suis photographe de marque personnelle",
    step_2a_process: "Je coache mes clientes sur leur posture et leur confiance avant chaque séance photo.",
    step_2b_values: "L'authenticité, la bienveillance et le sur-mesure.",
    step_2c_feedback: "\"C'est la première fois que je me trouve belle en photo.\"",
    step_2d_refuse: "Les shootings de masse, les retouches excessives.",
    step_3_for_whom: "Les entrepreneures qui veulent une image pro et authentique.",
    version_pitch_naturel: "J'aide les entrepreneures à se sentir bien dans leur image de marque grâce à des séances photo coachées.",
    version_bio: "Photographe de marque personnelle 📸 J'aide les entrepreneures à oser se montrer ✨",
    version_networking: "",
    version_site_web: "",
    version_engagee: "",
    version_one_liner: "Des photos qui te ressemblent, enfin.",
    version_final: "J'aide les entrepreneures à se sentir bien dans leur image de marque.",
  },
  tone_style: {
    voice_description: "Je parle comme à une copine, direct, un peu cash mais toujours avec le cœur. J'utilise l'humour et l'auto-dérision.",
    combat_cause: "Que chaque femme puisse se sentir légitime à se montrer.",
    combat_fights: "Les standards de beauté irréalistes dans le monde pro. Les photos corporate froides et impersonnelles.",
    combat_alternative: "Des photos authentiques, chaleureuses, qui montrent la vraie personne.",
    combat_refusals: "Les retouches excessives, les shootings à la chaîne, les promesses irréalistes.",
    tone_register: "tu",
    tone_level: "amie",
    tone_style: "oral",
    tone_humor: "auto-derision",
    tone_engagement: "nuancee",
    key_expressions: "\"C'est ton moment\", \"Ose te montrer\", \"Pas besoin d'être parfaite\"",
    things_to_avoid: "Le jargon photo technique, les formules toutes faites, le ton corporate",
    target_verbatims: "",
  },
  content_strategy: {
    step_1_hidden_facets: "Ma vie de maman, mes lectures sur le féminisme, mes doutes d'entrepreneure.",
    facet_1: "Ma vie de maman",
    facet_2: "Mes lectures féministes",
    facet_3: "Mon rapport au corps",
    pillar_major: "La confiance en soi par l'image",
    pillar_minor_1: "Les coulisses de mon métier",
    pillar_minor_2: "L'entrepreneuriat au féminin",
    pillar_minor_3: "Le personal branding authentique",
    creative_concept: "Le \"miroir bienveillant\" — je montre à mes clientes ce qu'elles ne voient pas encore en elles.",
  },
};

export default function BrandingSectionPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDemoMode } = useDemoContext();

  const section = (searchParams.get("section") || "story") as Section;
  const defaultTab = searchParams.get("tab") || "fiche";
  const config = SECTION_CONFIGS[section];

  const [activeTab, setActiveTab] = useState(defaultTab);
  const [data, setData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  useEffect(() => {
    if (!config) {
      navigate("/branding");
    }
  }, [config, navigate]);

  useEffect(() => {
    if (!config) return;
    if (isDemoMode) {
      setData(DEMO_FICHE_DATA[section] || {});
      setLastUpdated(new Date(Date.now() - 3 * 86400000).toISOString());
      setLoading(false);
      return;
    }
    if (!user) return;

    const load = async () => {
      const table = config.table;
      const columns = config.fields.map(f => f.key).join(", ") + ", updated_at";
      const { data: row } = await (supabase.from(table as any) as any)
        .select(columns)
        .eq("user_id", user.id)
        .maybeSingle();
      if (row) {
        setData(row);
        setLastUpdated(row.updated_at || null);
      }
      setLoading(false);
    };
    load();
  }, [user?.id, section, isDemoMode]);

  if (!config) return null;

  const filledCount = config.fields.filter(f => {
    const v = data[f.key];
    return v && typeof v === "string" && v.trim().length > 0;
  }).length;
  const totalFields = config.fields.length;
  const completionPct = Math.round((filledCount / totalFields) * 100);
  const emptyCount = totalFields - filledCount;

  const handleFieldUpdate = (field: string, value: string) => {
    setData(prev => ({ ...prev, [field]: value }));
    setLastUpdated(new Date().toISOString());
  };

  const switchToCoaching = () => setActiveTab("coaching");

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader />
        <div className="flex justify-center py-20">
          <div className="flex gap-1">
            <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" />
            <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.16s" }} />
            <div className="h-3 w-3 rounded-full bg-primary animate-bounce-dot" style={{ animationDelay: "0.32s" }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="mx-auto max-w-[700px] px-6 py-8 max-md:px-4">
        <SubPageHeader parentLabel="Branding" parentTo="/branding" currentLabel={config.title} />

        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">{config.emoji}</span>
          <h1 className="font-display text-[26px] font-bold text-foreground">{config.title}</h1>
        </div>

        {/* Completion bar */}
        <div className="flex items-center gap-3 mb-6">
          <div className="h-2 bg-muted rounded-full flex-1 overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${completionPct}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground font-medium">
            {completionPct}%{emptyCount > 0 ? ` · ${emptyCount} champ${emptyCount > 1 ? "s" : ""} manquant${emptyCount > 1 ? "s" : ""}` : ""}
          </span>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full mb-6">
            <TabsTrigger value="fiche" className="flex-1 gap-2">
              <ClipboardList className="h-4 w-4" />
              Ma fiche
            </TabsTrigger>
            <TabsTrigger value="coaching" className="flex-1 gap-2">
              <MessageSquare className="h-4 w-4" />
              Coaching IA
            </TabsTrigger>
          </TabsList>

          {/* FICHE TAB */}
          <TabsContent value="fiche">
            <div className="space-y-0">
              {config.fields.map(field => (
                <EditableField
                  key={field.key}
                  label={field.label}
                  value={data[field.key] || ""}
                  field={field.key}
                  table={field.table || config.table}
                  multiline={field.multiline !== false}
                  onUpdated={handleFieldUpdate}
                  onStartCoaching={switchToCoaching}
                />
              ))}
            </div>

            {lastUpdated && (
              <p className="text-xs text-muted-foreground mt-4">
                Dernière modification : {format(new Date(lastUpdated), "d MMMM yyyy 'à' HH:mm", { locale: fr })}
              </p>
            )}

            <Button
              variant="outline"
              className="w-full mt-6 gap-2"
              onClick={switchToCoaching}
            >
              <Sparkles className="h-4 w-4" />
              {filledCount > 0 ? "Continuer le coaching →" : "Commencer le coaching →"}
            </Button>
          </TabsContent>

          {/* COACHING TAB */}
          <TabsContent value="coaching">
            {showHistory ? (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display text-base font-bold text-foreground flex items-center gap-2">
                    <History className="h-4 w-4" /> Historique du coaching
                  </h3>
                  <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)} className="text-xs">
                    ← Retour au coaching
                  </Button>
                </div>
                <BrandingCoachingHistory section={section} />
                <Button className="w-full mt-6" onClick={() => setShowHistory(false)}>
                  <Sparkles className="h-4 w-4 mr-2" /> Continuer le coaching →
                </Button>
              </div>
            ) : (
              <div>
                <div className="flex justify-end mb-4">
                  <Button variant="ghost" size="sm" onClick={() => setShowHistory(true)} className="text-xs gap-1.5">
                    <History className="h-3.5 w-3.5" /> Voir l'historique
                  </Button>
                </div>
                <BrandingCoachingFlow
                  section={section}
                  onComplete={() => {
                    setActiveTab("fiche");
                    // Reload data
                    if (!isDemoMode && user) {
                      const columns = config.fields.map(f => f.key).join(", ") + ", updated_at";
                      (supabase.from(config.table as any) as any)
                        .select(columns)
                        .eq("user_id", user.id)
                        .maybeSingle()
                        .then(({ data: row }: any) => {
                          if (row) {
                            setData(row);
                            setLastUpdated(row.updated_at || null);
                          }
                        });
                    }
                  }}
                  onBack={() => setActiveTab("fiche")}
                />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
