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
  calendarPostCount: number,
): FocusItem {
  // PRIORITY 1 — Branding incomplete (total < 40%)
  if (bc.total < 40) {
    if (bc.storytelling === 0) {
      return { emoji: "📖", title: "Raconte ton histoire", description: "C'est la base de tout. 10 minutes pour poser ton parcours.", cta: "Commencer", route: "/branding/section?section=story", duration: "10 min", type: "branding", extra: { brandingTotal: bc.total } };
    }
    if (bc.persona === 0) {
      return { emoji: "👩‍💻", title: "Définis ta cliente idéale", description: "Qui veux-tu toucher ? Tout ton contenu en dépend.", cta: "Commencer", route: "/branding/section?section=persona", duration: "10 min", type: "branding", extra: { brandingTotal: bc.total } };
    }
    if (bc.proposition === 0) {
      return { emoji: "❤️", title: "Formule ta proposition de valeur", description: "Ce qui te rend unique. Les phrases que tu vas utiliser partout.", cta: "Commencer", route: "/branding/section?section=value_proposition", duration: "10 min", type: "branding", extra: { brandingTotal: bc.total } };
    }
    // Find lowest section
    const sections = Object.entries(bc).filter(([k]) => k !== "total") as [string, number][];
    const lowest = sections.sort((a, b) => a[1] - b[1])[0];
    const meta = SECTION_META[lowest[0]];
    if (meta) {
      return { emoji: meta.emoji, title: "Continue ton branding", description: `Ta section ${meta.label} est à ${lowest[1]}%. On la finit ?`, cta: "Continuer", route: meta.route, duration: "10 min", type: "branding", extra: { brandingTotal: bc.total } };
    }
  }

  // PRIORITY 2 — No Instagram audit
  if (igAuditScore === null) {
    return { emoji: "📊", title: "Audite ton compte Instagram", description: "Comprends où tu en es pour savoir où aller.", cta: "Lancer l'audit", route: "/espaces/instagram/audit", duration: "5 min", type: "audit" };
  }

  // PRIORITY 3 — Weak IG audit (< 50)
  if (igAuditScore < 50) {
    return { emoji: "📱", title: "Améliore ton profil Instagram", description: `Ton score est de ${igAuditScore}/100. On commence par ta bio et ton feed.`, cta: "Voir l'audit", route: "/espaces/instagram/audit", duration: "15 min", type: "audit", extra: { auditScore: igAuditScore } };
  }

  // PRIORITY 4 — No offers
  if (bc.total >= 40 && bc.proposition === 0) {
    return { emoji: "🎁", title: "Formule ton offre", description: "Ton branding avance bien. Maintenant, rends ton offre irrésistible.", cta: "Créer mon offre", route: "/branding/offres", duration: "15 min", type: "other" };
  }

  // PRIORITY 5 — No content planned this week
  if (calendarPostCount === 0) {
    return { emoji: "📅", title: "Planifie ta semaine de contenu", description: "Aucun post prévu cette semaine. On fixe 2-3 publications ?", cta: "Ouvrir le calendrier", route: "/calendrier", duration: "15 min", type: "content" };
  }

  // PRIORITY 6 — Default
  return { emoji: "✨", title: "Crée ton prochain contenu", description: "Ton branding est solide, ton profil est optimisé. C'est le moment de publier.", cta: "C'est parti", route: "/instagram/creer", duration: "20 min", type: "content" };
}

interface SessionFocusWidgetProps {
  brandingCompletion: BrandingCompletion;
  igAuditScore: number | null;
  calendarPostCount: number;
  animationDelay?: number;
}

export default function SessionFocusWidget({ brandingCompletion, igAuditScore, calendarPostCount, animationDelay = 0 }: SessionFocusWidgetProps) {
  const navigate = useNavigate();
  const focus = getSmartFocus(brandingCompletion, igAuditScore, calendarPostCount);

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
