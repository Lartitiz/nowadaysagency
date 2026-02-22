import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import AiDisclaimerBanner from "@/components/AiDisclaimerBanner";
import { Progress } from "@/components/ui/progress";
import { ExternalLink, ArrowRight } from "lucide-react";
import RoutinesPanel from "@/components/RoutinesPanel";
import { getMonday } from "@/lib/mission-engine";
import { fetchBrandingData, calculateBrandingCompletion, type BrandingCompletion } from "@/lib/branding-completion";

export interface UserProfile {
  prenom: string;
  activite: string;
  type_activite: string;
  cible: string;
  probleme_principal: string;
  piliers: string[];
  tons: string[];
  plan_start_date: string | null;
  mission?: string;
  offre?: string;
  croyances_limitantes?: string;
  verbatims?: string;
  expressions_cles?: string;
  ce_quon_evite?: string;
  style_communication?: string[];
  canaux?: string[];
}

/* ─── Module cards data ─── */
interface ModuleCard {
  id: string;
  emoji: string;
  number: number;
  title: string;
  description: string;
  chips: string[];
  cta: string;
  route?: string;
  externalUrl?: string;
  badge: { label: string; variant: "available" | "soon" | "external" };
  disabled?: boolean;
}

const MODULES: ModuleCard[] = [
  {
    id: "branding",
    emoji: "🎨",
    number: 1,
    title: "Mon Branding",
    description: "Pose les bases de ta marque : ta mission, ton positionnement, ta cible, ton ton. C'est ce qui rend tout le reste cohérent.",
    chips: ["Ma mission", "Ma cible", "Mon ton", "Mon positionnement"],
    cta: "Définir ma marque →",
    route: "/branding",
    badge: { label: "Disponible", variant: "available" },
  },
  {
    id: "instagram",
    emoji: "📱",
    number: 2,
    title: "Mon Instagram",
    description: "Optimise ton compte, trouve des idées de contenu, planifie tes posts, et crée du contenu qui fonctionne.",
    chips: ["Ma bio", "Idées de contenu", "Calendrier", "Stories à la une", "Lancement"],
    cta: "Bosser sur Instagram →",
    route: "/instagram",
    badge: { label: "Disponible", variant: "available" },
  },
  {
    id: "linkedin",
    emoji: "💼",
    number: 3,
    title: "Mon LinkedIn",
    description: "Optimise ton profil, développe ton réseau et crée du contenu qui te positionne comme experte.",
    chips: ["Mon profil", "Mon résumé", "Mon parcours", "Engagement"],
    cta: "Bosser sur LinkedIn →",
    route: "/linkedin",
    badge: { label: "Disponible", variant: "available" },
  },
  {
    id: "pinterest",
    emoji: "📌",
    number: 4,
    title: "Mon Pinterest",
    description: "Transforme tes visuels en trafic durable. Pinterest travaille pour toi même quand tu dors.",
    chips: ["Mon compte", "Mes tableaux", "Mes épingles", "Mots-clés"],
    cta: "Bosser sur Pinterest →",
    route: "/pinterest",
    badge: { label: "Disponible", variant: "available" },
  },
  {
    id: "siteweb",
    emoji: "🌐",
    number: 7,
    title: "Mon Site Web",
    description: "Rédige les textes de ton site : page d'accueil, à propos, pages produits. On te guide, tu copies-colles.",
    chips: ["Page d'accueil", "À propos", "Pages produits"],
    cta: "Bosser sur mon site →",
    route: "/site",
    badge: { label: "Disponible", variant: "available" },
  },
  {
    id: "seo",
    emoji: "🔍",
    number: 5,
    title: "Mon Référencement (SEO)",
    description: "Sois trouvée sur Google. Mots-clés, maillage interne, optimisation de tes pages.",
    chips: ["Mots-clés", "Maillage interne", "Audit SEO"],
    cta: "Ouvrir l'outil SEO ↗",
    externalUrl: "https://referencement-seo.lovable.app/",
    badge: { label: "Outil dispo ↗", variant: "external" },
  },
  {
    id: "emailing",
    emoji: "📧",
    number: 6,
    title: "Mon Emailing",
    description: "Newsletter, séquences automatisées, emails qui fidélisent sans spammer.",
    chips: ["Newsletter", "Séquences", "Templates"],
    cta: "Arrive bientôt",
    badge: { label: "Bientôt", variant: "soon" },
    disabled: true,
  },
  {
    id: "presse",
    emoji: "📣",
    number: 8,
    title: "Presse & Influence",
    description: "Que d'autres racontent ton histoire à ta place. Relations presse, partenariats, ambassadrices.",
    chips: ["Contacts médias", "Partenariats", "Ambassadrices"],
    cta: "Arrive bientôt",
    badge: { label: "Bientôt", variant: "soon" },
    disabled: true,
  },
];

/* ─── Conseils du jour ─── */
const CONSEILS = [
  "Ta com' n'a pas besoin d'être parfaite. Elle a besoin d'être régulière et sincère.",
  "Un post imparfait publié vaut mille posts parfaits restés dans tes brouillons.",
  "Si tu ne sais pas quoi poster, raconte une galère récente et ce que tu en as appris.",
  "Ton audience ne te suit pas pour tes photos. Elle te suit pour ta vision.",
  "La meilleure stratégie Instagram du monde ne remplacera jamais un positionnement clair.",
  "Vendre, ce n'est pas manipuler. C'est montrer à quelqu'un que tu as la solution à son problème.",
  "2 posts par semaine avec intention valent plus que 7 posts par semaine sans stratégie.",
  "Si un sujet engage en stories, c'est un signal pour en faire un post.",
  "Ton contenu ne doit pas plaire à tout le monde. Il doit parler à la bonne personne.",
  "La visibilité n'est pas de la vanité. C'est politique.",
  "Arrête de te comparer aux comptes qui ont 50K abonné·es. Toi, tu construis une communauté, pas une audience.",
  "Le contenu parfait n'existe pas. Le contenu publié, oui.",
  "Ton expertise mérite d'être visible. Poster, c'est un acte de générosité.",
  "Les algorithmes changent, les vraies connexions restent.",
  "Raconte ton histoire : c'est la seule chose que personne ne peut copier.",
  "La régularité bat la perfection. Toujours.",
  "Ton audience ne veut pas du contenu lisse. Elle veut du vrai.",
  "Chaque post est une graine. Certaines germent tout de suite, d'autres dans 6 mois.",
  "Ta voix unique est ton meilleur atout marketing.",
  "Mieux vaut 100 abonné·es engagé·es que 10 000 fantômes.",
];

/* ─── Badge styles ─── */
function badgeClass(variant: "available" | "soon" | "external") {
  switch (variant) {
    case "available":
      return "bg-primary text-primary-foreground";
    case "soon":
      return "bg-accent text-accent-foreground";
    case "external":
      return "bg-[#E8F5E9] text-[#2E7D32]";
  }
}

/* ─── Main component ─── */
export default function Dashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [brandingCompletion, setBrandingCompletion] = useState<BrandingCompletion>({ storytelling: 0, persona: 0, proposition: 0, tone: 0, strategy: 0, total: 0 });
  const [missionsDone, setMissionsDone] = useState(0);
  const [missionsTotal, setMissionsTotal] = useState(0);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [profRes, brandingData] = await Promise.all([
        supabase
          .from("profiles")
          .select("prenom, activite, type_activite, cible, probleme_principal, piliers, tons, plan_start_date")
          .eq("user_id", user.id)
          .single(),
        fetchBrandingData(user.id),
      ]);
      if (profRes.data) setProfile(profRes.data as UserProfile);
      setBrandingCompletion(calculateBrandingCompletion(brandingData));

      // Fetch missions summary
      const weekStart = getMonday(new Date()).toISOString().split("T")[0];
      const { data: missionsData } = await supabase
        .from("weekly_missions")
        .select("is_done")
        .eq("user_id", user.id)
        .eq("week_start", weekStart);
      if (missionsData) {
        setMissionsTotal(missionsData.length);
        setMissionsDone(missionsData.filter((m: any) => m.is_done).length);
      }
    };
    fetchData();
  }, [user]);

  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
  const conseil = CONSEILS[dayOfYear % CONSEILS.length];

  if (!profile) {
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
      <AiDisclaimerBanner />
      <main className="mx-auto max-w-[1100px] px-6 py-8 max-md:px-4">
        {/* Header */}
        <div className="mb-2">
          <h1 className="font-display text-[22px] sm:text-[30px] font-bold text-foreground">
            Hey <span className="text-primary">{profile.prenom}</span>, on avance sur quoi aujourd'hui ?
          </h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            Choisis un pilier de ta communication. On te guide étape par étape.
          </p>
        </div>

        {/* Suggestion d'ordre */}
        <div className="rounded-[10px] bg-rose-pale px-4 py-3 mb-6">
          <p className="text-[13px] text-muted-foreground">
            💡 <span className="font-bold text-bordeaux">Notre conseil</span> : commence par le Branding, c'est la base de tout. Ensuite Instagram, puis le reste. Mais c'est toi qui décides.
          </p>
        </div>

        {/* Missions summary */}
        {missionsTotal > 0 && (
          <Link to="/plan" className="block mb-6">
            <div className="rounded-2xl border border-border bg-card p-4 hover:border-primary/40 transition-all hover:shadow-card-hover hover:-translate-y-px">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-foreground">🎯 Cette semaine : {missionsDone}/{missionsTotal} missions faites</p>
                <span className="flex items-center gap-1 text-xs text-primary font-medium">
                  Voir mon plan <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </div>
              <Progress value={missionsTotal > 0 ? (missionsDone / missionsTotal) * 100 : 0} className="h-2" />
            </div>
          </Link>
        )}

        {/* Module grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {MODULES.map((mod) => (
            <ModuleCardComponent key={mod.id} mod={mod} brandingCompletion={mod.id === "branding" ? brandingCompletion : undefined} />
          ))}
        </div>

        {/* Routines */}
        <div className="mb-8">
          <RoutinesPanel />
        </div>

        {/* Conseil du jour */}
        <div className="rounded-none rounded-r-2xl bg-rose-pale border-l-4 border-primary px-5 py-4">
          <p className="font-mono-ui text-[11px] font-semibold text-primary uppercase tracking-wide mb-2">
            💡 Le conseil du jour
          </p>
          <p className="text-sm text-foreground leading-relaxed italic">"{conseil}"</p>
        </div>
      </main>
    </div>
  );
}

/* ─── Module Card ─── */
function ModuleCardComponent({ mod, brandingCompletion }: { mod: ModuleCard; brandingCompletion?: BrandingCompletion }) {
  const isActive = mod.id === "branding";

  const sectionBadges = brandingCompletion ? [
    { emoji: "👑", label: "Histoire", score: brandingCompletion.storytelling },
    { emoji: "👩‍💻", label: "Persona", score: brandingCompletion.persona },
    { emoji: "❤️", label: "Proposition", score: brandingCompletion.proposition },
    { emoji: "🎨", label: "Ton", score: brandingCompletion.tone },
    { emoji: "🍒", label: "Stratégie", score: brandingCompletion.strategy },
  ] : null;

  const inner = (
    <div
      className={`relative rounded-2xl border bg-card p-5 transition-all duration-[250ms] ${
        mod.disabled
          ? "opacity-45 cursor-default"
          : "hover:shadow-card-hover hover:-translate-y-px cursor-pointer"
      } ${
        isActive
          ? "border-primary border-2 before:absolute before:top-0 before:left-4 before:right-4 before:h-[3px] before:bg-primary before:rounded-b-full"
          : "border-border"
      }`}
    >
      {/* Top row: number + badge */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-2xl">{mod.emoji}</span>
        <div className="flex items-center gap-2">
          <span className={`font-mono-ui text-[11px] font-semibold px-2 py-0.5 rounded-md ${badgeClass(mod.badge.variant)}`}>
            {mod.badge.label}
          </span>
          <span className="font-mono-ui text-[11px] font-semibold bg-rose-pale text-foreground px-2 py-0.5 rounded-md">
            {mod.number}
          </span>
        </div>
      </div>

      {/* Title */}
      <h3 className="font-display text-lg font-bold text-foreground mb-1">{mod.title}</h3>
      <p className="text-[13px] text-muted-foreground leading-relaxed mb-3">{mod.description}</p>

      {/* Chips */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {mod.chips.map((chip) => (
          <span
            key={chip}
            className={`font-mono-ui text-[10px] font-medium px-2 py-0.5 rounded-md ${
              mod.disabled ? "bg-secondary text-muted-foreground" : "bg-rose-pale text-bordeaux"
            }`}
          >
            {chip}
          </span>
        ))}
      </div>

      {/* Branding progress */}
      {brandingCompletion && (
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono-ui text-[11px] text-muted-foreground">Branding : {brandingCompletion.total}% complété</span>
            {brandingCompletion.total === 100 && (
              <span className="font-mono-ui text-[10px] font-semibold text-[#2E7D32] bg-[#E8F5E9] px-1.5 py-0.5 rounded">✅ Complet</span>
            )}
          </div>
          <Progress value={brandingCompletion.total} className="h-2 mb-2" />
          <div className="flex flex-wrap gap-1.5">
            {sectionBadges?.map((s) => (
              <span
                key={s.label}
                className={`font-mono-ui text-[9px] font-semibold px-1.5 py-0.5 rounded ${
                  s.score === 100
                    ? "bg-[#E8F5E9] text-[#2E7D32]"
                    : s.score > 0
                      ? "bg-accent text-accent-foreground"
                      : "bg-secondary text-muted-foreground"
                }`}
              >
                {s.emoji} {s.score === 100 ? "✅" : s.score > 0 ? `${s.score}%` : "À faire"}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      <p className={`text-sm font-semibold ${mod.disabled ? "text-muted-foreground" : "text-primary"}`}>
        {mod.cta}
      </p>
    </div>
  );

  if (mod.disabled) return inner;

  if (mod.externalUrl) {
    return (
      <a href={mod.externalUrl} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  }

  return <Link to={mod.route!}>{inner}</Link>;
}
