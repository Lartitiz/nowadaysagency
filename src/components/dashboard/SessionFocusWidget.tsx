import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { BrandingCompletion } from "@/lib/branding-completion";

interface FocusItem {
  emoji: string;
  title: string;
  description: string;
  cta: string;
  route: string;
  duration: string;
  type: "branding" | "audit" | "content" | "other";
  extra?: { brandingTotal?: number; auditScore?: number };
}

const SECTION_META: Record<string, { emoji: string; label: string; route: string }> = {
  storytelling: { emoji: "📖", label: "Storytelling", route: "/branding/section?section=story" },
  persona: { emoji: "👩‍💻", label: "Persona", route: "/branding/section?section=persona" },
  proposition: { emoji: "❤️", label: "Proposition de valeur", route: "/branding/section?section=value_proposition" },
  tone: { emoji: "🗣️", label: "Ton & style", route: "/branding/section?section=tone" },
  strategy: { emoji: "📐", label: "Stratégie", route: "/branding/section?section=strategy" },
  charter: { emoji: "🎨", label: "Charte graphique", route: "/branding/charter" },
};

function getSmartFocus(
  bc: BrandingCompletion,
  igAuditScore: number | null,
  liAuditScore: number | null,
  calendarPostCount: number,
  weekPostsPublished: number,
  weekPostsTotal: number,
  contactCount: number,
): FocusItem {

  // PRIORITÉ 1 — Storytelling pas commencé (fondation)
  if (bc.storytelling === 0) {
    return {
      emoji: "📖", title: "Raconte ton histoire",
      description: "C'est la base de tout. L'IA te guide, tu parles, elle écrit.",
      cta: "Commencer", route: "/branding/section?section=story",
      duration: "10 min", type: "branding", extra: { brandingTotal: bc.total },
    };
  }

  // PRIORITÉ 2 — Persona pas commencé
  if (bc.persona === 0) {
    return {
      emoji: "👩‍💻", title: "Définis ta cliente idéale",
      description: "Qui veux-tu toucher ? Tout ton contenu en dépend.",
      cta: "Commencer", route: "/branding/section?section=persona",
      duration: "10 min", type: "branding", extra: { brandingTotal: bc.total },
    };
  }

  // PRIORITÉ 3 — Branding très incomplet (< 30%)
  if (bc.total < 30) {
    const sections = Object.entries(bc).filter(([k]) => k !== "total" && k !== "charter") as [string, number][];
    const lowest = sections.sort((a, b) => a[1] - b[1])[0];
    const meta = SECTION_META[lowest[0]];
    if (meta) {
      return {
        emoji: meta.emoji, title: `Continue : ${meta.label}`,
        description: `Cette section est à ${lowest[1]}%. Quelques minutes pour la compléter.`,
        cta: "Continuer", route: meta.route,
        duration: "10 min", type: "branding", extra: { brandingTotal: bc.total },
      };
    }
  }

  // PRIORITÉ 4 — Aucun audit Instagram
  if (igAuditScore === null) {
    return {
      emoji: "📊", title: "Audite ton Instagram",
      description: "5 min pour comprendre où tu en es et quoi améliorer en premier.",
      cta: "Lancer l'audit", route: "/instagram/audit",
      duration: "5 min", type: "audit",
    };
  }

  // PRIORITÉ 5 — Audit Instagram faible (< 50)
  if (igAuditScore < 50) {
    return {
      emoji: "📱", title: "Améliore ton profil Instagram",
      description: `Score : ${igAuditScore}/100. On optimise ta bio et ton feed.`,
      cta: "Voir les priorités", route: "/instagram/audit",
      duration: "15 min", type: "audit", extra: { auditScore: igAuditScore },
    };
  }

  // PRIORITÉ 6 — Aucun audit LinkedIn
  if (liAuditScore === null) {
    return {
      emoji: "💼", title: "Audite ton LinkedIn",
      description: "Ton profil LinkedIn mérite un coup d'œil. L'IA analyse tout en 5 min.",
      cta: "Lancer l'audit", route: "/linkedin/audit",
      duration: "5 min", type: "audit",
    };
  }

  // PRIORITÉ 7 — Branding entre 30-70% : compléter le ton/style
  if (bc.total < 70 && bc.tone < 50) {
    return {
      emoji: "🎨", title: "Affine ton ton et tes combats",
      description: "Comment tu parles, ce que tu défends. C'est ça qui te rend reconnaissable.",
      cta: "Continuer", route: "/branding/section?section=tone_style",
      duration: "10 min", type: "branding", extra: { brandingTotal: bc.total },
    };
  }

  // PRIORITÉ 8 — Aucun post cette semaine
  if (weekPostsTotal === 0) {
    return {
      emoji: "📅", title: "Planifie ta semaine",
      description: "Aucun post prévu. 2-3 posts cette semaine, c'est tenable et efficace.",
      cta: "Ouvrir le calendrier", route: "/calendrier",
      duration: "10 min", type: "content",
    };
  }

  // PRIORITÉ 9 — Des posts planifiés mais rien de publié
  if (weekPostsTotal > 0 && weekPostsPublished === 0) {
    return {
      emoji: "🚀", title: "C'est le moment de publier",
      description: `${weekPostsTotal} post${weekPostsTotal > 1 ? "s" : ""} planifié${weekPostsTotal > 1 ? "s" : ""} cette semaine. Lequel tu publies aujourd'hui ?`,
      cta: "Voir mes posts", route: "/calendrier",
      duration: "5 min", type: "content",
    };
  }

  // PRIORITÉ 10 — Pas de contacts/prospects
  if (contactCount === 0) {
    return {
      emoji: "👥", title: "Commence ton carnet de contacts",
      description: "Ajoute tes premiers contacts pour suivre tes relations pro.",
      cta: "Ajouter un contact", route: "/contacts",
      duration: "5 min", type: "other",
    };
  }

  // PRIORITÉ 11 — Stratégie de contenu pas commencée
  if (bc.strategy === 0 && bc.total >= 40) {
    return {
      emoji: "🧭", title: "Définis ta stratégie de contenu",
      description: "Tes piliers, ton twist créatif. La colonne vertébrale de ta com'.",
      cta: "Commencer", route: "/branding/section?section=content_strategy",
      duration: "15 min", type: "branding", extra: { brandingTotal: bc.total },
    };
  }

  // FALLBACK — Pool rotatif (JAMAIS "crée du contenu" pour éviter le doublon avec le hero)
  const fallbacks: FocusItem[] = [
    {
      emoji: "💬", title: "Engage-toi 15 min",
      description: "Commente 3-5 posts dans ta niche. L'engagement bat l'algorithme.",
      cta: "Mon engagement", route: "/linkedin/engagement",
      duration: "15 min", type: "other",
    },
    {
      emoji: "💡", title: "Trouve 3 idées de posts",
      description: "Remplis ta banque d'idées pour ne jamais être en panne d'inspiration.",
      cta: "Trouver des idées", route: "/creer",
      duration: "10 min", type: "other",
    },
    {
      emoji: "⭐", title: "Demande une recommandation",
      description: "Les recommandations LinkedIn sont la preuve sociale la plus puissante.",
      cta: "Mes recommandations", route: "/linkedin/recommandations",
      duration: "5 min", type: "other",
    },
    {
      emoji: "🔄", title: "Recycle un contenu",
      description: "Transforme un post Instagram en post LinkedIn (ou l'inverse).",
      cta: "Recycler", route: "/transformer",
      duration: "10 min", type: "other",
    },
    {
      emoji: "📊", title: "Vérifie ton score de com'",
      description: "Où en es-tu ? Un coup d'œil pour voir ce qui avance.",
      cta: "Mon score", route: "/mon-plan",
      duration: "2 min", type: "other",
    },
  ];

  // Rotation basée sur le jour de la semaine pour varier
  const dayIndex = new Date().getDay();
  return fallbacks[dayIndex % fallbacks.length];
}

export interface SessionFocusWidgetProps {
  brandingCompletion: BrandingCompletion;
  igAuditScore: number | null;
  liAuditScore: number | null;
  calendarPostCount: number;
  weekPostsPublished: number;
  weekPostsTotal: number;
  contactCount: number;
  animationDelay?: number;
}

export default function SessionFocusWidget({
  brandingCompletion, igAuditScore, liAuditScore, calendarPostCount,
  weekPostsPublished, weekPostsTotal, contactCount, animationDelay = 0,
}: SessionFocusWidgetProps) {
  const navigate = useNavigate();
  const focus = getSmartFocus(brandingCompletion, igAuditScore, liAuditScore, calendarPostCount, weekPostsPublished, weekPostsTotal, contactCount);

  return (
    <div
      className="rounded-2xl border border-border bg-card p-5 shadow-card flex flex-col justify-between h-full opacity-0 animate-fade-in"
      style={{ animationDelay: `${animationDelay}s`, animationFillMode: "forwards" }}
    >
      <div>
        <div className="flex items-center gap-2.5 mb-2">
          <span className="text-2xl">{focus.emoji}</span>
          <h3 className="font-heading text-sm font-bold text-foreground leading-snug">{focus.title}</h3>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">{focus.description}</p>

        {/* Branding progress bar */}
        {focus.type === "branding" && focus.extra?.brandingTotal != null && (
          <div className="flex items-center gap-2 mb-3">
            <Progress value={focus.extra.brandingTotal} className="h-1.5 flex-1" />
            <span className="text-[10px] text-muted-foreground font-medium">{focus.extra.brandingTotal}%</span>
          </div>
        )}

        {/* Audit score */}
        {focus.type === "audit" && focus.extra?.auditScore != null && (
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-[10px] font-medium text-muted-foreground">Score actuel :</span>
            <span className="text-xs font-bold text-primary">{focus.extra.auditScore}/100</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mt-auto pt-1">
        <Button size="sm" onClick={() => navigate(focus.route)} className="rounded-full text-xs gap-1.5 flex-1">
          {focus.cta}
        </Button>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">⏱ {focus.duration}</span>
      </div>
    </div>
  );
}
