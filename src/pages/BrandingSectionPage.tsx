import { useState, useEffect, useRef, useCallback } from "react";
import BrandingImportDialog from "@/components/branding/BrandingImportDialog";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useDemoContext } from "@/contexts/DemoContext";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspaceFilter, useWorkspaceId } from "@/hooks/use-workspace-query";
import AppHeader from "@/components/AppHeader";
import SubPageHeader from "@/components/SubPageHeader";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClipboardList, MessageSquare, Sparkles, History, FileText, ArrowLeft, FileDown } from "lucide-react";
import ContentPlayground from "@/components/branding/ContentPlayground";
import SynthesisRenderer from "@/components/branding/SynthesisRenderer";
import EditableField from "@/components/branding/EditableField";
import BrandingCoachingFlow from "@/components/branding/BrandingCoachingFlow";
import BrandingRecapRenderer from "@/components/branding/BrandingRecapRenderer";
import BrandingFicheCards from "@/components/branding/BrandingFicheCards";
import StoryFicheCards from "@/components/branding/StoryFicheCards";
import BrandingCoachingHistory from "@/components/branding/BrandingCoachingHistory";
import BrandingSuggestionsCard from "@/components/branding/BrandingSuggestionsCard";
import BrandingSpark from "@/components/branding/BrandingSpark";
import BrandingActionCTA from "@/components/branding/BrandingActionCTA";
import { useBrandingSuggestions } from "@/hooks/use-branding-suggestions";
import { DEMO_DATA } from "@/lib/demo-data";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { usePersonas } from "@/hooks/use-personas";
import PersonaList from "@/components/branding/PersonaList";

type Section = "story" | "persona" | "tone_style" | "content_strategy";

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

const NEXT_SECTION: Record<string, { label: string; route: string }> = {
  story: { label: "ton client·e idéal·e", route: "/branding/section?section=persona" },
  persona: { label: "ta proposition de valeur", route: "/branding/section?section=value_proposition" },
  tone_style: { label: "ta ligne éditoriale", route: "/branding/section?section=content_strategy" },
  content_strategy: { label: "ta charte graphique", route: "/branding/charter" },
};

const SECTION_CONFIGS: Record<Section, SectionConfig> = {
  story: {
    emoji: "📖",
    title: "Mon histoire",
    parentLabel: "Mon identité",
    table: "storytelling",
    idField: "id",
    fields: [
      { key: "step_1_raw", label: "Mon point de départ" },
      { key: "step_2_location", label: "Le contexte" },
      { key: "step_3_action", label: "Ce que j'ai fait" },
      { key: "step_4_thoughts", label: "Ce que je pensais" },
      { key: "step_5_emotions", label: "Ce que je ressentais" },
      { key: "step_6_full_story", label: "Mon histoire brute" },
      { key: "step_7_polished", label: "Mon histoire complète" },
      { key: "pitch_short", label: "Pitch court" },
      { key: "pitch_medium", label: "Pitch moyen" },
      { key: "pitch_long", label: "Pitch long" },
    ],
  },
  persona: {
    emoji: "👩‍💻",
    title: "Mon client·e idéal·e",
    parentLabel: "Mon identité",
    table: "persona",
    idField: "id",
    fields: [
      { key: "step_1_frustrations", label: "Ses frustrations" },
      { key: "step_2_transformation", label: "Sa transformation rêvée" },
      { key: "step_3a_objections", label: "Ses objections" },
      { key: "step_3b_cliches", label: "Ses croyances / clichés" },
      { key: "step_4_beautiful", label: "Ce qu'elle trouve beau" },
      { key: "step_4_inspiring", label: "Ce qui l'inspire" },
      { key: "step_4_repulsive", label: "Ce qui la rebute" },
      { key: "step_4_feeling", label: "Ce qu'elle a besoin de ressentir" },
      { key: "step_5_actions", label: "Premières actions" },
      { key: "pitch_short", label: "Pitch court" },
      { key: "pitch_medium", label: "Pitch moyen" },
      { key: "pitch_long", label: "Pitch long" },
    ],
  },
  tone_style: {
    emoji: "🎨",
    title: "Ma voix & mes combats",
    parentLabel: "Mon identité",
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
    title: "Ma ligne éditoriale",
    parentLabel: "Mon identité",
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
    step_1_raw: "",
    step_2_location: "",
    step_3_action: "",
    step_4_thoughts: "",
    step_5_emotions: "",
    step_6_full_story: "",
    step_7_polished: "Petite, j'étais déjà fascinée par les mots. Mon premier déclic, c'était en 3e : un article publié dans le journal local...",
    pitch_short: "J'accompagne les femmes et les collectifs engagé·es à bâtir une présence en ligne éthique et joyeuse.",
    pitch_medium: "",
    pitch_long: "",
  },
  persona: {
    step_1_frustrations: "L'invisibilité malgré les efforts. Elle poste sur Instagram, elle applique des tips, et rien ne bouge.",
    step_2_transformation: "Elle rêverait d'ouvrir Instagram le matin sans cette boule au ventre. De savoir exactement quoi poster.",
    step_3a_objections: "\"C'est trop cher pour moi en ce moment\", \"Je ne suis pas assez avancée pour ça\"",
    step_3b_cliches: "Elle pense que la com' c'est de la manipulation. Que si son projet est bon, il devrait se vendre tout seul.",
    step_4_beautiful: "Feed aéré, couleurs pastel, ambiance bohème",
    step_4_inspiring: "Lumière naturelle, visages sans retouche",
    step_4_repulsive: "Trop de pub, visuels ultra-léchés, stock photos",
    step_4_feeling: "Confiance, chaleur, engagement, paix",
    step_5_actions: "",
    pitch_short: "",
    pitch_medium: "",
    pitch_long: "",
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
  const { column, value } = useWorkspaceFilter();

  const [activeTab, setActiveTab] = useState(defaultTab);
  const [data, setData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [lastCoachingUpdate, setLastCoachingUpdate] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [sparkDismissed, setSparkDismissed] = useState(() => {
    try { return localStorage.getItem(`spark_dismissed_${section}`) === "1"; } catch { return false; }
  });

  // Multi-persona support
  const isPersonaSection = section === "persona";
  const { personas, refetch: refetchPersonas, setPrimary, updateChannels, deletePersona } = usePersonas();
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);

  // When personas load, select the first one (primary)
  useEffect(() => {
    if (isPersonaSection && personas.length > 0 && !selectedPersonaId) {
      setSelectedPersonaId(personas[0].id);
    }
  }, [personas, isPersonaSection, selectedPersonaId]);

  // Redirect value_proposition to recap page
  useEffect(() => {
    if (searchParams.get("section") === "value_proposition") {
      navigate("/branding/proposition/recap", { replace: true });
    }
  }, [searchParams, navigate]);

  useEffect(() => {
    if (!config) {
      navigate("/branding");
    }
  }, [config, navigate]);

  // Load persona by selected ID
  const loadPersonaById = useCallback(async (personaId: string) => {
    const { data: row } = await (supabase.from("persona") as any)
      .select("*")
      .eq("id", personaId)
      .maybeSingle();
    if (row) {
      setData(row);
      setLastUpdated(row.updated_at || null);
    }
  }, []);

  // Select a persona
  const handleSelectPersona = useCallback((id: string) => {
    setSelectedPersonaId(id);
    loadPersonaById(id);
  }, [loadPersonaById]);

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

      // For persona: if we have a selectedPersonaId, load that specific one
      if (isPersonaSection && selectedPersonaId) {
        await loadPersonaById(selectedPersonaId);
        setLoading(false);
        return;
      }

      // Fetch all columns for synthesis support
      let query = (supabase.from(table as any) as any)
        .select("*")
        .eq(column, value);
      
      // storytelling table uses is_primary flag
      if (table === "storytelling") {
        query = query.eq("is_primary", true);
      }
      
      // persona: fetch primary first
      if (isPersonaSection) {
        query = query.eq("is_primary", true);
      }

      const { data: row } = await query.maybeSingle();
      if (row) {
        setData(row);
        setLastUpdated(row.updated_at || null);
        if (isPersonaSection && row.id) {
          setSelectedPersonaId(row.id);
        }
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

  const workspaceId = useWorkspaceId();
  const { suggestions, suggestionId, showSuggestions, checkImpact, dismissSuggestions } = useBrandingSuggestions(workspaceId);

  const handleFieldUpdate = (field: string, value: string, oldValue?: string) => {
    setData(prev => ({ ...prev, [field]: value }));
    setLastUpdated(new Date().toISOString());
    // Check cross-module impact for structural fields
    if (oldValue && oldValue !== value) {
      checkImpact(field, oldValue, value);
    }
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
        <SubPageHeader breadcrumbs={[{ label: "Mon identité", to: "/branding" }]} currentLabel={config.title} />

        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour
        </button>

        <div className="flex items-center gap-3 mb-2">
          <span className="text-2xl">{config.emoji}</span>
          <h1 className="font-display text-[26px] font-bold text-foreground">
            {isPersonaSection && personas.length > 1 ? "Mes personas" : config.title}
          </h1>
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

        {!sparkDismissed && completionPct < 20 && (
          <BrandingSpark section={section} onDismiss={() => setSparkDismissed(true)} />
        )}

        {/* Multi-persona list */}
        {isPersonaSection && !isDemoMode && personas.length > 0 && (
          <PersonaList
            personas={personas}
            selectedId={selectedPersonaId}
            onSelect={handleSelectPersona}
            onSetPrimary={async (id) => { await setPrimary(id); }}
            onUpdateChannels={async (id, ch) => { await updateChannels(id, ch); }}
            onDelete={async (id) => {
              await deletePersona(id);
              if (selectedPersonaId === id) {
                const remaining = personas.filter((p) => p.id !== id);
                if (remaining.length > 0) handleSelectPersona(remaining[0].id);
              }
            }}
            onCreateNew={() => {
              // Navigate to persona stepper with new=true to force insert
              navigate("/branding/persona?new=true");
            }}
          />
        )}

        <Tabs value={activeTab} onValueChange={(v) => {
          setActiveTab(v);
          // When switching to synthese tab, reload data from DB
          if (v === "synthese" && !isDemoMode && user) {
            if (isPersonaSection && selectedPersonaId) {
              loadPersonaById(selectedPersonaId);
            } else {
              const table = config.table;
              const cols = "*";
              let q = (supabase.from(table as any) as any).select(cols).eq(column, value);
              if (table === "storytelling") q = q.eq("is_primary", true);
              q.maybeSingle().then(({ data: row }: any) => {
                if (row) { setData(row); setLastUpdated(row.updated_at || null); }
              });
            }
          }
        }} className="w-full">
          <TabsList className="w-full mb-6">
            <TabsTrigger value="fiche" className="flex-1 gap-2">
              <ClipboardList className="h-4 w-4" />
              Ma fiche
            </TabsTrigger>
            <TabsTrigger value="coaching" className="flex-1 gap-2">
              <MessageSquare className="h-4 w-4" />
              Coaching
            </TabsTrigger>
            <TabsTrigger value="synthese" className="flex-1 gap-2">
              <FileText className="h-4 w-4" />
              ✨ Synthèse
            </TabsTrigger>
          </TabsList>

          {/* FICHE TAB */}
          <TabsContent value="fiche">
            {section !== "story" && (
              <div className="flex justify-end mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-xs"
                  onClick={() => setShowImportDialog(true)}
                >
                  <FileDown className="h-3.5 w-3.5" />
                  📄 Importer mes données
                </Button>
              </div>
            )}

            {showSuggestions && suggestions.length > 0 && (
              <div className="mb-6">
                <BrandingSuggestionsCard
                  suggestions={suggestions}
                  triggerField=""
                  suggestionId={suggestionId}
                  onDismiss={dismissSuggestions}
                />
              </div>
            )}
            {section === "story" ? (
              <StoryFicheCards />
            ) : (
              <BrandingFicheCards
                section={section}
                fields={config.fields}
                data={data}
              />
            )}

            {section !== "story" && (
              <BrandingImportDialog
                open={showImportDialog}
                onOpenChange={setShowImportDialog}
                sectionTitle={config.title}
                sectionTable={config.table}
                fields={config.fields}
                existingData={data}
                filterColumn={column}
                filterValue={value}
                onImportDone={(updated) => {
                  setData(updated);
                  setLastUpdated(new Date().toISOString());
                }}
              />
            )}

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
                    setLastCoachingUpdate(new Date().toISOString());
                    const next = NEXT_SECTION[section];
                    if (next) {
                      toast.success(`✨ Ta fiche ${config.title} a été mise à jour !`, {
                        description: `Prochaine étape : ${next.label}`,
                        action: {
                          label: "Y aller →",
                          onClick: () => navigate(next.route),
                        },
                        duration: 6000,
                      });
                    } else {
                      toast.success(`✨ Ta fiche ${config.title} a été mise à jour !`);
                    }
                    setActiveTab("fiche");
                    if (!isDemoMode && user) {
                      if (isPersonaSection && selectedPersonaId) {
                        loadPersonaById(selectedPersonaId);
                        refetchPersonas();
                      } else {
                        const cols = "*";
                        let query = (supabase.from(config.table as any) as any)
                          .select(cols)
                          .eq(column, value);
                        if (config.table === "storytelling") {
                          query = query.eq("is_primary", true);
                        }
                        query.maybeSingle().then(({ data: row }: any) => {
                          if (row) {
                            setData(row);
                            setLastUpdated(row.updated_at || null);
                          }
                        });
                      }
                    }
                  }}
                  onBack={() => setActiveTab("fiche")}
                />
              </div>
            )}
          </TabsContent>

          {/* SYNTHESE TAB */}
          <TabsContent value="synthese">
            <SynthesisRenderer
              section={section}
              data={data}
              table={config.table}
              lastCoachingUpdate={lastCoachingUpdate}
              onSynthesisGenerated={() => setLastCoachingUpdate(null)}
            />
          </TabsContent>
        </Tabs>

        {completionPct >= 80 && (
          <>
            <BrandingActionCTA section={section} />
            <ContentPlayground section={section} />
          </>
        )}
      </main>
    </div>
  );
}
