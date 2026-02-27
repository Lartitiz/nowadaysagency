import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check, AlertCircle, Pencil, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BrandingCompletion } from "@/lib/branding-completion";

interface SectionSummary {
  storytelling?: { firstLine: string };
  persona?: { prenom: string; age: string; job: string };
  proposition?: { phrase: string };
  tone?: { keywords: string[] };
  strategy?: { pillars: string[] };
  charter?: { summary: string };
  offers?: { count: number; mainName: string };
}

interface SectionConfig {
  key: keyof Omit<BrandingCompletion, "total">;
  icon: string;
  title: string;
  editRoute: string;
  coachingRoute?: string;
}

const SECTIONS: SectionConfig[] = [
  { key: "storytelling", icon: "📖", title: "Mon histoire", editRoute: "/branding/section?section=story", coachingRoute: "/branding/coaching?section=storytelling" },
  { key: "persona", icon: "👩‍💻", title: "Mon·a client·e idéal·e", editRoute: "/branding/section?section=persona", coachingRoute: "/branding/coaching?section=persona" },
  { key: "proposition", icon: "❤️", title: "Ma proposition de valeur", editRoute: "/branding/section?section=value_proposition", coachingRoute: "/branding/coaching?section=proposition" },
  { key: "tone", icon: "🎨", title: "Ma voix & mes combats", editRoute: "/branding/section?section=tone_style", coachingRoute: "/branding/coaching?section=tone" },
  { key: "strategy", icon: "🍒", title: "Ma ligne éditoriale", editRoute: "/branding/section?section=content_strategy", coachingRoute: "/branding/coaching?section=strategy" },
  { key: "charter", icon: "🎨", title: "Ma charte graphique", editRoute: "/branding/charter" },
];

interface Props {
  completion: BrandingCompletion;
  summaries: SectionSummary;
  onReanalyze?: () => void;
}

function getSummaryLine(section: SectionConfig, summaries: SectionSummary): string {
  switch (section.key) {
    case "storytelling":
      return summaries.storytelling?.firstLine || "Pas encore rédigée";
    case "persona": {
      const p = summaries.persona;
      if (!p?.prenom) return "Pas encore défini·e";
      return [p.prenom, p.age, p.job].filter(Boolean).join(", ");
    }
    case "proposition":
      return summaries.proposition?.phrase || "Pas encore formulée";
    case "tone": {
      const kw = summaries.tone?.keywords;
      return kw && kw.length > 0 ? kw.join(" · ") : "Pas encore défini";
    }
    case "strategy": {
      const pil = summaries.strategy?.pillars;
      return pil && pil.length > 0 ? pil.join(" · ") : "Pas encore définie";
    }
    case "charter":
      return summaries.charter?.summary || "Pas encore créée";
    default:
      return "";
  }
}

function CompletionBadge({ score }: { score: number }) {
  if (score === 100) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--success-bg))] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--success))]">
        <Check className="h-3 w-3" /> Complet
      </span>
    );
  }
  if (score > 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--warning-bg))] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--warning))]">
        <AlertCircle className="h-3 w-3" /> {score}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      À faire
    </span>
  );
}

function TagChip({ label }: { label: string }) {
  return (
    <span className="inline-block rounded-full px-2.5 py-0.5 text-[12px] font-medium bg-[hsl(338_96%_61%/0.12)] text-[hsl(330_100%_28%)]">
      {label}
    </span>
  );
}

function SectionBlock({ section, score, summaryLine, summaries, isOpen, onToggle }: {
  section: SectionConfig;
  score: number;
  summaryLine: string;
  summaries: SectionSummary;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const navigate = useNavigate();
  const hasTags = section.key === "tone" || section.key === "strategy";
  const tags = section.key === "tone" ? summaries.tone?.keywords : section.key === "strategy" ? summaries.strategy?.pillars : [];

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header — always visible */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-muted/30 transition-colors"
      >
        <span className="text-xl shrink-0">{section.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-display text-[15px] text-foreground">{section.title}</p>
          {hasTags && tags && tags.length > 0 && score > 0 ? (
            <div className="flex flex-wrap gap-1.5 mt-1">
              {tags.slice(0, 4).map((t, i) => <TagChip key={i} label={t} />)}
            </div>
          ) : (
            <p className="font-mono-ui text-[12px] text-muted-foreground truncate mt-0.5">{summaryLine}</p>
          )}
        </div>
        <CompletionBadge score={score} />
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.25 }}
        >
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </motion.div>
      </button>

      {/* Expanded content */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 border-t border-border/50">
              <SectionDetail section={section} summaries={summaries} score={score} />
              <div className="flex items-center gap-2 mt-4">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs gap-1.5"
                  onClick={() => navigate(section.editRoute)}
                >
                  <Pencil className="h-3.5 w-3.5" /> Modifier
                </Button>
                {section.coachingRoute && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs gap-1.5 text-primary hover:text-primary"
                    onClick={() => navigate(section.coachingRoute!)}
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Affiner avec l'IA
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SectionDetail({ section, summaries, score }: { section: SectionConfig; summaries: SectionSummary; score: number }) {
  if (score === 0) {
    return <p className="text-sm text-muted-foreground italic">Cette section n'a pas encore été remplie.</p>;
  }

  switch (section.key) {
    case "storytelling":
      return (
        <p className="text-sm text-foreground leading-relaxed line-clamp-4">
          {summaries.storytelling?.firstLine || ""}
        </p>
      );
    case "persona": {
      const p = summaries.persona;
      return (
        <div className="space-y-1">
          {p?.prenom && <p className="text-sm text-foreground"><span className="font-medium">Prénom :</span> {p.prenom}</p>}
          {p?.job && <p className="text-sm text-foreground"><span className="font-medium">Activité :</span> {p.job}</p>}
        </div>
      );
    }
    case "proposition":
      return (
        <p className="text-sm text-foreground leading-relaxed italic">
          "{summaries.proposition?.phrase}"
        </p>
      );
    case "tone": {
      const kw = summaries.tone?.keywords || [];
      return (
        <div className="flex flex-wrap gap-1.5">
          {kw.map((k, i) => <TagChip key={i} label={k} />)}
        </div>
      );
    }
    case "strategy": {
      const pil = summaries.strategy?.pillars || [];
      return (
        <div className="flex flex-wrap gap-1.5">
          {pil.map((p, i) => <TagChip key={i} label={p} />)}
        </div>
      );
    }
    case "charter":
      return (
        <p className="text-sm text-foreground">{summaries.charter?.summary || ""}</p>
      );
    default:
      return null;
  }
}

export default function BrandingIdentityCard({ completion, summaries, onReanalyze }: Props) {
  const navigate = useNavigate();
  const [openSection, setOpenSection] = useState<string | null>(null);

  const filledCount = (["storytelling", "persona", "proposition", "tone", "strategy", "charter"] as const)
    .filter(k => completion[k] >= 50).length;
  const isComplete = filledCount === 6;

  const firstIncomplete = SECTIONS.find(s => completion[s.key] < 50);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] text-foreground">Ta fiche d'identité com'</h1>
          <p className="font-mono-ui text-[13px] text-muted-foreground mt-1">
            Tout ton branding en un coup d'œil. Clique sur une section pour la modifier.
          </p>
        </div>
        {onReanalyze && (
          <button
            onClick={onReanalyze}
            className="font-mono-ui text-[12px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 shrink-0 mt-1"
          >
            🔄 Réanalyser mes liens
          </button>
        )}
      </div>

      {/* Action card */}
      <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
        {isComplete ? (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-medium text-foreground">🎉 Ton branding est prêt !</p>
              <p className="text-[13px] text-muted-foreground mt-0.5">Prochaine étape : crée ton premier contenu.</p>
            </div>
            <Button size="sm" className="gap-1.5 text-xs" onClick={() => navigate("/creer")}>
              Créer un contenu <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-medium text-foreground">
                Il te reste {6 - filledCount} section{6 - filledCount > 1 ? "s" : ""} à compléter.
              </p>
              <p className="text-[13px] text-muted-foreground mt-0.5">On continue ?</p>
            </div>
            {firstIncomplete && (
              <Button size="sm" className="gap-1.5 text-xs" onClick={() => navigate(firstIncomplete.editRoute)}>
                Continuer <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Accordion sections */}
      <div className="space-y-3">
        {SECTIONS.map(section => (
          <SectionBlock
            key={section.key}
            section={section}
            score={completion[section.key]}
            summaryLine={getSummaryLine(section, summaries)}
            summaries={summaries}
            isOpen={openSection === section.key}
            onToggle={() => setOpenSection(prev => prev === section.key ? null : section.key)}
          />
        ))}
      </div>
    </div>
  );
}
